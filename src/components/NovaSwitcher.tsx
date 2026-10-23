import { useEffect, useRef, useState } from 'react';
import './NovaSwitcher.css';

/**
 * The Nova product switcher: a small pill beside the brand that opens a menu of every Nova app and
 * website. The list mirrors the other Nova sites (NovaCutSite's data/nova.js is the reference), so
 * when a product's address changes, change it there and here. Addresses are only listed once they
 * are live; anything else renders as "Soon".
 */

type Kind = 'link' | 'soon' | 'current';

interface Item {
  id: string;
  label: string;
  tagline: string;
  /** Path data for a 24px stroke icon. */
  icon: string;
  kind: Kind;
  url?: string;
}

const ICON = {
  cut: 'M6.5 4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM20 5 7 18M8.4 8.4 20 19',
  play: 'M6.5 7.5h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4ZM7 10.5v4M5 12.5h4',
  spark: 'M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9 12 3.5ZM18.5 4v3M20 5.5h-3',
  help: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 5.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9',
  globe: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z',
  doc: 'M6.5 3h7.2L19 8.3V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM13.5 3v5.5H19M8.5 13h7M8.5 16.5h5',
  star: 'm12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.3 6.9 19.2 8 13.5l-4.3-4 5.8-.7L12 3.5Z'
};

const APPS: Item[] = [
  { id: 'nova-cut', label: 'Nova Cut', tagline: 'Create and edit', icon: ICON.cut, kind: 'link', url: 'https://nova-cut-site.shadylabs.workers.dev/' },
  { id: 'replay-gg', label: 'Replay.GG', tagline: 'Record and clip gameplay', icon: ICON.play, kind: 'link', url: 'https://replay-gg-site.shadylabs.workers.dev/' },
  { id: 'atlas', label: 'Atlas', tagline: 'Your desktop assistant', icon: ICON.spark, kind: 'link', url: 'https://atlas-website.shadylabs.workers.dev/' },
  { id: 'nova-games', label: 'Nova Games', tagline: 'Coming soon', icon: ICON.play, kind: 'soon' }
];

const SITES: Item[] = [
  { id: 'nova-help', label: 'Nova.Help', tagline: 'Support and guides', icon: ICON.help, kind: 'link', url: 'https://nova-help.shadylabs.workers.dev/' },
  { id: 'atlas-site', label: 'Atlas Website', tagline: 'Download and learn about Atlas', icon: ICON.spark, kind: 'link', url: 'https://atlas-website.shadylabs.workers.dev/' },
  { id: 'replay-gg-site', label: 'Replay.GG Website', tagline: 'Download and learn about Replay.GG', icon: ICON.play, kind: 'link', url: 'https://replay-gg-site.shadylabs.workers.dev/' },
  { id: 'nova', label: 'Nova', tagline: 'The Nova home page', icon: ICON.globe, kind: 'link', url: 'https://nova-780.pages.dev/' },
  { id: 'nova-legal', label: 'Nova Legal', tagline: 'Terms and privacy', icon: ICON.doc, kind: 'link', url: 'https://nova-legal.shadylabs.workers.dev/' },
  { id: 'nova-review', label: 'Nova.Review', tagline: "You're here", icon: ICON.star, kind: 'current' },
  { id: 'nova-cut-site', label: 'Nova Cut Website', tagline: 'Download Nova Cut', icon: ICON.cut, kind: 'link', url: 'https://nova-cut-site.shadylabs.workers.dev/' }
];

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Row({ item }: { item: Item }) {
  const body = (
    <>
      <span className="nova-switcher__icon"><Glyph d={item.icon} /></span>
      <span className="nova-switcher__text">
        <span className="nova-switcher__label">{item.label}</span>
        <span className="nova-switcher__tagline">{item.tagline}</span>
      </span>
    </>
  );
  if (item.kind === 'current') return <span className="nova-switcher__item nova-switcher__item--current" role="menuitem" aria-current="true">{body}</span>;
  if (item.kind === 'soon') return <span className="nova-switcher__item nova-switcher__item--soon" role="menuitem" aria-disabled="true">{body}<span className="nova-switcher__badge">Soon</span></span>;
  return <a className="nova-switcher__item" role="menuitem" href={item.url} target="_blank" rel="noopener noreferrer">{body}</a>;
}

export function NovaSwitcher() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="nova-switcher" ref={root}>
      <button ref={trigger} type="button" className="nova-switcher__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="nova-switcher__mark">
          <rect width="24" height="24" rx="5.5" fill="#0E1120" />
          <path fill="#7C5CFF" d="M12 3.1c.52 5.46 3.95 8.89 9.41 9.41-5.46.52-8.89 3.95-9.41 9.41-.52-5.46-3.95-8.89-9.41-9.41C8.05 11.99 11.48 8.56 12 3.1Z" />
        </svg>
        <span>Product Switcher</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="nova-switcher__chevron"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className="nova-switcher__menu" role="menu" hidden={!open}>
        <p className="nova-switcher__eyebrow">Apps</p>
        {APPS.map(i => <Row key={i.id} item={i} />)}
        <p className="nova-switcher__eyebrow">Websites</p>
        {SITES.map(i => <Row key={i.id} item={i} />)}
      </div>
    </div>
  );
}
