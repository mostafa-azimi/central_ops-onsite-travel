import { createHash, randomUUID } from "node:crypto";
import { normalizeAccountName, type ReadinessAnswers, type VisitRequestSubmission } from "@/lib/submissions";
import { DEFAULT_PEOPLE, TRAVELER_COLOR_OPTIONS, TRAVELER_EMAILS, type Assignee, type ManagedPerson, type TravelerProfile } from "@/lib/types";

const SHEETS_API = "https://sheets.googleapis.com/v4";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUESTS_TAB = "Requests";
const AUDIT_TAB = "Audit";
const PEOPLE_TAB = "People";
const REQUEST_COLUMN_COUNT = 50;
const REQUEST_RANGE_END = "AX";
type Fetch = typeof fetch;

export const REQUEST_HEADERS = [
  "id", "created_at", "updated_at", "status", "trip_type", "cash_url", "cash_account_id",
  "city", "state", "start_date", "end_date_inclusive", "assigned_traveler", "decided_at",
  "decided_by_email", "calendar_event_id", "calendar_event_url", "reserved_external_id_1",
  "reserved_external_id_2", "sync_status", "sync_started_at", "sync_attempts", "sync_error",
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

export const PEOPLE_HEADERS = [
  "email", "display_name", "is_traveler", "is_admin", "map_color", "active",
  "created_at", "updated_at", "updated_by_email",
] as const;

const PEOPLE_COLORS = TRAVELER_COLOR_OPTIONS.map(({ value }) => value);

export type StoredVisitRequest = Omit<VisitRequestSubmission, "readiness"> & {
  readiness: ReadinessAnswers | null;
  id: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  createdAt: string;
  assignedTraveler: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  calendarEventId: string | null;
  calendarEventUrl: string | null;
  syncStatus: "not_started" | "syncing_calendar" | "complete" | "failed";
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
let cachedPeople: { value: ManagedPerson[]; expiresAt: number } | null = null;
let schemaEnsured = false;
let peopleSchemaEnsured = false;
let peopleSchemaPromise: Promise<void> | null = null;

export function databaseConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_ID &&
    process.env.GOOGLE_SHEETS_CLIENT_SECRET &&
    process.env.GOOGLE_SHEETS_REFRESH_TOKEN &&
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  );
}

export async function verifyDatabaseConnection(fetchImpl: Fetch = fetch) {
  if (!databaseConfigured()) throw new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
  const response = await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}?fields=spreadsheetId,properties.title`,
    { method: "GET" },
    fetchImpl,
  );
  const body = (await response.json()) as { spreadsheetId?: string };
  if (!body.spreadsheetId) throw new Error("Google Sheets health check returned no spreadsheet ID");
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

function normalizedSyncStatus(value: string, calendarEventId: string | null): StoredVisitRequest["syncStatus"] {
  if (value === "not_started" || value === "syncing_calendar" || value === "complete" || value === "failed") {
    return value;
  }
  return calendarEventId ? "complete" : "not_started";
}

export function storedRequestFromValues(values: string[]): StoredVisitRequest {
  const calendarEventId = cell(values, 14) || null;
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
    calendarEventId,
    calendarEventUrl: cell(values, 15) || null,
    syncStatus: normalizedSyncStatus(cell(values, 18), calendarEventId),
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
  const rangeEnd = tab === REQUESTS_TAB ? REQUEST_RANGE_END : tab === PEOPLE_TAB ? "I" : "F";
  const range = encodeURIComponent(`${tab}!A:${rangeEnd}`);
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

function booleanCell(value: string) {
  return value.trim().toLowerCase() === "true";
}

function personFromValues(values: string[]): ManagedPerson | null {
  const email = cell(values, 0).trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    name: cell(values, 1).trim(),
    isTraveler: booleanCell(cell(values, 2)),
    isAdmin: booleanCell(cell(values, 3)),
    color: cell(values, 4).trim().toLowerCase() || "#3281fd",
    active: booleanCell(cell(values, 5)),
    createdAt: cell(values, 6),
    updatedAt: cell(values, 7),
    updatedByEmail: cell(values, 8).trim().toLowerCase(),
  };
}

function personValues(person: ManagedPerson) {
  return [
    person.email, person.name, String(person.isTraveler), String(person.isAdmin), person.color,
    String(person.active), person.createdAt, person.updatedAt, person.updatedByEmail,
  ];
}

export function dedupeManagedPeople(people: ManagedPerson[]) {
  const byEmail = new Map<string, ManagedPerson>();
  for (const person of people) {
    const existing = byEmail.get(person.email);
    const timestamp = person.updatedAt || person.createdAt;
    const existingTimestamp = existing?.updatedAt || existing?.createdAt || "";
    if (!existing || timestamp >= existingTimestamp) byEmail.set(person.email, person);
  }
  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function readPeopleRows(fetchImpl: Fetch = fetch) {
  const range = encodeURIComponent(`${PEOPLE_TAB}!A2:I1001`);
  const response = await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${range}?majorDimension=ROWS`,
    { method: "GET" },
    fetchImpl,
  );
  const body = (await response.json()) as { values?: string[][] };
  return (body.values ?? [])
    .map((values, index) => ({ rowNumber: index + 2, values, person: personFromValues(values) }))
    .filter((row): row is { rowNumber: number; values: string[]; person: ManagedPerson } => Boolean(row.person));
}

