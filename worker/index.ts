import { PRODUCTS, reviewable, STATUS_LABELS, SUGGESTION_STATUSES, type SuggestionStatus } from '../src/lib/products.ts';
import { validateReport, validateReview, validateSuggestion } from '../src/lib/validate.ts';
import { resolveViewer, syncAvatar, type Viewer } from './auth.ts';
import { passesTurnstile, type TurnstileEnv } from './turnstile.ts';

export interface Env extends TurnstileEnv {
  DB: D1Database;
  /** Salt for guest hashes. A real secret in production. */
  IP_SALT: string;
  /** Service binding to the nova-help Worker (production). */
  NOVA_ACCOUNTS?: Fetcher;
  /** Where Nova Accounts live. Defaults to the live Nova.Help. */
  ACCOUNTS_ORIGIN?: string;
  /** Comma-separated Nova account ids allowed to use /api/admin/* (and the Admin page) when signed in. */
  ADMIN_ACCOUNT_IDS?: string;
  /** Alternative for scripts: a bearer token for /api/admin/*. Unset disables it. */
  ADMIN_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (error: string, status: number) => json({ error }, status);

const GUEST_VOTES_PER_HOUR = 20;
const REPORTS_PER_HOUR = 10;
const GUEST_SUGGESTIONS_PER_DAY = 5;
const HOUR = 3_600_000;

/** Salted hash of the caller's IP. Never stored raw, never returned. */
async function ipHash(req: Request, env: Env, scope: string) {
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_SALT}|${scope}|${ip}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Explicit public column lists: account ids, hashes and voter keys are never selected.
const NAME = (t: string) => `CASE WHEN ${t}.account_id IS NOT NULL
  THEN CASE WHEN ${t}.show_name = 1 THEN COALESCE(p.display_name, 'Anonymous') ELSE 'Anonymous' END
  ELSE COALESCE(${t}.guest_name, 'Anonymous') END`;

// The picture is linked only from content whose author chose to show their name (same rule as the name).
const AVATAR = (t: string) => `CASE WHEN ${t}.account_id IS NOT NULL AND ${t}.show_name = 1 AND p.avatar_key IS NOT NULL
  THEN '/api/avatars/' || p.avatar_key || '?v=' || p.avatar_etag END`;

const REVIEW_COLS = `r.id, r.product, r.rating, r.title, r.body, r.created_at AS createdAt, r.edited_at AS editedAt,
  r.account_id IS NOT NULL AS verified, ${NAME('r')} AS author, ${AVATAR('r')} AS avatar, COALESCE(r.account_id = ?, 0) AS mine`;

const SUGGESTION_COLS = `s.id, s.product, s.title, s.body, s.status, s.created_at AS createdAt,
  COALESCE(r_votes.n, 0) AS votes, ${NAME('s')} AS author, ${AVATAR('s')} AS avatar, s.account_id IS NOT NULL AS verified,
  COALESCE(s.account_id = ?, 0) AS mine,
  EXISTS (SELECT 1 FROM votes v WHERE v.suggestion_id = s.id AND v.voter_key = ?) AS voted`;
const SUGGESTION_FROM = `suggestions s
  LEFT JOIN profiles p ON p.account_id = s.account_id
  LEFT JOIN (SELECT suggestion_id, COUNT(*) AS n FROM votes GROUP BY suggestion_id) r_votes ON r_votes.suggestion_id = s.id`;

const asBool = (v: unknown) => (v ? 1 : 0);
const rows = <T>(r: D1Result) => r.results as T[];

async function handle(req: Request, env: Env, path: string, viewer: Viewer): Promise<Response> {
  const method = req.method;
  const account = viewer.kind === 'account' ? viewer : null;
  const body = async () => (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const defaultShowName = async () =>
    account
      ? ((await env.DB.prepare('SELECT default_show_name AS d FROM profiles WHERE account_id = ?').bind(account.id).first<{ d: number }>())?.d ?? 1)
      : 1;
  // Guests prove they are not a bot before they write or vote (accounts are never challenged).
  const challenge = async () =>
    account || (await passesTurnstile(req, env)) ? null : fail('We could not verify that you are not a bot. Please try again.', 403);
  const voterKey = async () => (account ? `a:${account.id}` : `g:${await ipHash(req, env, 'vote')}`);

  // ── Profile pictures: served from our copy, by a random key that is not the Nova id ──────
  const pic = path.match(/^\/api\/avatars\/([0-9a-f]{32})$/);
  if (pic && method === 'GET') {
    const row = await env.DB.prepare('SELECT avatar_b64 AS b, avatar_type AS t, avatar_etag AS e FROM profiles WHERE avatar_key = ?')
      .bind(pic[1])
      .first<{ b: string; t: string; e: string }>();
    if (!row) return fail('Not found.', 404);
    return new Response(Uint8Array.from(atob(row.b), c => c.charCodeAt(0)), {
      headers: {
        'content-type': row.t,
        // ?v=<etag> changes with the picture, so this can be cached hard.
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox"
      }
    });
  }

  // ── Catalog ─────────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/products') {
    const [rev, sug] = await env.DB.batch([
      env.DB.prepare('SELECT product, COUNT(*) AS count, AVG(rating) AS average FROM reviews GROUP BY product'),
      env.DB.prepare("SELECT product, COUNT(*) AS n FROM suggestions WHERE status NOT IN ('done','declined') GROUP BY product")
    ]);
    const stats = new Map(rows<{ product: string; count: number; average: number }>(rev).map(r => [r.product, r]));
    const open = new Map(rows<{ product: string; n: number }>(sug).map(r => [r.product, r.n]));
    return json(
      PRODUCTS.filter(p => p.public).map(p => ({
        ...p,
        count: stats.get(p.slug)?.count ?? 0,
        average: stats.get(p.slug)?.average ?? 0,
        openSuggestions: open.get(p.slug) ?? 0
      }))
    );
  }

  // ── Reviews ─────────────────────────────────────────────────────────────
  let m = path.match(/^\/api\/products\/([a-z0-9-]+)\/(reviews|suggestions)$/);
  if (m) {
    const product = reviewable(m[1]);
    if (!product) return fail('Unknown product.', 404);

    if (m[2] === 'reviews') {
      if (method === 'GET') {
        const [list, dist] = await env.DB.batch([
          env.DB.prepare(
            `SELECT ${REVIEW_COLS} FROM reviews r LEFT JOIN profiles p ON p.account_id = r.account_id
             WHERE r.product = ? ORDER BY r.created_at DESC LIMIT 100`
          ).bind(account?.id ?? null, product.slug),
          env.DB.prepare('SELECT rating, COUNT(*) AS n FROM reviews WHERE product = ? GROUP BY rating').bind(product.slug)
        ]);
        const distribution = [0, 0, 0, 0, 0];
        for (const d of rows<{ rating: number; n: number }>(dist)) distribution[d.rating - 1] = d.n;
        const count = distribution.reduce((a, b) => a + b, 0);
        const average = count ? distribution.reduce((a, n, i) => a + n * (i + 1), 0) / count : 0;
        return json({ product, reviews: rows(list), distribution, count, average });
      }
      if (method === 'POST') {
        const blocked = await challenge();
        if (blocked) return blocked;
        const raw = await body();
        const v = validateReview(raw);
        if (!v.ok) return fail(v.error, 400);
        const showName = raw?.showName === undefined ? await defaultShowName() : asBool(raw.showName);
        const who = account
          ? { account_id: account.id, guest_name: null, author_hash: null }
          : { account_id: null, guest_name: v.value.author === 'Anonymous' ? null : v.value.author, author_hash: await ipHash(req, env, product.slug) };
        try {
          await env.DB.prepare(
            'INSERT INTO reviews (product, rating, title, body, account_id, guest_name, author_hash, show_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(product.slug, v.value.rating, v.value.title, v.value.body, who.account_id, who.guest_name, who.author_hash, showName, Date.now())
            .run();
        } catch (e) {
          if (String(e).includes('UNIQUE')) return fail('You have already reviewed this product.', 409);
          throw e;
        }
        return json({ ok: true }, 201);
      }
    }

    // ── Suggestions ───────────────────────────────────────────────────────
    if (m[2] === 'suggestions') {
      if (method === 'GET') {
        const list = await env.DB.prepare(
          `SELECT ${SUGGESTION_COLS} FROM ${SUGGESTION_FROM} WHERE s.product = ?
           ORDER BY (s.status IN ('done','declined')), COALESCE(r_votes.n, 0) DESC, s.created_at DESC LIMIT 100`
        )
          .bind(account?.id ?? null, await voterKey(), product.slug)
          .all();
        return json({ product, suggestions: list.results.map(s => ({ ...s, votes: s.votes ?? 0 })) });
      }
      if (method === 'POST') {
        const blocked = await challenge();
        if (blocked) return blocked;
        const raw = await body();
        const v = validateSuggestion(raw);
        if (!v.ok) return fail(v.error, 400);
        const showName = raw?.showName === undefined ? await defaultShowName() : asBool(raw.showName);
        const hash = account ? null : await ipHash(req, env, 'suggest');
        if (hash) {
          const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE author_hash = ? AND created_at > ?')
            .bind(hash, Date.now() - 24 * HOUR)
            .first<{ n: number }>();
          if ((recent?.n ?? 0) >= GUEST_SUGGESTIONS_PER_DAY) return fail('Too many suggestions today. Try again tomorrow, or sign in.', 429);
        }
        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO suggestions (product, title, body, account_id, guest_name, author_hash, show_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(product.slug, v.value.title, v.value.body, account?.id ?? null, !account && v.value.author !== 'Anonymous' ? v.value.author : null, hash, showName, now, now)
          .run();
        return json({ ok: true }, 201);
      }
    }
    return fail('Method not allowed.', 405);
  }

  // ── Edit / delete my own review ─────────────────────────────────────────
  m = path.match(/^\/api\/reviews\/(\d+)$/);
  if (m) {
    if (!account) return fail('Sign in with a Nova Account to change reviews.', 401);
    if (method === 'DELETE') {
      const r = await env.DB.prepare('DELETE FROM reviews WHERE id = ? AND account_id = ?').bind(+m[1], account.id).run();
      if (r.meta.changes) await env.DB.prepare("DELETE FROM reports WHERE target_type = 'review' AND target_id = ?").bind(+m[1]).run();
      return r.meta.changes ? json({ ok: true }) : fail('Not found.', 404);
    }
    if (method === 'PATCH') {
      const raw = await body();
      const v = validateReview(raw);
      if (!v.ok) return fail(v.error, 400);
      const showName = raw?.showName === undefined ? await defaultShowName() : asBool(raw.showName);
      const r = await env.DB.prepare(
        'UPDATE reviews SET rating = ?, title = ?, body = ?, show_name = ?, edited_at = ? WHERE id = ? AND account_id = ?'
      )
        .bind(v.value.rating, v.value.title, v.value.body, showName, Date.now(), +m[1], account.id)
        .run();
      return r.meta.changes ? json({ ok: true }) : fail('Not found.', 404);
    }
    return fail('Method not allowed.', 405);
  }

  // ── Edit / delete my own suggestion ─────────────────────────────────────
  m = path.match(/^\/api\/suggestions\/(\d+)$/);
  if (m) {
    if (!account) return fail('Sign in with a Nova Account to change suggestions.', 401);
    if (method === 'DELETE') {
      const own = await env.DB.prepare('SELECT id FROM suggestions WHERE id = ? AND account_id = ?').bind(+m[1], account.id).first();
      if (!own) return fail('Not found.', 404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM votes WHERE suggestion_id = ?').bind(+m[1]),
        env.DB.prepare('DELETE FROM notifications WHERE suggestion_id = ?').bind(+m[1]),
        env.DB.prepare("DELETE FROM reports WHERE target_type = 'suggestion' AND target_id = ?").bind(+m[1]),
        env.DB.prepare('DELETE FROM suggestions WHERE id = ?').bind(+m[1])
      ]);
      return json({ ok: true });
    }
    if (method === 'PATCH') {
      const raw = await body();
      const v = validateSuggestion(raw);
      if (!v.ok) return fail(v.error, 400);
      const showName = raw?.showName === undefined ? await defaultShowName() : asBool(raw.showName);
      const r = await env.DB.prepare('UPDATE suggestions SET title = ?, body = ?, show_name = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .bind(v.value.title, v.value.body, showName, Date.now(), +m[1], account.id)
        .run();
      return r.meta.changes ? json({ ok: true }) : fail('Not found.', 404);
    }
    return fail('Method not allowed.', 405);
  }

  // ── Reports (guests and accounts). Filing one never hides or removes anything. ──
  if (method === 'POST' && path === '/api/reports') {
    const blocked = await challenge();
    if (blocked) return blocked;
    const v = validateReport(await body());
    if (!v.ok) return fail(v.error, 400);
    const { type, id, reason, note } = v.value;
    const table = type === 'review' ? 'reviews' : 'suggestions';
    const target = await env.DB.prepare(`SELECT id, account_id FROM ${table} WHERE id = ?`).bind(id).first<{ id: number; account_id: string | null }>();
    if (!target) return fail('That no longer exists.', 404);
    if (account && target.account_id === account.id) return fail('You cannot report your own post. You can edit or delete it instead.', 400);
    const key = account ? `a:${account.id}` : `g:${await ipHash(req, env, 'report')}`;
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_key = ? AND created_at > ?')
      .bind(key, Date.now() - HOUR)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= REPORTS_PER_HOUR) return fail('Too many reports. Try again later.', 429);
    try {
      await env.DB.prepare('INSERT INTO reports (target_type, target_id, reason, note, reporter_key, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(type, id, reason, note || null, key, Date.now())
        .run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return json({ ok: true }); // already reported: same answer, nothing to learn
      throw e;
    }
    return json({ ok: true }, 201);
  }

  // ── Votes ───────────────────────────────────────────────────────────────
  m = path.match(/^\/api\/suggestions\/(\d+)\/vote$/);
  if (m) {
    const id = +m[1];
    const exists = await env.DB.prepare('SELECT id FROM suggestions WHERE id = ?').bind(id).first();
    if (!exists) return fail('Not found.', 404);
    const key = await voterKey();
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM votes WHERE suggestion_id = ? AND voter_key = ?').bind(id, key).run();
      return json({ ok: true });
    }
    if (method === 'POST') {
      const blocked = await challenge();
      if (blocked) return blocked;
      if (!account) {
        // Guest voting is open, challenged by Turnstile and also capped per (salted) IP per hour.
        const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter_key = ? AND created_at > ?')
          .bind(key, Date.now() - HOUR)
          .first<{ n: number }>();
        if ((recent?.n ?? 0) >= GUEST_VOTES_PER_HOUR) return fail('Too many votes. Try again later, or sign in.', 429);
      }
      await env.DB.prepare('INSERT OR IGNORE INTO votes (suggestion_id, voter_key, created_at) VALUES (?, ?, ?)').bind(id, key, Date.now()).run();
      return json({ ok: true });
    }
    return fail('Method not allowed.', 405);
  }

  // ── Me (Nova Account only) ──────────────────────────────────────────────
  if (path.startsWith('/api/me')) {
    if (!account) return fail('Sign in with a Nova Account.', 401);

    if (method === 'GET' && path === '/api/me') {
      await syncAvatar(env, account); // once per page load, with the person's own token
      const [prefs, unread] = await env.DB.batch([
        env.DB.prepare(
          `SELECT notify, default_show_name AS defaultShowName,
                  CASE WHEN avatar_key IS NOT NULL THEN '/api/avatars/' || avatar_key || '?v=' || avatar_etag END AS avatarUrl
           FROM profiles WHERE account_id = ?`
        ).bind(account.id),
        env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE account_id = ? AND read = 0').bind(account.id)
      ]);
      const p = rows<{ notify: number; defaultShowName: number; avatarUrl: string | null }>(prefs)[0];
      return json({
        accountId: account.id,
        isAdmin: isAdminAccount(env, viewer),
        displayName: account.name,
        avatarUrl: p?.avatarUrl ?? null,
        notify: !!p?.notify,
        defaultShowName: !!p?.defaultShowName,
        unread: rows<{ n: number }>(unread)[0]?.n ?? 0
      });
    }

    if (method === 'GET' && path === '/api/me/activity') {
      const [rev, sug, notes] = await env.DB.batch([
        env.DB.prepare(
          `SELECT ${REVIEW_COLS} FROM reviews r LEFT JOIN profiles p ON p.account_id = r.account_id
           WHERE r.account_id = ? ORDER BY r.created_at DESC`
        ).bind(account.id, account.id),
        env.DB.prepare(
          `SELECT ${SUGGESTION_COLS} FROM ${SUGGESTION_FROM} WHERE s.account_id = ? ORDER BY s.created_at DESC`
        ).bind(account.id, `a:${account.id}`, account.id),
        env.DB.prepare(
          'SELECT id, kind, product, suggestion_id AS suggestionId, message, read, created_at AS createdAt FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 50'
        ).bind(account.id)
      ]);
      return json({ reviews: rows(rev), suggestions: rows(sug), notifications: rows(notes) });
    }

    if (method === 'PUT' && path === '/api/me/prefs') {
      const raw = await body();
      if (!raw || typeof raw.notify !== 'boolean' || typeof raw.defaultShowName !== 'boolean') return fail('Invalid request.', 400);
      await env.DB.prepare('UPDATE profiles SET notify = ?, default_show_name = ? WHERE account_id = ?')
        .bind(asBool(raw.notify), asBool(raw.defaultShowName), account.id)
        .run();
      return json({ ok: true });
    }

    if (method === 'POST' && path === '/api/me/notifications/read') {
      await env.DB.prepare('UPDATE notifications SET read = 1 WHERE account_id = ?').bind(account.id).run();
      return json({ ok: true });
    }

    // Delete everything this account has put on Nova.Review. The Nova Account itself is untouched.
    if (method === 'DELETE' && path === '/api/me') {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM reports WHERE target_type = 'review' AND target_id IN (SELECT id FROM reviews WHERE account_id = ?)").bind(account.id),
        env.DB.prepare("DELETE FROM reports WHERE target_type = 'suggestion' AND target_id IN (SELECT id FROM suggestions WHERE account_id = ?)").bind(account.id),
        env.DB.prepare('DELETE FROM reports WHERE reporter_key = ?').bind(`a:${account.id}`),
        env.DB.prepare('DELETE FROM votes WHERE suggestion_id IN (SELECT id FROM suggestions WHERE account_id = ?)').bind(account.id),
        env.DB.prepare('DELETE FROM votes WHERE voter_key = ?').bind(`a:${account.id}`),
        env.DB.prepare('DELETE FROM suggestions WHERE account_id = ?').bind(account.id),
        env.DB.prepare('DELETE FROM reviews WHERE account_id = ?').bind(account.id),
        env.DB.prepare('DELETE FROM notifications WHERE account_id = ?').bind(account.id),
        env.DB.prepare('DELETE FROM profiles WHERE account_id = ?').bind(account.id)
      ]);
      return json({ ok: true });
    }
    return fail('Not found.', 404);
  }

