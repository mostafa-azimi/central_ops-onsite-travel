const SIGN_IN_ORIGIN = (process.env.NEXT_PUBLIC_SIGN_IN_ORIGIN ?? "").trim().replace(/\/$/, "");

export function googleSignInHref(returnTo = "/admin") {
  const path = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
  return `${SIGN_IN_ORIGIN}${path}`;
}

export function googleSignInErrorMessage(error: string | undefined) {
  if (!error) return "";
  if (error === "not_authorized") return "Use a verified @shiphero.com Google account.";
  return "Google sign-in did not finish. Please try again.";
}
