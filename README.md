# CS Onsite Travel

A lightweight public Next.js dashboard for upcoming customer onsite travel.

## Privacy boundary

- Includes only Chris Haun, Mike Azimi, Rob McFaul, and Sam Armenia.
- Filters on the server before sending data to the browser.
- Returns a minimal DTO: assignee, customer, safe location, dates, and all-day status.
- Never exposes descriptions, emails, meeting links, or excluded people.
- Does not iframe the source calendar.

## Calendar refresh

The server reads `CALENDAR_ICS_URL` when a private, read-only iCal address is configured in the deployment environment. The credential stays server-side. Successful reads are cached for 15 minutes. If no private feed is configured or the feed is unavailable, the page falls back to the last verified sanitized snapshot in `data/snapshot.json`.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```
