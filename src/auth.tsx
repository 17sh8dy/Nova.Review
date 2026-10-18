import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createNovaAccountClient, SIGN_IN_FAILURES, type NovaSignInFlow } from '@nova/account-client';
import { browserStorage } from '@nova/account-client/storage';

const storage = browserStorage('nova.review.account');
const client = createNovaAccountClient({
  product: 'nova-review',
  scopes: ['identity', 'avatar'],
  storage,
  origin: import.meta.env.VITE_ACCOUNTS_ORIGIN || undefined
});

/** The bearer token for our own API. The client keeps it in the storage we gave it. */
const token = (): string | null => {
  try {
    return JSON.parse(storage.read() ?? 'null')?.token ?? null;
  } catch {
    return null;
  }
};

export interface Me {
  accountId: string;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  notify: boolean;
  defaultShowName: boolean;
  unread: number;
}

/** fetch() against our API, attaching the Nova Account token when there is one. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const t = token();
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.status === 401 && t) await client.signOut(); // Nova no longer accepts this token
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong.');
  return data as T;
}

type SignInState =
  | { step: 'idle' }
  | { step: 'code'; flow: NovaSignInFlow }
  | { step: 'error'; message: string };

interface AuthValue {
  signedIn: boolean;
  me: Me | null;
  refreshMe: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  state: SignInState;
  cancel: () => void;
}

const Ctx = createContext<AuthValue>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(client.isSignedIn());
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<SignInState>({ step: 'idle' });
  const flowRef = useRef<NovaSignInFlow | null>(null);

  const refreshMe = useCallback(async () => {
    if (!client.isSignedIn()) return setMe(null);
    try {
      setMe(await api<Me>('/api/me'));
    } catch {
      setMe(null);
    }
    setSignedIn(client.isSignedIn());
  }, []);

  // Offline is not a sign-out: refresh() keeps the token on a network failure.
  useEffect(() => {
    if (!client.isSignedIn()) return;
    client.refresh().then(r => {
      setSignedIn(r.state !== 'signed-out');
      if (r.state !== 'signed-out') void refreshMe();
    });
  }, [refreshMe]);

  const signIn = useCallback(async () => {
    const flow = await client.beginSignIn({ deviceName: 'Nova.Review' });
    if (!flow.ok) return setState({ step: 'error', message: SIGN_IN_FAILURES[flow.reason] });
    flowRef.current = flow;
    setState({ step: 'code', flow });
    window.open(flow.verificationUriComplete, '_blank', 'noopener');
    const onFocus = () => flow.nudge();
    addEventListener('focus', onFocus);
    const result = await flow.wait();
    removeEventListener('focus', onFocus);
    flowRef.current = null;
    if (result.ok) {
      setState({ step: 'idle' });
      setSignedIn(true);
      await refreshMe();
    } else if (result.reason === 'cancelled') setState({ step: 'idle' });
    else setState({ step: 'error', message: SIGN_IN_FAILURES[result.reason] });
  }, [refreshMe]);

  const value = useMemo<AuthValue>(
    () => ({
      signedIn,
      me,
      refreshMe,
      signIn: () => void signIn(),
      signOut: async () => {
        await client.signOut();
        setSignedIn(false);
        setMe(null);
      },
      state,
      cancel: () => {
        flowRef.current?.cancel();
        setState({ step: 'idle' });
      }
    }),
    [signedIn, me, refreshMe, signIn, state]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
