import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { TRAVELER_EMAILS, type Assignee } from "@/lib/types";
import type { StoredVisitRequest } from "@/lib/db";

export function canApproveVisitChange(request: StoredVisitRequest, employeeEmail: string) {
  const normalized = employeeEmail.trim().toLowerCase();
  if (isAllowedAdminEmail(normalized)) return true;
  if (!request.assignedTraveler) return false;
  return TRAVELER_EMAILS[request.assignedTraveler as Assignee]?.toLowerCase() === normalized;
}
