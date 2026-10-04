import { NextResponse } from "next/server";
import { validateVisitSubmission } from "@/lib/submissions";
import { getAdminSession } from "@/lib/admin-auth";
import { ApprovalError, approvalConnectionsConfigured, approveVisitRequest } from "@/lib/approve-request";
import { createVisitRequest, databaseConfigured } from "@/lib/db";

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

  if (!databaseConfigured()) {
    return NextResponse.json({ message: "Request storage is not configured. No records were created." }, { status: 503 });
  }
  if (!approvalConnectionsConfigured()) {
    return NextResponse.json(
      { message: "Calendar and HubSpot write connections are not configured. No records were created." },
      { status: 503 },
    );
  }

  try {
    const saved = await createVisitRequest({
      submissionId: parsed.value.submissionId,
      tripType: parsed.value.tripType,
      cashUrl: parsed.value.cashUrl,
      cashAccountId: parsed.value.cashAccountId,
      city: parsed.value.city,
      state: parsed.value.state,
      start: parsed.value.start,
      end: parsed.value.end,
    });
    const approved = await approveVisitRequest(saved.id, parsed.value.traveler, admin.email);
    return NextResponse.json({ request: approved }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      return NextResponse.json({ message: "That submission ID was already used for different visit data." }, { status: 409 });
    }
    if (error instanceof ApprovalError) {
      const status = error.code === "not_configured" ? 503 : error.code === "conflict" ? 409 : 502;
      return NextResponse.json({ message: error.message }, { status });
    }
    throw error;
  }
}
