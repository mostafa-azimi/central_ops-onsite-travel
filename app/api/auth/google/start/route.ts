import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { adminAuthConfigured, appOrigin } from "@/lib/admin-auth";

export const runtime = "nodejs";

function publicRequestHost(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwardedHost || request.headers.get("host")?.trim() || new URL(request.url).host;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const canonicalOrigin = appOrigin(request);
  if (publicRequestHost(request) !== new URL(canonicalOrigin).host) {
    return NextResponse.redirect(new URL(`${requestUrl.pathname}${requestUrl.search}`, canonicalOrigin));
  }

  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  if (!adminAuthConfigured() || !clientId) {
    return NextResponse.json({ message: "Google administrator sign-in is not configured." }, { status: 503 });
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${canonicalOrigin}/api/auth/google/callback`;
  const requestedReturnTo = requestUrl.searchParams.get("returnTo");
  const returnTo = ["/", "/?view=submit", "/map", "/calendar", "/admin", "/admin/settings", "/admin/operations"].includes(requestedReturnTo ?? "")
    ? requestedReturnTo!
    : "/admin";
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  response.cookies.set("central_ops_oauth_state", state, cookieOptions);
  response.cookies.set("central_ops_oauth_verifier", verifier, cookieOptions);
  response.cookies.set("central_ops_oauth_return", returnTo, cookieOptions);
  return response;
}
