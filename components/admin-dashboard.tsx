"use client";

import { useState, type FormEvent } from "react";
import { ASSIGNEES } from "@/lib/types";
import type { StoredVisitRequest } from "@/lib/db";
import { AddressFields } from "@/components/address-fields";
import { READINESS_ITEMS, readinessScore } from "@/lib/submissions";

function ReadinessReview({ request }: { request: StoredVisitRequest }) {
  if (!request.readiness) return <p className="field-note">Readiness was not collected for this legacy request.</p>;
  const score = readinessScore(request.readiness);
  const lpnItem = READINESS_ITEMS.find((item) => item.key === "usingLpns")!;
  return (
    <div className="readiness-review">
      <div className="readiness-review-heading">
        <strong>{score.ready} of {score.total} ready</strong>
        <span>Using LPNs: {request.readiness[lpnItem.key] ? "Yes" : "No"}</span>
      </div>
      <p><strong>Warehouse start:</strong> {request.warehouseStartTime} · <strong>Contact:</strong> {request.contactName}, {request.contactEmail}, {request.contactPhone}</p>
      {score.blockers.length > 0 ? (
        <details>
          <summary>{score.blockers.length} {score.blockers.length === 1 ? "item" : "items"} marked No</summary>
          <ul>{score.blockers.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
        </details>
      ) : <p>All scored readiness items are marked Yes.</p>}
    </div>
  );
}

export function AdminDashboard({ initialRequests }: { initialRequests: StoredVisitRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState("");

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

  async function reschedule(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("Updating Calendar…");
    const response = await fetch(`/api/admin/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        start: form.get("start"), end: form.get("end"),
        fullAddress: form.get("fullAddress"), city: form.get("city"), state: form.get("state"),
        postalCode: form.get("postalCode"),
        countryCode: form.get("countryCode"), latitude: form.get("latitude"), longitude: form.get("longitude"), placeId: form.get("placeId"),
      }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setMessage(result.message ?? (response.ok ? "Visit rescheduled." : "The visit could not be rescheduled."));
  }

  async function cancel(id: string) {
    if (confirmCancelId !== id) { setConfirmCancelId(id); setMessage("Click Cancel visit again to confirm."); return; }
    setMessage("Cancelling Calendar event…");
    const response = await fetch(`/api/admin/requests/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setMessage(result.message ?? (response.ok ? "Visit cancelled." : "The visit could not be cancelled."));
    setConfirmCancelId("");
  }

  async function decideChange(id: string, action: "approve_change" | "deny_change") {
    setMessage(action === "approve_change" ? "Applying approved change…" : "Denying change…");
    const response = await fetch(`/api/requests/${id}/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setMessage(result.message ?? (response.ok ? "Change decided." : "The change could not be decided."));
  }

  const pending = requests.filter((request) => request.status === "pending" && !request.calendarEventId);
  const scheduled = requests.filter((request) => request.calendarEventId && request.status !== "cancelled" && request.status !== "denied");
  return (
    <div>
      {message && <div className="submit-status working" role="status">{message}</div>}
      <h2>{pending.length} pending {pending.length === 1 ? "request" : "requests"}</h2>
      <div className="approval-list">
        {pending.map((request) => (
          <article className="approval-card" key={request.id}>
            <div><h3>{request.accountName || "Account name needed"}</h3><p>{request.tripType} · {request.city}, {request.state} · {request.start} to {request.end}</p><div className="request-badges"><span className={`confidence confidence-${request.dateConfidence}`}>{request.dateConfidence} confidence</span><span className="field-note">Requested by {request.requesterName || request.requesterEmail || "legacy request"}</span></div>{request.tripType === "Onboarding" && <ReadinessReview request={request} />}<a href={request.cashUrl} target="_blank" rel="noreferrer">CASH account {request.cashAccountId}</a></div>
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
      <h2 className="admin-section-heading">{scheduled.length} scheduled {scheduled.length === 1 ? "visit" : "visits"}</h2>
      <div className="approval-list">
        {scheduled.map((request) => (
          <article className="scheduled-card" key={request.id}>
            <div className="scheduled-summary"><div><h3>{request.accountName}</h3><p>{request.assignedTraveler} · {request.fullAddress} · {request.start} to {request.end}</p><span className={`confidence confidence-${request.dateConfidence}`}>{request.dateConfidence} confidence</span></div>{request.calendarEventUrl && <a href={request.calendarEventUrl} target="_blank" rel="noreferrer">Calendar event</a>}</div>
            {request.pendingChange && <div className="change-request"><strong>{request.pendingChange.type === "cancel" ? "Requester wants to cancel" : `Requester proposed ${request.pendingChange.start} to ${request.pendingChange.end}`}</strong><span>Submitted by {request.requesterName || request.pendingChange.requestedByEmail}</span><div className="scheduled-actions"><button className="btn-primary" type="button" onClick={() => void decideChange(request.id, "approve_change")}>Approve change</button><button className="filter" type="button" onClick={() => void decideChange(request.id, "deny_change")}>Deny</button></div></div>}
            <details><summary>Reschedule visit</summary><form className="visit-form reschedule-form" onSubmit={(event) => void reschedule(request.id, event)}>
              <AddressFields />
              <label><span>Start date</span><input name="start" type="date" required defaultValue={request.start} /></label>
              <label><span>End date</span><input name="end" type="date" required defaultValue={request.end} /></label>
              <div className="form-actions full"><button className="btn-primary" type="submit">Save reschedule</button><span>Calendar attendees will receive an update.</span></div>
            </form></details>
            <div className="scheduled-actions">
              {request.syncStatus === "awaiting_hubspot" && <span className="duration">HubSpot pending</span>}
              {request.status === "pending" && <button className="filter" type="button" onClick={() => void decide(request.id, "approve", request.assignedTraveler ?? undefined)}>Retry HubSpot</button>}
              <button className="danger-button" type="button" onClick={() => void cancel(request.id)}>{confirmCancelId === request.id ? "Confirm cancellation" : "Cancel visit"}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