async function initializePeopleSchema(fetchImpl: Fetch = fetch) {
  const metadata = await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}?fields=sheets.properties.title`,
    { method: "GET" },
    fetchImpl,
  );
  const body = (await metadata.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const exists = body.sheets?.some((sheet) => sheet.properties?.title === PEOPLE_TAB) ?? false;
  if (!exists) {
    try {
      await sheetsFetch(
        `/spreadsheets/${encodeURIComponent(spreadsheetId())}:batchUpdate`,
        { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: PEOPLE_TAB, gridProperties: { frozenRowCount: 1, columnCount: PEOPLE_HEADERS.length } } } }] }) },
        fetchImpl,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes('A sheet with the name "People" already exists')) throw error;
    }
  }
  const headerRange = `${PEOPLE_TAB}!A1:I1`;
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ range: headerRange, majorDimension: "ROWS", values: [[...PEOPLE_HEADERS]] }) },
    fetchImpl,
  );
  const rows = await readPeopleRows(fetchImpl);
  if (rows.length === 0) {
    const now = new Date().toISOString();
    const seedRange = `${PEOPLE_TAB}!A2:I${DEFAULT_PEOPLE.length + 1}`;
    const values = DEFAULT_PEOPLE.map((person) => personValues({
      ...person,
      createdAt: now,
      updatedAt: now,
      updatedByEmail: "system",
    }));
    await sheetsFetch(
      `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(seedRange)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ range: seedRange, majorDimension: "ROWS", values }) },
      fetchImpl,
    );
  }
}

async function ensurePeopleSchema(fetchImpl: Fetch = fetch) {
  if (peopleSchemaEnsured) return;
  if (!peopleSchemaPromise) {
    peopleSchemaPromise = initializePeopleSchema(fetchImpl)
      .then(() => { peopleSchemaEnsured = true; })
      .finally(() => { peopleSchemaPromise = null; });
  }
  await peopleSchemaPromise;
}

export async function listPeopleDirectory(fetchImpl: Fetch = fetch) {
  if (!databaseConfigured()) return DEFAULT_PEOPLE;
  if (fetchImpl === fetch && cachedPeople && cachedPeople.expiresAt > Date.now()) return cachedPeople.value;
  await ensurePeopleSchema(fetchImpl);
  const people = dedupeManagedPeople((await readPeopleRows(fetchImpl)).map((row) => row.person));
  if (fetchImpl === fetch) cachedPeople = { value: people, expiresAt: Date.now() + 60_000 };
  return people;
}

export async function listActiveTravelers(fetchImpl: Fetch = fetch): Promise<TravelerProfile[]> {
  return (await listPeopleDirectory(fetchImpl))
    .filter((person) => person.active && person.isTraveler)
    .map(({ email, name, color }) => ({ email, name, color }));
}

export async function listKnownTravelers(fetchImpl: Fetch = fetch): Promise<TravelerProfile[]> {
  return (await listPeopleDirectory(fetchImpl))
    .filter((person) => person.isTraveler)
    .map(({ email, name, color }) => ({ email, name, color }));
}

