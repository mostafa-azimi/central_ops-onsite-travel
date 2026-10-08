import { createHash, randomUUID } from "node:crypto";
import { normalizeAccountName, type ReadinessAnswers, type VisitRequestSubmission } from "@/lib/submissions";
import { TRAVELER_EMAILS, type Assignee } from "@/lib/types";

const SHEETS_API = "https://sheets.googleapis.com/v4";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUESTS_TAB = "Requests";
const AUDIT_TAB = "Audit";
const REQUEST_COLUMN_COUNT = 50;
const REQUEST_RANGE_END = "AX";
type Fetch = typeof fetch;

export const REQUEST_HEADERS = [
  "id", "created_at", "updated_at", "status", "trip_type", "cash_url", "cash_account_id",
  "city", "state", "start_date", "end_date_inclusive", "assigned_traveler", "decided_at",
  "decided_by_email", "calendar_event_id", "calendar_event_url", "hubspot_meeting_id",
  "hubspot_company_id", "sync_status", "sync_started_at", "sync_attempts", "sync_error",
  "payload_fingerprint", "claim_token", "account_name",
  "full_address", "country_code", "latitude", "longitude", "place_id",
  "lifecycle_action", "lifecycle_version", "participants_snapshot",
  "date_confidence", "requester_email", "requester_name", "change_type", "change_status",
  "proposed_start_date", "proposed_end_date", "change_requested_by_email", "change_requested_at",
  "change_decided_by_email", "change_decided_at", "postal_code",
  "readiness_json", "contact_name", "contact_email", "contact_phone", "warehouse_start_time",
] as const;

export const AUDIT_HEADERS = [
  "audit_id", "request_id", "created_at", "actor_email", "action", "details_json",
] as const;

export type StoredVisitRequest = Omit<VisitRequestSubmission, "readiness"> & {
  readiness: ReadinessAnswers | null;
  id: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  createdAt: string;
  assignedTraveler: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  calendarEventId: string | null;
  hubspotMeetingId: string | null;
  hubspotCompanyId: string | null;
  calendarEventUrl: string | null;
  syncStatus: "not_started" | "syncing_calendar" | "awaiting_hubspot" | "syncing_hubspot" | "complete" | "failed";
  syncError: string | null;
  syncAttempts: number;
  lifecycleAction: "create" | "reschedule" | "cancel" | "participants";
  lifecycleVersion: number;
  participantsSnapshot: string[];
  pendingChange: null | {
    type: "reschedule" | "cancel";
    start: string | null;
    end: string | null;
    requestedByEmail: string;
    requestedAt: string;
  };
};

type RequestRow = {
  rowNumber: number;
  values: string[];
  request: StoredVisitRequest;
  fingerprint: string;
  claimToken: string;
  syncStartedAt: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let schemaEnsured = false;

export function databaseConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_ID &&
    process.env.GOOGLE_SHEETS_CLIENT_SECRET &&
    process.env.GOOGLE_SHEETS_REFRESH_TOKEN &&
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  );
}

function sheetsCredential() {
  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_SHEETS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
  return { clientId, clientSecret, refreshToken };
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_NOT_CONFIGURED");
  return id;
}

async function responseMessage(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; error_description?: string };
    return parsed.error?.message ?? parsed.error_description ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function accessToken(fetchImpl: Fetch = fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const credential = sheetsCredential();
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credential.clientId,
      client_secret: credential.clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Sheets token refresh failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google Sheets token refresh returned no access token");
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

function cell(values: string[], index: number) {
  return String(values[index] ?? "");
}

export function requestFingerprint(input: VisitRequestSubmission | StoredVisitRequest) {
  return createHash("sha256").update(JSON.stringify({
    tripType: input.tripType,
    accountName: input.accountName,
    cashUrl: input.cashUrl,
    cashAccountId: input.cashAccountId,
    fullAddress: input.fullAddress,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    countryCode: input.countryCode,
    latitude: input.latitude,
    longitude: input.longitude,
    placeId: input.placeId,
    start: input.start,
    end: input.end,
    dateConfidence: input.dateConfidence,
    requesterEmail: input.requesterEmail,
    requesterName: input.requesterName,
    readiness: input.readiness,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    warehouseStartTime: input.warehouseStartTime,
  })).digest("hex");
}

function readinessFromCell(value: string): ReadinessAnswers | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as ReadinessAnswers : null;
  } catch {
    return null;
  }
}

