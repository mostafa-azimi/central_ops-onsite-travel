export const INITIAL_ADMIN_EMAIL = "mike.azimi@shiphero.com";

export function isAllowedAdminEmail(email: string) {
  return email.trim().toLowerCase() === INITIAL_ADMIN_EMAIL;
}
