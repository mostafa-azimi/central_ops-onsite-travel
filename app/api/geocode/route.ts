import { NextResponse } from "next/server";
import { parsePhotonResponse } from "@/lib/geocoding";

export const runtime = "nodejs";

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
  if (rateLimited(request)) return NextResponse.json({ message: "Too many address searches. Try again shortly." }, { status: 429 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 4 || query.length > 200) return NextResponse.json({ suggestions: [] });

  const upstream = new URL("https://photon.komoot.io/api/");
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("limit", "5");
  upstream.searchParams.set("lang", "en");
  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "CentralOpsTravel/1.0 (https://cs-onsite-travel.vercel.app)",
      },
      next: { revalidate: 604800 },
    });
    if (!response.ok) return NextResponse.json({ suggestions: [] }, { status: 502 });
    return NextResponse.json({ suggestions: parsePhotonResponse(await response.json()) });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