  return fail('Not found.', 404);
}

const isAdminAccount = (env: Env, viewer: Viewer) =>
  viewer.kind === 'account' && (env.ADMIN_ACCOUNT_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean).includes(viewer.id);

async function hasAdminToken(req: Request, env: Env) {
  if (!env.ADMIN_TOKEN) return false;
  const sha = async (x: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [a, b] = await Promise.all([sha(req.headers.get('authorization') ?? ''), sha(`Bearer ${env.ADMIN_TOKEN}`)]);
  return a.every((x, i) => x === b[i]);
}

/** Maintainer-only: see everything, set suggestion status (telling the author if they asked to hear), remove content. */
async function admin(req: Request, env: Env, path: string, viewer: Viewer): Promise<Response> {
  // 404 rather than 403 so the routes are not discoverable.
  if (!isAdminAccount(env, viewer) && !(await hasAdminToken(req, env))) return fail('Not found.', 404);

  if (req.method === 'GET' && path === '/api/admin/overview') {
    const [rev, sug] = await env.DB.batch([
      env.DB.prepare(
        `SELECT ${REVIEW_COLS} FROM reviews r LEFT JOIN profiles p ON p.account_id = r.account_id ORDER BY r.created_at DESC LIMIT 200`
      ).bind(null),
      env.DB.prepare(`SELECT ${SUGGESTION_COLS} FROM ${SUGGESTION_FROM} ORDER BY s.created_at DESC LIMIT 200`).bind(null, null)
    ]);
    return json({ reviews: rows(rev), suggestions: rows(sug) });
  }

  // The reports queue: one row per reported item, with what was reported and why.
  if (req.method === 'GET' && path === '/api/admin/reports') {
    const queue = (type: 'review' | 'suggestion', table: string) =>
      env.DB.prepare(
        `SELECT '${type}' AS type, t.id, t.product, t.title, t.body, ${NAME('t')} AS author, COUNT(*) AS count,
                group_concat(r.reason) AS reasons, group_concat(COALESCE(r.note, ''), ' | ') AS notes, MAX(r.created_at) AS lastAt
         FROM reports r JOIN ${table} t ON r.target_type = '${type}' AND t.id = r.target_id
         LEFT JOIN profiles p ON p.account_id = t.account_id WHERE r.status = 'open' GROUP BY t.id`
      );
    const [rev, sug] = await env.DB.batch([queue('review', 'reviews'), queue('suggestion', 'suggestions')]);
    const all = [...rows<{ lastAt: number; count: number }>(rev), ...rows<{ lastAt: number; count: number }>(sug)];
    all.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
    return json({ reports: all });
  }

  // Dismiss: the content stays; the open reports on it are closed (and still block the same people re-filing).
  let m = path.match(/^\/api\/admin\/reports\/(review|suggestion)\/(\d+)\/dismiss$/);
  if (m && req.method === 'POST') {
    await env.DB.prepare("UPDATE reports SET status = 'dismissed' WHERE target_type = ? AND target_id = ? AND status = 'open'").bind(m[1], +m[2]).run();
    return json({ ok: true });
  }

  m = path.match(/^\/api\/admin\/reviews\/(\d+)$/);
  if (m && req.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(+m[1]).run();
    if (r.meta.changes) await env.DB.prepare("DELETE FROM reports WHERE target_type = 'review' AND target_id = ?").bind(+m[1]).run();
    return r.meta.changes ? json({ ok: true }) : fail('Not found.', 404);
  }

  m = path.match(/^\/api\/admin\/suggestions\/(\d+)$/);
  if (!m) return fail('Not found.', 404);
  const id = +m[1];

  if (req.method === 'DELETE') {
    const exists = await env.DB.prepare('SELECT id FROM suggestions WHERE id = ?').bind(id).first();
    if (!exists) return fail('Not found.', 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM votes WHERE suggestion_id = ?').bind(id),
      env.DB.prepare('DELETE FROM notifications WHERE suggestion_id = ?').bind(id),
      env.DB.prepare("DELETE FROM reports WHERE target_type = 'suggestion' AND target_id = ?").bind(id),
      env.DB.prepare('DELETE FROM suggestions WHERE id = ?').bind(id)
    ]);
    return json({ ok: true });
  }

  if (req.method !== 'PATCH') return fail('Not found.', 404);
  const raw = (await req.json().catch(() => null)) as { status?: string } | null;
  const status = raw?.status as SuggestionStatus;
  if (!SUGGESTION_STATUSES.includes(status)) return fail('Invalid status.', 400);

  const s = await env.DB.prepare('SELECT id, product, title, account_id, status FROM suggestions WHERE id = ?')
    .bind(id)
    .first<{ id: number; product: string; title: string; account_id: string | null; status: string }>();
  if (!s) return fail('Not found.', 404);
  await env.DB.prepare('UPDATE suggestions SET status = ?, updated_at = ? WHERE id = ?').bind(status, Date.now(), s.id).run();

  // The bell toggle: an author who switched notifications off hears nothing, ever.
  if (s.account_id && s.status !== status) {
    const prefs = await env.DB.prepare('SELECT notify FROM profiles WHERE account_id = ?').bind(s.account_id).first<{ notify: number }>();
    if (prefs?.notify) {
      const name = PRODUCTS.find(p => p.slug === s.product)?.name ?? s.product;
      const message =
        status === 'done'
          ? `Your suggestion "${s.title}" has been implemented in ${name}!`
          : `Your suggestion "${s.title}" for ${name} is now ${STATUS_LABELS[status]}.`;
      await env.DB.prepare('INSERT INTO notifications (account_id, kind, product, suggestion_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(s.account_id, 'status', s.product, s.id, message, Date.now())
        .run();
    }
  }
  return json({ ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;

    // The admin bearer token is not a Nova token, so it must not go through account verification.
    if (path.startsWith('/api/admin/') && (await hasAdminToken(req, env))) return admin(req, env, path, { kind: 'guest' });

    const viewer = await resolveViewer(req, env);
    // A token that Nova no longer accepts is a sign-out, and the client needs to hear it.
    if (viewer.kind === 'invalid') return fail('Signed out.', 401);
    if (viewer.kind === 'unavailable') return fail('Nova Accounts is unreachable right now.', 503);
    if (viewer.kind === 'account') {
      await env.DB.prepare(
        `INSERT INTO profiles (account_id, display_name, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`
      )
        .bind(viewer.id, viewer.name, Date.now())
        .run();
    }
    if (path.startsWith('/api/admin/')) return admin(req, env, path, viewer);
    return handle(req, env, path, viewer);
  }
} satisfies ExportedHandler<Env>;
