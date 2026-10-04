import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { INITIAL_ADMIN_EMAIL, isAllowedAdminEmail } from "@/lib/admin-policy";

export const ADMIN_COOKIE = "central_ops_admin";
export { INITIAL_ADMIN_EMAIL };

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type AdminSession = {
  email: string;
  name: string;
};

export function adminAuthConfigured() {
  return Boolean(process.env.GOOGLE_OIDC_CLIENT_ID && process.env.GOOGLE_OIDC_CLIENT_SECRET);
}

export async function verifyAdminToken(token: string | undefined): Promise<AdminSession | null> {
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  if (!clientId || !token) return null;

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (payload.email_verified !== true || !isAllowedAdminEmail(email)) return null;
    return {
      email,
      name: typeof payload.name === "string" ? payload.name : email,
    };
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

export function appOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  if (requestOrigin.startsWith("http://localhost:")) return requestOrigin;
  return (process.env.APP_ORIGIN ?? "https://cs-onsite-travel.vercel.app").replace(/\/$/, "");
}
