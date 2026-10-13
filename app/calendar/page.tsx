import Link from "next/link";
import { adminAuthConfigured, getEmployeeSession } from "@/lib/admin-auth";
import { googleSignInErrorMessage, googleSignInHref } from "@/lib/auth-links";
import { fetchCachedEmployeeTravelEvents, googleCalendarConfigured } from "@/lib/google-calendar";
import { isAllowedAdminEmail } from "@/lib/admin-policy";
import { TravelCalendar } from "@/components/travel-calendar";
import { DEFAULT_PEOPLE, type EmployeeTravelEvent } from "@/lib/types";
import { databaseConfigured, listActiveTravelers, listVisitRequests } from "@/lib/db";
import { ShipHeroBrand } from "@/components/shiphero-brand";
import { withExternalRequestDeadline } from "@/lib/external-request";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const employee = await getEmployeeSession();
  const { error } = await searchParams;

  if (!employee) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <ShipHeroBrand className="admin-brand" />
          <p className="eyebrow">Employee access</p>
          <h1>Calendar view</h1>
          <p>Sign in with a verified @shiphero.com Google account to explore visits and join a customer onsite.</p>
          {error && <div className="submit-status error" role="alert">{googleSignInErrorMessage(error)}</div>}
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
    city: "Bay Minette",
    state: "AL",
    countryCode: "US",
    latitude: 30.88,
    longitude: -87.77,
  }] : [];
  const fallbackTravelers = DEFAULT_PEOPLE.filter((person) => person.isTraveler).map(({ email, name, color }) => ({ email, name, color }));
  const [calendarEvents, storedRequests, canAdminister, travelers] = await Promise.all([
    testEvents.length > 0 ? Promise.resolve(testEvents) : googleCalendarConfigured()
      ? withExternalRequestDeadline(fetchCachedEmployeeTravelEvents(employee.email)).catch(() => {
        calendarError = "Calendar travel could not be loaded. Check the connection and refresh.";
        return [];
      })
      : Promise.resolve([]),
    testEvents.length === 0 && databaseConfigured()
      ? withExternalRequestDeadline(listVisitRequests()).catch(() => [])
      : Promise.resolve([]),
    withExternalRequestDeadline(isAllowedAdminEmail(employee.email)).catch(() => false),
    withExternalRequestDeadline(listActiveTravelers()).catch(() => fallbackTravelers),
  ]);
  const requestByCalendarEvent = new Map(storedRequests
    .filter((request) => request.calendarEventId)
    .map((request) => [request.calendarEventId!, request]));
  const events = calendarEvents.map((event) => {
    const request = requestByCalendarEvent.get(event.calendarEventId);
    return request ? { ...event, city: request.city, state: request.state } : event;
  });
  return (
    <TravelCalendar
      employee={employee}
      initialEvents={events}
      canAdminister={canAdminister}
      travelers={travelers}
      initialError={calendarError}
    />
  );
}
