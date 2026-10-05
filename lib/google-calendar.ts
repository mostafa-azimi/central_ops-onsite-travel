import { createHash } from "node:crypto";
import { allowedAssignee, CALENDAR_ID, CALENDAR_TIME_ZONE, publicFields } from "@/lib/calendar";
import { inclusiveEndToExclusive, type TripType } from "@/lib/submissions";
import type { Assignee, TravelEvent } from "@/lib/types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type Fetch = typeof fetch;

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: Array<{ email?: string }>;
  extendedProperties?: { private?: Record<string, string> };
};

const TRAVELER_EMAILS: Record<Assignee, string> = {
  "Chris Haun": "chris.haun@shiphero.com",
  "Mike Azimi": "mike.azimi@shiphero.com",
  "Rob McFaul": "rob.mcfaul@shiphero.com",
  "Sam Armenia": "samuel.armenia@shiphero.com",
};

type CalendarWriteInput = {
  requestId: string;
  traveler: Assignee;
  tripType: TripType;
  companyName: string;
  city: string;
  state: string;
  start: string;
  endInclusive: string;
};

export type CalendarWriteResult = {
  id: string;
  htmlLink: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function googleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  );
}

async function responseMessage(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; error_description?: string };
    return parsed.error?.message ?? parsed.error_description ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function getGoogleAccessToken(fetchImpl: Fetch = fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_CALENDAR_NOT_CONFIGURED");

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google token refresh returned no access token");
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

function publicId(event: GoogleEvent, start: string) {
  return createHash("sha256").update(`${event.id ?? "event"}:${start}`).digest("hex").slice(0, 20);
}

export function googleEventToPublic(event: GoogleEvent): TravelEvent | null {
  if (event.status === "cancelled" || !event.start || !event.end) return null;
  const summary = String(event.summary ?? "");
  const assignee = allowedAssignee(summary);
  if (!assignee) return null;
  const start = event.start.date ?? event.start.dateTime;
  const end = event.end.date ?? event.end.dateTime;
  if (!start || !end) return null;
  const fields = publicFields(summary, assignee, event.location);
  return {
    id: publicId(event, start),
    assignee,
    ...fields,
    start,
    end,
    allDay: Boolean(event.start.date),
  };
}

export async function fetchGoogleTravelEvents(
  now = new Date(),
  fetchImpl: Fetch = fetch,
): Promise<TravelEvent[]> {
  const token = await getGoogleAccessToken(fetchImpl);
  const through = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  const events: TravelEvent[] = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "false",
      orderBy: "startTime",
      maxResults: "2500",
      timeMin: now.toISOString(),
      timeMax: through.toISOString(),
      timeZone: CALENDAR_TIME_ZONE,
    });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await fetchImpl(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${query}`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 900 } },
    );
    if (!response.ok) throw new Error(`Google Calendar read failed: ${await responseMessage(response)}`);
    const body = (await response.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    for (const event of body.items ?? []) {
      const item = googleEventToPublic(event);
      if (item) events.push(item);
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

function deterministicEventId(requestId: string) {
  return `cot${requestId.replace(/-/g, "").toLowerCase()}`;
}

function verifyExistingEvent(event: GoogleEvent, expectedId: string, requestId: string) {
  if (
    event.id !== expectedId ||
    event.status === "cancelled" ||
    event.extendedProperties?.private?.centralOpsRequestId !== requestId
  ) {
    throw new Error("Calendar event ID conflict");
  }
  if (!event.htmlLink) throw new Error("Calendar event returned no link");
  return { id: expectedId, htmlLink: event.htmlLink };
}

export async function createOrGetCalendarEvent(
  input: CalendarWriteInput,
  fetchImpl: Fetch = fetch,
): Promise<CalendarWriteResult> {
  const token = await getGoogleAccessToken(fetchImpl);
  const eventId = deterministicEventId(input.requestId);
  const travelerEmail = TRAVELER_EMAILS[input.traveler];
  const payload = {
    id: eventId,
    summary: `${input.traveler}: ${input.companyName}`,
    description: `Visit type: ${input.tripType}`,
    location: `${input.city}, ${input.state}`,
    start: { date: input.start },
    end: { date: inclusiveEndToExclusive(input.endInclusive) },
    attendees: [{ email: travelerEmail }],
    transparency: "opaque",
    extendedProperties: {
      private: { centralOpsRequestId: input.requestId, tripType: input.tripType },
    },
  };
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const response = await fetchImpl(`${url}?sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.ok) {
    const event = (await response.json()) as GoogleEvent;
    return verifyExistingEvent(event, eventId, input.requestId);
  }
  if (response.status !== 409) {
    throw new Error(`Calendar event creation failed: ${await responseMessage(response)}`);
  }

  const existing = await fetchImpl(`${url}/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!existing.ok) throw new Error(`Calendar event recovery failed: ${await responseMessage(existing)}`);
  const existingEvent = (await existing.json()) as GoogleEvent;
  const result = verifyExistingEvent(existingEvent, eventId, input.requestId);
  const hasTraveler = existingEvent.attendees?.some(
    (attendee) => attendee.email?.toLowerCase() === travelerEmail.toLowerCase(),
  );
  const summaryChanged = existingEvent.summary !== payload.summary;
  if (!hasTraveler || summaryChanged) {
    const attendees = hasTraveler
      ? existingEvent.attendees
      : [...(existingEvent.attendees ?? []), { email: travelerEmail }];
    const updated = await fetchImpl(
      `${url}/${encodeURIComponent(eventId)}?sendUpdates=${hasTraveler ? "none" : "all"}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: payload.summary,
          description: payload.description,
          location: payload.location,
          start: payload.start,
          end: payload.end,
          attendees,
          transparency: payload.transparency,
          extendedProperties: payload.extendedProperties,
        }),
        cache: "no-store",
      },
    );
    if (!updated.ok) throw new Error(`Calendar event update failed: ${await responseMessage(updated)}`);
    return verifyExistingEvent((await updated.json()) as GoogleEvent, eventId, input.requestId);
  }
  return result;
}
