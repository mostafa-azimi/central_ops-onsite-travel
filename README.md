# Central Ops Travel

A lightweight public Next.js dashboard for upcoming customer onsite travel.

## Privacy boundary

- Includes only Chris Haun, Mike Azimi, Rob McFaul, and Sam Armenia.
- Filters on the server before sending data to the browser.
- Returns a minimal DTO: assignee, customer, safe location, dates, and all-day status.
- Never exposes descriptions, emails, meeting links, or excluded people.
- Does not iframe the source calendar.

## Calendar refresh

The server reads `CALENDAR_ICS_URL` when a private, read-only iCal address is configured in the deployment environment. The credential stays server-side. Successful reads are cached for 15 minutes. If no private feed is configured or the feed is unavailable, the page falls back to the last verified sanitized snapshot in `data/snapshot.json`.

## Request and approval workflow

The public form submits a visit request and cannot choose a traveler. The API rejects any public request payload containing a traveler field. It accepts only exact HTTPS CASH links shaped like `https://cash.shiphero.com/client/{numeric account ID}`. It canonicalizes an optional trailing slash, never fetches the submitted URL, and rejects query strings, fragments, credentials, ports, extra paths, and non-numeric IDs.

Traveler assignment, approval, denial, and direct scheduling live on `/admin`. Google OpenID Connect is verified server-side against Google's signing keys, and the verified email must be in the exact server-side allowlist. The initial allowed administrator is `mike.azimi@shiphero.com`; all other accounts are denied by default. The existing direct-schedule endpoint also requires a verified administrator session.

Google administrator sign-in requires a separate web OAuth client with redirect URI `https://cs-onsite-travel.vercel.app/api/auth/google/callback` and environment variables `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET`. Additional administrators can be added explicitly through `ADMIN_ALLOWED_EMAILS`. Until OAuth and durable storage are configured, the public request and administrator actions fail closed and never return mock success.

The completed approval path must create exactly one all-day Calendar event without invitations and one HubSpot meeting associated to a deterministically resolved company. CASH account IDs map only through HubSpot company string property `account_id`; the lookup must return exactly one company and its `shiphero_cash__account_url` must match the canonical submitted URL. Calendar end dates are stored end-exclusive. Pending requests, decision audit, external IDs, and idempotency keys must be persisted before enabling writes so a partial failure can be retried without duplicates.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```
