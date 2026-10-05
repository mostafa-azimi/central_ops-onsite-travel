import assert from "node:assert/strict";
import test from "node:test";
import { createOrGetCalendarEvent, googleEventToPublic } from "@/lib/google-calendar";
import { createOrGetHubSpotMeeting, findVerifiedCompany, meetingTimes } from "@/lib/hubspot";
import { approvalConnectionError } from "@/lib/approve-request";
import type { StoredVisitRequest } from "@/lib/db";

const request: StoredVisitRequest = {
  id: "4f75767a-905d-4b80-b185-f942d659b25f",
  submissionId: "4f75767a-905d-4b80-b185-f942d659b25f",
  tripType: "Onboarding",
  accountName: "GTI Properties",
  cashUrl: "https://cash.shiphero.com/client/100000",
  cashAccountId: "100000",
  city: "Atlanta",
  state: "GA",
  start: "2026-10-05",
  end: "2026-10-07",
  status: "pending",
  createdAt: "2026-10-04T00:00:00.000Z",
  assignedTraveler: "Mike Azimi",
  decidedAt: null,
  decidedByEmail: null,
  calendarEventId: null,
  calendarEventUrl: null,
  hubspotMeetingId: null,
  hubspotCompanyId: null,
  syncStatus: "syncing_calendar",
  syncError: null,
  syncAttempts: 1,
};

test("approval connection status identifies only the missing service", () => {
  const originalHubSpot = process.env.HUBSPOT_ACCESS_TOKEN;
  const originalClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const originalRefresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "calendar-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "calendar-secret";
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "calendar-refresh";
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  assert.equal(approvalConnectionError(), null);
  if (originalHubSpot === undefined) delete process.env.HUBSPOT_ACCESS_TOKEN; else process.env.HUBSPOT_ACCESS_TOKEN = originalHubSpot;
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
  });
  assert.equal(safe?.customer, "Acme");
  assert.equal(safe?.location, "");
  assert.equal(safe?.end, "2026-10-08");
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
    start: request.start,
    endInclusive: request.end,
  }, fakeFetch);

  assert.equal(result.id, "cot4f75767a905d4b80b185f942d659b25f");
  const calendarCall = calls.find((call) => call.url.includes("/calendar/v3/"));
  const payload = JSON.parse(String(calendarCall?.init?.body));
  assert.deepEqual(payload.start, { date: "2026-10-05" });
  assert.deepEqual(payload.end, { date: "2026-10-08" });
  assert.equal(payload.summary, "Mike Azimi: GTI");
  assert.deepEqual(payload.attendees, [{ email: "mike.azimi@shiphero.com" }]);
  assert.match(payload.description, /CASH account: https:\/\/cash\.shiphero\.com\/client\/100000/);
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

test("HubSpot company mapping requires one exact account and canonical CASH URL", async () => {
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  const goodFetch = (async () => Response.json({ results: [{
    id: "56996862100",
    properties: {
      account_id: "100000",
      name: "GTI",
      shiphero_cash__account_url: "https://cash.shiphero.com/client/100000/",
      timezone: "America/New_York",
    },
  }] })) as typeof fetch;
  assert.deepEqual(
    await findVerifiedCompany("100000", "https://cash.shiphero.com/client/100000", goodFetch),
    { id: "56996862100", name: "GTI", timeZone: "America/New_York" },
  );

  const duplicateFetch = (async () => Response.json({ results: [{ id: "1" }, { id: "2" }] })) as typeof fetch;
  await assert.rejects(
    findVerifiedCompany("100000", "https://cash.shiphero.com/client/100000", duplicateFetch),
    /exactly one/,
  );
});

test("HubSpot meeting uses 9 AM to 3 PM company-local time and company association 188", async () => {
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/search")) return Response.json({ results: [] });
    return Response.json({ id: "meeting-123" });
  }) as typeof fetch;

  assert.deepEqual(meetingTimes("2026-10-05", "America/New_York"), {
    start: "2026-10-05T13:00:00.000Z",
    end: "2026-10-05T19:00:00.000Z",
  });
  assert.deepEqual(meetingTimes("2026-10-05", "America/Los_Angeles"), {
    start: "2026-10-05T16:00:00.000Z",
    end: "2026-10-05T22:00:00.000Z",
  });
  const id = await createOrGetHubSpotMeeting(
    request,
    { id: "56996862100", name: "GTI", timeZone: "America/New_York" },
    "https://calendar.google.com/calendar/event?eid=safe",
    fakeFetch,
  );
  assert.equal(id, "meeting-123");
  const createCall = calls.find((call) => call.url.endsWith("/crm/v3/objects/meetings"));
  const payload = JSON.parse(String(createCall?.init?.body));
  assert.equal(payload.properties.hs_timestamp, "2026-10-05T13:00:00.000Z");
  assert.equal(payload.properties.hs_meeting_start_time, "2026-10-05T13:00:00.000Z");
  assert.equal(payload.properties.hs_meeting_end_time, "2026-10-05T19:00:00.000Z");
  assert.equal(payload.properties.hs_meeting_outcome, "SCHEDULED");
  assert.equal(payload.properties.hs_activity_type, "On-Site");
  assert.equal(payload.associations[0].types[0].associationTypeId, 188);
  assert.equal(payload.associations[0].to.id, "56996862100");
});
