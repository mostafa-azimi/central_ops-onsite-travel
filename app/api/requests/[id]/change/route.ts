import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/admin-auth";
import { canApproveVisitChange } from "@/lib/change-policy";
import {
  completeVisitLifecycleHubSpot,
  databaseConfigured,
  denyVisitChange,
  getVisitRequest,
  recordVisitCancellation,
  recordVisitReschedule,
  requestVisitChange,
} from "@/lib/db";
import { cancelCalendarEvent, rescheduleCalendarEvent } from "@/lib/google-calendar";
import { findVerifiedCompany, hubSpotConfigured, updateHubSpotMeetingLifecycle } from "@/lib/hubspot";
import { validateVisitChange } from "@/lib/submissions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const employee = await getEmployeeSession();
  if (!employee) return NextResponse.json({ message: "Verified ShipHero sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Invalid request ID." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const current = await getVisitRequest(id);
  if (!current) return NextResponse.json({ message: "Visit request not found." }, { status: 404 });

  if (action === "request_cancel" || action === "request_reschedule") {
    const parsed = validateVisitChange(body);
    if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
    const updated = await requestVisitChange(id, parsed.value, employee.email);
    if (!updated) {
      return NextResponse.json({ message: "Only the original requester can change a scheduled visit, and only one change can be pending." }, { status: 409 });
    }
    return NextResponse.json({
      request: updated,
      message: parsed.value.type === "cancel"
        ? "Cancellation submitted for traveler or administrator approval."
        : "New dates submitted for traveler or administrator approval.",
    });
  }

  if (action !== "approve_change" && action !== "deny_change") {
    return NextResponse.json({ message: "Select a valid change action." }, { status: 400 });
  }
  if (!current.pendingChange) return NextResponse.json({ message: "No change is awaiting approval." }, { status: 409 });
  if (!canApproveVisitChange(current, employee.email)) {
    return NextResponse.json({ message: "Only an administrator or the assigned traveler can decide this change." }, { status: 403 });
  }

  if (action === "deny_change") {
    const denied = await denyVisitChange(id, employee.email);
    if (!denied) return NextResponse.json({ message: "The change is no longer pending." }, { status: 409 });
    return NextResponse.json({ request: denied, message: "Change request denied. The scheduled visit was not modified." });
  }

  if (!current.calendarEventId) return NextResponse.json({ message: "The Calendar event is missing." }, { status: 409 });
  let updated;
  if (current.pendingChange.type === "cancel") {
    await cancelCalendarEvent(current.calendarEventId);
    updated = await recordVisitCancellation(id, employee.email);
  } else {
    const { start, end } = current.pendingChange;
    if (!start || !end) return NextResponse.json({ message: "The proposed dates are incomplete." }, { status: 409 });
    await rescheduleCalendarEvent(current.calendarEventId, {
      start,
      endInclusive: end,
      fullAddress: current.fullAddress,
      latitude: current.latitude,
      longitude: current.longitude,
    });
    updated = await recordVisitReschedule(id, { ...current, start, end }, employee.email);
  }
  if (!updated) return NextResponse.json({ message: "The change could not be recorded." }, { status: 409 });

  if (hubSpotConfigured() && updated.hubspotMeetingId) {
    const company = await findVerifiedCompany(updated.cashAccountId, updated.cashUrl);
    await updateHubSpotMeetingLifecycle(updated, company, updated.lifecycleAction === "cancel" ? "cancel" : "reschedule");
    updated = await completeVisitLifecycleHubSpot(id, employee.email) ?? updated;
  }

  return NextResponse.json({
    request: updated,
    message: updated.status === "cancelled"
      ? "Cancellation approved. Calendar attendees were notified."
      : "New dates approved. Calendar attendees were notified.",
  });
}
