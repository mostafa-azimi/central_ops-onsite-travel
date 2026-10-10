import { inspectCalendarEvent } from "@/lib/google-calendar";
import { listVisitRequests, recordOperationalAudit } from "@/lib/db";
import { notifyOperationalAlert } from "@/lib/email-notifications";

export type ReconciliationCheck = {
  requestId: string;
  accountName: string;
  calendarEventId: string;
  issues: string[];
};

export async function reconcileScheduledVisits(actorEmail = "system") {
  const requests = (await listVisitRequests()).filter((request) => request.status === "approved" && request.calendarEventId && request.assignedTraveler).slice(0, 100);
  const checks: ReconciliationCheck[] = [];
  for (const request of requests) {
    try {
      const issues = await inspectCalendarEvent({
        id: request.id,
        calendarEventId: request.calendarEventId!,
        assignedTraveler: request.assignedTraveler!,
        accountName: request.accountName,
        start: request.start,
        end: request.end,
      });
      checks.push({ requestId: request.id, accountName: request.accountName, calendarEventId: request.calendarEventId!, issues });
    } catch (error) {
      checks.push({ requestId: request.id, accountName: request.accountName, calendarEventId: request.calendarEventId!, issues: [error instanceof Error ? error.message : "Calendar check failed"] });
    }
  }
  const problems = checks.filter((check) => check.issues.length > 0);
  await recordOperationalAudit("calendar_reconciled", { checked: checks.length, problems: problems.length }, actorEmail);
  if (problems.length > 0) {
    const details = problems.map((problem) => `${problem.accountName}: ${problem.issues.join("; ")}`).join("\n");
    await notifyOperationalAlert(`calendar-reconciliation:${new Date().toISOString().slice(0, 10)}`, `Calendar reconciliation: ${problems.length} ${problems.length === 1 ? "visit needs" : "visits need"} attention`, `Central Ops Travel found Calendar differences.\n\n${details}\n\nReview: ${(process.env.APP_ORIGIN ?? "https://central-ops-travel-hub.vercel.app").replace(/\/$/, "")}/admin/operations`);
  }
  return { checkedAt: new Date().toISOString(), checked: checks.length, problems };
}
