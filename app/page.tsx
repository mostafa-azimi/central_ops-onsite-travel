import { getSnapshotTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";
import { databaseConfigured } from "@/lib/db";
import { getEmployeeSession } from "@/lib/admin-auth";
import { DEFAULT_PEOPLE } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const { view, error } = await searchParams;
  const employee = await getEmployeeSession();
  const hasDatabase = databaseConfigured();
  const travelers = DEFAULT_PEOPLE
    .filter((person) => person.isTraveler)
    .map(({ email, name, color }) => ({ email: employee ? email : "", name, color }));
  return <TravelDashboard
    feed={getSnapshotTravelFeed()}
    requestStorageConfigured={hasDatabase}
    employee={employee}
    initialRequests={[]}
    canAdminister={false}
    travelers={travelers}
    initialView={view === "submit" ? "submit" : "schedule"}
    authError={error}
    refreshOnMount
  />;
}
