import { createHash } from "node:crypto";
import { allowedAssignee, CALENDAR_ID, CALENDAR_TIME_ZONE, publicFields } from "@/lib/calendar";
import { addressWithPostalCode, inclusiveEndToExclusive, readinessScore, type ReadinessAnswers, type TripType } from "@/lib/submissions";
import { TRAVELER_EMAILS, type Assignee, type EmployeeTravelEvent, type TravelEvent } from "@/lib/types";

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
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  extendedProperties?: { private?: Record<string, string> };
};

type CalendarWriteInput = {
  requestId: string;
  traveler: Assignee;
  tripType: TripType;
  companyName: string;
  cashUrl: string;
  city: string;
  state: string;
  fullAddress?: string;
  postalCode?: string;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  start: string;
  endInclusive: string;
  readiness?: ReadinessAnswers | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  warehouseStartTime?: string;
};

function calendarDescription(input: CalendarWriteInput) {
  const score = input.readiness ? readinessScore(input.readiness) : null;
  return [
    `Visit type: ${input.tripType}`,
    `CASH account: ${input.cashUrl}`,
    input.warehouseStartTime ? `Warehouse start: ${input.warehouseStartTime}` : "",
    input.contactName ? `Point of contact: ${input.contactName} · ${input.contactEmail} · ${input.contactPhone}` : "",
    score ? `Readiness: ${score.ready} of ${score.total}` : "",
    score?.blockers.length ? `Marked No: ${score.blockers.map((item) => item.label).join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function employeeName(attendee: { email?: string; displayName?: string }) {
  const email = String(attendee.email ?? "").toLowerCase();
  if (!email.endsWith("@shiphero.com")) return null;
  const displayName = String(attendee.displayName ?? "").trim();
  if (displayName) return displayName;
  return email.split("@")[0].split(/[._-]/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

function finiteCoordinate(value: string | undefined, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

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
  const assignee = allowedAssignee(
    summary,
    (event.attendees ?? [])
      .filter((attendee) => attendee.responseStatus !== "declined")
      .map((attendee) => attendee.email ?? ""),
  );
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

export async function fetchEmployeeTravelEvents(
  employeeEmail: string,
  now = new Date(),
  fetchImpl: Fetch = fetch,
): Promise<EmployeeTravelEvent[]> {
  const token = await getGoogleAccessToken(fetchImpl);
  const through = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    orderBy: "startTime",
    maxResults: "2500",
    timeMin: now.toISOString(),
    timeMax: through.toISOString(),
    timeZone: CALENDAR_TIME_ZONE,
  });
  const response = await fetchImpl(
    `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${query}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Google Calendar read failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { items?: GoogleEvent[] };
  return (body.items ?? []).flatMap((event) => {
    const publicEvent = googleEventToPublic(event);
    if (!publicEvent || !event.id) return [];
    const participants = new Set<string>([publicEvent.assignee]);
    for (const attendee of event.attendees ?? []) {
      if (attendee.responseStatus === "declined") continue;
      const name = employeeName(attendee);
      if (name) participants.add(name);
    }
    const privateProperties = event.extendedProperties?.private ?? {};
    return [{
      ...publicEvent,
      calendarEventId: event.id,
      participants: [...participants],
      joined: (event.attendees ?? []).some((attendee) => attendee.email?.toLowerCase() === employeeEmail.toLowerCase()),
      countryCode: /^[A-Z]{2}$/i.test(privateProperties.countryCode ?? "") ? String(privateProperties.countryCode).toUpperCase() : "US",
      latitude: finiteCoordinate(privateProperties.latitude, -90, 90),
      longitude: finiteCoordinate(privateProperties.longitude, -180, 180),
    }];
  });
}

async function getManagedCalendarEvent(eventId: string, fetchImpl: Fetch) {
  if (!/^[a-z0-9_-]{5,1024}$/i.test(eventId)) throw new Error("INVALID_EVENT_ID");
  const token = await getGoogleAccessToken(fetchImpl);
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Calendar event lookup failed: ${await responseMessage(response)}`);
  const event = (await response.json()) as GoogleEvent;
  const assignee = allowedAssignee(
    String(event.summary ?? ""),
    (event.attendees ?? [])
      .filter((attendee) => attendee.responseStatus !== "declined")
      .map((attendee) => attendee.email ?? ""),
  );
  if (!assignee || event.status === "cancelled") throw new Error("EVENT_NOT_AVAILABLE");
  return { token, url, event, assignee };
}

export async function updateCalendarAttendance(
  eventId: string,
  employeeEmail: string,
  action: "join" | "leave",
  fetchImpl: Fetch = fetch,
) {
  const normalizedEmail = employeeEmail.trim().toLowerCase();
  if (!normalizedEmail.endsWith("@shiphero.com")) throw new Error("EMPLOYEE_EMAIL_REQUIRED");
  const { token, url, event, assignee } = await getManagedCalendarEvent(eventId, fetchImpl);
  const primaryEmail = TRAVELER_EMAILS[assignee].toLowerCase();
  if (action === "leave" && normalizedEmail === primaryEmail) throw new Error("PRIMARY_TRAVELER_CANNOT_LEAVE");
  const current = event.attendees ?? [];
  const isAttending = current.some((attendee) => attendee.email?.toLowerCase() === normalizedEmail);
  if ((action === "join" && isAttending) || (action === "leave" && !isAttending)) {
    return {
      requestId: event.extendedProperties?.private?.centralOpsRequestId ?? null,
      participants: [...new Set([assignee, ...current.map(employeeName).filter((name): name is string => Boolean(name))])],
    };
  }
  const attendees = action === "join"
    ? [...current, { email: normalizedEmail }]
    : current.filter((attendee) => attendee.email?.toLowerCase() !== normalizedEmail);
  const response = await fetchImpl(`${url}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ attendees }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Calendar attendee update failed: ${await responseMessage(response)}`);
  return {
    requestId: event.extendedProperties?.private?.centralOpsRequestId ?? null,
    participants: [...new Set([assignee, ...attendees.map(employeeName).filter((name): name is string => Boolean(name))])],
  };
}

export async function rescheduleCalendarEvent(
  eventId: string,
  input: { start: string; endInclusive: string; fullAddress: string; postalCode?: string; latitude?: number | null; longitude?: number | null },
  fetchImpl: Fetch = fetch,
) {
  const { token, url, event } = await getManagedCalendarEvent(eventId, fetchImpl);
  const privateProperties = { ...(event.extendedProperties?.private ?? {}) };
  if (input.latitude != null) privateProperties.latitude = String(input.latitude);
  if (input.longitude != null) privateProperties.longitude = String(input.longitude);
  const response = await fetchImpl(`${url}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { date: input.start },
      end: { date: inclusiveEndToExclusive(input.endInclusive) },
      location: addressWithPostalCode(input.fullAddress, input.postalCode ?? ""),
      extendedProperties: { private: privateProperties },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Calendar reschedule failed: ${await responseMessage(response)}`);
}

export async function cancelCalendarEvent(eventId: string, fetchImpl: Fetch = fetch) {
  const { token, url } = await getManagedCalendarEvent(eventId, fetchImpl);
  const response = await fetchImpl(`${url}?sendUpdates=all`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 410) {
    throw new Error(`Calendar cancellation failed: ${await responseMessage(response)}`);
  }
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
    description: calendarDescription(input),
    location: input.fullAddress
      ? addressWithPostalCode(input.fullAddress, input.postalCode ?? "")
      : [input.city, input.state, input.postalCode].filter(Boolean).join(", "),
    start: { date: input.start },
    end: { date: inclusiveEndToExclusive(input.endInclusive) },
    attendees: [{ email: travelerEmail }],
    transparency: "opaque",
    extendedProperties: {
      private: {
        centralOpsRequestId: input.requestId,
        tripType: input.tripType,
        ...(input.countryCode ? { countryCode: input.countryCode } : {}),
        ...(input.latitude != null ? { latitude: String(input.latitude) } : {}),
        ...(input.longitude != null ? { longitude: String(input.longitude) } : {}),
      },
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
