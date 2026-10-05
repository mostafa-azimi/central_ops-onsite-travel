"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EmployeeSession } from "@/lib/admin-auth";
import type { EmployeeTravelEvent } from "@/lib/types";
import { loadGoogleMaps } from "@/components/address-fields";

type Coordinate = { lat: number; lng: number };
type MapsApi = {
  Map: new (element: HTMLElement, options: object) => { fitBounds(bounds: object, padding?: number): void };
  Marker: new (options: object) => { addListener(name: string, callback: () => void): void };
  InfoWindow: new (options: object) => { open(options: object): void };
  LatLngBounds: new () => { extend(position: Coordinate): void };
  Geocoder: new () => { geocode(request: object, callback: (results: Array<{ geometry: { location: { lat(): number; lng(): number } } }> | null, status: string) => void): void };
};
type MapsWindow = Window & { google?: { maps: MapsApi } };

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

export function TravelMap({
  employee,
  initialEvents,
  apiKey,
}: {
  employee: EmployeeSession;
  initialEvents: EmployeeTravelEvent[];
  apiKey: string;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!apiKey || !mapElement.current) return;
    let active = true;
    void loadGoogleMaps(apiKey).then(async () => {
      if (!active || !mapElement.current) return;
      const maps = (window as MapsWindow).google?.maps;
      if (!maps) return;
      const map = new maps.Map(mapElement.current, {
        center: { lat: 43, lng: -101 },
        zoom: 3,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      const bounds = new maps.LatLngBounds();
      const geocoder = new maps.Geocoder();
      let markerCount = 0;
      for (const event of initialEvents) {
        let position: Coordinate | null = event.latitude != null && event.longitude != null
          ? { lat: event.latitude, lng: event.longitude }
          : null;
        if (!position && event.location) {
          position = await new Promise<Coordinate | null>((resolve) => {
            geocoder.geocode({ address: event.location }, (results, status) => {
              const location = status === "OK" ? results?.[0]?.geometry.location : null;
              resolve(location ? { lat: location.lat(), lng: location.lng() } : null);
            });
          });
        }
        if (!active || !position) continue;
        const marker = new maps.Marker({ map, position, title: `${event.customer}: ${event.participants.join(", ")}` });
        const info = new maps.InfoWindow({
          content: `<div class="map-popup"><strong>${escapeHtml(event.customer)}</strong><br>${escapeHtml(event.location)}<br><span>${escapeHtml(event.participants.join(", "))}</span></div>`,
        });
        marker.addListener("click", () => info.open({ anchor: marker, map }));
        bounds.extend(position);
        markerCount += 1;
      }
      if (markerCount > 0) map.fitBounds(bounds, 70);
    }).catch(() => setMessage("The interactive map could not load. The visit list is still available."));
    return () => { active = false; };
  }, [apiKey, initialEvents]);

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
        <div><p className="eyebrow">ShipHero employee view</p><h1>Team travel map</h1><p>See active visits, who is going, and add yourself to the Calendar invite.</p></div>
        <div className="map-account"><span>{employee.name}</span><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
      </header>
      <nav className="map-nav"><Link href="/">Public schedule</Link><Link href="/admin">Admin approvals</Link></nav>
      {!apiKey && <div className="setup-note"><strong>Interactive map setup pending</strong><span>The employee-only visit list and Calendar join controls work now. Google Maps and address autocomplete need the restricted Maps key.</span></div>}
      {message && <div className="submit-status error" role="status">{message}</div>}
      <section className="map-layout">
        <div ref={mapElement} className={apiKey ? "travel-map" : "travel-map map-placeholder"} aria-label="Interactive customer visit map">
          {!apiKey && <p>Map activates after Google Maps Platform setup.</p>}
        </div>
        <div className="map-visits">
          <div className="map-visits-heading"><h2>{initialEvents.length} active {initialEvents.length === 1 ? "visit" : "visits"}</h2><p>North America is the default view. Other regions appear automatically when active.</p></div>
          {initialEvents.map((event) => (
            <article className="map-visit-card" key={event.calendarEventId}>
              <div><h3>{event.customer}</h3><p>{dateRange(event)}</p><p>{event.location || "Location pending"}</p></div>
              <div className="participant-list" aria-label="People on this visit">{event.participants.map((name) => <span key={name}>{name}</span>)}</div>
              <button className={event.joined ? "filter active" : "btn-primary"} type="button" disabled={workingId === event.calendarEventId} onClick={() => void attendance(event)}>
                {workingId === event.calendarEventId ? "Updating…" : event.joined ? "Leave visit" : "Join and shadow"}
              </button>
            </article>
          ))}
          {initialEvents.length === 0 && <div className="empty-state"><h3>No active visits</h3><p>Approved visits will appear here.</p></div>}
        </div>
      </section>
    </main>
  );
}
