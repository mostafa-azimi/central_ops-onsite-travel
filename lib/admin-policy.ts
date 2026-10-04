export const INITIAL_ADMIN_EMAIL = "mike.azimi@shiphero.com";

export function isAllowedAdminEmail(email: string, additionalEmails = process.env.ADMIN_ALLOWED_EMAILS ?? "") {
  const allowed = new Set([
    INITIAL_ADMIN_EMAIL,
    ...additionalEmails
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ]);
  return allowed.has(email.trim().toLowerCase());
}
