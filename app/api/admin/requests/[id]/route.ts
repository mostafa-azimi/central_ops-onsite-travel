import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  databaseConfigured,
  denyVisitRequest,
  findActiveTravelerByName,
  getVisitRequest,
  recordVisitCancellation,
  recordVisitReschedule,
  setVisitRequestAccountName,
} from "@/lib/db";
import { ApprovalError, approveVisitRequest } from "@/lib/approve-request";
import { cancelCalendarEvent, rescheduleCalendarEvent } from "@/lib/google-calendar";
import { validateVisitSubmission } from "@/lib/submissions";
import { notifyRequestDecision, notifyVisitUpdated } from "@/lib/email-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Invalid request ID." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === "deny") {
    const reason = String(body.reason ?? "").trim().replace(/\s+/g, " ");
    if (reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason)) {
      return NextResponse.json({ message: "Keep the denial reason under 500 characters." }, { status: 400 });
    }
    const denied = await denyVisitRequest(id, admin.email, fetch, reason);
    if (!denied) return NextResponse.json({ message: "Only pending requests can be denied." }, { status: 409 });
    await notifyRequestDecision(denied, "denied", reason);
    return NextResponse.json({ request: denied });
  }
  if (body?.action === "approve") {
    const traveler = await findActiveTravelerByName(String(body.traveler ?? ""));
    if (!traveler) {
      return NextResponse.json({ message: "Select an approved traveler." }, { status: 400 });
    }
    try {
      if (body.accountName) {
        const named = await setVisitRequestAccountName(id, body.accountName, admin.email);
        if (!named) return NextResponse.json({ message: "The account name conflicts with the saved request." }, { status: 409 });
      }
      const approved = await approveVisitRequest(
        id,
        traveler.name,
        admin.email,
      );
      await notifyRequestDecision(approved, "approved");
      return NextResponse.json({
        request: approved,
        message: "Request approved. The Calendar event was created and the assigned traveler was invited.",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_ACCOUNT_NAME") {
        return NextResponse.json({ message: "Enter a valid account name." }, { status: 400 });
      }
      if (error instanceof ApprovalError) {
        const status = error.code === "not_configured" ? 503 : error.code === "conflict" ? 409 : 502;
        return NextResponse.json({ message: error.message }, { status });
      }
      throw error;
    }
  }
  if (body?.action === "reschedule") {
    const current = await getVisitRequest(id);
    if (!current?.calendarEventId) return NextResponse.json({ message: "Only scheduled visits can be rescheduled." }, { status: 409 });
    const parsed = validateVisitSubmission({
      ...current,
      ...body,
      submissionId: current.id,
      traveler: current.assignedTraveler,
      tripType: current.tripType,
      accountName: current.accountName,
      cashUrl: current.cashUrl,
    }, current.assignedTraveler ? [current.assignedTraveler] : []);
    if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
    await rescheduleCalendarEvent(current.calendarEventId, {
      start: parsed.value.start,
      endInclusive: parsed.value.end,
      fullAddress: parsed.value.fullAddress,
      postalCode: parsed.value.postalCode,
      latitude: parsed.value.latitude,
      longitude: parsed.value.longitude,
    });
    const updated = await recordVisitReschedule(id, parsed.value, admin.email);
    if (!updated) return NextResponse.json({ message: "The visit could not be rescheduled." }, { status: 409 });
    await notifyVisitUpdated(updated, "rescheduled");
    return NextResponse.json({ request: updated, message: "Calendar updated and attendees notified." });
  }
  if (body?.action === "cancel") {
    const current = await getVisitRequest(id);
    if (!current?.calendarEventId) return NextResponse.json({ message: "Only scheduled visits can be cancelled." }, { status: 409 });
    await cancelCalendarEvent(current.calendarEventId);
    const updated = await recordVisitCancellation(id, admin.email);
    if (!updated) return NextResponse.json({ message: "The visit could not be cancelled." }, { status: 409 });
    await notifyVisitUpdated(updated, "cancelled");
    return NextResponse.json({ request: updated, message: "Calendar event cancelled and attendees notified." });
  }
  return NextResponse.json({ message: "Select approve, deny, reschedule, or cancel." }, { status: 400 });
}
