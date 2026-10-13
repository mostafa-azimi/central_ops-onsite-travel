# Central Ops Travel

A lightweight public Next.js dashboard for upcoming customer onsite travel.

## Privacy boundary

- Includes only Chris Haun, Mike Azimi, Rob McFaul, and Sam Armenia.
- Filters on the server before sending data to the browser.
- Returns a minimal DTO: assignee, customer, safe location, dates, and all-day status.
- Never exposes descriptions, emails, meeting links, or excluded people.
- Does not iframe the source calendar.
- Keeps the map, attendee names, and participation controls behind verified `@shiphero.com` Google sign-in.

## Calendar refresh

The server prefers the authenticated Google Calendar API when `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` are configured. It requests expanded event instances from the one hard-coded CS Onsite calendar, filters the four-person allowlist on the server, and caches successful reads for 15 minutes. A private, read-only iCal address in `CALENDAR_ICS_URL` is the optional secondary source. If neither live source is available, the page falls back to the last verified sanitized snapshot in `data/snapshot.json`.

## Request and approval workflow

The public schedule remains anonymous, but submitting a visit requires a verified `@shiphero.com` Google session. The server records the verified requester name and email rather than trusting identity fields from the browser. The form records low, medium, or high date confidence, and the administrator queue orders pending requests by confidence. A requester cannot choose a traveler. The API rejects any request payload containing a traveler field. The customer-link field accepts ordinary HTTP or HTTPS links and safely upgrades bare domains to HTTPS. It never fetches the submitted link and rejects credentials, unsafe protocols, whitespace, and malformed text. Known `cash.shiphero.com/client/{numeric account ID}` paths still provide a deterministic account ID for display. The account name is used in the Calendar event title, while the submitted customer link is included in the private Calendar description.

## User guide

`/how-to-use` is a public onboarding guide with a 71-second narrated walkthrough, selectable English captions, an inline transcript, written documentation, an automatic Calendar workflow summary, and frequently asked questions. The tutorial uses mock customer information and does not expose Calendar or request data. `npm run video:build` reproduces the MP4, poster, and WebVTT caption file locally using Playwright, macOS text-to-speech, and the development-only FFmpeg package.

Traveler assignment, approval, and denial live on `/admin`. Google OpenID Connect is verified server-side against Google's signing keys, and the verified email must be an active administrator in the private people directory. The directory is managed at `/admin/settings`; administrators can add or deactivate exact `@shiphero.com` identities and grant traveler, administrator, or both roles. The initial administrator is `mike.azimi@shiphero.com`, the last active administrator cannot remove their own administrative access, and every directory change is written to the private audit log.

Google administrator sign-in requires a separate web OAuth client with redirect URI `https://central-ops-travel.aiherolabs.xyz/api/auth/google/callback` and environment variables `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET`. Administrator access is loaded from the private Sheet-backed people directory and fails closed if that configured directory cannot be read. Until OAuth and durable storage are configured, the public request and administrator actions fail closed and never return mock success.

The approval path creates one all-day Calendar event and sends an invitation to the assigned traveler. Calendar end dates are stored end-exclusive. A deterministic Google event ID makes retries recoverable without creating duplicate events or invitations. The private Google Sheet persists synchronization state, Calendar IDs, errors, decisions, and audit rows before an approval is marked complete. The public browser never receives the Sheet ID, OAuth credential, audit data, or raw rows.

After a visit is scheduled, the verified original requester can propose new inclusive dates or request cancellation. The proposal does not modify Calendar. It remains pending until an allowlisted administrator or the exact assigned traveler approves it. Approval updates Calendar and notifies attendees. Denial leaves the scheduled visit unchanged. Legacy rows without a verified requester remain administrator-managed.

