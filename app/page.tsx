import { getTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";
import { databaseConfigured, listEmployeeVisitRequests } from "@/lib/db";
import { getEmployeeSession } from "@/lib/admin-auth";
import { isAllowedAdminEmail } from "@/lib/admin-policy";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const employee = await getEmployeeSession();
  const hasDatabase = databaseConfigured();
  const [feed, requests] = await Promise.all([
    getTravelFeed(),
    employee && hasDatabase ? listEmployeeVisitRequests(employee.email) : Promise.resolve([]),
  ]);
  return <TravelDashboard
    feed={feed}
    requestStorageConfigured={hasDatabase}
    employee={employee}
    initialRequests={requests}
    canAdminister={employee ? isAllowedAdminEmail(employee.email) : false}
    initialView={view === "submit" ? "submit" : "schedule"}
  />;
}
