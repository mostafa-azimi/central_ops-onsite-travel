import Link from "next/link";
import { adminAuthConfigured, getEmployeeSession } from "@/lib/admin-auth";
import { fetchEmployeeTravelEvents, googleCalendarConfigured } from "@/lib/google-calendar";
import { TravelMap } from "@/components/travel-map";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { googleSignInHref } from "@/lib/auth-links";
import { listActiveTravelers } from "@/lib/db";
import { ShipHeroBrand } from "@/components/shiphero-brand";

export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const employee = await getEmployeeSession();
  const { error } = await searchParams;
  if (!employee) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <ShipHeroBrand className="admin-brand" />
          <p className="eyebrow">Employee access</p>
          <h1>Map view</h1>
          <p>Sign in with a verified @shiphero.com Google account to view traveler names and join a customer visit.</p>
          {error && <div className="submit-status error">Use a verified @shiphero.com Google account.</div>}
          {adminAuthConfigured() && <a className="btn-primary admin-signin" href={googleSignInHref("/map")}>Sign in with Google</a>}
          <Link href="/">Back to public travel</Link>
        </section>
      </main>
    );
  }
  let calendarError = "";
  const events = googleCalendarConfigured()
    ? await fetchEmployeeTravelEvents(employee.email).catch(() => {
        calendarError = "Calendar travel could not be loaded. Check the connection and refresh.";
        return [];
      })
    : [];
  const [canAdminister, travelers] = await Promise.all([isAllowedAdminEmail(employee.email), listActiveTravelers()]);
  return <TravelMap employee={employee} initialEvents={events} canAdminister={canAdminister} travelers={travelers} initialError={calendarError} />;
}