The public request form accepts manually entered international addresses. Postal-code lookup uses Zippopotam.us to fill city and state or region while leaving both fields editable, and manual entry remains available when lookup is unavailable. `/map` is employee-only and uses Leaflet with OpenStreetMap tiles. It defaults to North America, then fits active engagements in any other region. It lists participant names without exposing attendee emails. Any verified ShipHero employee can join or leave as a shadower; this adds or removes that employee from the Google Calendar attendees and sends Calendar updates. The assigned traveler cannot leave their own visit. Administrators can reschedule or cancel scheduled visits, and Calendar attendees are notified. Participant, reschedule, and cancellation updates are recorded in the private audit log.

The map and postal-code lookup require no API key, billing account, or paid plan. OpenStreetMap tiles and Zippopotam.us are best-effort services without an availability guarantee. The application uses visible OpenStreetMap attribution, loads only tiles viewed by the employee, debounces lookups, rate-limits its server endpoints, caches upstream results, and always preserves manual address entry.

Email notifications never roll back a successfully saved request or Calendar action. Every delivery is recorded in the private `Notifications` Sheet tab with a stable key, delivery status, attempt count, and error. Administrators can review and retry failures from `/admin/operations`. New requests notify every active administrator; approvals, denials, reschedules, cancellations, requester change decisions, and Calendar reconciliation problems notify the appropriate verified employees. Recipients are restricted to `@shiphero.com`. Delivery requires the Gmail API and a dedicated sender OAuth grant using `https://www.googleapis.com/auth/gmail.send`, plus the standard `openid email` identity scopes so the connection check can confirm the exact sender without reading mailbox content or sending a test message. Set `GOOGLE_EMAIL_CLIENT_ID`, `GOOGLE_EMAIL_CLIENT_SECRET`, `GOOGLE_EMAIL_REFRESH_TOKEN`, and `GOOGLE_EMAIL_SENDER` in each deployment environment.

## Operations and audit

`/admin/operations` is restricted to active administrators. It provides searchable audit history, notification delivery status and retry, and a read-only Google Calendar reconciliation check. The check compares approved requests with managed Calendar events and flags missing events, changed dates, title or traveler mismatches, and missing assigned attendees. It does not automatically overwrite Calendar edits. A daily authenticated reconciliation endpoint is available at `/api/operations/reconcile` when `OPERATIONS_CRON_SECRET` is configured in both the deployment and GitHub Actions.

### Gmail sender setup

1. Enable the Gmail API in the Google Cloud project used by Central Ops Travel.
2. Use a dedicated Desktop OAuth client, or the existing approved Desktop client, to authorize the sender with `https://www.googleapis.com/auth/gmail.send`, `openid`, and `email`, plus offline access. The identity scopes only verify the sender account.
3. Store the client ID, client secret, resulting refresh token, and expected sender email as the four `GOOGLE_EMAIL_*` secrets. Never paste credential values into chat or source control.
4. Redeploy the application, open `/admin`, and run **Check connections**. A valid setup reports the verified `@shiphero.com` sender without sending a test email.

Required runtime configuration:

