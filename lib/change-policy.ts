import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { findActiveTravelerByName, type StoredVisitRequest } from "@/lib/db";

export async function canApproveVisitChange(request: StoredVisitRequest, employeeEmail: string) {
  const normalized = employeeEmail.trim().toLowerCase();
  if (await isAllowedAdminEmail(normalized)) return true;
  if (!request.assignedTraveler) return false;
  return (await findActiveTravelerByName(request.assignedTraveler))?.email.toLowerCase() === normalized;
}
