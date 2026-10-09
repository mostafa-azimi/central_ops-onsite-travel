import Link from "next/link";
import { adminAuthConfigured, getEmployeeSession } from "@/lib/admin-auth";
import { googleSignInHref } from "@/lib/auth-links";
import { fetchEmployeeTravelEvents, googleCalendarConfigured } from "@/lib/google-calendar";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { TravelCalendar } from "@/components/travel-calendar";
import type { EmployeeTravelEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const employee = await getEmployeeSession();
  const { error } = await searchParams;

  if (!employee) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="eyebrow">ShipHero employees</p>
          <h1>Calendar view</h1>
          <p>Sign in with a verified @shiphero.com Google account to explore visits and join a customer onsite.</p>
          {error && <div className="submit-status error">Use a verified @shiphero.com Google account.</div>}
          {adminAuthConfigured() && <a className="btn-primary admin-signin" href={googleSignInHref("/calendar")}>Sign in with Google</a>}
          <Link href="/">Back to public travel</Link>
        </section>
      </main>
    );
  }

  let calendarError = "";
  const testEvents: EmployeeTravelEvent[] = process.env.E2E_TEST_AUTH === "1" ? [{
    id: "e2e-visit",
    calendarEventId: "e2e-calendar-event",
    assignee: "Mike Azimi",
    customer: "Cane Brew",
    location: "Bay Minette, AL",
    start: "2026-10-08",
    end: "2026-10-10",
    allDay: true,
    participants: ["Amanda Example"],
    joined: false,
    countryCode: "US",
    latitude: 30.88,
    longitude: -87.77,
  }] : [];
  const events = testEvents.length > 0 ? testEvents : googleCalendarConfigured()
    ? await fetchEmployeeTravelEvents(employee.email).catch(() => {
        calendarError = "Calendar travel could not be loaded. Check the connection and refresh.";
        return [];
      })
    : [];

  return (
    <TravelCalendar
      employee={employee}
      initialEvents={events}
      canAdminister={isAllowedAdminEmail(employee.email)}
      initialError={calendarError}
    />
  );
}
