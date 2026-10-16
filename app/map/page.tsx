import Link from "next/link";
import { adminAuthConfigured, getEmployeeSession } from "@/lib/admin-auth";
import { TravelMap } from "@/components/travel-map";
import { googleSignInErrorMessage, googleSignInHref } from "@/lib/auth-links";
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
          {error && <div className="submit-status error" role="alert">{googleSignInErrorMessage(error)}</div>}
          {adminAuthConfigured() && <a className="btn-primary admin-signin" href={googleSignInHref("/map")}>Sign in with Google</a>}
          <Link href="/">Back to public travel</Link>
        </section>
      </main>
    );
  }
  return <TravelMap employee={employee} />;
}
