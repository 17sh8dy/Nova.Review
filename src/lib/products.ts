export interface Product {
  slug: string;
  name: string;
  tagline: string;
  /** Where "Visit" sends people so they can look around and try it. */
  url: string;
  /** Only public products can be reviewed. Flip to true when a product ships. */
  public: boolean;
}

export const PRODUCTS: Product[] = [
  { slug: 'atlas', name: 'Atlas', tagline: 'The desktop assistant, and its website.', url: 'https://atlas-website.shadylabs.workers.dev', public: true },
  { slug: 'nova', name: 'Nova', tagline: 'The front door to the Nova ecosystem.', url: 'https://nova-780.pages.dev', public: true },
  { slug: 'nova-help', name: 'Nova.Help', tagline: 'Support for every Nova product.', url: 'https://nova-help.shadylabs.workers.dev', public: true },
  { slug: 'nova-legal', name: 'Nova Legal', tagline: 'Legal information for the Nova ecosystem.', url: 'https://nova-legal.shadylabs.workers.dev', public: true }
];

export const reviewable = (slug: string) => PRODUCTS.find(p => p.slug === slug && p.public);

export const SUGGESTION_STATUSES = ['open', 'planned', 'in_progress', 'done', 'declined'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Implemented',
  declined: 'Declined'
};

/** Where a Nova Account is edited. Nova.Review never edits a profile itself. */
export const NOVA_PROFILE_URL = 'https://nova-780.pages.dev/account/profile';