export function storedRequestFromValues(values: string[]): StoredVisitRequest {
  return {
    id: cell(values, 0),
    submissionId: cell(values, 0),
    status: (cell(values, 3) || "pending") as StoredVisitRequest["status"],
    tripType: cell(values, 4) as VisitRequestSubmission["tripType"],
    accountName: cell(values, 24),
    cashUrl: cell(values, 5),
    cashAccountId: cell(values, 6),
    fullAddress: cell(values, 25) || [cell(values, 7), cell(values, 8)].filter(Boolean).join(", "),
    city: cell(values, 7),
    state: cell(values, 8),
    postalCode: cell(values, 44),
    countryCode: cell(values, 26) || "US",
    latitude: cell(values, 27) ? Number(cell(values, 27)) : null,
    longitude: cell(values, 28) ? Number(cell(values, 28)) : null,
    placeId: cell(values, 29),
    start: cell(values, 9),
    end: cell(values, 10),
    createdAt: cell(values, 1),
    assignedTraveler: cell(values, 11) || null,
    decidedAt: cell(values, 12) || null,
    decidedByEmail: cell(values, 13) || null,
    calendarEventId: cell(values, 14) || null,
    calendarEventUrl: cell(values, 15) || null,
    hubspotMeetingId: cell(values, 16) || null,
    hubspotCompanyId: cell(values, 17) || null,
    syncStatus: (cell(values, 18) || "not_started") as StoredVisitRequest["syncStatus"],
    syncAttempts: Number(cell(values, 20) || 0),
    syncError: cell(values, 21) || null,
    lifecycleAction: (cell(values, 30) || "create") as StoredVisitRequest["lifecycleAction"],
    lifecycleVersion: Number(cell(values, 31) || 1),
    participantsSnapshot: (() => { try { const value = JSON.parse(cell(values, 32) || "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } })(),
    dateConfidence: (cell(values, 33) || "medium") as VisitRequestSubmission["dateConfidence"],
    requesterEmail: cell(values, 34).toLowerCase(),
    requesterName: cell(values, 35),
    readiness: readinessFromCell(cell(values, 45)),
    contactName: cell(values, 46),
    contactEmail: cell(values, 47).toLowerCase(),
    contactPhone: cell(values, 48),
    warehouseStartTime: cell(values, 49),
    pendingChange: cell(values, 37) === "pending" && ["reschedule", "cancel"].includes(cell(values, 36))
      ? {
          type: cell(values, 36) as "reschedule" | "cancel",
          start: cell(values, 38) || null,
          end: cell(values, 39) || null,
          requestedByEmail: cell(values, 40).toLowerCase(),
          requestedAt: cell(values, 41),
        }
      : null,
  };
}

function requestRow(values: string[], rowNumber: number): RequestRow {
  const padded = Array.from({ length: REQUEST_COLUMN_COUNT }, (_, index) => cell(values, index));
  return {
    rowNumber,
    values: padded,
    request: storedRequestFromValues(padded),
    fingerprint: cell(padded, 22),
    claimToken: cell(padded, 23),
    syncStartedAt: cell(padded, 19),
  };
}

function initialValues(input: VisitRequestSubmission) {
  const now = new Date().toISOString();
  return [
    input.submissionId, now, now, "pending", input.tripType, input.cashUrl, input.cashAccountId,
    input.city, input.state, input.start, input.end, "", "", "", "", "", "", "",
    "not_started", "", "0", "", requestFingerprint(input), "", input.accountName,
    input.fullAddress, input.countryCode, input.latitude == null ? "" : String(input.latitude),
    input.longitude == null ? "" : String(input.longitude), input.placeId, "create", "1", "",
    input.dateConfidence, input.requesterEmail.toLowerCase(), input.requesterName,
    "", "", "", "", "", "", "", "", input.postalCode,
    JSON.stringify(input.readiness), input.contactName, input.contactEmail.toLowerCase(), input.contactPhone,
    input.warehouseStartTime,
  ];
}

async function sheetsFetch(path: string, init: RequestInit, fetchImpl: Fetch) {
  const token = await accessToken(fetchImpl);
  const response = await fetchImpl(`${SHEETS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Sheets request failed: ${await responseMessage(response)}`);
  return response;
}

async function ensureRequestSchema(fetchImpl: Fetch) {
  if (schemaEnsured) return;
  const rangeName = `${REQUESTS_TAB}!A1:${REQUEST_RANGE_END}1`;
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(rangeName)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ range: rangeName, majorDimension: "ROWS", values: [[...REQUEST_HEADERS]] }) },
    fetchImpl,
  );
  schemaEnsured = true;
}

