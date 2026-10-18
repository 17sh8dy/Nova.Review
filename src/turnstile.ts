/**
 * Cloudflare Turnstile, run only for guests and only when they act (post, vote, report).
 * "interaction-only" keeps it invisible unless Cloudflare decides it needs the person to do something.
 * With no site key configured (local dev) this does nothing and the server does not require a token.
 */
interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const FAILED = 'We could not verify that you are not a bot. Please try again.';

let loading: Promise<TurnstileApi> | null = null;
const load = () =>
  (loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(FAILED)));
    s.onerror = () => {
      loading = null; // allow a retry next time
      reject(new Error(FAILED));
    };
    document.head.appendChild(s);
  }));

let host: HTMLDivElement | null = null;
let widget: string | null = null;
let settle: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function run(): Promise<string> {
  const api = await load();
  if (!host) {
    host = document.createElement('div');
    // Only visible if Cloudflare needs the person to interact.
    host.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20';
    document.body.appendChild(host);
  }
  return new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
    if (widget === null) {
      widget = api.render(host!, {
        sitekey: SITE_KEY,
        theme: 'dark',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token: string) => {
          settle?.resolve(token);
          settle = null;
        },
        'error-callback': () => {
          settle?.reject(new Error(FAILED));
          settle = null;
          return true;
        },
        'timeout-callback': () => {
          settle?.reject(new Error(FAILED));
          settle = null;
        }
      });
    } else api.reset(widget); // a token is single-use
    api.execute(widget);
  });
}

/** A fresh Turnstile token, or null when Turnstile is not configured. One at a time. */
export function challengeToken(): Promise<string | null> {
  if (!SITE_KEY) return Promise.resolve(null);
  const next = queue.then(run);
  queue = next.catch(() => {});
  return next;
}

/** Which of our API calls a guest must be challenged for. Mirrors the server. */
export const needsChallenge = (method: string, path: string) =>
  method === 'POST' && /^\/api\/(products\/[a-z0-9-]+\/(reviews|suggestions)|suggestions\/\d+\/vote|reports)$/.test(path);
