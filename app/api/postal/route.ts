import { NextResponse } from "next/server";
import { normalizeCountryCode, normalizePostalCode, parsePostalResponse, postalLookupCode } from "@/lib/geocoding";

export const runtime = "nodejs";

const POSTAL_API = "https://api.zippopotam.us";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function GET(request: Request) {
  if (rateLimited(request)) return NextResponse.json({ message: "Too many postal code lookups. Try again shortly." }, { status: 429 });
  const searchParams = new URL(request.url).searchParams;
  const countryCode = normalizeCountryCode(searchParams.get("countryCode"));
  const postalCode = normalizePostalCode(searchParams.get("postalCode"));
  if (!countryCode || !postalCode) return NextResponse.json({ message: "Enter a valid country and postal code." }, { status: 400 });

  const lookupCode = postalLookupCode(countryCode, postalCode);
  try {
    const response = await fetch(`${POSTAL_API}/${encodeURIComponent(countryCode)}/${encodeURIComponent(lookupCode)}`, {
      headers: { Accept: "application/json", "User-Agent": "CentralOpsTravel/1.0 (https://cs-onsite-travel.vercel.app)" },
      next: { revalidate: 2_592_000 },
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 404) return NextResponse.json({ match: null });
    if (!response.ok) return NextResponse.json({ message: "Postal code lookup is temporarily unavailable." }, { status: 502 });
    return NextResponse.json({ match: parsePostalResponse(await response.json(), countryCode) });
  } catch {
    return NextResponse.json({ message: "Postal code lookup is temporarily unavailable." }, { status: 502 });
  }
}
