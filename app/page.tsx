import { getSnapshotTravelFeed, getTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";
import { databaseConfigured, listActiveTravelers, listEmployeeVisitRequests } from "@/lib/db";
import { getEmployeeSession } from "@/lib/admin-auth";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { DEFAULT_PEOPLE } from "@/lib/types";
import { withExternalRequestDeadline } from "@/lib/external-request";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const { view, error } = await searchParams;
  const employee = await getEmployeeSession();
  const hasDatabase = databaseConfigured();
  const fallbackTravelers = DEFAULT_PEOPLE.filter((person) => person.isTraveler).map(({ email, name, color }) => ({ email, name, color }));
  const [feed, requests, travelers, canAdminister] = await Promise.all([
    withExternalRequestDeadline(getTravelFeed()).catch(() => getSnapshotTravelFeed()),
    employee && hasDatabase ? withExternalRequestDeadline(listEmployeeVisitRequests(employee.email)).catch(() => []) : Promise.resolve([]),
    withExternalRequestDeadline(listActiveTravelers()).catch(() => fallbackTravelers),
    employee ? withExternalRequestDeadline(isAllowedAdminEmail(employee.email)).catch(() => false) : Promise.resolve(false),
  ]);
  return <TravelDashboard
    feed={feed}
    requestStorageConfigured={hasDatabase}
    employee={employee}
    initialRequests={requests}
    canAdminister={canAdminister}
    travelers={travelers}
    initialView={view === "submit" ? "submit" : "schedule"}
    authError={error}
  />;
}
