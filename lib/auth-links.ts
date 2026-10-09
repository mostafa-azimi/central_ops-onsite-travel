const SIGN_IN_ORIGIN = (process.env.NEXT_PUBLIC_SIGN_IN_ORIGIN ?? "").trim().replace(/\/$/, "");

export function googleSignInHref(returnTo = "/admin") {
  const path = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
  return `${SIGN_IN_ORIGIN}${path}`;
}
