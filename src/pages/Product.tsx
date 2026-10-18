import { useCallback, useEffect, useState } from 'react';
import { api, useAuth } from '../auth.tsx';
import { Avatar, Badge, date, ReportMenu, ReviewForm, Stars, StatusPill, SuggestionForm, type Review, type Suggestion } from '../ui.tsx';

interface Product {
  slug: string;
  name: string;
  tagline: string;
  url: string;
}
interface Detail {
  product: Product;
  reviews: Review[];
  distribution: number[];
  count: number;
  average: number;
}

export default function ProductPage({ slug, go }: { slug: string; go: (to: string) => void }) {
  const { signedIn, signIn } = useAuth();
  const [tab, setTab] = useState<'reviews' | 'suggestions'>('reviews');
  const [data, setData] = useState<Detail | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [voteError, setVoteError] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api<Detail>(`/api/products/${slug}/reviews`),
        api<{ suggestions: Suggestion[] }>(`/api/products/${slug}/suggestions`)
      ]);
      setData(d);
      setSuggestions(s.suggestions);
    } catch {
      setMissing(true);
    }
  }, [slug]);
  useEffect(() => void load(), [load, signedIn]);

  if (missing) return <p>That product isn't available. <a href="/" onClick={e => (e.preventDefault(), go('/'))}>Back</a></p>;
  if (!data) return <p className="muted">Loading…</p>;

  const mine = data.reviews.find(r => r.mine);
  const vote = async (s: Suggestion) => {
    setVoteError('');
    try {
      await api(`/api/suggestions/${s.id}/vote`, { method: s.voted ? 'DELETE' : 'POST' });
      await load();
    } catch (e) {
      setVoteError((e as Error).message);
    }
  };

  return (
    <>
      <a href="/" className="back" onClick={e => (e.preventDefault(), go('/'))}>← All products</a>
      <div className="head">
        <div>
          <h1>{data.product.name}</h1>
          <p className="lede">{data.product.tagline}</p>
        </div>
        <a className="button" href={data.product.url} target="_blank" rel="noopener noreferrer">Visit {data.product.name} ↗</a>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reviews'} onClick={() => setTab('reviews')}>Reviews ({data.count})</button>
        <button role="tab" aria-selected={tab === 'suggestions'} onClick={() => setTab('suggestions')}>Suggestions ({suggestions.length})</button>
      </div>

      {tab === 'reviews' && (
        <>
          <div className="panel overview">
            <div className="big">
              <b>{data.count ? data.average.toFixed(1) : '–'}</b>
              <Stars value={data.average} size={22} />
              <span className="muted">{data.count} review{data.count === 1 ? '' : 's'}</span>
            </div>
            <div className="bars">
              {[5, 4, 3, 2, 1].map(n => (
                <div key={n} className="bar">
                  <span>{n}</span>
                  <i><u style={{ width: `${data.count ? (data.distribution[n - 1] / data.count) * 100 : 0}%` }} /></i>
                  <span className="muted">{data.distribution[n - 1]}</span>
                </div>
              ))}
            </div>
          </div>

          {!mine && (
            <>
              <h3>Write a review</h3>
              <ReviewForm
                submitLabel="Post review"
                onSubmit={async v => {
                  await api(`/api/products/${slug}/reviews`, { method: 'POST', body: v });
                  await load();
                }}
              />
              {!signedIn && <p className="muted hint">Writing as a guest. <button className="link" onClick={signIn}>Sign in with Nova</button> to edit or delete it later.</p>}
            </>
          )}

          <div className="reviews">
            {data.reviews.map(r =>
              editing === r.id ? (
                <ReviewForm
                  key={r.id}
                  initial={r}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={async v => {
                    await api(`/api/reviews/${r.id}`, { method: 'PATCH', body: v });
                    setEditing(null);
                    await load();
                  }}
                />
              ) : (
                <article key={r.id} className="panel">
                  <Stars value={r.rating} size={16} />
                  <h4>{r.title}</h4>
                  <p className="body">{r.body}</p>
                  <p className="muted meta byline">
                    {r.avatar && <Avatar name={r.author} src={r.avatar} size={20} />}{r.author} · {date(r.createdAt)}{r.editedAt ? ' (edited)' : ''} {r.verified ? <Badge>Nova Account</Badge> : null}
                  </p>
                  {r.mine ? (
                    <p className="actions">
                      <button className="link" onClick={() => setEditing(r.id)}>Edit</button>
                      <button
                        className="link danger"
                        onClick={async () => {
                          if (!confirm('Delete your review?')) return;
                          await api(`/api/reviews/${r.id}`, { method: 'DELETE' });
                          await load();
                        }}
                      >Delete</button>
                    </p>
                  ) : (
                    <p className="actions"><ReportMenu type="review" id={r.id} /></p>
                  )}
                </article>
              )
            )}
          </div>
        </>
      )}

      {tab === 'suggestions' && (
        <>
          <h3>Suggest something</h3>
          <SuggestionForm
            submitLabel="Submit suggestion"
            onSubmit={async v => {
              await api(`/api/products/${slug}/suggestions`, { method: 'POST', body: v });
              await load();
            }}
          />
          {voteError && <p className="error">{voteError}</p>}
          <div className="reviews">
            {suggestions.map(s =>
              editing === -s.id ? (
                <SuggestionForm
                  key={s.id}
                  initial={s}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={async v => {
                    await api(`/api/suggestions/${s.id}`, { method: 'PATCH', body: v });
                    setEditing(null);
                    await load();
                  }}
                />
              ) : (
                <article key={s.id} className="panel suggestion">
                  <button className={`vote${s.voted ? ' vote--on' : ''}`} onClick={() => vote(s)} aria-pressed={!!s.voted} aria-label={s.voted ? 'Remove vote' : 'Vote'}>
                    ▲<b>{s.votes}</b>
                  </button>
                  <div>
                    <h4>{s.title} <StatusPill status={s.status} /></h4>
                    <p className="body">{s.body}</p>
                    <p className="muted meta byline">{s.avatar && <Avatar name={s.author} src={s.avatar} size={20} />}{s.author} · {date(s.createdAt)} {s.verified ? <Badge>Nova Account</Badge> : null}</p>
                    {s.mine ? (
                      <p className="actions">
                        <button className="link" onClick={() => setEditing(-s.id)}>Edit</button>
                        <button
                          className="link danger"
                          onClick={async () => {
                            if (!confirm('Delete your suggestion?')) return;
                            await api(`/api/suggestions/${s.id}`, { method: 'DELETE' });
                            await load();
                          }}
                        >Delete</button>
                      </p>
                    ) : (
                      <p className="actions"><ReportMenu type="suggestion" id={s.id} /></p>
                    )}
                  </div>
                </article>
              )
            )}
            {!suggestions.length && <p className="muted">No suggestions yet. Be the first.</p>}
          </div>
        </>
      )}
    </>
  );
}
