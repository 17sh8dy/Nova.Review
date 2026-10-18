export interface ReviewInput {
  rating: number;
  title: string;
  body: string;
  /** Guests only; accounts take their name from Nova. */
  author: string;
  /** Accounts only: show the Nova display name, or "Anonymous". */
  showName: boolean;
}

export interface SuggestionInput {
  title: string;
  body: string;
  author: string;
  showName: boolean;
}

export const LIMITS = { title: 80, body: 2000, author: 40, minBody: 10 };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
// Keep paragraph breaks in the body, but collapse other whitespace runs.
const multiLine = (v: unknown) =>
  typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';

function common(r: Record<string, unknown>): Result<{ title: string; body: string; author: string; showName: boolean }> {
  const title = oneLine(r.title);
  const author = oneLine(r.author) || 'Anonymous';
  const body = multiLine(r.body);
  if (!title) return { ok: false, error: 'Add a short title.' };
  if (title.length > LIMITS.title) return { ok: false, error: `Title is limited to ${LIMITS.title} characters.` };
  if (body.length < LIMITS.minBody) return { ok: false, error: 'Tell us a bit more.' };
  if (body.length > LIMITS.body) return { ok: false, error: `Text is limited to ${LIMITS.body} characters.` };
  if (author.length > LIMITS.author) return { ok: false, error: `Name is limited to ${LIMITS.author} characters.` };
  return { ok: true, value: { title, body, author, showName: r.showName !== false } };
}

/** Returns the cleaned review, or an error message safe to show the user. */
export function validateReview(raw: unknown): Result<ReviewInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request.' };
  const r = raw as Record<string, unknown>;
  const rating = r.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, error: 'Pick a rating from 1 to 5 stars.' };
  const c = common(r);
  return c.ok ? { ok: true, value: { rating, ...c.value } } : c;
}

export function validateSuggestion(raw: unknown): Result<SuggestionInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request.' };
  return common(raw as Record<string, unknown>);
}
