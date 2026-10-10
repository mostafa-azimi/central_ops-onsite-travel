"use client";

import { useState, type FormEvent } from "react";
import type { TravelerProfile } from "@/lib/types";
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

export function AdminDashboard({ initialRequests, travelers }: { initialRequests: StoredVisitRequest[]; travelers: TravelerProfile[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"working" | "success" | "error">("working");
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [confirmDecision, setConfirmDecision] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [travelerSelections, setTravelerSelections] = useState<Record<string, string>>(() => Object.fromEntries(
    initialRequests.map((request) => [request.id, request.assignedTraveler ?? ""]),
  ));
  const [denialReasons, setDenialReasons] = useState<Record<string, string>>({});

  async function decide(id: string, action: "approve" | "deny", traveler?: string, accountName?: string, reason?: string) {
    setWorkingId(id);
    setMessageKind("working");
    setMessage("Working…");
    try {
      const response = await fetch(`/api/admin/requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, traveler, accountName, reason }),
      });
      const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
      if (!response.ok) {
        setMessageKind("error");
        setMessage(result.message ?? "The request could not be updated.");
        return;
      }
      if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
      setMessageKind("success");
      setMessage(result.message ?? (action === "deny" ? "Request denied." : "Request approved."));
      setConfirmDecision("");
    } catch {
      setMessageKind("error");
      setMessage("The request could not be updated. Check your connection and try again.");
    } finally {
      setWorkingId("");
    }
  }

  function confirmThenDecide(id: string, action: "approve" | "deny", traveler?: string, accountName?: string) {
    const key = `${action}:${id}`;
    if (confirmDecision !== key) {
      setConfirmDecision(key);
      setMessageKind("working");
      setMessage(action === "approve" ? "Review the traveler and dates, then click Confirm approval." : "Add an optional reason, then click Confirm denial.");
      return;
    }
    void decide(id, action, traveler, accountName, denialReasons[id]);
  }

  async function reschedule(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorkingId(id); setMessageKind("working"); setMessage("Updating Calendar…");
    try {
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
      setMessageKind(response.ok ? "success" : "error");
      setMessage(result.message ?? (response.ok ? "Visit rescheduled." : "The visit could not be rescheduled."));
    } catch {
      setMessageKind("error");
      setMessage("The visit could not be rescheduled. Check your connection and try again.");
    } finally {
      setWorkingId("");
    }
  }

  async function cancel(id: string) {
    if (confirmCancelId !== id) { setConfirmCancelId(id); setMessageKind("working"); setMessage("Click Cancel visit again to confirm."); return; }
    setWorkingId(id); setMessageKind("working"); setMessage("Cancelling Calendar event…");
    try {
      const response = await fetch(`/api/admin/requests/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }),
      });
      const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
      if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
      setMessageKind(response.ok ? "success" : "error");
      setMessage(result.message ?? (response.ok ? "Visit cancelled." : "The visit could not be cancelled."));
      setConfirmCancelId("");
    } catch {
      setMessageKind("error");
      setMessage("The visit could not be cancelled. Check your connection and try again.");
    } finally {
      setWorkingId("");
    }
  }

  async function decideChange(id: string, action: "approve_change" | "deny_change") {
    setWorkingId(id); setMessageKind("working"); setMessage(action === "approve_change" ? "Applying approved change…" : "Denying change…");
    try {
      const response = await fetch(`/api/requests/${id}/change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
      if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
      setMessageKind(response.ok ? "success" : "error");
      setMessage(result.message ?? (response.ok ? "Change decided." : "The change could not be decided."));
    } catch {
      setMessageKind("error");
      setMessage("The change could not be decided. Check your connection and try again.");
    } finally {
      setWorkingId("");
    }
  }

  const pending = requests.filter((request) => request.status === "pending" && !request.calendarEventId);
  const scheduled = requests.filter((request) => request.calendarEventId && request.status !== "cancelled" && request.status !== "denied");
  return (
    <div>
      {message && <div className={`submit-status ${messageKind}`} role="status">{message}</div>}
      <h2>{pending.length} pending {pending.length === 1 ? "request" : "requests"}</h2>
      <div className="approval-list">
        {pending.map((request) => {
          const selectedTraveler = travelerSelections[request.id] ?? "";
          const conflicts = scheduled.filter((visit) => visit.assignedTraveler === selectedTraveler && visit.start <= request.end && request.start <= visit.end);
          return <article className="approval-card" key={request.id}>
            <div><h3>{request.accountName || "Account name needed"}</h3><p>{request.tripType} · {request.city}, {request.state} · {request.start} to {request.end}</p><div className="request-badges"><span className={`confidence confidence-${request.dateConfidence}`}>{request.dateConfidence} confidence</span><span className="field-note">Requested by {request.requesterName || request.requesterEmail || "legacy request"}</span></div>{request.tripType === "Onboarding" && <ReadinessReview request={request} />}<a href={request.cashUrl} target="_blank" rel="noreferrer">CASH account {request.cashAccountId}</a></div>
            <div className="approval-actions">
              {request.calendarEventUrl && <a href={request.calendarEventUrl} target="_blank" rel="noreferrer">View Calendar event</a>}
              {!request.accountName && <input aria-label={`Account name for ${request.id}`} id={`account-${request.id}`} maxLength={120} placeholder="Account name" />}
              <select aria-label={`Traveler for ${request.id}`} value={selectedTraveler} onChange={(event) => setTravelerSelections((current) => ({ ...current, [request.id]: event.target.value }))} disabled={workingId === request.id}>
                <option value="" disabled>Assign traveler</option>
                {travelers.map((person) => <option key={person.email} value={person.name}>{person.name}</option>)}
              </select>
              {conflicts.length > 0 && <span className="field-error" role="alert">Conflict: {selectedTraveler} already has {conflicts.length} overlapping {conflicts.length === 1 ? "visit" : "visits"}.</span>}
              <button className="btn-primary" type="button" onClick={() => {
                const accountInput = document.getElementById(`account-${request.id}`) as HTMLInputElement | null;
                confirmThenDecide(request.id, "approve", selectedTraveler, request.accountName || accountInput?.value);
              }} disabled={workingId === request.id || !selectedTraveler}>{confirmDecision === `approve:${request.id}` ? "Confirm approval" : "Approve"}</button>
              {confirmDecision === `deny:${request.id}` && <textarea aria-label={`Denial reason for ${request.accountName}`} maxLength={500} placeholder="Optional reason for the requester" value={denialReasons[request.id] ?? ""} onChange={(event) => setDenialReasons((current) => ({ ...current, [request.id]: event.target.value }))} />}
              <button className="filter" type="button" disabled={workingId === request.id} onClick={() => confirmThenDecide(request.id, "deny")}>{confirmDecision === `deny:${request.id}` ? "Confirm denial" : "Deny"}</button>
            </div>
          </article>
        })}
        {pending.length === 0 && <div className="empty-state"><h3>No pending requests</h3></div>}
      </div>
      <h2 className="admin-section-heading">{scheduled.length} scheduled {scheduled.length === 1 ? "visit" : "visits"}</h2>
      <div className="approval-list">
        {scheduled.map((request) => (
          <article className="scheduled-card" key={request.id}>
            <div className="scheduled-summary"><div><h3>{request.accountName}</h3><p>{request.assignedTraveler} · {request.fullAddress} · {request.start} to {request.end}</p><span className={`confidence confidence-${request.dateConfidence}`}>{request.dateConfidence} confidence</span></div>{request.calendarEventUrl && <a href={request.calendarEventUrl} target="_blank" rel="noreferrer">Calendar event</a>}</div>
            {request.pendingChange && <div className="change-request"><strong>{request.pendingChange.type === "cancel" ? "Requester wants to cancel" : `Requester proposed ${request.pendingChange.start} to ${request.pendingChange.end}`}</strong><span>Submitted by {request.requesterName || request.pendingChange.requestedByEmail}</span><div className="scheduled-actions"><button className="btn-primary" type="button" disabled={workingId === request.id} onClick={() => void decideChange(request.id, "approve_change")}>Approve change</button><button className="filter" type="button" disabled={workingId === request.id} onClick={() => void decideChange(request.id, "deny_change")}>Deny</button></div></div>}
            <details><summary>Reschedule visit</summary><form className="visit-form reschedule-form" onSubmit={(event) => void reschedule(request.id, event)}>
              <AddressFields initial={request} />
              <label><span>Start date</span><input name="start" type="date" required defaultValue={request.start} /></label>
              <label><span>End date</span><input name="end" type="date" required defaultValue={request.end} /></label>
              <div className="form-actions full"><button className="btn-primary" type="submit" disabled={workingId === request.id}>Save reschedule</button><span>Calendar attendees will receive an update.</span></div>
            </form></details>
            <div className="scheduled-actions">
              {request.status === "pending" && <button className="filter" type="button" onClick={() => void decide(request.id, "approve", request.assignedTraveler ?? undefined)}>Finish approval</button>}
              <button className="danger-button" type="button" disabled={workingId === request.id} onClick={() => void cancel(request.id)}>{confirmCancelId === request.id ? "Confirm cancellation" : "Cancel visit"}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
