import { neon } from "@neondatabase/serverless";
import type { VisitRequestSubmission } from "@/lib/submissions";

export type StoredVisitRequest = VisitRequestSubmission & {
  id: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  assignedTraveler: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  calendarEventId: string | null;
  hubspotMeetingId: string | null;
  hubspotCompanyId: string | null;
  calendarEventUrl: string | null;
  syncStatus: "not_started" | "syncing_calendar" | "syncing_hubspot" | "complete" | "failed";
  syncError: string | null;
  syncAttempts: number;
};

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(url);
}

function mapRow(row: Record<string, unknown>): StoredVisitRequest {
  return {
    id: String(row.id),
    submissionId: String(row.id),
    status: String(row.status) as StoredVisitRequest["status"],
    tripType: String(row.trip_type) as VisitRequestSubmission["tripType"],
    cashUrl: String(row.cash_url),
    cashAccountId: String(row.cash_account_id),
    city: String(row.city),
    state: String(row.state),
    start: String(row.start_date).slice(0, 10),
    end: String(row.end_date_inclusive).slice(0, 10),
    createdAt: new Date(String(row.created_at)).toISOString(),
    assignedTraveler: row.assigned_traveler ? String(row.assigned_traveler) : null,
    decidedAt: row.decided_at ? new Date(String(row.decided_at)).toISOString() : null,
    decidedByEmail: row.decided_by_email ? String(row.decided_by_email) : null,
    calendarEventId: row.calendar_event_id ? String(row.calendar_event_id) : null,
    hubspotMeetingId: row.hubspot_meeting_id ? String(row.hubspot_meeting_id) : null,
    hubspotCompanyId: row.hubspot_company_id ? String(row.hubspot_company_id) : null,
    calendarEventUrl: row.calendar_event_url ? String(row.calendar_event_url) : null,
    syncStatus: String(row.sync_status) as StoredVisitRequest["syncStatus"],
    syncError: row.sync_error ? String(row.sync_error) : null,
    syncAttempts: Number(row.sync_attempts ?? 0),
  };
}

export async function createVisitRequest(input: VisitRequestSubmission) {
  const sql = client();
  const rows = await sql`
    INSERT INTO visit_requests (
      id, trip_type, cash_url, cash_account_id, city, state, start_date, end_date_inclusive
    ) VALUES (
      ${input.submissionId}, ${input.tripType}, ${input.cashUrl}, ${input.cashAccountId},
      ${input.city}, ${input.state}, ${input.start}, ${input.end}
    )
    ON CONFLICT (id) DO UPDATE SET id = visit_requests.id
    RETURNING *
  `;
  const saved = mapRow(rows[0] as Record<string, unknown>);
  if (
    saved.tripType !== input.tripType || saved.cashUrl !== input.cashUrl ||
    saved.cashAccountId !== input.cashAccountId || saved.city !== input.city ||
    saved.state !== input.state || saved.start !== input.start || saved.end !== input.end
  ) {
    throw new Error("IDEMPOTENCY_CONFLICT");
  }
  return saved;
}

export async function listVisitRequests() {
  const sql = client();
  const rows = await sql`
    SELECT * FROM visit_requests
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 250
  `;
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getVisitRequest(id: string) {
  const sql = client();
  const rows = await sql`SELECT * FROM visit_requests WHERE id = ${id}::uuid LIMIT 1`;
  return rows.length === 1 ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function denyVisitRequest(id: string, actorEmail: string) {
  const sql = client();
  const rows = await sql`
    WITH updated AS (
      UPDATE visit_requests
      SET status = 'denied', decided_at = now(), decided_by_email = ${actorEmail}, updated_at = now()
      WHERE id = ${id}::uuid AND status = 'pending'
      RETURNING *
    ), audited AS (
      INSERT INTO visit_request_audit (request_id, actor_email, action)
      SELECT id, ${actorEmail}, 'denied' FROM updated
      RETURNING request_id
    )
    SELECT updated.* FROM updated, audited WHERE audited.request_id = updated.id
  `;
  if (rows.length !== 1) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function claimVisitRequestApproval(id: string, traveler: string) {
  const sql = client();
  const rows = await sql`
    UPDATE visit_requests
    SET assigned_traveler = COALESCE(assigned_traveler, ${traveler}),
        sync_status = CASE WHEN calendar_event_id IS NULL THEN 'syncing_calendar' ELSE 'syncing_hubspot' END,
        sync_started_at = now(), sync_attempts = sync_attempts + 1, sync_error = NULL, updated_at = now()
    WHERE id = ${id}::uuid
      AND status = 'pending'
      AND (assigned_traveler IS NULL OR assigned_traveler = ${traveler})
      AND (
        sync_status IN ('not_started', 'failed')
        OR (sync_status IN ('syncing_calendar', 'syncing_hubspot') AND sync_started_at < now() - interval '15 minutes')
      )
    RETURNING *
  `;
  return rows.length === 1 ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function saveCalendarResult(id: string, eventId: string, eventUrl: string, companyId: string) {
  const sql = client();
  const rows = await sql`
    UPDATE visit_requests
    SET calendar_event_id = ${eventId}, calendar_event_url = ${eventUrl},
        hubspot_company_id = ${companyId}, sync_status = 'syncing_hubspot', updated_at = now()
    WHERE id = ${id}::uuid AND status = 'pending'
    RETURNING *
  `;
  return rows.length === 1 ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function failVisitRequestApproval(id: string, error: string) {
  const sql = client();
  await sql`
    UPDATE visit_requests
    SET sync_status = 'failed', sync_error = ${error.slice(0, 500)}, sync_started_at = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND status = 'pending'
  `;
}

export async function completeVisitRequestApproval(
  id: string,
  actorEmail: string,
  hubspotMeetingId: string,
) {
  const sql = client();
  const rows = await sql`
    WITH updated AS (
      UPDATE visit_requests
      SET status = 'approved', hubspot_meeting_id = ${hubspotMeetingId}, sync_status = 'complete',
          sync_error = NULL, sync_started_at = NULL, decided_at = now(),
          decided_by_email = ${actorEmail}, updated_at = now()
      WHERE id = ${id}::uuid AND status = 'pending' AND calendar_event_id IS NOT NULL
      RETURNING *
    ), audited AS (
      INSERT INTO visit_request_audit (request_id, actor_email, action, details)
      SELECT id, ${actorEmail}, 'approved', jsonb_build_object(
        'traveler', assigned_traveler,
        'calendar_event_id', calendar_event_id,
        'hubspot_meeting_id', hubspot_meeting_id
      ) FROM updated
      RETURNING request_id
    )
    SELECT updated.* FROM updated, audited WHERE audited.request_id = updated.id
  `;
  return rows.length === 1 ? mapRow(rows[0] as Record<string, unknown>) : null;
}
