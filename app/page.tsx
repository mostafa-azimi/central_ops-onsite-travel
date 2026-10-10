import { getTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";
import { databaseConfigured, listActiveTravelers, listEmployeeVisitRequests } from "@/lib/db";
import { getEmployeeSession } from "@/lib/admin-auth";
import { isAllowedAdminEmail } from "@/lib/admin-policy";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const employee = await getEmployeeSession();
  const hasDatabase = databaseConfigured();
  const [feed, requests, travelers, canAdminister] = await Promise.all([
    getTravelFeed(),
    employee && hasDatabase ? listEmployeeVisitRequests(employee.email) : Promise.resolve([]),
    listActiveTravelers(),
    employee ? isAllowedAdminEmail(employee.email) : Promise.resolve(false),
  ]);
  return <TravelDashboard
    feed={feed}
    requestStorageConfigured={hasDatabase}
    employee={employee}
    initialRequests={requests}
    canAdminister={canAdminister}
    travelers={travelers}
    initialView={view === "submit" ? "submit" : "schedule"}
  />;
}
