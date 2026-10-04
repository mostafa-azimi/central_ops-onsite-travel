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

## Visit submission prototype

The public form accepts only the two approved visit types and the four public travelers. The API validates an exact configured CASH hostname, dates, city/state, payload size, and request rate before any integration can run. It currently fails closed with HTTP 503 because Google Calendar and HubSpot backend credentials have not been approved or configured. It never returns mock success.

The completed write path must create exactly one all-day Calendar event without invitations and one HubSpot `MEETING_EVENT` associated to a deterministically resolved company. The Calendar end date is stored end-exclusive. External IDs and an idempotency key must be persisted before enabling public writes so a partial failure can be retried without duplicates.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```
