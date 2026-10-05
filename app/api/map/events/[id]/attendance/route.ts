import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/admin-auth";
import { updateCalendarAttendance } from "@/lib/google-calendar";
import { completeVisitLifecycleHubSpot, databaseConfigured, recordParticipantChange } from "@/lib/db";
import { hubSpotConfigured, updateHubSpotMeetingParticipants } from "@/lib/hubspot";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const employee = await getEmployeeSession();
  if (!employee) return NextResponse.json({ message: "Verified ShipHero sign-in is required." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "join" && body?.action !== "leave") {
    return NextResponse.json({ message: "Choose join or leave." }, { status: 400 });
  }
  const { id } = await params;
  try {
    const result = await updateCalendarAttendance(id, employee.email, body.action);
    if (result?.requestId && databaseConfigured()) {
      const saved = await recordParticipantChange(result.requestId, result.participants, employee.email);
      if (saved?.hubspotMeetingId && hubSpotConfigured()) {
        await updateHubSpotMeetingParticipants(saved.hubspotMeetingId, result.participants);
        await completeVisitLifecycleHubSpot(saved.id, employee.email);
      }
    }
    return NextResponse.json({
      message: body.action === "join"
        ? "You were added to the Calendar invite. HubSpot participants will sync when connected."
        : "You left the Calendar invite. HubSpot participants will sync when connected.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar attendance could not be updated.";
    const status = message === "PRIMARY_TRAVELER_CANNOT_LEAVE" ? 409 : message === "EVENT_NOT_AVAILABLE" ? 404 : 502;
    return NextResponse.json({
      message: message === "PRIMARY_TRAVELER_CANNOT_LEAVE"
        ? "The assigned traveler cannot leave their own visit. Ask an administrator to reassign or cancel it."
        : message === "EVENT_NOT_AVAILABLE" ? "That visit is no longer available." : "Calendar attendance could not be updated.",
    }, { status });
  }
}
