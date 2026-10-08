import assert from "node:assert/strict";
import test from "node:test";
import {
  clearGoogleSheetsTokenCacheForTests,
  createPrivateRequestSpreadsheet,
  createVisitRequest,
  claimVisitRequestApproval,
  denyVisitRequest,
  denyVisitChange,
  listVisitRequests,
  recordVisitReschedule,
  requestFingerprint,
  requestVisitChange,
  saveCalendarResult,
  setVisitRequestAccountName,
  storedRequestFromValues,
} from "@/lib/db";
import type { VisitRequestSubmission } from "@/lib/submissions";

const request: VisitRequestSubmission = {
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
  countryCode: "US",
  latitude: 33.77,
  longitude: -84.38,
  placeId: "test-place",
  start: "2026-10-05",
  end: "2026-10-07",
};

function configure() {
  process.env.GOOGLE_SHEETS_CLIENT_ID = "test-client";
  process.env.GOOGLE_SHEETS_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_SHEETS_REFRESH_TOKEN = "test-refresh";
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "test-sheet";
  clearGoogleSheetsTokenCacheForTests();
}

function fakeStore() {
  const requests: string[][] = [];
  const audit: string[][] = [];
  const calls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    if ((init?.method ?? "GET") === "GET" && url.includes("Requests!")) return Response.json({ values: requests });
    if (init?.method === "POST" && url.includes(":append")) {
      const body = JSON.parse(String(init.body)) as { values: string[][] };
      (url.includes("Requests!") ? requests : audit).push([...body.values[0]]);
      return Response.json({ updates: { updatedRows: 1 } });
    }
    if (init?.method === "PUT" && url.includes("Requests!")) {
      const body = JSON.parse(String(init.body)) as { range: string; values: string[][] };
      if (body.range === "Requests!A1:AR1") return Response.json({ updatedRows: 1 });
      const rowNumber = Number(/A(\d+):AR/.exec(body.range)?.[1]);
      requests[rowNumber - 2] = [...body.values[0]];
      return Response.json({ updatedRows: 1 });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;
  return { requests, audit, calls, fakeFetch };
}

test("Sheet rows keep public requests unassigned and preserve stable IDs", () => {
  const values = [
    request.submissionId, "2026-10-05T12:00:00.000Z", "2026-10-05T12:00:00.000Z", "pending",
    request.tripType, request.cashUrl, request.cashAccountId, request.city, request.state,
    request.start, request.end, "", "", "", "", "", "", "", "not_started", "", "0", "",
    requestFingerprint(request), "", request.accountName,
  ];
  const stored = storedRequestFromValues(values);
  assert.equal(stored.id, request.submissionId);
  assert.equal(stored.submissionId, request.submissionId);
  assert.equal(stored.assignedTraveler, null);
  assert.equal(stored.status, "pending");
  assert.equal(stored.accountName, "GTI Properties");
  assert.equal(stored.dateConfidence, "medium");
});

test("sequential duplicate submissions are idempotent and changed payloads conflict", async () => {
  configure();
  const store = fakeStore();
  const first = await createVisitRequest(request, store.fakeFetch);
  const second = await createVisitRequest(request, store.fakeFetch);
  assert.equal(first.id, request.submissionId);
  assert.equal(second.id, request.submissionId);
  assert.equal(store.requests.length, 1);
  assert.equal(store.requests[0][11], "");
  assert.equal(store.requests[0][33], "high");
  assert.equal(store.requests[0][34], "amanda.requester@shiphero.com");

  await assert.rejects(
    createVisitRequest({ ...request, city: "Boston" }, store.fakeFetch),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(store.requests.length, 1);
});

test("pending requests are ranked by date confidence", async () => {
  configure();
  const store = fakeStore();
  await createVisitRequest({ ...request, submissionId: "11111111-1111-4111-8111-111111111111", dateConfidence: "low" }, store.fakeFetch);
  await createVisitRequest({ ...request, submissionId: "22222222-2222-4222-8222-222222222222", dateConfidence: "high" }, store.fakeFetch);
  const listed = await listVisitRequests(store.fakeFetch);
  assert.deepEqual(listed.map((item) => item.dateConfidence), ["high", "low"]);
});

test("denial persists the actor and appends an audit row", async () => {
  configure();
  const store = fakeStore();
  await createVisitRequest(request, store.fakeFetch);
  const denied = await denyVisitRequest(request.submissionId, "mike.azimi@shiphero.com", store.fakeFetch);
  assert.equal(denied?.status, "denied");
  assert.equal(denied?.decidedByEmail, "mike.azimi@shiphero.com");
  assert.equal(store.audit.length, 1);
  assert.equal(store.audit[0][1], request.submissionId);
  assert.equal(store.audit[0][4], "denied");
});

test("an administrator can add the account name to a legacy pending row", async () => {
  configure();
  const store = fakeStore();
  await createVisitRequest(request, store.fakeFetch);
  store.requests[0][24] = "";
  const updated = await setVisitRequestAccountName(
    request.submissionId,
    "  GTI Properties  ",
    "mike.azimi@shiphero.com",
    store.fakeFetch,
  );
  assert.equal(updated?.accountName, "GTI Properties");
  assert.equal(store.requests[0][24], "GTI Properties");
  assert.equal(store.audit[0][4], "account_name_added");
});

test("requester date changes remain pending until an approver applies them", async () => {
  configure();
  const store = fakeStore();
  await createVisitRequest(request, store.fakeFetch);
  await claimVisitRequestApproval(request.submissionId, "Sam Armenia", store.fakeFetch);
  await saveCalendarResult(request.submissionId, "calendar-event", "https://calendar.google.com/event", null, store.fakeFetch);

  assert.equal(await requestVisitChange(
    request.submissionId,
    { type: "reschedule", start: "2026-10-20", end: "2026-10-22" },
    "different.person@shiphero.com",
    store.fakeFetch,
  ), null);

  const proposed = await requestVisitChange(
    request.submissionId,
    { type: "reschedule", start: "2026-10-20", end: "2026-10-22" },
    request.requesterEmail,
    store.fakeFetch,
  );
  assert.equal(proposed?.pendingChange?.type, "reschedule");
  assert.equal(proposed?.start, request.start);

  const approved = await recordVisitReschedule(
    request.submissionId,
    { ...request, start: "2026-10-20", end: "2026-10-22" },
    "samuel.armenia@shiphero.com",
    store.fakeFetch,
  );
  assert.equal(approved?.start, "2026-10-20");
  assert.equal(approved?.pendingChange, null);
  assert.ok(store.audit.some((row) => row[4] === "reschedule_requested"));
  assert.ok(store.audit.some((row) => row[4] === "reschedule_change_approved"));

  const cancellation = await requestVisitChange(
    request.submissionId,
    { type: "cancel", start: null, end: null },
    request.requesterEmail,
    store.fakeFetch,
  );
  assert.equal(cancellation?.pendingChange?.type, "cancel");
  const denied = await denyVisitChange(request.submissionId, "mike.azimi@shiphero.com", store.fakeFetch);
  assert.equal(denied?.pendingChange, null);
  assert.ok(store.audit.some((row) => row[4] === "cancel_change_denied"));
});

test("Sheet setup creates only Requests and Audit tabs with fixed headers", async () => {
  configure();
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  let createBody: Record<string, unknown> | null = null;
  let batchBody: Record<string, unknown> | null = null;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    if (url.endsWith("/spreadsheets") && init?.method === "POST") {
      createBody = JSON.parse(String(init.body));
      return Response.json({ spreadsheetId: "created-sheet" });
    }
    if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
      batchBody = JSON.parse(String(init.body));
      return Response.json({ totalUpdatedRows: 2 });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  assert.equal(await createPrivateRequestSpreadsheet(fakeFetch), "created-sheet");
  const create = createBody as unknown as { sheets: Array<{ properties: { title: string } }> };
  assert.deepEqual(create.sheets.map((sheet) => sheet.properties.title), ["Requests", "Audit"]);
  const batch = batchBody as unknown as { data: Array<{ range: string }> };
  assert.deepEqual(batch.data.map((item) => item.range), ["Requests!A1:AR1", "Audit!A1:F1"]);
});
