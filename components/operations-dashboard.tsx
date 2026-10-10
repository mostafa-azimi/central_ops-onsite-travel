"use client";

import { useMemo, useState } from "react";
import type { AuditEntry, NotificationRecord } from "@/lib/db";
import type { ReconciliationCheck } from "@/lib/calendar-reconciliation";

function when(value: string) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
}

export function OperationsDashboard({ initialAudit, initialNotifications }: { initialAudit: AuditEntry[]; initialNotifications: NotificationRecord[] }) {
  const [auditQuery, setAuditQuery] = useState("");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<ReconciliationCheck[]>([]);
  const audit = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    return query ? initialAudit.filter((entry) => `${entry.action} ${entry.actorEmail} ${entry.requestId} ${JSON.stringify(entry.details)}`.toLowerCase().includes(query)) : initialAudit;
  }, [auditQuery, initialAudit]);

  async function retry(id: string) {
    setWorking(id); setMessage("Retrying notification…");
    const response = await fetch(`/api/admin/notifications/${id}/retry`, { method: "POST" });
    const result = (await response.json()) as { notification?: NotificationRecord; message?: string };
    if (result.notification) setNotifications((items) => items.map((item) => item.id === id ? result.notification! : item));
    setMessage(result.message ?? (response.ok ? "Notification sent." : "Notification retry failed."));
    setWorking("");
  }

  async function reconcile() {
    setWorking("reconcile"); setMessage("Checking scheduled visits against Google Calendar…"); setProblems([]);
    const response = await fetch("/api/admin/reconciliation", { method: "POST" });
    const result = (await response.json()) as { checked?: number; problems?: ReconciliationCheck[]; message?: string };
    setProblems(result.problems ?? []);
    setMessage(response.ok ? `${result.checked ?? 0} scheduled visits checked. ${(result.problems ?? []).length} need attention.` : result.message ?? "Calendar reconciliation failed.");
    setWorking("");
  }

  return <div className="operations-dashboard">
    {message && <div className="submit-status working" role="status">{message}</div>}
    <section className="settings-panel operations-section">
      <div className="settings-panel-heading"><div><p className="eyebrow">Calendar integrity</p><h2>Reconciliation</h2></div><button className="btn-primary" type="button" disabled={Boolean(working)} onClick={() => void reconcile()}>{working === "reconcile" ? "Checking…" : "Run Calendar check"}</button></div>
      <p>Compare approved requests with their managed Google Calendar events. This check never edits Calendar.</p>
      {problems.length > 0 && <div className="operations-list">{problems.map((problem) => <article key={problem.requestId}><strong>{problem.accountName}</strong><span>{problem.issues.join(" · ")}</span><small>{problem.requestId}</small></article>)}</div>}
    </section>
    <section className="settings-panel operations-section">
      <div className="settings-panel-heading"><div><p className="eyebrow">Email delivery</p><h2>Notifications</h2></div><span>{notifications.filter((item) => item.status === "failed").length} failed</span></div>
      <div className="operations-list">{notifications.map((notification) => <article key={notification.id}>
        <div><strong>{notification.subject}</strong><span>{notification.recipients.join(", ")}</span><small>{when(notification.updatedAt)} · {notification.attempts} {notification.attempts === 1 ? "attempt" : "attempts"}</small></div>
        <span className={`operation-status ${notification.status}`}>{notification.status}</span>
        {notification.status === "failed" && <button className="filter" type="button" disabled={Boolean(working)} onClick={() => void retry(notification.id)}>{working === notification.id ? "Retrying…" : "Retry"}</button>}
        {notification.lastError && <p>{notification.lastError}</p>}
      </article>)}</div>
      {notifications.length === 0 && <div className="empty-state"><h3>No notification history yet</h3></div>}
    </section>
    <section className="settings-panel operations-section">
      <div className="settings-panel-heading"><div><p className="eyebrow">Accountability</p><h2>Audit history</h2></div><label className="compact-search"><span className="sr-only">Search audit history</span><input type="search" value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Search action, person, or request" /></label></div>
      <div className="audit-table" role="table" aria-label="Audit history">{audit.map((entry) => <article role="row" key={entry.id}>
        <div role="cell"><strong>{entry.action.replaceAll("_", " ")}</strong><span>{entry.actorEmail}</span></div>
        <div role="cell"><span>{when(entry.createdAt)}</span><small>{entry.requestId}</small></div>
        <details><summary>Details</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>
      </article>)}</div>
      {audit.length === 0 && <div className="empty-state"><h3>No matching audit entries</h3></div>}
    </section>
  </div>;
}
