import { NextResponse } from "next/server";
import { reconcileScheduledVisits } from "@/lib/calendar-reconciliation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.OPERATIONS_CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return NextResponse.json({ message: "Not authorized." }, { status: 401 });
  try {
    return NextResponse.json(await reconcileScheduledVisits("scheduled-monitor"), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Calendar reconciliation failed." }, { status: 502 });
  }
}
