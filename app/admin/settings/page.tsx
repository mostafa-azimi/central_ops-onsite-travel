import Link from "next/link";
import { adminAuthConfigured, getAdminSession } from "@/lib/admin-auth";
import { databaseConfigured, listPeopleDirectory } from "@/lib/db";
import { googleSignInHref } from "@/lib/auth-links";
import { PeopleSettings } from "@/components/people-settings";
import { DEFAULT_PEOPLE } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getAdminSession();
  const { error } = await searchParams;
  if (!session) {
    return <main className="admin-shell"><section className="admin-card"><p className="eyebrow">Central Ops Travel</p><h1>Admin settings</h1><p>Sign in with an authorized administrator account.</p>{error && <div className="submit-status error">That Google account is not authorized.</div>}{adminAuthConfigured() && <a className="btn-primary admin-signin" href={googleSignInHref("/admin/settings")}>Sign in with Google</a>}<Link href="/">Back to travel</Link></section></main>;
  }
  const isE2e = process.env.E2E_TEST_AUTH === "1";
  if (!databaseConfigured() && !isE2e) {
    return <main className="admin-shell"><section className="admin-card"><p className="eyebrow">Signed in as {session.email}</p><h1>Admin settings</h1><div className="setup-note"><strong>Google Sheets storage pending</strong><span>The people directory requires the existing private Sheet connection.</span></div><Link href="/admin">Back to approvals</Link></section></main>;
  }
  const people = isE2e ? DEFAULT_PEOPLE : await listPeopleDirectory();
  return <main className="admin-shell"><section className="admin-card wide-admin settings-card">
    <nav className="view-tabs" aria-label="Travel workspace"><Link href="/?view=submit">Requests</Link><Link href="/map">Map view</Link><Link href="/calendar">Calendar view</Link><Link href="/how-to-use">How to use</Link><Link href="/admin">Approvals</Link><Link href="/admin/settings" className="active" aria-current="page">Admin settings</Link><Link href="/admin/operations">Operations</Link></nav>
    <div className="admin-header"><div><p className="eyebrow">Signed in as {session.email}</p><h1>Admin settings</h1><p>Manage traveler assignments and administrator access.</p></div><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
    <div className="security-note"><strong>Protected settings</strong><span>Calendar IDs, OAuth credentials, and private Sheet identifiers stay in server configuration and cannot be changed here.</span></div>
    <PeopleSettings initialPeople={people} currentEmail={session.email} />
  </section></main>;
}
