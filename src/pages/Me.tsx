import { useCallback, useEffect, useState } from 'react';
import { api, useAuth } from '../auth.tsx';
import { NOVA_PROFILE_URL, PRODUCTS } from '../lib/products.ts';
import BellToggle from '../components/BellToggle.tsx';
import { Avatar, date, Stars, StatusPill, type Review, type Suggestion } from '../ui.tsx';

interface Note {
  id: number;
  message: string;
  read: number;
  createdAt: number;
}
interface Activity {
  reviews: Review[];
  suggestions: Suggestion[];
  notifications: Note[];
}

const nameOf = (slug: string) => PRODUCTS.find(p => p.slug === slug)?.name ?? slug;

export default function Me({ go }: { go: (to: string) => void }) {
  const { signedIn, me, refreshMe, signIn, signOut } = useAuth();
  const [data, setData] = useState<Activity | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setData(await api<Activity>('/api/me/activity'));
    // Opening the dashboard is reading the notifications.
    await api('/api/me/notifications/read', { method: 'POST' }).catch(() => {});
    await refreshMe();
  }, [refreshMe]);
  useEffect(() => {
    if (signedIn) void load().catch(() => {});
  }, [signedIn, load]);

  if (!signedIn)
    return (
      <>
        <h1>Your Nova.Review</h1>
        <p className="lede">Sign in with your Nova Account to manage your reviews and suggestions, and to hear when one is acted on.</p>
        <button onClick={signIn}>Sign in with Nova</button>
      </>
    );
  if (!data || !me) return <p className="muted">Loading…</p>;

  const savePrefs = async (next: { notify: boolean; defaultShowName: boolean }) => {
    await api('/api/me/prefs', { method: 'PUT', body: next });
    await refreshMe();
  };

  return (
    <>
      <div className="panel profile">
        <Avatar name={me.displayName} />
        <div>
          <h2>{me.displayName ?? 'Nova member'}</h2>
          <p className="muted">Your Nova Profile. Your email is never shown here or to anyone else.</p>
          <p className="muted small">Nova ID: <code>{me.accountId}</code> (only you can see this)</p>
        </div>
        <a className="button" href={NOVA_PROFILE_URL} target="_blank" rel="noopener noreferrer">Edit on Nova ↗</a>
      </div>

      {data.notifications.length > 0 && (
        <>
          <h3>Notifications</h3>
          <div className="reviews">
            {data.notifications.map(n => (
              <article key={n.id} className="panel note">
                <p>💜 {n.message}</p>
                <p className="muted meta">{date(n.createdAt)}</p>
              </article>
            ))}
          </div>
        </>
      )}

      <h3>My reviews</h3>
      <div className="reviews">
        {data.reviews.map(r => (
          <article key={r.id} className="panel">
            <p className="muted meta"><b>{nameOf(r.product)}</b> · {date(r.createdAt)}</p>
            <Stars value={r.rating} size={16} />
            <h4>{r.title}</h4>
            <p className="body">{r.body}</p>
            <p className="actions">
              <button className="link" onClick={() => go(`/p/${r.product}`)}>Edit</button>
              <button
                className="link danger"
                onClick={async () => {
                  if (!confirm('Delete your review?')) return;
                  await api(`/api/reviews/${r.id}`, { method: 'DELETE' });
                  await load();
                }}
              >Delete</button>
            </p>
          </article>
        ))}
        {!data.reviews.length && <p className="muted">You haven't reviewed anything yet.</p>}
      </div>

      <h3>My suggestions</h3>
      <div className="reviews">
        {data.suggestions.map(s => (
          <article key={s.id} className="panel">
            <p className="muted meta"><b>{nameOf(s.product)}</b> · {date(s.createdAt)} · ▲ {s.votes}</p>
            <h4>{s.title} <StatusPill status={s.status} /></h4>
            <p className="body">{s.body}</p>
            <p className="actions">
              <button className="link" onClick={() => go(`/p/${s.product}`)}>Edit</button>
              <button
                className="link danger"
                onClick={async () => {
                  if (!confirm('Delete your suggestion?')) return;
                  await api(`/api/suggestions/${s.id}`, { method: 'DELETE' });
                  await load();
                }}
              >Delete</button>
            </p>
          </article>
        ))}
        {!data.suggestions.length && <p className="muted">No suggestions yet.</p>}
      </div>

      <h3>Settings</h3>
      <div className="panel form">
        <div className="bell">
          <BellToggle
            pressed={me.notify}
            onChange={v => void savePrefs({ notify: v, defaultShowName: me.defaultShowName })}
            offLabel="Notify me"
            onLabel="You'll be notified"
            label="Notifications about my suggestions"
            background="#2a2733"
            color="#f1eff6"
            onBackground="#8b7cff"
            onColor="#0e0d12"
          />
          <span className="muted small">
            {me.notify ? 'You will hear when a suggestion of yours changes status.' : 'Off: you will not be notified about anything.'}
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={me.defaultShowName} onChange={e => savePrefs({ notify: me.notify, defaultShowName: e.target.checked })} />
          Show my Nova name on new reviews and suggestions (otherwise "Anonymous")
        </label>
        {message && <p className="muted">{message}</p>}
        <div className="row">
          <button className="ghost" onClick={signOut}>Sign out</button>
          <button
            className="ghost danger"
            onClick={async () => {
              if (!confirm('Delete every review, suggestion and vote you have made on Nova.Review? Your Nova Account is not affected.')) return;
              await api('/api/me', { method: 'DELETE' });
              setMessage('All your Nova.Review data was deleted.');
              await load();
            }}
          >Delete all my Nova.Review data</button>
        </div>
      </div>
    </>
  );
}
