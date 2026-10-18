import { useCallback, useEffect, useState } from 'react';
import { api, useAuth } from '../auth.tsx';
import { PRODUCTS, STATUS_LABELS, SUGGESTION_STATUSES, type SuggestionStatus } from '../lib/products.ts';
import { date, Stars, type Review, type Suggestion } from '../ui.tsx';

const nameOf = (slug: string) => PRODUCTS.find(p => p.slug === slug)?.name ?? slug;

/** Maintainer console. The server decides who may use it; this page is only shown to them. */
export default function Admin() {
  const { me } = useAuth();
  const [tab, setTab] = useState<'suggestions' | 'reviews'>('suggestions');
  const [data, setData] = useState<{ reviews: Review[]; suggestions: Suggestion[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api('/api/admin/overview'));
    } catch {
      setError('Not available.');
    }
  }, []);
  useEffect(() => {
    if (me?.isAdmin) void load();
  }, [me, load]);

  if (!me) return <p className="muted">Loading…</p>;
  if (!me.isAdmin || error) return <p>Not available.</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1>Admin</h1>
      <p className="lede">Set suggestion status (authors with notifications on are told) and remove content that breaks the rules.</p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'suggestions'} onClick={() => setTab('suggestions')}>Suggestions ({data.suggestions.length})</button>
        <button role="tab" aria-selected={tab === 'reviews'} onClick={() => setTab('reviews')}>Reviews ({data.reviews.length})</button>
      </div>

      <div className="reviews">
        {tab === 'suggestions' &&
          data.suggestions.map(s => (
            <article key={s.id} className="panel">
              <div className="admin-row">
                <div>
                  <p className="muted meta"><b>{nameOf(s.product)}</b> · {date(s.createdAt)} · ▲ {s.votes} · {s.author}</p>
                  <h4>{s.title}</h4>
                  <p className="body">{s.body}</p>
                </div>
                <div className="row">
                  <select
                    aria-label="Status"
                    value={s.status}
                    onChange={e => act(() => api(`/api/admin/suggestions/${s.id}`, { method: 'PATCH', body: { status: e.target.value as SuggestionStatus } }))}
                  >
                    {SUGGESTION_STATUSES.map(st => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                  </select>
                  <button className="link danger" onClick={() => confirm('Delete this suggestion?') && act(() => api(`/api/admin/suggestions/${s.id}`, { method: 'DELETE' }))}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        {tab === 'reviews' &&
          data.reviews.map(r => (
            <article key={r.id} className="panel">
              <div className="admin-row">
                <div>
                  <p className="muted meta"><b>{nameOf(r.product)}</b> · {date(r.createdAt)} · {r.author}</p>
                  <Stars value={r.rating} size={16} />
                  <h4>{r.title}</h4>
                  <p className="body">{r.body}</p>
                </div>
                <button className="link danger" onClick={() => confirm('Delete this review?') && act(() => api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }))}>Delete</button>
              </div>
            </article>
          ))}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
