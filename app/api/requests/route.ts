import { NextResponse } from "next/server";
import { validateVisitRequest } from "@/lib/submissions";
import { createVisitRequest, databaseConfigured } from "@/lib/db";
import { getEmployeeSession } from "@/lib/admin-auth";

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
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ message: "Verified ShipHero sign-in is required to submit a visit." }, { status: 401 });
  }
  if (rateLimited(request)) {
    return NextResponse.json({ message: "Too many attempts. Try again later." }, { status: 429 });
  }
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 8_192) return NextResponse.json({ message: "Request is too large." }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = validateVisitRequest(body);
  if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
  if (!databaseConfigured()) {
    return NextResponse.json(
      { message: "Request storage is not configured. No request or external record was created." },
      { status: 503 },
    );
  }

  try {
    const saved = await createVisitRequest({
      ...parsed.value,
      requesterEmail: employee.email,
      requesterName: employee.name,
    });
    return NextResponse.json({ requestId: saved.id, status: saved.status, request: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      return NextResponse.json({ message: "That submission ID was already used for different request data." }, { status: 409 });
    }
    throw error;
  }
}
