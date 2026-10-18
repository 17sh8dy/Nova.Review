/**
 * Cloudflare Turnstile for GUEST actions (posting, voting, reporting). Accounts are never challenged.
 *
 * It supplements the per-IP rate limits and does not replace them. Two deliberate choices:
 *  - Enforcement exists only when TURNSTILE_SECRET is set, so the site works before keys are configured.
 *  - An explicit failure from Cloudflare blocks the action; Cloudflare being unreachable does NOT,
 *    because the rate limits still hold and an outage over there must not stop people posting here.
 */
export interface TurnstileEnv {
  TURNSTILE_SECRET?: string;
}

export const TURNSTILE_HEADER = 'x-turnstile-token';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** true = let it through, false = refuse. */
export async function passesTurnstile(req: Request, env: TurnstileEnv): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  const token = req.headers.get(TURNSTILE_HEADER);
  if (!token || token.length > 2048) return false;

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = req.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) return true; // Cloudflare is having trouble: rate limits still apply
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return true;
  }
}
