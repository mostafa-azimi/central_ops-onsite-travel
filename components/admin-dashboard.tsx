"use client";

import { useState } from "react";
import { ASSIGNEES } from "@/lib/types";
import type { StoredVisitRequest } from "@/lib/db";

export function AdminDashboard({ initialRequests }: { initialRequests: StoredVisitRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");

  async function decide(id: string, action: "approve" | "deny", traveler?: string, accountName?: string) {
    setMessage("Working…");
    const response = await fetch(`/api/admin/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, traveler, accountName }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (!response.ok) {
      setMessage(result.message ?? "The request could not be updated.");
      return;
    }
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setMessage(result.message ?? (action === "deny" ? "Request denied." : "Request approved."));
  }

  const pending = requests.filter((request) => request.status === "pending");
  return (
    <div>
      {message && <div className="submit-status working" role="status">{message}</div>}
      <h2>{pending.length} pending {pending.length === 1 ? "request" : "requests"}</h2>
      <div className="approval-list">
        {pending.map((request) => (
          <article className="approval-card" key={request.id}>
            <div><h3>{request.accountName || "Account name needed"}</h3><p>{request.tripType} · {request.city}, {request.state} · {request.start} to {request.end}</p><a href={request.cashUrl} target="_blank" rel="noreferrer">CASH account {request.cashAccountId}</a></div>
            <div className="approval-actions">
              {request.calendarEventUrl && <a href={request.calendarEventUrl} target="_blank" rel="noreferrer">View Calendar event</a>}
              {request.syncStatus === "awaiting_hubspot" && <span className="duration">HubSpot pending</span>}
              {!request.accountName && <input aria-label={`Account name for ${request.id}`} id={`account-${request.id}`} maxLength={120} placeholder="Account name" />}
              <select aria-label={`Traveler for ${request.id}`} defaultValue={request.assignedTraveler ?? ""} id={`traveler-${request.id}`}>
                <option value="" disabled>Assign traveler</option>
                {ASSIGNEES.map((name) => <option key={name}>{name}</option>)}
              </select>
              <button className="btn-primary" type="button" onClick={() => {
                const select = document.getElementById(`traveler-${request.id}`) as HTMLSelectElement;
                const accountInput = document.getElementById(`account-${request.id}`) as HTMLInputElement | null;
                void decide(request.id, "approve", select.value, request.accountName || accountInput?.value);
              }}>{request.calendarEventId ? "Retry HubSpot" : "Approve"}</button>
              <button className="filter" type="button" onClick={() => void decide(request.id, "deny")}>Deny</button>
            </div>
          </article>
        ))}
        {pending.length === 0 && <div className="empty-state"><h3>No pending requests</h3></div>}
      </div>
    </div>
  );
}
