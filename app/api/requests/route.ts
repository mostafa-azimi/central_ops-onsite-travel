import { NextResponse } from "next/server";
import { validateVisitRequest } from "@/lib/submissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  return NextResponse.json(
    { message: "Request storage is not configured. No request or external record was created." },
    { status: 503 },
  );
}
