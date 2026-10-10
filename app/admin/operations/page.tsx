import Link from "next/link";
import { adminAuthConfigured, getAdminSession } from "@/lib/admin-auth";
import { databaseConfigured, listAuditEntries, listNotificationRecords } from "@/lib/db";
import { googleSignInHref } from "@/lib/auth-links";
import { OperationsDashboard } from "@/components/operations-dashboard";
import { ShipHeroBrand } from "@/components/shiphero-brand";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getAdminSession();
  const { error } = await searchParams;
  if (!session) return <main className="admin-shell"><section className="admin-card"><ShipHeroBrand className="admin-brand" /><p className="eyebrow">Central Ops Travel</p><h1>Operations</h1><p>Sign in with an authorized administrator account.</p>{error && <div className="submit-status error">That Google account is not authorized.</div>}{adminAuthConfigured() && <a className="btn-primary admin-signin" href={googleSignInHref("/admin/operations")}>Sign in with Google</a>}<Link href="/">Back to travel</Link></section></main>;
  const isE2e = process.env.E2E_TEST_AUTH === "1";
  const configured = databaseConfigured() || isE2e;
  const [audit, notifications] = configured && !isE2e ? await Promise.all([listAuditEntries(), listNotificationRecords()]) : [[], []];
  return <main className="admin-shell"><section className="admin-card wide-admin settings-card">
    <ShipHeroBrand className="admin-brand" />
    <nav className="view-tabs" aria-label="Travel workspace"><Link href="/?view=submit">Requests</Link><Link href="/map">Map view</Link><Link href="/calendar">Calendar view</Link><Link href="/how-to-use">How to use</Link><Link href="/admin">Approvals</Link><Link href="/admin/settings">Admin settings</Link><Link href="/admin/operations" className="active" aria-current="page">Operations</Link></nav>
    <div className="admin-header"><div><p className="eyebrow">Signed in as {session.email}</p><h1>Operations</h1><p>Review delivery, audit activity, and Calendar integrity.</p></div><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
    {!configured ? <div className="setup-note"><strong>Google Sheets storage pending</strong><span>Operational history requires the private Sheet connection.</span></div> : <OperationsDashboard initialAudit={audit} initialNotifications={notifications} />}
  </section></main>;
}
