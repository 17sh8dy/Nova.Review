import { useEffect, useState } from 'react';
import { api } from '../auth.tsx';
import { Stars } from '../ui.tsx';

interface Summary {
  slug: string;
  name: string;
  tagline: string;
  url: string;
  count: number;
  average: number;
  openSuggestions: number;
}

export default function Home({ go }: { go: (to: string) => void }) {
  const [products, setProducts] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Summary[]>('/api/products').then(setProducts).catch(() => setError('Could not load products.'));
  }, []);
  return (
    <>
      <h1>What people think of Nova</h1>
      <p className="lede">Honest reviews and ideas for every public Nova product. No account needed.</p>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {products?.map(p => (
          <div key={p.slug} className="card">
            <a href={`/p/${p.slug}`} onClick={e => (e.preventDefault(), go(`/p/${p.slug}`))}>
              <h2>{p.name}</h2>
              <p className="muted">{p.tagline}</p>
              {p.count ? (
                <span className="summary"><Stars value={p.average} size={16} /><b>{p.average.toFixed(1)}</b> <span className="muted">({p.count})</span></span>
              ) : (
                <span className="muted">No reviews yet</span>
              )}
              <p className="muted small">{p.openSuggestions} open suggestion{p.openSuggestions === 1 ? '' : 's'}</p>
            </a>
            <a className="button small" href={p.url} target="_blank" rel="noopener noreferrer">Visit ↗</a>
          </div>
        ))}
      </div>
    </>
  );
}
