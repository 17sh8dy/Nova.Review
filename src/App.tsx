import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth.tsx';
import { Avatar } from './ui.tsx';
import { NovaSwitcher } from './components/NovaSwitcher.tsx';
import Home from './pages/Home.tsx';
import ProductPage from './pages/Product.tsx';
import Me from './pages/Me.tsx';
import Admin from './pages/Admin.tsx';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = (to: string) => {
    history.pushState(null, '', to);
    setPath(to);
    scrollTo(0, 0);
  };
  return [path, go] as const;
}

/** The sign-in dialog: shows the code, since the approval happens on Nova, not here. */
function SignInDialog() {
  const { state, cancel, signIn } = useAuth();
  if (state.step === 'idle') return null;
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Sign in with Nova">
      <div className="panel dialog">
        {state.step === 'code' ? (
          <>
            <h3>Approve on Nova</h3>
            <p className="muted">A Nova page opened in a new tab. Sign in there, then type this code to connect Nova.Review.</p>
            <p className="code">{state.flow.userCode}</p>
            <p className="muted small">
              Didn't open? <a href={state.flow.verificationUriComplete} target="_blank" rel="noopener noreferrer">Open it again</a>. Nova.Review never sees your password.
            </p>
            <p className="muted small">Waiting for approval…</p>
            <button className="ghost" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <>
            <h3>Couldn't sign in</h3>
            <p className="error">{state.message}</p>
            <div className="row">
              <button onClick={signIn}>Try again</button>
              <button className="ghost" onClick={cancel}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const [path, go] = usePath();
  const { signedIn, me, signIn } = useAuth();
  const m = path.match(/^\/p\/([a-z0-9-]+)$/);
  const link = (to: string) => (e: { preventDefault(): void }) => (e.preventDefault(), go(to));
  return (
    <>
      <header>
        <span className="row">
          <a href="/" className="brand" onClick={link('/')}>Nova<span>.Review</span></a>
          <NovaSwitcher />
        </span>
        {signedIn ? (
          <span className="row">
          {me?.isAdmin && <a href="/admin" onClick={link('/admin')}>Admin</a>}
          <a href="/me" className="who" onClick={link('/me')}>
            <Avatar name={me?.displayName ?? null} src={me?.avatarUrl} />
            {me?.displayName ?? 'My account'}
            {me?.unread ? <i className="dot" aria-label={`${me.unread} new notifications`}>{me.unread}</i> : null}
          </a>
          </span>
        ) : (
          <button className="ghost" onClick={signIn}>Sign in with Nova</button>
        )}
      </header>
      <main>{path === '/me' ? <Me go={go} /> : path === '/admin' ? <Admin /> : m ? <ProductPage key={m[1]} slug={m[1]} go={go} /> : <Home go={go} />}</main>
      <SignInDialog />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