async function readRows(fetchImpl: Fetch = fetch) {
  const range = encodeURIComponent(`${REQUESTS_TAB}!A2:${REQUEST_RANGE_END}10001`);
  const response = await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${range}?majorDimension=ROWS`,
    { method: "GET" },
    fetchImpl,
  );
  const body = (await response.json()) as { values?: string[][] };
  return (body.values ?? []).map((values, index) => requestRow(values, index + 2)).filter((row) => row.request.id);
}

async function appendValues(tab: string, values: string[], fetchImpl: Fetch) {
  const range = encodeURIComponent(`${tab}!A:${tab === REQUESTS_TAB ? REQUEST_RANGE_END : "F"}`);
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: [values] }) },
    fetchImpl,
  );
}

async function updateRow(row: RequestRow, fetchImpl: Fetch) {
  const rangeName = `${REQUESTS_TAB}!A${row.rowNumber}:${REQUEST_RANGE_END}${row.rowNumber}`;
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(rangeName)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ range: rangeName, majorDimension: "ROWS", values: [row.values] }) },
    fetchImpl,
  );
}

function canonicalRows(rows: RequestRow[]) {
  const byId = new Map<string, RequestRow>();
  for (const row of rows) if (!byId.has(row.request.id)) byId.set(row.request.id, row);
  return [...byId.values()];
}

async function findCanonicalRow(id: string, fetchImpl: Fetch) {
  const matches = (await readRows(fetchImpl)).filter((row) => row.request.id === id);
  if (new Set(matches.map((row) => row.fingerprint)).size > 1) throw new Error("IDEMPOTENCY_CONFLICT");
  return matches[0] ?? null;
}

async function appendAudit(requestId: string, actorEmail: string, action: string, details: object, fetchImpl: Fetch) {
  await appendValues(AUDIT_TAB, [
    randomUUID(), requestId, new Date().toISOString(), actorEmail, action, JSON.stringify(details),
  ], fetchImpl);
}

export async function createVisitRequest(input: VisitRequestSubmission, fetchImpl: Fetch = fetch) {
  await ensureRequestSchema(fetchImpl);
  const existing = await findCanonicalRow(input.submissionId, fetchImpl);
  const fingerprint = requestFingerprint(input);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing.request;
  }
  await appendValues(REQUESTS_TAB, initialValues(input), fetchImpl);
  const saved = await findCanonicalRow(input.submissionId, fetchImpl);
  if (!saved || saved.fingerprint !== fingerprint) throw new Error("SHEETS_WRITE_VERIFICATION_FAILED");
  return saved.request;
}

export async function listVisitRequests(fetchImpl: Fetch = fetch) {
  await ensureRequestSchema(fetchImpl);
  const confidenceRank = { low: 1, medium: 2, high: 3 } as const;
  return canonicalRows(await readRows(fetchImpl))
    .map((row) => row.request)
    .sort((a, b) =>
      Number(a.status !== "pending") - Number(b.status !== "pending") ||
      confidenceRank[b.dateConfidence] - confidenceRank[a.dateConfidence] ||
      b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 250);
}

export async function listEmployeeVisitRequests(employeeEmail: string, fetchImpl: Fetch = fetch) {
  await ensureRequestSchema(fetchImpl);
  const normalized = employeeEmail.trim().toLowerCase();
  return canonicalRows(await readRows(fetchImpl))
    .map((row) => row.request)
    .filter((request) => {
      if (request.requesterEmail === normalized) return true;
      const travelerEmail = request.assignedTraveler
        ? TRAVELER_EMAILS[request.assignedTraveler as Assignee]?.toLowerCase()
        : null;
      return Boolean(request.pendingChange && travelerEmail === normalized);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function getVisitRequest(id: string, fetchImpl: Fetch = fetch) {
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function requestVisitChange(
  id: string,
  change: { type: "reschedule" | "cancel"; start: string | null; end: string | null },
  actorEmail: string,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  const normalizedActor = actorEmail.trim().toLowerCase();
  if (
    !row ||
    !row.request.calendarEventId ||
    row.request.status === "cancelled" ||
    row.request.status === "denied" ||
    row.request.requesterEmail !== normalizedActor ||
    row.request.pendingChange
  ) return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[36] = change.type;
  row.values[37] = "pending";
  row.values[38] = change.start ?? "";
  row.values[39] = change.end ?? "";
  row.values[40] = normalizedActor;
  row.values[41] = now;
  row.values[42] = "";
  row.values[43] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, normalizedActor, `${change.type}_requested`, {
    start: change.start,
    end: change.end,
  }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function denyVisitChange(id: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row?.request.pendingChange) return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[37] = "denied";
  row.values[42] = actorEmail.trim().toLowerCase();
  row.values[43] = now;
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, `${row.request.pendingChange.type}_change_denied`, {}, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function setVisitRequestAccountName(
  id: string,
  value: unknown,
  actorEmail: string,
  fetchImpl: Fetch = fetch,
) {
  const accountName = normalizeAccountName(value);
  if (!accountName) throw new Error("INVALID_ACCOUNT_NAME");
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  if (row.request.accountName) return row.request.accountName === accountName ? row.request : null;
  row.values[2] = new Date().toISOString();
  row.values[24] = accountName;
  const updatedRequest = { ...row.request, accountName };
  row.values[22] = requestFingerprint(updatedRequest);
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "account_name_added", { accountName }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function denyVisitRequest(id: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[3] = "denied";
  row.values[12] = now;
  row.values[13] = actorEmail;
  row.values[23] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "denied", {}, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function recordVisitReschedule(
  id: string,
  input: Pick<VisitRequestSubmission, "fullAddress" | "city" | "state" | "postalCode" | "countryCode" | "latitude" | "longitude" | "placeId" | "start" | "end">,
  actorEmail: string,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || !row.request.calendarEventId || row.request.status === "cancelled" || row.request.status === "denied") return null;
  const pendingChange = row.request.pendingChange;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[7] = input.city;
  row.values[8] = input.state;
  row.values[44] = input.postalCode;
  row.values[9] = input.start;
  row.values[10] = input.end;
  row.values[18] = "awaiting_hubspot";
  row.values[21] = "";
  row.values[25] = input.fullAddress;
  row.values[26] = input.countryCode;
  row.values[27] = input.latitude == null ? "" : String(input.latitude);
  row.values[28] = input.longitude == null ? "" : String(input.longitude);
  row.values[29] = input.placeId;
  row.values[30] = "reschedule";
  row.values[31] = String(row.request.lifecycleVersion + 1);
  if (pendingChange) {
    row.values[37] = "approved";
    row.values[42] = actorEmail.trim().toLowerCase();
    row.values[43] = now;
  }
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, pendingChange ? "reschedule_change_approved" : "rescheduled", {
    start: input.start,
    end: input.end,
    fullAddress: input.fullAddress,
    hubspotStatus: "pending",
  }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function recordVisitCancellation(id: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || !row.request.calendarEventId || row.request.status === "cancelled" || row.request.status === "denied") return null;
  const pendingChange = row.request.pendingChange;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[3] = "cancelled";
  row.values[12] = now;
  row.values[13] = actorEmail;
  row.values[18] = "awaiting_hubspot";
  row.values[21] = "";
  row.values[30] = "cancel";
  row.values[31] = String(row.request.lifecycleVersion + 1);
  if (pendingChange) {
    row.values[37] = "approved";
    row.values[42] = actorEmail.trim().toLowerCase();
    row.values[43] = now;
  }
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, pendingChange ? "cancel_change_approved" : "cancelled", { hubspotStatus: "pending" }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function completeVisitLifecycleHubSpot(id: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row) return null;
  row.values[2] = new Date().toISOString();
  row.values[18] = "complete";
  row.values[21] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, `${row.request.lifecycleAction}_hubspot_synced`, {}, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function recordParticipantChange(
  id: string,
  participants: string[],
  actorEmail: string,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || !row.request.calendarEventId || row.request.status === "cancelled") return null;
  row.values[2] = new Date().toISOString();
  row.values[18] = row.request.hubspotMeetingId ? "awaiting_hubspot" : row.values[18];
  row.values[30] = "participants";
  row.values[31] = String(row.request.lifecycleVersion + 1);
  row.values[32] = JSON.stringify([...new Set(participants)].slice(0, 100));
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "participants_changed", { participants, hubspotStatus: "pending" }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function claimVisitRequestApproval(id: string, traveler: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  if (row.request.assignedTraveler && row.request.assignedTraveler !== traveler) return null;
  const stale = row.syncStartedAt && Date.now() - new Date(row.syncStartedAt).getTime() > 15 * 60 * 1000;
  if (!["not_started", "awaiting_hubspot", "failed"].includes(row.request.syncStatus) && !stale) return null;

  const now = new Date().toISOString();
  const claimToken = randomUUID();
  row.values[2] = now;
  row.values[11] = traveler;
  row.values[18] = row.request.calendarEventId ? "syncing_hubspot" : "syncing_calendar";
  row.values[19] = now;
  row.values[20] = String(row.request.syncAttempts + 1);
  row.values[21] = "";
  row.values[23] = claimToken;
  await updateRow(row, fetchImpl);
  const verified = await findCanonicalRow(id, fetchImpl);
  return verified?.claimToken === claimToken ? verified.request : null;
}

export async function saveCalendarResult(
  id: string,
  eventId: string,
  eventUrl: string,
  companyId: string | null,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  row.values[2] = new Date().toISOString();
  row.values[14] = eventId;
  row.values[15] = eventUrl;
  if (companyId) row.values[17] = companyId;
  row.values[18] = "syncing_hubspot";
  await updateRow(row, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function markVisitRequestAwaitingHubSpot(
  id: string,
  actorEmail: string,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending" || !row.request.calendarEventId) return null;
  row.values[2] = new Date().toISOString();
  row.values[18] = "awaiting_hubspot";
  row.values[19] = "";
  row.values[21] = "";
  row.values[23] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "calendar_scheduled", {
    traveler: row.values[11], calendarEventId: row.values[14], hubspotStatus: "pending",
  }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function failVisitRequestApproval(id: string, error: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return;
  row.values[2] = new Date().toISOString();
  row.values[18] = "failed";
  row.values[19] = "";
  row.values[21] = error.slice(0, 500);
  row.values[23] = "";
  await updateRow(row, fetchImpl);
}

export async function completeVisitRequestApproval(
  id: string,
  actorEmail: string,
  hubspotMeetingId: string,
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending" || !row.request.calendarEventId) return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[3] = "approved";
  row.values[12] = now;
  row.values[13] = actorEmail;
  row.values[16] = hubspotMeetingId;
  row.values[18] = "complete";
  row.values[19] = "";
  row.values[21] = "";
  row.values[23] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "approved", {
    traveler: row.values[11], calendarEventId: row.values[14], hubspotMeetingId,
  }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function createPrivateRequestSpreadsheet(fetchImpl: Fetch = fetch) {
  const token = await accessToken(fetchImpl);
  const response = await fetchImpl(`${SHEETS_API}/spreadsheets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: "Central Ops Travel Requests" },
      sheets: [
        { properties: { title: REQUESTS_TAB, gridProperties: { frozenRowCount: 1, columnCount: REQUEST_COLUMN_COUNT } } },
        { properties: { title: AUDIT_TAB, gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Sheet creation failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { spreadsheetId?: string };
  if (!body.spreadsheetId) throw new Error("Google Sheet creation returned no spreadsheet ID");
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = body.spreadsheetId;
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(body.spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: [
          { range: `${REQUESTS_TAB}!A1:${REQUEST_RANGE_END}1`, majorDimension: "ROWS", values: [[...REQUEST_HEADERS]] },
          { range: `${AUDIT_TAB}!A1:F1`, majorDimension: "ROWS", values: [[...AUDIT_HEADERS]] },
        ],
      }),
    },
    fetchImpl,
  );
  return body.spreadsheetId;
}

export function clearGoogleSheetsTokenCacheForTests() {
  cachedToken = null;
  schemaEnsured = false;
}
