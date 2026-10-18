export type Viewer =
  | { kind: 'guest' }
  | { kind: 'account'; id: string; name: string | null }
  /** A token was sent but Nova does not accept it (revoked, expired, or for another product). */
  | { kind: 'invalid' }
  /** Nova Accounts could not be reached. Not a sign-out. */
  | { kind: 'unavailable' };

const DEFAULT_ORIGIN = 'https://nova-help.shadylabs.workers.dev';

/**
 * Who is calling? No Authorization header means a guest, and every guest feature keeps working.
 *
 * A bearer token is checked against Nova Accounts itself (GET /api/account), so Nova stays the
 * only authority on identity: revoking a connected app on the Nova account page signs this site
 * out on the next request. The token must have been issued TO Nova.Review, so a token that leaked
 * from another Nova product cannot be used here.
 */
export async function resolveViewer(req: Request, env: { ACCOUNTS_ORIGIN?: string; NOVA_ACCOUNTS?: Fetcher }): Promise<Viewer> {
  const header = req.headers.get('authorization');
  if (!header) return { kind: 'guest' };

  let res: Response;
  try {
    const url = `${env.ACCOUNTS_ORIGIN ?? DEFAULT_ORIGIN}/api/account`;
    const init = { headers: { authorization: header } };
    // The service binding exists in production; locally ACCOUNTS_ORIGIN points at a Nova.Help server.
    res = env.NOVA_ACCOUNTS && !env.ACCOUNTS_ORIGIN ? await env.NOVA_ACCOUNTS.fetch(url, init) : await fetch(url, init);
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
  return { kind: 'account', id: data.account.id, name: data.account.displayName ?? null };
}
