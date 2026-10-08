"use client";

import { useState } from "react";
import type { ConnectorHealth } from "@/lib/connector-health";

export function ConnectorHealthPanel() {
  const [connectors, setConnectors] = useState<ConnectorHealth[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  async function runChecks() {
    setStatus("working");
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      const body = (await response.json()) as { connectors?: ConnectorHealth[]; checkedAt?: string; message?: string };
      if (!response.ok || !body.connectors) throw new Error(body.message ?? "Connection checks failed.");
      setConnectors(body.connectors);
      setCheckedAt(body.checkedAt ?? "");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="connector-health" aria-labelledby="connector-health-heading">
      <div>
        <h2 id="connector-health-heading">Connection health</h2>
        <p>{checkedAt ? `Last checked ${new Date(checkedAt).toLocaleString()}` : "Verify current access without creating records."}</p>
      </div>
      <button className="filter" type="button" onClick={() => void runChecks()} disabled={status === "working"}>
        {status === "working" ? "Checking…" : "Check connections"}
      </button>
      {status === "error" && <div className="submit-status error" role="alert">Connection checks could not run. Try again.</div>}
      {connectors.length > 0 && <ul>{connectors.map((connector) => (
        <li key={connector.name}>
          <span className={`health-dot ${connector.state}`} aria-hidden="true" />
          <strong>{connector.name}</strong>
          <span>{connector.detail}</span>
        </li>
      ))}</ul>}
    </section>
  );
}
