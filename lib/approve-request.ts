import {
  claimVisitRequestApproval,
  completeVisitRequestApproval,
  failVisitRequestApproval,
  getVisitRequest,
  saveCalendarResult,
  type StoredVisitRequest,
} from "@/lib/db";
import { createOrGetCalendarEvent, googleCalendarConfigured } from "@/lib/google-calendar";
import type { Assignee } from "@/lib/types";

export class ApprovalError extends Error {
  constructor(message: string, public readonly code: "not_configured" | "conflict" | "sync_failed") {
    super(message);
  }
}

export function approvalConnectionsConfigured() {
  return googleCalendarConfigured();
}

export function approvalConnectionError() {
  return googleCalendarConfigured() ? null : "Calendar write connection is not configured.";
}

export async function approveVisitRequest(id: string, traveler: Assignee, actorEmail: string) {
  const connectionError = approvalConnectionError();
  if (connectionError) {
    throw new ApprovalError(connectionError, "not_configured");
  }

  const current = await getVisitRequest(id);
  if (current?.status === "approved" && current.assignedTraveler === traveler) return current;
  if (!current?.accountName) {
    throw new ApprovalError("Enter the account name before approving this request.", "conflict");
  }

  const claimed = await claimVisitRequestApproval(id, traveler);
  if (!claimed) {
    throw new ApprovalError("The request is already decided, assigned differently, or being synchronized.", "conflict");
  }

  try {
    let withCalendar = claimed;
    if (!claimed.calendarEventId || !claimed.calendarEventUrl) {
      const calendar = await createOrGetCalendarEvent({
        requestId: claimed.id,
        traveler,
        tripType: claimed.tripType,
        companyName: claimed.accountName,
        cashUrl: claimed.cashUrl,
        city: claimed.city,
        state: claimed.state,
        fullAddress: claimed.fullAddress,
        postalCode: claimed.postalCode,
        countryCode: claimed.countryCode,
        latitude: claimed.latitude,
        longitude: claimed.longitude,
        start: claimed.start,
        endInclusive: claimed.end,
        readiness: claimed.readiness,
        contactName: claimed.contactName,
        contactEmail: claimed.contactEmail,
        contactPhone: claimed.contactPhone,
        warehouseStartTime: claimed.warehouseStartTime,
      });
      const saved = await saveCalendarResult(claimed.id, calendar.id, calendar.htmlLink);
      if (!saved) throw new Error("Request changed while Calendar result was being saved");
      withCalendar = saved;
    }

    const completed = await completeVisitRequestApproval(withCalendar.id, actorEmail);
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
