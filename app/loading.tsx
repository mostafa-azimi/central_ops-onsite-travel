import { ShipHeroBrand } from "@/components/shiphero-brand";

export default function Loading() {
  return (
    <main className="route-loading-shell">
      <section className="route-loading-card" role="status" aria-live="polite">
        <ShipHeroBrand className="route-loading-brand" />
        <p className="eyebrow">Central Ops Travel</p>
        <h1>Opening your workspace</h1>
        <p>Loading current travel and access.</p>
        <div className="route-loading-track" aria-hidden="true"><span /></div>
      </section>
    </main>
  );
}
