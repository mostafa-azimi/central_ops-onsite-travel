import { databaseConfigured, listActiveAdminEmails } from "@/lib/db";

export const INITIAL_ADMIN_EMAIL = "mike.azimi@shiphero.com";

export async function isAllowedAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!databaseConfigured()) return normalized === INITIAL_ADMIN_EMAIL;
  try {
    return (await listActiveAdminEmails()).includes(normalized);
  } catch {
    return false;
  }
}
