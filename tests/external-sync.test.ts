import assert from "node:assert/strict";
import test from "node:test";
import { additionalParticipantNames, cancelCalendarEvent, createOrGetCalendarEvent, googleEventToPublic, rescheduleCalendarEvent, updateCalendarAttendance } from "@/lib/google-calendar";
import { approvalConnectionError } from "@/lib/approve-request";
import type { StoredVisitRequest } from "@/lib/db";
import { READINESS_ITEMS, type ReadinessAnswers } from "@/lib/submissions";

const readiness = Object.fromEntries(READINESS_ITEMS.map((item) => [item.key, true])) as ReadinessAnswers;

const request: StoredVisitRequest = {
  id: "4f75767a-905d-4b80-b185-f942d659b25f",
  submissionId: "4f75767a-905d-4b80-b185-f942d659b25f",
  tripType: "Onboarding",
  dateConfidence: "high",
  requesterEmail: "amanda.requester@shiphero.com",
  requesterName: "Amanda Requester",
  accountName: "GTI Properties",
  cashUrl: "https://cash.shiphero.com/client/100000",
  cashAccountId: "100000",
  fullAddress: "123 Peachtree St NE, Atlanta, GA 30303, USA",
  city: "Atlanta",
  state: "GA",
  postalCode: "30303",
  countryCode: "US",
  latitude: 33.77,
  longitude: -84.38,
  placeId: "test-place",
  start: "2026-10-05",
  end: "2026-10-07",
  status: "pending",
  createdAt: "2026-10-04T00:00:00.000Z",
  assignedTraveler: "Mike Azimi",
  decidedAt: null,
  decidedByEmail: null,
  calendarEventId: null,
  calendarEventUrl: null,
  syncStatus: "syncing_calendar",
  syncError: null,
  syncAttempts: 1,
  lifecycleAction: "create",
  lifecycleVersion: 1,
  participantsSnapshot: [],
  pendingChange: null,
  readiness,
  contactName: "Jamie Customer",
  contactEmail: "jamie@example.com",
  contactPhone: "+1 404 555 0100",
  warehouseStartTime: "08:30",
};

test("approval connection status identifies only the missing service", () => {
  const originalClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const originalRefresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "calendar-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "calendar-secret";
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "calendar-refresh";
  assert.equal(approvalConnectionError(), null);
  if (originalClientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID; else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalClientId;
  if (originalClientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET; else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalClientSecret;
  if (originalRefresh === undefined) delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN; else process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = originalRefresh;
});

test("Google event sanitizer excludes cancelled and non-allowlisted travel", () => {
  assert.equal(googleEventToPublic({
    id: "cancelled",
    status: "cancelled",
    summary: "Sam Armenia: Secret",
    start: { date: "2026-10-05" },
    end: { date: "2026-10-06" },
  }), null);
  assert.equal(googleEventToPublic({
    id: "joey",
    summary: "Joey Buckley: Customer",
    start: { date: "2026-10-05" },
    end: { date: "2026-10-06" },
  }), null);

  const safe = googleEventToPublic({
    id: "sam",
    summary: "Sam Armenia: Acme",
    location: "https://meet.google.com/secret",
    start: { date: "2026-10-05" },
    end: { date: "2026-10-08" },
    attendees: [{ email: "samuel.armenia@shiphero.com" }],
  });
  assert.equal(safe?.customer, "Acme");
  assert.equal(safe?.location, "");
  assert.equal(safe?.end, "2026-10-08");
});

test("Google event sanitizer rejects a same-first-name traveler with a different email", () => {
  const wrongChris = googleEventToPublic({
    id: "wonder",
    summary: "Chris onsite to Wonder",
    start: { date: "2026-10-08" },
    end: { date: "2026-10-10" },
    attendees: [{ email: "another.chris@shiphero.com", displayName: "Chris Other" }],
  });
  assert.equal(wrongChris, null);

  const chrisHaun = googleEventToPublic({
    id: "verified-chris",
    summary: "Chris onsite to Verified Customer",
    start: { date: "2026-10-08" },
    end: { date: "2026-10-10" },
    attendees: [{ email: "chris.haun@shiphero.com", displayName: "Chris Haun" }],
  });
  assert.equal(chrisHaun?.assignee, "Chris Haun");
});

test("map joiners exclude the assigned traveler and deduplicate verified employees", () => {
  assert.deepEqual(additionalParticipantNames("Sam Armenia", [
    { email: "samuel.armenia@shiphero.com", displayName: "Samuel Armenia" },
    { email: "samuel.armenia@shiphero.com", displayName: "Sam Armenia" },
    { email: "alex.person@shiphero.com", displayName: "Alex Person" },
    { email: "ALEX.PERSON@shiphero.com", displayName: "Alex Person" },
    { email: "declined.person@shiphero.com", displayName: "Declined Person", responseStatus: "declined" },
  ]), ["Alex Person"]);
});

test("Calendar creation is deterministic and keeps the all-day end exclusive", async () => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "test-refresh";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) {
      return Response.json({ access_token: "access", expires_in: 3600 });
    }
    const body = JSON.parse(String(init?.body));
    return Response.json({
      id: body.id,
      htmlLink: "https://calendar.google.com/calendar/event?eid=safe",
      extendedProperties: body.extendedProperties,
    });
  }) as typeof fetch;

  const result = await createOrGetCalendarEvent({
    requestId: request.id,
    traveler: "Mike Azimi",
    tripType: request.tripType,
    companyName: "GTI",
    cashUrl: request.cashUrl,
    city: request.city,
    state: request.state,
    fullAddress: "2109 N US Hwy 31, Bay Minette, AL",
    postalCode: "36507",
    start: request.start,
    endInclusive: request.end,
    readiness: request.readiness,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    contactPhone: request.contactPhone,
    warehouseStartTime: request.warehouseStartTime,
  }, fakeFetch);

  assert.equal(result.id, "cot4f75767a905d4b80b185f942d659b25f");
  const calendarCall = calls.find((call) => call.url.includes("/calendar/v3/"));
  const payload = JSON.parse(String(calendarCall?.init?.body));
  assert.deepEqual(payload.start, { date: "2026-10-05" });
  assert.deepEqual(payload.end, { date: "2026-10-08" });
  assert.equal(payload.summary, "Mike Azimi: GTI");
  assert.equal(payload.location, "2109 N US Hwy 31, Bay Minette, AL, 36507");
  assert.deepEqual(payload.attendees, [{ email: "mike.azimi@shiphero.com" }]);
  assert.match(payload.description, /CASH account: https:\/\/cash\.shiphero\.com\/client\/100000/);
  assert.match(payload.description, /Warehouse start: 08:30/);
  assert.match(payload.description, /Readiness: 12 of 12/);
  assert.match(String(calendarCall?.url), /sendUpdates=all/);
  assert.equal(payload.extendedProperties.private.centralOpsRequestId, request.id);
});

