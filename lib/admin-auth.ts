import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { INITIAL_ADMIN_EMAIL, isAllowedAdminEmail } from "@/lib/admin-policy";

export const ADMIN_COOKIE = "central_ops_admin";
export const E2E_AUTH_COOKIE = "central_ops_e2e_user";
export { INITIAL_ADMIN_EMAIL };

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type AdminSession = {
  email: string;
  name: string;
};

export type EmployeeSession = AdminSession;

export function adminAuthConfigured() {
  return Boolean(process.env.GOOGLE_OIDC_CLIENT_ID && process.env.GOOGLE_OIDC_CLIENT_SECRET);
}

function e2eSession(value: string | undefined): EmployeeSession | null {
  if (process.env.NODE_ENV === "production" || process.env.E2E_TEST_AUTH !== "1") return null;
  if (value === "admin") return { email: INITIAL_ADMIN_EMAIL, name: "Mike Azimi" };
  if (value === "employee") return { email: "employee@shiphero.com", name: "ShipHero Employee" };
  return null;
}

export async function verifyEmployeeToken(token: string | undefined): Promise<EmployeeSession | null> {
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  if (!clientId || !token) return null;

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    const hostedDomain = typeof payload.hd === "string" ? payload.hd.toLowerCase() : "";
    if (payload.email_verified !== true || hostedDomain !== "shiphero.com" || !email.endsWith("@shiphero.com")) return null;
    return {
      email,
      name: typeof payload.name === "string" ? payload.name : email,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string | undefined): Promise<AdminSession | null> {
  const employee = await verifyEmployeeToken(token);
  return employee && await isAllowedAdminEmail(employee.email) ? employee : null;
}

export async function getEmployeeSession() {
  const store = await cookies();
  return e2eSession(store.get(E2E_AUTH_COOKIE)?.value) ?? verifyEmployeeToken(store.get(ADMIN_COOKIE)?.value);
}

export async function getAdminSession() {
  const store = await cookies();
  const testSession = e2eSession(store.get(E2E_AUTH_COOKIE)?.value);
  if (testSession) return await isAllowedAdminEmail(testSession.email) ? testSession : null;
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

export function appOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  if (requestOrigin.startsWith("http://localhost:")) return requestOrigin;
  return (process.env.APP_ORIGIN ?? "https://central-ops-travel.aiherolabs.xyz").replace(/\/$/, "");
}
