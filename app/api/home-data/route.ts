import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/admin-auth";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { getSnapshotTravelFeed, getTravelFeed } from "@/lib/calendar";
import { databaseConfigured, listActiveTravelers, listEmployeeVisitRequests } from "@/lib/db";
import { withExternalRequestDeadline } from "@/lib/external-request";
import { DEFAULT_PEOPLE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const employee = await getEmployeeSession();
  const hasDatabase = databaseConfigured();
  const fallbackTravelers = DEFAULT_PEOPLE
    .filter((person) => person.isTraveler)
    .map(({ email, name, color }) => ({ email, name, color }));
  const [feed, requests, travelers, canAdminister] = await Promise.all([
    withExternalRequestDeadline(getTravelFeed()).catch(() => getSnapshotTravelFeed()),
    employee && hasDatabase
      ? withExternalRequestDeadline(listEmployeeVisitRequests(employee.email)).catch(() => [])
      : Promise.resolve([]),
    withExternalRequestDeadline(listActiveTravelers()).catch(() => fallbackTravelers),
    employee
      ? withExternalRequestDeadline(isAllowedAdminEmail(employee.email)).catch(() => false)
      : Promise.resolve(false),
  ]);

  return NextResponse.json(
    {
      feed,
      requests,
      travelers: travelers.map(({ email, name, color }) => ({
        email: employee ? email : "",
        name,
        color,
      })),
      canAdminister,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
