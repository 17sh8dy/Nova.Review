# Nova.Review

Public reviews for every public Nova product. React + Vite frontend, a Cloudflare Worker API, reviews in D1.
Star rating is React Bits' Peek Rating (`src/components/PeekRating.*`, copied from the registry).

- `npm run build` then `npm run db:local` then `npx wrangler dev` serves app + API on :8787
- `npm test` runs the validation/catalog tests
- `src/lib/products.ts` is the product catalog; set `public: true` when a product ships

## Accounts
Optional Nova Account sign-in via the shared device grant (`@nova/account-client`, product `nova-review`,
identity scope only - no email). The Worker verifies the token against Nova.Help on every request
(`worker/auth.ts`). Guests can read, review, suggest and vote; accounts add edit/delete, history,
notifications, show-name choice. Profile edits link out to Nova (`NOVA_PROFILE_URL`).
Local dev against a local Nova.Help: `VITE_ACCOUNTS_ORIGIN=... npm run build`, `wrangler dev --var ACCOUNTS_ORIGIN:...`.
Admin: put your Nova id (shown on /me) in `ADMIN_ACCOUNT_IDS` and an Admin page appears for you: set suggestion
status, delete reviews/suggestions. Scripts can use `Authorization: Bearer $ADMIN_TOKEN` instead.
Notifications are one bell toggle (React Bits BellToggle); off means nothing is created for that person.
No email is sent: Nova.Review never receives addresses, so email would have to go through Nova.Help.

## Running it
`npm start` builds, migrates the local DB and serves app + API on http://localhost:8787. Opening `index.html`
from disk cannot work (module scripts are blocked on file://), so the page says so instead of staying black.

## Not done yet
- Deploy: needs `wrangler d1 create nova-review`, the real id in `wrangler.jsonc`, secrets `IP_SALT` + `ADMIN_TOKEN`,
  and `nova-review` registered in the LIVE Nova.Help (edit is made in NovaHelp + Nova, not deployed)
- Profile pictures: Nova.Help has no public avatar URL; initials are shown instead
- Guest vote protection is a per-IP hourly cap; Turnstile would be the next layer
- No report flow (people flagging content)
- `@nova/account-client` is a cross-repo `file:` dependency; a git-built deploy cannot resolve it
