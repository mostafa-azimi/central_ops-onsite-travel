import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { reconcileScheduledVisits } from "@/lib/calendar-reconciliation";

export const runtime = "nodejs";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  try {
    return NextResponse.json(await reconcileScheduledVisits(admin.email));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Calendar reconciliation failed." }, { status: 502 });
  }
}