- `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_CLIENT_SECRET`, and `GOOGLE_SHEETS_REFRESH_TOKEN` for a server-side OAuth grant limited to `drive.file`
- `GOOGLE_SHEETS_SPREADSHEET_ID` for the private app-created request Sheet
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` for server-side Calendar event read/write
- `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET` for verified employee and administrator sign-in
- `GOOGLE_EMAIL_CLIENT_ID`, `GOOGLE_EMAIL_CLIENT_SECRET`, `GOOGLE_EMAIL_REFRESH_TOKEN`, and `GOOGLE_EMAIL_SENDER` for approved Gmail notifications
- optional `ADMIN_NOTIFICATION_EMAIL`, defaulting to `mike.azimi@shiphero.com`
- `OPERATIONS_CRON_SECRET` for the daily authenticated Calendar reconciliation job

All credentials remain server-side. The application fails closed when any required connection is absent and never returns a mock write success.

### Google Sheets storage limits

This store is intentionally sized for a low-volume workflow. Stable submission IDs plus payload fingerprints make sequential retries idempotent, and deterministic Calendar identifiers make external-write retries recoverable. Google Sheets does not provide transactions, uniqueness constraints, or atomic compare-and-set operations. Two requests or approvals executing at exactly the same time can therefore race, and the request-row update and audit-row append are not atomic. The app supports multiple administrators, but they should avoid approving the same request at the same moment. Move the workflow to a transactional database if concurrent activity or volume grows.

## Local development

```bash
npm install
npm run video:build
npm test
npm run test:e2e
npm run lint
npm run build
npm run verify:deployment -- https://central-ops-travel.aiherolabs.xyz
npm run dev
```

The Playwright suite runs desktop and mobile Chromium flows, uses a development-only test identity gate that is disabled in production, checks accessibility with axe, and does not write to Google Calendar or the private request Sheet.

GitHub Actions runs unit tests, lint, the production build, and desktop/mobile browser tests for every pull request and push to `main`. A separate hourly workflow checks `/api/health`, opens one GitHub incident issue when production is unavailable, and closes it after recovery. Set the `PRODUCTION_URL` repository variable to the active Railway origin during cutover. GitHub issue notifications provide the external uptime alert path.

## Docker and Railway

The production image uses the Next.js standalone server, runs as a non-root user, listens on Railway's injected `PORT`, and exposes `/api/health` for deployment readiness checks. Build and run it locally with:

```bash
docker build -t central-ops-travel-hub .
docker run --rm -p 3000:3000 --env-file .env.local central-ops-travel-hub
```

Railway automatically detects the root `Dockerfile`. Configure `/api/health` as the service healthcheck path. Copy the existing server-side Google Calendar, Google Sheets, Google OIDC, and optional email variables into the Railway service. Set `APP_ORIGIN` to the final HTTPS origin and add `${APP_ORIGIN}/api/auth/google/callback` to the Google web OAuth client's authorized redirect URIs before using sign-in. `NEXT_PUBLIC_SIGN_IN_ORIGIN` is an optional Docker build argument; leave it empty to use same-origin sign-in on Railway.

### Railway cutover checklist

1. Create one Railway service from the private GitHub repository and deploy `main`. Railway should detect the root `Dockerfile` automatically.
2. Generate the Railway public domain. Set the service healthcheck path to `/api/health` and confirm it returns HTTP 200.
3. Add every required variable listed in `.env.example` directly in Railway. Do not send credential values through Slack, email, tickets, or source control.
4. Set `APP_ORIGIN=https://central-ops-travel.aiherolabs.xyz`. Leave `NEXT_PUBLIC_SIGN_IN_ORIGIN` blank.
5. Add `https://central-ops-travel.aiherolabs.xyz/api/auth/google/callback` to the existing `Central Ops Travel Admin` Google Web OAuth client.
6. Redeploy after the variables and callback are configured. Sign in at `/admin`, run **Check connections**, and confirm Google sign-in, Sheets, Calendar, and email are green.
7. Verify `/`, `/map`, `/calendar`, `/admin`, and `/admin/settings` before redirecting users away from Vercel.
8. Set the GitHub `PRODUCTION_URL` repository variable to the Railway origin. Store the same new `OPERATIONS_CRON_SECRET` in Railway and GitHub Actions secrets, then run the Calendar reconciliation workflow once.
9. Run `npm run verify:deployment -- https://central-ops-travel.aiherolabs.xyz` from a trusted workstation.

The app stores durable workflow data in its private Google Sheet, so Railway does not need a database or persistent volume. Keep Vercel active until the Railway connection check and employee sign-in both pass.

Do not add a public Railway domain until the intended access boundary is confirmed. Railway private networking isolates services inside a Railway environment, but it does not by itself give employee browsers access. A company VPN path requires a separately approved ingress design, such as a Tailscale forwarder, or a public domain restricted to the company's VPN egress addresses with Railway edge rules.
