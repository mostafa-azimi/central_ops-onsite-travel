import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, appOrigin, verifyEmployeeToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

function appRedirect(request: Request, path: string, error?: string) {
  const url = new URL(path === "/map" ? "/map" : "/admin", appOrigin(request));
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("central_ops_oauth_state")?.value;
  const verifier = store.get("central_ops_oauth_verifier")?.value;
  const returnTo = store.get("central_ops_oauth_return")?.value === "/map" ? "/map" : "/admin";
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OIDC_CLIENT_SECRET;

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !clientId || !clientSecret) {
    return appRedirect(request, returnTo, "invalid_sign_in");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appOrigin(request)}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) return appRedirect(request, returnTo, "token_exchange_failed");
  const tokenData = (await tokenResponse.json()) as { id_token?: string };
  const session = await verifyEmployeeToken(tokenData.id_token);
  if (!session || !tokenData.id_token) return appRedirect(request, returnTo, "not_authorized");

  const response = appRedirect(request, returnTo);
  response.cookies.set(ADMIN_COOKIE, tokenData.id_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  });
  response.cookies.delete("central_ops_oauth_state");
  response.cookies.delete("central_ops_oauth_verifier");
  response.cookies.delete("central_ops_oauth_return");
  return response;
}
