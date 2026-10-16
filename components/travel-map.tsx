"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShipHeroBrand } from "@/components/shiphero-brand";
import type { EmployeeSession } from "@/lib/admin-auth";
import { resolveMapCoordinate, type MapCoordinate } from "@/lib/map-coordinate";
import type { EmployeeTravelEvent, TravelerProfile } from "@/lib/types";
import { travelerColor } from "@/lib/traveler-colors";

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

function markerInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function markerTextColor(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#000000" : "#ffffff";
}

export function TravelMap({ employee }: { employee: EmployeeSession }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [initialEvents, setEvents] = useState<EmployeeTravelEvent[]>([]);
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [canAdminister, setCanAdminister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [positions, setPositions] = useState<Record<string, MapCoordinate | null>>({});
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    void fetch("/api/map-data", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to view visits." : "Visits could not be loaded. Try again shortly.");
        return response.json() as Promise<{ events: EmployeeTravelEvent[]; travelers: TravelerProfile[]; canAdminister: boolean }>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setEvents(result.events);
        setTravelers(result.travelers);
        setCanAdminister(result.canAdminister);
        setPositions({});
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Loading visits timed out. Try again shortly.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!mapElement.current) return;
    let active = true;
    const controller = new AbortController();
    let destroy: (() => void) | undefined;
    void import("leaflet").then(async (leafletModule) => {
      if (!active || !mapElement.current) return;
      const L = leafletModule.default;
      const map = L.map(mapElement.current, { scrollWheelZoom: true, touchZoom: true, worldCopyJump: true }).setView([43, -101], 3);
      destroy = () => map.remove();
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      const bounds = L.latLngBounds([]);
      let userMoved = false;
      map.on("dragstart", () => { userMoved = true; });
      const markInteraction = () => { userMoved = true; };
      mapElement.current.addEventListener("wheel", markInteraction, { passive: true });
      mapElement.current.addEventListener("touchstart", markInteraction, { passive: true });
      const element = mapElement.current;
      destroy = () => {
        element.removeEventListener("wheel", markInteraction);
        element.removeEventListener("touchstart", markInteraction);
        map.remove();
      };
      const queue = [...initialEvents];
      async function locate(event: EmployeeTravelEvent) {
        let marker: import("leaflet").Marker | undefined;
        const color = travelerColor(event.assignee, travelers);
        const joiningLine = event.participants.length > 0
          ? `<br><span>Joining: ${escapeHtml(event.participants.join(", "))}</span>`
          : "";
        const position = await resolveMapCoordinate(event, (position) => {
          if (!active) return;
          if (marker) marker.setLatLng([position.lat, position.lng]);
          else marker = L.marker([position.lat, position.lng], {
            title: `${event.customer}: ${[event.assignee, ...event.participants].join(", ")}`,
            icon: L.divIcon({ className: "travel-pin", html: `<span aria-hidden="true" style="background:${color};color:${markerTextColor(color)}"><b>${escapeHtml(markerInitials(event.assignee))}</b></span>`, iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -32] }),
          }).addTo(map);
          marker.bindPopup(`<div class="map-popup"><strong>${escapeHtml(event.customer)}</strong><br>${escapeHtml(event.location)}${position.approximate ? "<br><span>Approximate location</span>" : ""}<br><span>Dates: ${escapeHtml(dateRange(event))}</span><br><span>Traveler: ${escapeHtml(event.assignee)}</span>${joiningLine}</div>`);
          bounds.extend([position.lat, position.lng]);
          if (!userMoved) map.fitBounds(bounds.pad(0.18), { maxZoom: 7 });
          setPositions((current) => ({ ...current, [event.calendarEventId]: position }));
        }, controller.signal);
        if (active) setPositions((current) => ({ ...current, [event.calendarEventId]: position }));
      }
      // Bound external lookup concurrency, but draw each pin as soon as it resolves.
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (active && queue.length) await locate(queue.shift()!);
      }));
    }).catch(() => { if (active) setMessage("The interactive map could not load. The visit list is still available."); });
    return () => { active = false; controller.abort(); destroy?.(); };
  }, [initialEvents, travelers]);

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
        <div><ShipHeroBrand className="map-brand" /><p className="eyebrow">Employee travel view</p><h1>Map view</h1><p>See active visits, who is going, and add yourself to the Calendar invite.</p></div>
        <div className="map-account"><span>{employee.name}</span><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
      </header>
      <nav className="view-tabs map-workspace-nav" aria-label="Travel workspace">
        <Link href="/?view=submit">Requests</Link>
        <Link href="/map" className="active" aria-current="page">Map view</Link>
        <Link href="/calendar">Calendar view</Link>
        <Link href="/how-to-use">How to use</Link>
        {canAdminister && <><Link href="/admin">Approvals</Link><Link href="/admin/settings">Admin settings</Link><Link href="/admin/operations">Operations</Link></>}
      </nav>
      {message && <div className="submit-status error" role="status">{message} <button type="button" className="filter" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
      <section className="map-layout">
        <div className="map-canvas">
          <div ref={mapElement} className="travel-map" aria-label="Interactive customer visit map" />
          <aside className="map-legend" aria-label="Traveler map colors">
            <strong>{loading ? "Loading travelers…" : "Traveler colors"}</strong>
            <ul>
              {travelers.map((person) => (
                <li key={person.email}>
                  <span className="map-legend-dot" style={{ backgroundColor: person.color }} aria-hidden="true" />
                  <span>{person.name}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="map-visits">
          <div className="map-visits-heading"><h2>{loading ? "Loading visits…" : `${initialEvents.length} active ${initialEvents.length === 1 ? "visit" : "visits"}`}</h2><p>North America is the default view. Pinch or scroll over the map to zoom.</p></div>
          {initialEvents.map((event) => {
            const isPrimaryTraveler = travelers.find((person) => person.name === event.assignee)?.email.toLowerCase() === employee.email.toLowerCase();
            return (
              <article className="map-visit-card" key={event.calendarEventId}>
                <div><h3>{event.customer}</h3><p>{dateRange(event)}</p><p>{event.location || "Location pending"}</p><p><strong>Traveler:</strong> {event.assignee}</p></div>
                <p className="field-note">{positions[event.calendarEventId] === undefined ? "Locating on map…" : positions[event.calendarEventId] === null ? "Location could not be mapped. This visit is still scheduled." : positions[event.calendarEventId]?.approximate ? "Approximate location on map" : "Shown on map"}</p>
                {event.participants.length > 0 && <div className="participant-list" aria-label="Additional people joining this visit"><strong>Joining:</strong>{event.participants.map((name) => <span key={name}>{name}</span>)}</div>}
                <button className={event.joined || isPrimaryTraveler ? "filter active" : "btn-primary"} type="button" disabled={isPrimaryTraveler || workingId === event.calendarEventId} onClick={() => void attendance(event)}>
                  {isPrimaryTraveler ? "Assigned traveler" : workingId === event.calendarEventId ? "Updating…" : event.joined ? "Leave visit" : "Join and shadow"}
                </button>
              </article>
            );
          })}
          {!loading && !message && initialEvents.length === 0 && <div className="empty-state"><h3>No active visits</h3><p>Approved visits will appear here.</p></div>}
        </div>
      </section>
    </main>
  );
}