export async function listActiveAdminEmails(fetchImpl: Fetch = fetch) {
  return (await listPeopleDirectory(fetchImpl)).filter((person) => person.active && person.isAdmin).map((person) => person.email);
}

export async function findActiveTravelerByName(name: string, fetchImpl: Fetch = fetch) {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  return (await listActiveTravelers(fetchImpl)).find((person) => person.name.toLocaleLowerCase("en-US") === normalized) ?? null;
}

export function validateManagedPerson(input: Partial<ManagedPerson>) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const color = String(input.color ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@shiphero\.com$/i.test(email)) throw new Error("SHIPHERO_EMAIL_REQUIRED");
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("VALID_DISPLAY_NAME_REQUIRED");
  if (!input.isTraveler && !input.isAdmin) throw new Error("PERSON_ROLE_REQUIRED");
  if (!PEOPLE_COLORS.includes(color as (typeof PEOPLE_COLORS)[number])) throw new Error("INVALID_PERSON_COLOR");
  return { email, name, color, isTraveler: Boolean(input.isTraveler), isAdmin: Boolean(input.isAdmin), active: input.active !== false };
}

export function assertAdministratorContinuity(existing: ManagedPerson | null, nextIsActiveAdmin: boolean, activeAdminCount: number) {
  if (existing?.active && existing.isAdmin && !nextIsActiveAdmin && activeAdminCount <= 1) {
    throw new Error("LAST_ADMIN_REQUIRED");
  }
}

export function assertTravelerColorAvailable(candidate: Pick<ManagedPerson, "email" | "color" | "isTraveler" | "active">, people: ManagedPerson[]) {
  if (!candidate.active || !candidate.isTraveler) return;
  const conflict = people.find((person) =>
    person.active &&
    person.isTraveler &&
    person.email !== candidate.email &&
    person.color === candidate.color,
  );
  if (conflict) throw new Error("TRAVELER_COLOR_IN_USE");
}

export async function saveManagedPerson(input: Partial<ManagedPerson>, actorEmail: string, fetchImpl: Fetch = fetch) {
  await ensurePeopleSchema(fetchImpl);
  const valid = validateManagedPerson(input);
  const rows = await readPeopleRows(fetchImpl);
  const existing = rows.find((row) => row.person.email === valid.email);
  const activeAdmins = rows.filter((row) => row.person.active && row.person.isAdmin);
  assertAdministratorContinuity(existing?.person ?? null, valid.active && valid.isAdmin, activeAdmins.length);
  assertTravelerColorAvailable(valid, dedupeManagedPeople(rows.map((row) => row.person)));
  const now = new Date().toISOString();
  const person: ManagedPerson = {
    ...valid,
    createdAt: existing?.person.createdAt || now,
    updatedAt: now,
    updatedByEmail: actorEmail.trim().toLowerCase(),
  };
  if (existing) {
    const rangeName = `${PEOPLE_TAB}!A${existing.rowNumber}:I${existing.rowNumber}`;
    await sheetsFetch(
      `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(rangeName)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ range: rangeName, majorDimension: "ROWS", values: [personValues(person)] }) },
      fetchImpl,
    );
  } else {
    await appendValues(PEOPLE_TAB, personValues(person), fetchImpl);
  }
  await appendAudit("people", actorEmail, existing ? "person_updated" : "person_created", { email: person.email, name: person.name, isTraveler: person.isTraveler, isAdmin: person.isAdmin, active: person.active }, fetchImpl);
  cachedPeople = null;
  return person;
}

export async function deactivateManagedPerson(email: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  await ensurePeopleSchema(fetchImpl);
  const normalized = email.trim().toLowerCase();
  const rows = await readPeopleRows(fetchImpl);
  const existing = rows.find((row) => row.person.email === normalized);
  if (!existing?.person.active) return null;
  const activeAdmins = rows.filter((row) => row.person.active && row.person.isAdmin);
  assertAdministratorContinuity(existing.person, false, activeAdmins.length);
  const now = new Date().toISOString();
  const person = { ...existing.person, active: false, updatedAt: now, updatedByEmail: actorEmail.trim().toLowerCase() };
  const rangeName = `${PEOPLE_TAB}!A${existing.rowNumber}:I${existing.rowNumber}`;
  await sheetsFetch(
    `/spreadsheets/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(rangeName)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ range: rangeName, majorDimension: "ROWS", values: [personValues(person)] }) },
    fetchImpl,
  );
  await appendAudit("people", actorEmail, "person_deactivated", { email: normalized }, fetchImpl);
  cachedPeople = null;
  return person;
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
  const travelers = await listKnownTravelers(fetchImpl);
  return canonicalRows(await readRows(fetchImpl))
    .map((row) => row.request)
    .filter((request) => {
      if (request.requesterEmail === normalized) return true;
      const travelerEmail = request.assignedTraveler
        ? travelers.find((person) => person.name === request.assignedTraveler)?.email.toLowerCase()
          ?? TRAVELER_EMAILS[request.assignedTraveler as Assignee]?.toLowerCase()
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

export async function denyVisitRequest(id: string, actorEmail: string, fetchImpl: Fetch = fetch, reason = "") {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[3] = "denied";
  row.values[12] = now;
  row.values[13] = actorEmail;
  row.values[23] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "denied", reason ? { reason } : {}, fetchImpl);
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
  row.values[18] = "complete";
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
  row.values[18] = "complete";
  row.values[21] = "";
  row.values[30] = "cancel";
  row.values[31] = String(row.request.lifecycleVersion + 1);
  if (pendingChange) {
    row.values[37] = "approved";
    row.values[42] = actorEmail.trim().toLowerCase();
    row.values[43] = now;
  }
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, pendingChange ? "cancel_change_approved" : "cancelled", {}, fetchImpl);
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
  row.values[18] = "complete";
  row.values[21] = "";
  row.values[30] = "participants";
  row.values[31] = String(row.request.lifecycleVersion + 1);
  row.values[32] = JSON.stringify([...new Set(participants)].slice(0, 100));
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "participants_changed", { participants }, fetchImpl);
  return (await findCanonicalRow(id, fetchImpl))?.request ?? null;
}

