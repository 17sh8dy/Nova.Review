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
export async function resolveViewer(req: Request, env: { ACCOUNTS_ORIGIN?: string }): Promise<Viewer> {
  const header = req.headers.get('authorization');
  if (!header) return { kind: 'guest' };

  let res: Response;
  try {
    res = await fetch(`${env.ACCOUNTS_ORIGIN ?? DEFAULT_ORIGIN}/api/account`, { headers: { authorization: header } });
  } catch {
    return { kind: 'unavailable' };
  }
  if (res.status >= 500) return { kind: 'unavailable' };
  if (!res.ok) return { kind: 'invalid' };

  const data = (await res.json().catch(() => null)) as { account?: { id?: string; displayName?: string | null }; product?: string } | null;
  if (data?.product !== 'nova-review' || typeof data.account?.id !== 'string') return { kind: 'invalid' };
  return { kind: 'account', id: data.account.id, name: data.account.displayName ?? null };
}
