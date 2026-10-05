import Link from "next/link";
import { adminAuthConfigured, getAdminSession, INITIAL_ADMIN_EMAIL } from "@/lib/admin-auth";
import { databaseConfigured, listVisitRequests } from "@/lib/db";
import { AdminDashboard } from "@/components/admin-dashboard";
import { googleCalendarConfigured } from "@/lib/google-calendar";
import { hubSpotConfigured } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getAdminSession();
  const { error } = await searchParams;

  if (!session) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="eyebrow">Central Ops Travel</p>
          <h1>Travel approvals</h1>
          <p>Sign in with an approved Google account to review requests, assign travelers, and schedule visits.</p>
          {error && <div className="submit-status error">That Google account is not authorized.</div>}
          {adminAuthConfigured() ? (
            <a className="btn-primary admin-signin" href="/api/auth/google/start">Sign in with Google</a>
          ) : (
            <div className="setup-note"><strong>Google sign-in setup pending</strong><span>No approval actions are available until the dedicated web OAuth client is configured.</span></div>
          )}
          <p className="admin-allowlist">Initial allowed administrator: {INITIAL_ADMIN_EMAIL}</p>
          <Link href="/">Back to public travel</Link>
        </section>
      </main>
    );
  }

  const hasDatabase = databaseConfigured();
  const requests = hasDatabase ? await listVisitRequests() : [];
  const calendarReady = googleCalendarConfigured();
  const hubSpotReady = hubSpotConfigured();

  return (
    <main className="admin-shell">
      <section className="admin-card wide-admin">
        <div className="admin-header">
          <div><p className="eyebrow">Signed in as {session.email}</p><h1>Travel approvals</h1></div>
          <form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form>
        </div>
        {!hasDatabase && <div className="setup-note"><strong>Google Sheets storage pending</strong><span>Requests and approval actions remain unavailable until the private server-side Sheet is connected.</span></div>}
        {hasDatabase && (
          <div className={`submit-status ${calendarReady && hubSpotReady ? "success" : "working"}`} role="status">
            Calendar: {calendarReady ? "connected" : "pending"} · HubSpot: {hubSpotReady ? "connected" : "pending"}
          </div>
        )}
        <p>Only signed-in, allowlisted administrators can approve, deny, assign a traveler, or directly schedule a visit.</p>
        {hasDatabase && <AdminDashboard initialRequests={requests} />}
        <Link href="/">View public travel</Link>
      </section>
    </main>
  );
}
