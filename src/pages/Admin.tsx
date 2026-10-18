import { useCallback, useEffect, useState } from 'react';
import { api, useAuth } from '../auth.tsx';
import { PRODUCTS, STATUS_LABELS, SUGGESTION_STATUSES, type SuggestionStatus } from '../lib/products.ts';
import { REASON_LIMIT, REPORT_LABELS, type ReportReason } from '../lib/validate.ts';
import { date, Stars, type Review, type Suggestion } from '../ui.tsx';

interface Reported {
  type: 'review' | 'suggestion';
  id: number;
  product: string;
  title: string;
  body: string;
  author: string;
  count: number;
  reasons: string;
  notes: string;
}

const nameOf = (slug: string) => PRODUCTS.find(p => p.slug === slug)?.name ?? slug;

/** Asks for the sentence or two the author will see, then removes. The reason is optional. */
function RemoveBox({ kind, onRemove, onCancel }: { kind: string; onRemove: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="remove-box">
      <label>
        Why is this {kind} being removed? <span className="muted">(optional, one or two sentences; the author sees it if they have a Nova Account)</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={REASON_LIMIT} rows={2} placeholder="e.g. It breaks the Nova Legal acceptable use rules." />
      </label>
      <div className="row">
        <button className="danger-fill" onClick={() => onRemove(reason)}>Remove {kind}</button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Maintainer console. The server decides who may use it; this page is only shown to them. */
export default function Admin() {
  const { me } = useAuth();
  const [tab, setTab] = useState<'reports' | 'suggestions' | 'reviews'>('reports');
  const [reports, setReports] = useState<Reported[]>([]);
  const [data, setData] = useState<{ reviews: Review[]; suggestions: Suggestion[] } | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, queue] = await Promise.all([
        api<{ reviews: Review[]; suggestions: Suggestion[] }>('/api/admin/overview'),
        api<{ reports: Reported[] }>('/api/admin/reports')
      ]);
      setData(overview);
      setReports(queue.reports);
    } catch {
      setError('Not available.');
    }
  }, []);
  useEffect(() => {
    if (me?.isAdmin) void load();
  }, [me, load]);

  if (!me) return <p className="muted">Loading…</p>;
  if (!me.isAdmin || (error && !data)) return <p>Not available.</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
      setRemoving(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = (kind: 'review' | 'suggestion', id: number) => (reason: string) =>
    act(() => api(kind === 'review' ? `/api/admin/reviews/${id}` : `/api/admin/suggestions/${id}`, { method: 'DELETE', body: { reason } }));

  return (
    <>
      <h1>Admin</h1>
      <p className="lede">Set suggestion status (authors with notifications on are told) and remove content that breaks the rules.</p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')}>Reports ({reports.length})</button>
        <button role="tab" aria-selected={tab === 'suggestions'} onClick={() => setTab('suggestions')}>Suggestions ({data.suggestions.length})</button>
        <button role="tab" aria-selected={tab === 'reviews'} onClick={() => setTab('reviews')}>Reviews ({data.reviews.length})</button>
      </div>

      <div className="reviews">
        {tab === 'reports' && !reports.length && <p className="muted">No open reports.</p>}
        {tab === 'reports' &&
          reports.map(r => {
            const reasons = [...new Set(r.reasons.split(','))].map(x => REPORT_LABELS[x as ReportReason] ?? x).join(', ');
            const notes = r.notes.split(' | ').filter(Boolean);
            const key = `${r.type}-${r.id}`;
            return (
              <article key={key} className="panel">
                <div className="admin-row">
                  <div>
                    <p className="muted meta"><b>{nameOf(r.product)}</b> · {r.type} · {r.author} · <b>{r.count} report{r.count === 1 ? '' : 's'}</b>: {reasons}</p>
                    <h4>{r.title}</h4>
                    <p className="body">{r.body}</p>
                    {notes.length > 0 && <p className="muted small">Notes: {notes.join(' · ')}</p>}
                  </div>
                  <div className="row">
                    <button className="ghost" onClick={() => act(() => api(`/api/admin/reports/${r.type}/${r.id}/dismiss`, { method: 'POST' }))}>Dismiss</button>
                    <button className="ghost danger" onClick={() => setRemoving(key)}>Remove content</button>
                  </div>
                </div>
                {removing === key && <RemoveBox kind={r.type} onRemove={remove(r.type, r.id)} onCancel={() => setRemoving(null)} />}
              </article>
            );
          })}
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
                  <button className="link danger" onClick={() => setRemoving(`suggestion-${s.id}`)}>Delete</button>
                </div>
              </div>
              {removing === `suggestion-${s.id}` && <RemoveBox kind="suggestion" onRemove={remove('suggestion', s.id)} onCancel={() => setRemoving(null)} />}
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
                <button className="link danger" onClick={() => setRemoving(`review-${r.id}`)}>Delete</button>
              </div>
              {removing === `review-${r.id}` && <RemoveBox kind="review" onRemove={remove('review', r.id)} onCancel={() => setRemoving(null)} />}
            </article>
          ))}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
