"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ASSIGNEES, TRAVELER_EMAILS, type Assignee, type TravelFeed } from "@/lib/types";
import { AddressFields } from "@/components/address-fields";
import type { StoredVisitRequest } from "@/lib/db";

const TZ = "America/New_York";

function parseDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatDate(value: string, allDay: boolean) {
  const date = allDay ? parseDay(value) : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: allDay ? "UTC" : TZ,
  }).format(date);
}

function formatRange(start: string, end: string, allDay: boolean) {
  if (!allDay) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const date = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: TZ,
    }).format(startDate);
    const times = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: TZ,
    });
    return `${date}, ${times.format(startDate)} to ${times.format(endDate)} ET`;
  }

  const exclusiveEnd = parseDay(end);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
  const startText = formatDate(start, true);
  const endText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(exclusiveEnd);
  return startText === endText ? startText : `${startText} to ${endText}`;
}

function durationLabel(start: string, end: string, allDay: boolean) {
  const startDate = allDay ? parseDay(start) : new Date(start);
  const endDate = allDay ? parseDay(end) : new Date(end);
  const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function TravelDashboard({
  feed,
  requestStorageConfigured,
  employee,
  initialRequests,
  canAdminister,
  initialView,
}: {
  feed: TravelFeed;
  requestStorageConfigured: boolean;
  employee: { email: string; name: string } | null;
  initialRequests: StoredVisitRequest[];
  canAdminister: boolean;
  initialView: "schedule" | "submit";
}) {
  const [view, setView] = useState<"schedule" | "submit">(initialView);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Assignee[]>([]);
  const [formStart, setFormStart] = useState("");
  const [formResetVersion, setFormResetVersion] = useState(0);
  const [requests, setRequests] = useState(initialRequests);
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [submitStatus, setSubmitStatus] = useState<{
    kind: "idle" | "working" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });

  const events = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    return feed.events.filter((event) => {
      const matchesPerson = selected.length === 0 || selected.includes(event.assignee);
      const haystack = `${event.assignee} ${event.customer} ${event.location}`.toLocaleLowerCase("en-US");
      return matchesPerson && (!needle || haystack.includes(needle));
    });
  }, [feed.events, query, selected]);
  const travelerCount = new Set(feed.events.map((event) => event.assignee)).size;
  const nextTrip = feed.events[0];
  const visibleRequests = requests.filter((request) => request.status !== "cancelled");

  function toggle(assignee: Assignee) {
    setSelected((current) =>
      current.includes(assignee)
        ? current.filter((item) => item !== assignee)
        : [...current, assignee],
    );
  }

  async function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus({ kind: "working", message: "Submitting request…" });
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      submissionId: crypto.randomUUID(),
      tripType: String(form.get("tripType")),
      dateConfidence: String(form.get("dateConfidence")),
      accountName: String(form.get("accountName")).trim(),
      cashUrl: String(form.get("cashUrl")),
      city: String(form.get("city")).trim(),
      state: String(form.get("state")).trim(),
      postalCode: String(form.get("postalCode")).trim(),
      fullAddress: String(form.get("fullAddress")).trim(),
      countryCode: String(form.get("countryCode")).trim().toUpperCase(),
      latitude: String(form.get("latitude")),
      longitude: String(form.get("longitude")),
      placeId: String(form.get("placeId")),
      start: String(form.get("start")),
      end: String(form.get("end")),
    };

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string; requestId?: string; request?: StoredVisitRequest };
      if (!response.ok) throw new Error(result.message || "The request could not be submitted.");
      if (result.request) setRequests((items) => [result.request!, ...items.filter((item) => item.id !== result.request!.id)]);
      setSubmitStatus({
        kind: "success",
        message: `Request ${result.requestId} was submitted for approval. The form is ready for another request.`,
      });
      formElement.reset();
      setFormStart("");
      setFormResetVersion((version) => version + 1);
    } catch (error) {
      setSubmitStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "The request could not be submitted.",
      });
    }
  }

  async function requestChange(id: string, action: "request_reschedule" | "request_cancel", start?: string, end?: string) {
    if (action === "request_cancel" && confirmCancelId !== id) {
      setConfirmCancelId(id);
      setSubmitStatus({ kind: "working", message: "Click Request cancellation again to confirm." });
      return;
    }
    setSubmitStatus({ kind: "working", message: action === "request_cancel" ? "Submitting cancellation…" : "Submitting new dates…" });
    const response = await fetch(`/api/requests/${id}/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, start, end }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setSubmitStatus({ kind: response.ok ? "success" : "error", message: result.message ?? "The change request could not be submitted." });
    setConfirmCancelId("");
  }

  async function submitReschedule(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await requestChange(id, "request_reschedule", String(form.get("start")), String(form.get("end")));
  }

  async function decideChange(id: string, action: "approve_change" | "deny_change") {
    setSubmitStatus({ kind: "working", message: action === "approve_change" ? "Applying approved change…" : "Denying change…" });
    const response = await fetch(`/api/requests/${id}/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as { message?: string; request?: StoredVisitRequest };
    if (result.request) setRequests((items) => items.map((item) => item.id === id ? result.request! : item));
    setSubmitStatus({ kind: response.ok ? "success" : "error", message: result.message ?? "The change could not be decided." });
  }

  return (
    <main>
      <header className="hero">
        <div className="hero-inner hero-layout">
          <div>
            <p className="eyebrow">ShipHero customer success</p>
            <h1>Central Ops Travel</h1>
            <p className="hero-copy">Plan customer visits and keep the team aligned.</p>
          </div>
          <div className={feed.source === "live" ? "sync-pill" : "sync-pill pending"} aria-label="Calendar refresh status">
            <span aria-hidden="true" />
            {feed.source === "live" ? "Private calendar sync · Every 15 minutes" : "Verified snapshot · Live sync pending"}
          </div>
        </div>
      </header>

      <section className="content">
        <nav className="view-tabs" aria-label="Travel workspace">
          <button type="button" className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}>Upcoming travel</button>
          <button type="button" className={view === "submit" ? "active" : ""} onClick={() => setView("submit")}>Requests</button>
          <Link href="/map">Map view</Link>
          {canAdminister && <Link href="/admin">Approvals</Link>}
        </nav>

        {view === "schedule" ? (
          <div aria-labelledby="travel-list-heading">
            <div className="toolbar">
              <label className="search-label">
                <span>Search travel</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, city, or teammate" />
              </label>
              <fieldset>
                <legend>Filter by teammate</legend>
                <div className="filters">
                  {ASSIGNEES.map((assignee) => {
                    const active = selected.includes(assignee);
                    const count = feed.events.filter((event) => event.assignee === assignee).length;
                    return (
                      <button key={assignee} type="button" className={active ? "filter active" : "filter"} aria-pressed={active} onClick={() => toggle(assignee)}>
                        <span>{assignee}</span><small>{count}</small>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="stats" aria-label="Travel summary">
              <div className="stat-card"><span>Upcoming trips</span><strong>{feed.events.length}</strong></div>
              <div className="stat-card"><span>Traveling teammates</span><strong>{travelerCount}</strong></div>
              <div className="stat-card wide"><span>Next visit</span><strong>{nextTrip ? `${nextTrip.customer} · ${formatDate(nextTrip.start, nextTrip.allDay)}` : "No travel scheduled"}</strong></div>
            </div>

            <div className="list-heading">
              <div><p className="eyebrow">Next visits</p><h2 id="travel-list-heading">{events.length} upcoming {events.length === 1 ? "trip" : "trips"}</h2></div>
              <p className="updated">{feed.source === "live" ? "Live calendar" : "Verified snapshot"} · Updated {formatDate(feed.refreshedAt, false)}</p>
            </div>

            {events.length > 0 ? (
              <ol className="event-list">
                {events.map((event) => (
                  <li key={event.id} className="event-card">
                    <div className="date-block" aria-label={formatRange(event.start, event.end, event.allDay)}>
                      <span>{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: event.allDay ? "UTC" : TZ }).format(event.allDay ? parseDay(event.start) : new Date(event.start))}</span>
                      <strong>{new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: event.allDay ? "UTC" : TZ }).format(event.allDay ? parseDay(event.start) : new Date(event.start))}</strong>
                    </div>
                    <div className="event-main">
                      <div className="event-title-row"><h3>{event.customer}</h3><span className="duration">{durationLabel(event.start, event.end, event.allDay)}</span></div>
                      <p className="date-line">{formatRange(event.start, event.end, event.allDay)}</p>
                      {event.location && <p className="location">{event.location}</p>}
                    </div>
                    <span className="assignee">{event.assignee}</span>
                  </li>
                ))}
              </ol>
            ) : <div className="empty-state"><h3>No matching travel</h3><p>Try another search or clear a teammate filter.</p></div>}
          </div>
        ) : (
          <section className="workflow-panel" aria-labelledby="submit-heading">
            <div className="panel-heading">
              <p className="eyebrow">Request workflow</p>
              <h2 id="submit-heading">Request a customer visit</h2>
              <p>An approved administrator reviews the request, assigns the traveler, and then creates the Calendar and HubSpot records.</p>
            </div>
            {!requestStorageConfigured && (
              <div className="setup-note"><strong>Private request Sheet setup in progress</strong><span>The form validates now but will not report success until the request is saved durably.</span></div>
            )}
            {!employee ? (
              <div className="employee-gate">
                <h3>ShipHero sign-in required</h3>
                <p>Sign in so your request and any future date or cancellation changes can be verified.</p>
                <a className="btn-primary admin-signin" href="/api/auth/google/start?returnTo=%2F%3Fview%3Dsubmit">Sign in with Google</a>
              </div>
            ) : (
              <>
                <div className="employee-session"><span>Submitting as</span><strong>{employee.name}</strong><small>{employee.email}</small></div>
                <form key={formResetVersion} className="visit-form" onSubmit={submitVisit}>
                  <label><span>Visit type</span><select name="tripType" required defaultValue=""><option value="" disabled>Select a visit type</option><option>Onboarding</option><option>Central Ops onsite</option></select></label>
                  <label><span>Date confidence</span><select name="dateConfidence" required defaultValue=""><option value="" disabled>How firm are these dates?</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                  <p className="field-note full">Low means exploratory. Medium means likely. High means the customer and dates are confirmed.</p>
                  <label className="full"><span>Account name</span><input name="accountName" required maxLength={120} placeholder="Customer account name" autoComplete="organization" /></label>
                  <label className="full"><span>Customer link in CASH</span><input name="cashUrl" type="text" inputMode="url" autoComplete="url" required maxLength={500} placeholder="Paste any customer link" /></label>
                  <AddressFields />
                  <label><span>Start date</span><input name="start" type="date" required onChange={(event) => setFormStart(event.target.value)} /></label>
                  <label><span>End date</span><input name="end" type="date" required min={formStart || undefined} /></label>
                  <div className="form-actions full">
                    <button className="btn-primary" type="submit" disabled={submitStatus.kind === "working"}>{submitStatus.kind === "working" ? "Working…" : "Submit request"}</button>
                    <p>Dates are inclusive. An administrator assigns the traveler.</p>
                  </div>
                </form>
                {submitStatus.kind !== "idle" && <div className={`submit-status ${submitStatus.kind}`} role="status">{submitStatus.message}</div>}

                <div className="request-history-heading"><p className="eyebrow">Your workflow</p><h3>My requests and approvals</h3></div>
                <div className="request-history">
                  {visibleRequests.map((request) => {
                    const isRequester = request.requesterEmail === employee.email;
                    const assignedEmail = request.assignedTraveler
                      ? TRAVELER_EMAILS[request.assignedTraveler as Assignee]
                      : null;
                    const canDecide = canAdminister || assignedEmail === employee.email;
                    const activeVisit = Boolean(request.calendarEventId && !["cancelled", "denied"].includes(request.status));
                    return (
                      <article className="request-card" key={request.id}>
                        <div className="request-card-heading">
                          <div><h3>{request.accountName}</h3><p>{request.start} to {request.end} · {request.assignedTraveler ?? "Traveler not assigned"}</p></div>
                          <div className="request-badges"><span className={`confidence confidence-${request.dateConfidence}`}>{request.dateConfidence} confidence</span><span className="assignee">{request.status}</span></div>
                        </div>
                        {!isRequester && request.pendingChange && <p className="field-note">Change requested by {request.requesterName || request.requesterEmail}.</p>}
                        {request.pendingChange && (
                          <div className="change-request">
                            <strong>{request.pendingChange.type === "cancel" ? "Cancellation requested" : `New dates: ${request.pendingChange.start} to ${request.pendingChange.end}`}</strong>
                            <span>Waiting for the assigned traveler or an administrator.</span>
                            {canDecide && <div className="scheduled-actions"><button className="btn-primary" type="button" onClick={() => void decideChange(request.id, "approve_change")}>Approve change</button><button className="filter" type="button" onClick={() => void decideChange(request.id, "deny_change")}>Deny</button></div>}
                          </div>
                        )}
                        {isRequester && activeVisit && !request.pendingChange && (
                          <div className="requester-actions">
                            <details><summary>Request new dates</summary><form className="change-date-form" onSubmit={(event) => void submitReschedule(request.id, event)}><label><span>Start date</span><input name="start" type="date" required defaultValue={request.start} /></label><label><span>End date</span><input name="end" type="date" required defaultValue={request.end} /></label><button className="filter" type="submit">Submit new dates</button></form></details>
                            <button className="danger-button" type="button" onClick={() => void requestChange(request.id, "request_cancel")}>{confirmCancelId === request.id ? "Confirm cancellation request" : "Request cancellation"}</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {visibleRequests.length === 0 && <div className="empty-state"><h3>No requests yet</h3><p>Your submitted visits and assigned change approvals will appear here.</p></div>}
                </div>
              </>
            )}
          </section>
        )}
      </section>
      <footer>Times shown in America/New_York. Public schedule details are limited to travel essentials.</footer>
    </main>
  );
}
