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

Traveler assignment, approval, denial, and direct scheduling live on `/admin`. Google OpenID Connect is verified server-side against Google's signing keys, and the verified email must be in the exact server-side allowlist. The initial allowed administrator is `mike.azimi@shiphero.com`; all other accounts are denied by default. The existing direct-schedule endpoint also requires a verified administrator session.

Google administrator sign-in requires a separate web OAuth client with redirect URI `https://central-ops-travel-hub.vercel.app/api/auth/google/callback` and environment variables `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET`. Administrator access is hard-coded to `mike.azimi@shiphero.com`; all other verified employees are denied. Until OAuth and durable storage are configured, the public request and administrator actions fail closed and never return mock success.

The approval path creates one all-day Calendar event and sends an invitation to the assigned traveler. Calendar end dates are stored end-exclusive. A deterministic Google event ID makes retries recoverable without creating duplicate events or invitations. The private Google Sheet persists synchronization state, Calendar IDs, errors, decisions, and audit rows before an approval is marked complete. The public browser never receives the Sheet ID, OAuth credential, audit data, or raw rows.

After a visit is scheduled, the verified original requester can propose new inclusive dates or request cancellation. The proposal does not modify Calendar. It remains pending until an allowlisted administrator or the exact assigned traveler approves it. Approval updates Calendar and notifies attendees. Denial leaves the scheduled visit unchanged. Legacy rows without a verified requester remain administrator-managed.

The public request form accepts manually entered international addresses. Postal-code lookup uses Zippopotam.us to fill city and state or region while leaving both fields editable, and manual entry remains available when lookup is unavailable. `/map` is employee-only and uses Leaflet with OpenStreetMap tiles. It defaults to North America, then fits active engagements in any other region. It lists participant names without exposing attendee emails. Any verified ShipHero employee can join or leave as a shadower; this adds or removes that employee from the Google Calendar attendees and sends Calendar updates. The assigned traveler cannot leave their own visit. Administrators can reschedule or cancel scheduled visits, and Calendar attendees are notified. Participant, reschedule, and cancellation updates are recorded in the private audit log.

The map and postal-code lookup require no API key, billing account, or paid plan. OpenStreetMap tiles and Zippopotam.us are best-effort services without an availability guarantee. The application uses visible OpenStreetMap attribution, loads only tiles viewed by the employee, debounces lookups, rate-limits its server endpoints, caches upstream results, and always preserves manual address entry.

Email notifications are best effort and never roll back a successfully saved request or Calendar action. New requests notify the administrator; approvals, denials, reschedules, cancellations, and requester change decisions notify the verified requester. Recipients are restricted to `@shiphero.com`. Delivery requires the Gmail API and a dedicated sender OAuth grant limited to `https://www.googleapis.com/auth/gmail.send`. Set `GOOGLE_EMAIL_CLIENT_ID`, `GOOGLE_EMAIL_CLIENT_SECRET`, and `GOOGLE_EMAIL_REFRESH_TOKEN` in each deployment environment. The administrator connection check verifies the sender account without sending a message.

### Gmail sender setup

1. Enable the Gmail API in the Google Cloud project used by Central Ops Travel.
2. Use a dedicated Desktop OAuth client, or the existing approved Desktop client, to authorize the sender with only `https://www.googleapis.com/auth/gmail.send` and offline access.
3. Store the client ID, client secret, and resulting refresh token as the three `GOOGLE_EMAIL_*` secrets. Never paste those values into chat or source control.
4. Redeploy the application, open `/admin`, and run **Check connections**. A valid setup reports the verified `@shiphero.com` sender without sending a test email.

Required runtime configuration:

- `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_CLIENT_SECRET`, and `GOOGLE_SHEETS_REFRESH_TOKEN` for a server-side OAuth grant limited to `drive.file`
- `GOOGLE_SHEETS_SPREADSHEET_ID` for the private app-created request Sheet
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` for server-side Calendar event read/write
- `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET` for verified employee and administrator sign-in
- `GOOGLE_EMAIL_CLIENT_ID`, `GOOGLE_EMAIL_CLIENT_SECRET`, and `GOOGLE_EMAIL_REFRESH_TOKEN` for approved Gmail notifications
- optional `ADMIN_NOTIFICATION_EMAIL`, defaulting to `mike.azimi@shiphero.com`

All credentials remain server-side. The application fails closed when any required connection is absent and never returns a mock write success.

### Google Sheets storage limits

This store is intentionally sized for a low-volume, single-administrator workflow. Stable submission IDs plus payload fingerprints make sequential retries idempotent, and deterministic Calendar identifiers make external-write retries recoverable. Google Sheets does not provide transactions, uniqueness constraints, or atomic compare-and-set operations. Two requests or approvals executing at exactly the same time can therefore race, and the request-row update and audit-row append are not atomic. Keep Mike as the sole administrator while this backend is in use. Move the workflow to a transactional database if concurrent administrators or higher volume become necessary.

## Local development

```bash
npm install
npm run video:build
npm test
npm run test:e2e
npm run lint
npm run build
npm run dev
```

The Playwright suite runs desktop and mobile Chromium flows, uses a development-only test identity gate that is disabled in production, checks accessibility with axe, and does not write to Google Calendar or the private request Sheet.

## Docker and Railway

The production image uses the Next.js standalone server, runs as a non-root user, listens on Railway's injected `PORT`, and exposes `/api/health` for deployment readiness checks. Build and run it locally with:

```bash
docker build -t central-ops-travel-hub .
docker run --rm -p 3000:3000 --env-file .env.local central-ops-travel-hub
```

Railway automatically detects the root `Dockerfile`. Configure `/api/health` as the service healthcheck path. Copy the existing server-side Google Calendar, Google Sheets, Google OIDC, and optional email variables into the Railway service. Set `APP_ORIGIN` to the final HTTPS origin and add `${APP_ORIGIN}/api/auth/google/callback` to the Google web OAuth client's authorized redirect URIs before using sign-in. `NEXT_PUBLIC_SIGN_IN_ORIGIN` is an optional Docker build argument; leave it empty to use same-origin sign-in on Railway.

Do not add a public Railway domain until the intended access boundary is confirmed. Railway private networking isolates services inside a Railway environment, but it does not by itself give employee browsers access. A company VPN path requires a separately approved ingress design, such as a Tailscale forwarder, or a public domain restricted to the company's VPN egress addresses with Railway edge rules
