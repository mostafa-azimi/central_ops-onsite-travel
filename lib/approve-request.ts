import {
  claimVisitRequestApproval,
  completeVisitRequestApproval,
  failVisitRequestApproval,
  getVisitRequest,
  saveCalendarResult,
  type StoredVisitRequest,
} from "@/lib/db";
import { createOrGetCalendarEvent, googleCalendarConfigured } from "@/lib/google-calendar";
import { createOrGetHubSpotMeeting, findVerifiedCompany, hubSpotConfigured } from "@/lib/hubspot";
import { inclusiveEndToExclusive } from "@/lib/submissions";
import type { Assignee } from "@/lib/types";

export class ApprovalError extends Error {
  constructor(message: string, public readonly code: "not_configured" | "conflict" | "sync_failed") {
    super(message);
  }
}

export function approvalConnectionsConfigured() {
  return googleCalendarConfigured() && hubSpotConfigured();
}

export async function approveVisitRequest(id: string, traveler: Assignee, actorEmail: string) {
  if (!approvalConnectionsConfigured()) {
    throw new ApprovalError("Calendar and HubSpot write connections are not configured.", "not_configured");
  }

  const current = await getVisitRequest(id);
  if (current?.status === "approved" && current.assignedTraveler === traveler) return current;

  const claimed = await claimVisitRequestApproval(id, traveler);
  if (!claimed) {
    throw new ApprovalError("The request is already decided, assigned differently, or being synchronized.", "conflict");
  }

  try {
    const company = await findVerifiedCompany(claimed.cashAccountId, claimed.cashUrl);
    const calendar = await createOrGetCalendarEvent({
      requestId: claimed.id,
      traveler,
      tripType: claimed.tripType,
      companyName: company.name,
      city: claimed.city,
      state: claimed.state,
      start: claimed.start,
      endInclusive: claimed.end,
    });
    const withCalendar = await saveCalendarResult(claimed.id, calendar.id, calendar.htmlLink, company.id);
    if (!withCalendar) throw new Error("Request changed while Calendar result was being saved");

    const meetingId = await createOrGetHubSpotMeeting(
      withCalendar,
      company,
      calendar.htmlLink,
      inclusiveEndToExclusive(withCalendar.end),
    );
    const completed = await completeVisitRequestApproval(withCalendar.id, actorEmail, meetingId);
    if (!completed) throw new Error("Request changed while approval was being completed");
    return completed;
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "Unknown synchronization failure";
    await failVisitRequestApproval(claimed.id, safeMessage).catch(() => undefined);
    throw new ApprovalError(
      "Approval could not be synchronized. No mock success was recorded; it is safe to retry.",
      "sync_failed",
    );
  }
}

export type { StoredVisitRequest };
