import { useState, type FormEvent, type ReactNode } from 'react';
import PeekRating from './components/PeekRating.tsx';
import { STATUS_LABELS, type SuggestionStatus } from './lib/products.ts';
import { LIMITS } from './lib/validate.ts';
import { useAuth } from './auth.tsx';

export interface Review {
  id: number;
  product: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  verified: number;
  mine: number;
  createdAt: number;
  editedAt: number | null;
}
export interface Suggestion {
  id: number;
  product: string;
  title: string;
  body: string;
  status: SuggestionStatus;
  votes: number;
  author: string;
  verified: number;
  mine: number;
  voted: number;
  createdAt: number;
}

export const LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];
export const date = (t: number) => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const Stars = ({ value, size = 18 }: { value: number; size?: number }) => (
  <PeekRating value={Math.round(value)} readOnly size={size} showTip={false} ariaLabel={`${value.toFixed(1)} out of 5`} />
);

export const Badge = ({ children }: { children: ReactNode }) => <span className="badge">{children}</span>;
export const StatusPill = ({ status }: { status: SuggestionStatus }) => (
  <span className={`pill pill--${status}`}>{STATUS_LABELS[status]}</span>
);

/** A letter in a circle. Profile pictures need Nova.Help to serve them publicly; not built yet. */
export const Avatar = ({ name }: { name: string | null }) => <span className="avatar">{(name ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>;

export function ShowNameToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      Show my Nova name (otherwise "Anonymous")
    </label>
  );
}

/** Shared by "write" and "edit". Guests get a name box; accounts get the show-name toggle. */
export function ReviewForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial?: Review;
  submitLabel: string;
  onSubmit: (v: { rating: number; title: string; body: string; author: string; showName: boolean }) => Promise<void>;
  onCancel?: () => void;
}) {
  const { signedIn, me } = useAuth();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [author, setAuthor] = useState('');
  const [showName, setShowName] = useState(initial ? initial.author !== 'Anonymous' : (me?.defaultShowName ?? true));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ rating, title, body, author, showName });
      if (!initial) {
        setRating(0);
        setTitle('');
        setBody('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <PeekRating value={rating} onChange={setRating} labels={LABELS} size={36} ariaLabel="Your rating" />
      <label>
        Title
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={LIMITS.title} />
      </label>
      <label>
        Review
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={LIMITS.body} rows={5} />
      </label>
      {signedIn ? (
        <ShowNameToggle checked={showName} onChange={setShowName} />
      ) : (
        <label>
          Name <span className="muted">(optional)</span>
          <input value={author} onChange={e => setAuthor(e.target.value)} maxLength={LIMITS.author} />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function SuggestionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial?: Suggestion;
  submitLabel: string;
  onSubmit: (v: { title: string; body: string; author: string; showName: boolean }) => Promise<void>;
  onCancel?: () => void;
}) {
  const { signedIn, me } = useAuth();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [author, setAuthor] = useState('');
  const [showName, setShowName] = useState(initial ? initial.author !== 'Anonymous' : (me?.defaultShowName ?? true));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ title, body, author, showName });
      if (!initial) {
        setTitle('');
        setBody('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <label>
        Suggestion
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={LIMITS.title} placeholder="One line: what should change?" />
      </label>
      <label>
        Details
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={LIMITS.body} rows={4} />
      </label>
      {signedIn ? (
        <ShowNameToggle checked={showName} onChange={setShowName} />
      ) : (
        <label>
          Name <span className="muted">(optional)</span>
          <input value={author} onChange={e => setAuthor(e.target.value)} maxLength={LIMITS.author} />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
