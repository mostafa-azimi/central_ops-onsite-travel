import { NextResponse } from "next/server";
import { validateVisitSubmission } from "@/lib/submissions";
import { getAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
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

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  }
  if (rateLimited(request)) {
    return NextResponse.json({ message: "Too many attempts. Try again later." }, { status: 429 });
  }
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 8_192) {
    return NextResponse.json({ message: "Request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = validateVisitSubmission(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  // Never return a mock success. This endpoint remains fail-closed until both
  // narrowly scoped external connections and deterministic CASH mapping exist.
  return NextResponse.json(
    {
      message:
        "Google Calendar and HubSpot connections are not configured. No records were created.",
    },
    { status: 503 },
  );
}
