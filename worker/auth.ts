export type Viewer =
  | { kind: 'guest' }
  | { kind: 'account'; id: string; name: string | null; authorization: string }
  /** A token was sent but Nova does not accept it (revoked, expired, or for another product). */
  | { kind: 'invalid' }
  /** Nova Accounts could not be reached. Not a sign-out. */
  | { kind: 'unavailable' };

const DEFAULT_ORIGIN = 'https://nova-help.shadylabs.workers.dev';

type AccountsEnv = { ACCOUNTS_ORIGIN?: string; NOVA_ACCOUNTS?: Fetcher };

/** Call Nova Accounts. Production uses the service binding; local dev points ACCOUNTS_ORIGIN at a Nova.Help server. */
export const accountsFetch = (env: AccountsEnv, path: string, init: RequestInit) => {
  const url = `${env.ACCOUNTS_ORIGIN ?? DEFAULT_ORIGIN}${path}`;
  return env.NOVA_ACCOUNTS && !env.ACCOUNTS_ORIGIN ? env.NOVA_ACCOUNTS.fetch(url, init) : fetch(url, init);
};

/**
 * Who is calling? No Authorization header means a guest, and every guest feature keeps working.
 *
 * A bearer token is checked against Nova Accounts itself (GET /api/account), so Nova stays the
 * only authority on identity: revoking a connected app on the Nova account page signs this site
 * out on the next request. The token must have been issued TO Nova.Review, so a token that leaked
 * from another Nova product cannot be used here.
 */
export async function resolveViewer(req: Request, env: AccountsEnv): Promise<Viewer> {
  const header = req.headers.get('authorization');
  if (!header) return { kind: 'guest' };

  let res: Response;
  try {
    res = await accountsFetch(env, '/api/account', { headers: { authorization: header } });
  } catch {
    return { kind: 'unavailable' };
  }
  // Only an explicit "not signed in" is a sign-out. Anything else (a 404 from a blocked
  // Worker-to-Worker call, a 5xx) is Nova being unreachable, and must never log anyone out.
  if (res.status === 400 || res.status === 401 || res.status === 403) return { kind: 'invalid' };
  if (!res.ok) {
    console.log(`nova accounts check failed: HTTP ${res.status}`);
    return { kind: 'unavailable' };
  }

  const data = (await res.json().catch(() => null)) as { account?: { id?: string; displayName?: string | null }; product?: string } | null;
  if (data?.product !== 'nova-review' || typeof data.account?.id !== 'string') return { kind: 'invalid' };
  return { kind: 'account', id: data.account.id, name: data.account.displayName ?? null, authorization: header };
}

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_AVATAR_BYTES = 300 * 1024;

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Bring our copy of the person's Nova profile picture up to date, using their own token (the
 * `avatar` scope). Called when they open the site, never on anyone else's behalf. Failure is
 * silent on purpose: a picture is a nicety and must never break signing in.
 */
export async function syncAvatar(env: AccountsEnv & { DB: D1Database }, viewer: { id: string; authorization: string }) {
  try {
    const row = await env.DB.prepare('SELECT avatar_key, avatar_etag FROM profiles WHERE account_id = ?')
      .bind(viewer.id)
      .first<{ avatar_key: string | null; avatar_etag: string | null }>();
    const res = await accountsFetch(env, '/api/account/avatar', {
      headers: { authorization: viewer.authorization, ...(row?.avatar_etag ? { 'if-none-match': `"${row.avatar_etag}"` } : {}) }
    });
    if (res.status === 304) return;
    if (res.status === 404) {
      await env.DB.prepare('UPDATE profiles SET avatar_key = NULL, avatar_b64 = NULL, avatar_type = NULL, avatar_etag = NULL WHERE account_id = ?')
        .bind(viewer.id)
        .run();
      return;
    }
    if (!res.ok) return; // 403: this sign-in predates the avatar scope; 5xx: try again next visit
    const type = res.headers.get('content-type') ?? '';
    const etag = (res.headers.get('etag') ?? '').replace(/"/g, '');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!AVATAR_TYPES.includes(type) || !etag || bytes.length > MAX_AVATAR_BYTES) return;
    const key = row?.avatar_key ?? [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('UPDATE profiles SET avatar_key = ?, avatar_b64 = ?, avatar_type = ?, avatar_etag = ? WHERE account_id = ?')
      .bind(key, toBase64(bytes), type, etag, viewer.id)
      .run();
  } catch (e) {
    console.log('avatar sync failed', String(e));
  }
}
