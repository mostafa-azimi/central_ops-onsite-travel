import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { databaseConfigured, denyVisitRequest } from "@/lib/db";
import { ASSIGNEES } from "@/lib/types";
import { ApprovalError, approveVisitRequest } from "@/lib/approve-request";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Invalid request ID." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: string; traveler?: string } | null;
  if (body?.action === "deny") {
    const denied = await denyVisitRequest(id, admin.email);
    if (!denied) return NextResponse.json({ message: "Only pending requests can be denied." }, { status: 409 });
    return NextResponse.json({ request: denied });
  }
  if (body?.action === "approve") {
    if (!ASSIGNEES.includes(body.traveler as (typeof ASSIGNEES)[number])) {
      return NextResponse.json({ message: "Select an approved traveler." }, { status: 400 });
    }
    try {
      const approved = await approveVisitRequest(
        id,
        body.traveler as (typeof ASSIGNEES)[number],
        admin.email,
      );
      return NextResponse.json({ request: approved });
    } catch (error) {
      if (error instanceof ApprovalError) {
        const status = error.code === "not_configured" ? 503 : error.code === "conflict" ? 409 : 502;
        return NextResponse.json({ message: error.message }, { status });
      }
      throw error;
    }
  }
  return NextResponse.json({ message: "Select approve or deny." }, { status: 400 });
}