export async function claimVisitRequestApproval(id: string, traveler: string, fetchImpl: Fetch = fetch) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  if (row.request.assignedTraveler && row.request.assignedTraveler !== traveler) return null;
  const stale = row.syncStartedAt && Date.now() - new Date(row.syncStartedAt).getTime() > 15 * 60 * 1000;
  if (!["not_started", "complete", "failed"].includes(row.request.syncStatus) && !stale) return null;

  const now = new Date().toISOString();
  const claimToken = randomUUID();
  row.values[2] = now;
  row.values[11] = traveler;
  row.values[18] = "syncing_calendar";
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
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending") return null;
  row.values[2] = new Date().toISOString();
  row.values[14] = eventId;
  row.values[15] = eventUrl;
  row.values[18] = "syncing_calendar";
  await updateRow(row, fetchImpl);
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
  fetchImpl: Fetch = fetch,
) {
  const row = await findCanonicalRow(id, fetchImpl);
  if (!row || row.request.status !== "pending" || !row.request.calendarEventId) return null;
  const now = new Date().toISOString();
  row.values[2] = now;
  row.values[3] = "approved";
  row.values[12] = now;
  row.values[13] = actorEmail;
  row.values[18] = "complete";
  row.values[19] = "";
  row.values[21] = "";
  row.values[23] = "";
  await updateRow(row, fetchImpl);
  await appendAudit(id, actorEmail, "approved", {
    traveler: row.values[11], calendarEventId: row.values[14],
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
        { properties: { title: PEOPLE_TAB, gridProperties: { frozenRowCount: 1, columnCount: PEOPLE_HEADERS.length } } },
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
          { range: `${PEOPLE_TAB}!A1:I1`, majorDimension: "ROWS", values: [[...PEOPLE_HEADERS]] },
        ],
      }),
    },
    fetchImpl,
  );
  return body.spreadsheetId;
}

export function clearGoogleSheetsTokenCacheForTests() {
  cachedToken = null;
  cachedPeople = null;
  schemaEnsured = false;
  peopleSchemaEnsured = false;
  peopleSchemaPromise = null;
}
