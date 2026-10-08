"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EmployeeSession } from "@/lib/admin-auth";
import type { AddressSuggestion } from "@/lib/geocoding";
import { ASSIGNEES, TRAVELER_EMAILS, type EmployeeTravelEvent } from "@/lib/types";
import { TRAVELER_MAP_COLORS, travelerColorClass } from "@/lib/traveler-colors";

type Coordinate = { lat: number; lng: number };

function dateRange(event: EmployeeTravelEvent) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: event.allDay ? "UTC" : "America/New_York" });
  const start = event.allDay ? new Date(`${event.start.slice(0, 10)}T12:00:00Z`) : new Date(event.start);
  const end = event.allDay ? new Date(`${event.end.slice(0, 10)}T12:00:00Z`) : new Date(event.end);
  if (event.allDay) end.setUTCDate(end.getUTCDate() - 1);
  const startText = formatter.format(start);
  const endText = formatter.format(end);
  return startText === endText ? startText : `${startText} to ${endText}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

async function eventCoordinate(event: EmployeeTravelEvent): Promise<Coordinate | null> {
  if (event.latitude != null && event.longitude != null) return { lat: event.latitude, lng: event.longitude };
  if (!event.location) return null;
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(event.location)}&countryCode=${encodeURIComponent(event.countryCode || "US")}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { suggestions?: AddressSuggestion[] };
    const first = body.suggestions?.[0];
    return first ? { lat: first.latitude, lng: first.longitude } : null;
  } catch {
    return null;
  }
}

export function TravelMap({
  employee,
  initialEvents,
  canAdminister,
}: {
  employee: EmployeeSession;
  initialEvents: EmployeeTravelEvent[];
  canAdminister: boolean;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!mapElement.current) return;
    let active = true;
    let destroy: (() => void) | undefined;
    void import("leaflet").then(async (leafletModule) => {
      if (!active || !mapElement.current) return;
      const L = leafletModule.default;
      const map = L.map(mapElement.current, { scrollWheelZoom: false, worldCopyJump: true }).setView([43, -101], 3);
      destroy = () => map.remove();
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      const points = await Promise.all(initialEvents.map(async (event) => ({ event, position: await eventCoordinate(event) })));
      if (!active) return;
      const bounds = L.latLngBounds([]);
      for (const { event, position } of points) {
        if (!position) continue;
        const joiningLine = event.participants.length > 0
          ? `<br><span>Joining: ${escapeHtml(event.participants.join(", "))}</span>`
          : "";
        const marker = L.marker([position.lat, position.lng], {
          title: `${event.customer}: ${[event.assignee, ...event.participants].join(", ")}`,
          icon: L.divIcon({ className: `travel-pin ${travelerColorClass(event.assignee)}`, html: '<span aria-hidden="true"></span>', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -32] }),
        }).addTo(map);
        marker.bindPopup(`<div class="map-popup"><strong>${escapeHtml(event.customer)}</strong><br>${escapeHtml(event.location)}<br><span>Traveler: ${escapeHtml(event.assignee)}</span>${joiningLine}</div>`);
        bounds.extend([position.lat, position.lng]);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 7 });
    }).catch(() => setMessage("The interactive map could not load. The visit list is still available."));
    return () => { active = false; destroy?.(); };
  }, [initialEvents]);

  async function attendance(event: EmployeeTravelEvent) {
    setWorkingId(event.calendarEventId);
    setMessage("");
    const action = event.joined ? "leave" : "join";
    const response = await fetch(`/api/map/events/${encodeURIComponent(event.calendarEventId)}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(result.message ?? "Calendar attendance could not be updated.");
      setWorkingId("");
      return;
    }
    window.location.reload();
  }

  return (
    <main className="map-shell">
      <header className="map-header">
        <div><p className="eyebrow">ShipHero employee view</p><h1>Map view</h1><p>See active visits, who is going, and add yourself to the Calendar invite.</p></div>
        <div className="map-account"><span>{employee.name}</span><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
      </header>
      <nav className="view-tabs map-workspace-nav" aria-label="Travel workspace">
        <Link href="/?view=submit">Requests</Link>
        <Link href="/map" className="active" aria-current="page">Map view</Link>
        {canAdminister && <Link href="/admin">Approvals</Link>}
      </nav>
      {message && <div className="submit-status error" role="status">{message}</div>}
      <section className="map-layout">
        <div className="map-canvas">
          <div ref={mapElement} className="travel-map" aria-label="Interactive customer visit map" />
          <aside className="map-legend" aria-label="Traveler map colors">
            <strong>Traveler colors</strong>
            <ul>
              {ASSIGNEES.map((assignee) => (
                <li key={assignee}>
                  <span className="map-legend-dot" style={{ backgroundColor: TRAVELER_MAP_COLORS[assignee] }} aria-hidden="true" />
                  <span>{assignee}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="map-visits">
          <div className="map-visits-heading"><h2>{initialEvents.length} active {initialEvents.length === 1 ? "visit" : "visits"}</h2><p>North America is the default view. Other regions appear automatically when active.</p></div>
          {initialEvents.map((event) => {
            const isPrimaryTraveler = TRAVELER_EMAILS[event.assignee].toLowerCase() === employee.email.toLowerCase();
            return (
              <article className="map-visit-card" key={event.calendarEventId}>
                <div><h3>{event.customer}</h3><p>{dateRange(event)}</p><p>{event.location || "Location pending"}</p><p><strong>Traveler:</strong> {event.assignee}</p></div>
                {event.participants.length > 0 && <div className="participant-list" aria-label="Additional people joining this visit"><strong>Joining:</strong>{event.participants.map((name) => <span key={name}>{name}</span>)}</div>}
                <button className={event.joined || isPrimaryTraveler ? "filter active" : "btn-primary"} type="button" disabled={isPrimaryTraveler || workingId === event.calendarEventId} onClick={() => void attendance(event)}>
                  {isPrimaryTraveler ? "Assigned traveler" : workingId === event.calendarEventId ? "Updating…" : event.joined ? "Leave visit" : "Join and shadow"}
                </button>
              </article>
            );
          })}
          {initialEvents.length === 0 && <div className="empty-state"><h3>No active visits</h3><p>Approved visits will appear here.</p></div>}
        </div>
      </section>
    </main>
  );
}
