import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { checkConnectorHealth } from "@/lib/connector-health";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  return NextResponse.json(await checkConnectorHealth(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
