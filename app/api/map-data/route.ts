import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/admin-auth";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { listActiveTravelers } from "@/lib/db";
import { fetchCachedEmployeeTravelEvents, googleCalendarConfigured } from "@/lib/google-calendar";
import { withExternalRequestDeadline } from "@/lib/external-request";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const employee = await getEmployeeSession();
  if (!employee) return NextResponse.json({ message: "Sign in with your ShipHero account to load visits." }, { status: 401, headers });
  if (!googleCalendarConfigured()) return NextResponse.json({ message: "The Calendar connection is unavailable." }, { status: 503, headers });
  try {
    const [events, travelers, canAdminister] = await Promise.all([
      withExternalRequestDeadline(fetchCachedEmployeeTravelEvents(employee.email)),
      withExternalRequestDeadline(listActiveTravelers()),
      withExternalRequestDeadline(isAllowedAdminEmail(employee.email)).catch(() => false),
    ]);
    return NextResponse.json({ events, travelers, canAdminister }, { headers });
  } catch {
    return NextResponse.json({ message: "Visits could not be loaded. Try again shortly." }, { status: 503, headers });
  }
}
