import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, appOrigin, verifyEmployeeToken } from "@/lib/admin-auth";
import { externalRequestSignal } from "@/lib/external-request";

export const runtime = "nodejs";

function appRedirect(request: Request, path: string, error?: string) {
  const safePath = ["/", "/?view=submit", "/map", "/calendar", "/admin", "/admin/settings", "/admin/operations"].includes(path) ? path : "/admin";
  const url = new URL(safePath, appOrigin(request));
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function clearSignInCookies(response: NextResponse) {
  response.cookies.delete("central_ops_oauth_state");
  response.cookies.delete("central_ops_oauth_verifier");
  response.cookies.delete("central_ops_oauth_return");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("central_ops_oauth_state")?.value;
  const verifier = store.get("central_ops_oauth_verifier")?.value;
  const savedReturnTo = store.get("central_ops_oauth_return")?.value;
  const returnTo = ["/", "/?view=submit", "/map", "/calendar", "/admin", "/admin/settings", "/admin/operations"].includes(savedReturnTo ?? "") ? savedReturnTo! : "/admin";
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OIDC_CLIENT_SECRET;

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !clientId || !clientSecret) {
    return clearSignInCookies(appRedirect(request, returnTo, "invalid_sign_in"));
  }

  try {
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
      signal: externalRequestSignal(),
    });
    if (!tokenResponse.ok) return clearSignInCookies(appRedirect(request, returnTo, "token_exchange_failed"));
    const tokenData = (await tokenResponse.json()) as { id_token?: string };
    const session = await verifyEmployeeToken(tokenData.id_token);
    if (!session || !tokenData.id_token) return clearSignInCookies(appRedirect(request, returnTo, "not_authorized"));

    const response = appRedirect(request, returnTo);
    response.cookies.set(ADMIN_COOKIE, tokenData.id_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
    return clearSignInCookies(response);
  } catch {
    return clearSignInCookies(appRedirect(request, returnTo, "sign_in_unavailable"));
  }
}