test("Calendar recovery adds the assigned traveler without duplicating the event", async () => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "test-refresh";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const eventId = "cot4f75767a905d4b80b185f942d659b25f";
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    if (init?.method === "POST") return new Response("conflict", { status: 409 });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return Response.json({
        id: eventId,
        htmlLink: "https://calendar.google.com/calendar/event?eid=safe",
        summary: body.summary,
        attendees: body.attendees,
        extendedProperties: body.extendedProperties,
      });
    }
    return Response.json({
      id: eventId,
      htmlLink: "https://calendar.google.com/calendar/event?eid=safe",
      summary: "Mike Azimi: CASH account 100000",
      attendees: [],
      extendedProperties: { private: { centralOpsRequestId: request.id } },
    });
  }) as typeof fetch;

  const result = await createOrGetCalendarEvent({
    requestId: request.id,
    traveler: "Mike Azimi",
    tripType: request.tripType,
    companyName: "CASH account 100000",
    cashUrl: request.cashUrl,
    city: request.city,
    state: request.state,
    start: request.start,
    endInclusive: request.end,
  }, fakeFetch);

  assert.equal(result.id, eventId);
  const patchCall = calls.find((call) => call.init?.method === "PATCH");
  assert.match(String(patchCall?.url), /sendUpdates=all/);
  assert.deepEqual(JSON.parse(String(patchCall?.init?.body)).attendees, [{ email: "mike.azimi@shiphero.com" }]);
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
});

test("verified employees can join and leave Calendar attendees with notifications", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    if (init?.method === "PATCH") return Response.json({});
    return Response.json({
      id: "event123",
      summary: "Mike Azimi: GTI",
      attendees: [{ email: "mike.azimi@shiphero.com", displayName: "Mike Azimi" }],
      extendedProperties: { private: { centralOpsRequestId: request.id } },
    });
  }) as typeof fetch;
  const joined = await updateCalendarAttendance("event123", "alex.person@shiphero.com", "join", fakeFetch);
  assert.equal(joined?.requestId, request.id);
  assert.deepEqual(joined?.participants, ["Mike Azimi", "Alex Person"]);
  const patch = calls.find((call) => call.init?.method === "PATCH");
  assert.match(String(patch?.url), /sendUpdates=all/);
  assert.deepEqual(JSON.parse(String(patch?.init?.body)).attendees.at(-1), { email: "alex.person@shiphero.com" });
  await assert.rejects(updateCalendarAttendance("event123", "mike.azimi@shiphero.com", "leave", fakeFetch), /PRIMARY_TRAVELER/);
});

test("reschedule and cancellation notify Calendar attendees", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    if (init?.method === "PATCH" || init?.method === "DELETE") return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({});
    return Response.json({
      id: "event123",
      summary: "Mike Azimi: GTI",
      attendees: [{ email: "mike.azimi@shiphero.com", displayName: "Mike Azimi" }],
      extendedProperties: { private: {} },
    });
  }) as typeof fetch;
  await rescheduleCalendarEvent("event123", {
    start: "2026-11-10", endInclusive: "2026-11-12", fullAddress: "1 King St, Toronto, ON, Canada", latitude: 43.65, longitude: -79.38,
  }, fakeFetch);
  await cancelCalendarEvent("event123", fakeFetch);
  const patch = calls.find((call) => call.init?.method === "PATCH");
  const payload = JSON.parse(String(patch?.init?.body));
  assert.deepEqual(payload.end, { date: "2026-11-13" });
  assert.equal(payload.location, "1 King St, Toronto, ON, Canada");
  assert.ok(calls.some((call) => call.init?.method === "DELETE" && call.url.includes("sendUpdates=all")));
});

