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

The public form submits an account name and visit request but cannot choose a traveler. The API rejects any public request payload containing a traveler field. It accepts only exact HTTPS CASH links shaped like `https://cash.shiphero.com/client/{numeric account ID}`. It canonicalizes an optional trailing slash, never fetches the submitted URL, and rejects query strings, fragments, credentials, ports, extra paths, and non-numeric IDs. The account name is used in the Calendar event title, while the validated CASH URL is included in the private Calendar description.

Traveler assignment, approval, denial, and direct scheduling live on `/admin`. Google OpenID Connect is verified server-side against Google's signing keys, and the verified email must be in the exact server-side allowlist. The initial allowed administrator is `mike.azimi@shiphero.com`; all other accounts are denied by default. The existing direct-schedule endpoint also requires a verified administrator session.

Google administrator sign-in requires a separate web OAuth client with redirect URI `https://cs-onsite-travel.vercel.app/api/auth/google/callback` and environment variables `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET`. Additional administrators can be added explicitly through `ADMIN_ALLOWED_EMAILS`. Until OAuth and durable storage are configured, the public request and administrator actions fail closed and never return mock success.

The approval path first creates one all-day Calendar event and sends an invitation to the assigned traveler. If HubSpot is not connected, the request stays pending with its Calendar event ID recorded and can be retried later without creating a duplicate event or invitation. Once HubSpot is available, the workflow associates one meeting to a deterministically resolved company. CASH account IDs map only through HubSpot company string property `account_id`; the lookup must return exactly one company and its `shiphero_cash__account_url` must match the canonical submitted URL. The HubSpot meeting runs from 9:00 AM to 3:00 PM on the first requested date in the matched company's valid HubSpot `timezone`, with outcome `SCHEDULED` and activity type `On-Site`; HubSpot completion fails safely if the company timezone is absent or invalid. Calendar end dates are stored end-exclusive. A deterministic Google event ID and unique HubSpot meeting title make partial retries recoverable. The private Google Sheet persists synchronization state, external IDs, errors, decisions, and audit rows before an approval is marked complete. The public browser never receives the Sheet ID, OAuth credential, audit data, or raw rows.

The public request form accepts full international addresses. When Google Maps Platform is configured, Places autocomplete fills the city, region, country code, coordinates, and Place ID. Manual international entry remains available when it is not configured. `/map` is employee-only and defaults to North America, then fits active engagements in any other region. It lists participant names without exposing attendee emails. Any verified ShipHero employee can join or leave as a shadower; this adds or removes that employee from the Google Calendar attendees and sends Calendar updates. The assigned traveler cannot leave their own visit. Administrators can reschedule or cancel scheduled visits, and Calendar attendees are notified. Participant, reschedule, and cancellation updates are recorded as pending HubSpot lifecycle actions until the HubSpot credential is available.

Required runtime configuration:

- `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_CLIENT_SECRET`, and `GOOGLE_SHEETS_REFRESH_TOKEN` for a server-side OAuth grant limited to `drive.file`
- `GOOGLE_SHEETS_SPREADSHEET_ID` for the private app-created request Sheet
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` for server-side Calendar event read/write
- `HUBSPOT_ACCESS_TOKEN` with company read and meeting-create permissions
- `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET` for administrator sign-in
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for a browser key restricted to the production hostname and only Maps JavaScript, Places, and Geocoding APIs

All credentials remain server-side. The application fails closed when any required connection is absent and never returns a mock write success.

### Google Sheets storage limits

This store is intentionally sized for a low-volume, single-administrator workflow. Stable submission IDs plus payload fingerprints make sequential retries idempotent, and deterministic Calendar and HubSpot identifiers make external-write retries recoverable. Google Sheets does not provide transactions, uniqueness constraints, or atomic compare-and-set operations. Two requests or approvals executing at exactly the same time can therefore race, and the request-row update and audit-row append are not atomic. Keep Mike as the sole administrator while this backend is in use. Move the workflow to a transactional database if concurrent administrators or higher volume become necessary.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```
