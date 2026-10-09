"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { EmployeeSession } from "@/lib/admin-auth";
import { addDays, calendarEventDayKeys, dateKey, eventsByDay, monthGrid, startOfWeek, weekGrid } from "@/lib/calendar-view";
import { ASSIGNEES, TRAVELER_EMAILS, type Assignee, type EmployeeTravelEvent } from "@/lib/types";
import { TRAVELER_MAP_COLORS } from "@/lib/traveler-colors";

type CalendarMode = "month" | "week";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function keyDate(key: string) {
  return new Date(`${key}T12:00:00Z`);
}

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(keyDate(key));
}

function weekLabel(key: string) {
  const first = startOfWeek(key);
  const last = addDays(first, 6);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(keyDate(first))} to ${formatter.format(keyDate(last))}`;
}

function dayNumber(key: string) {
  return Number(key.slice(8, 10));
}

function dayHeading(key: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(keyDate(key));
}

function eventTime(event: EmployeeTravelEvent) {
  if (event.allDay) return "All day";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(event.start));
}

function eventRange(event: EmployeeTravelEvent) {
  if (event.allDay) {
    const first = event.start.slice(0, 10);
    const last = addDays(event.end.slice(0, 10), -1);
    const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const firstText = formatter.format(keyDate(first));
    const lastText = formatter.format(keyDate(last));
    return first === last ? firstText : `${firstText} to ${lastText}`;
  }
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const start = new Date(event.start);
  const end = new Date(event.end);
  const firstDay = dateKey(start);
  const lastDay = dateKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  if (firstDay === lastDay) return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} to ${timeFormatter.format(end)} ET`;
  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} to ${dateFormatter.format(end)}, ${timeFormatter.format(end)} ET`;
}

function shiftAnchor(key: string, mode: CalendarMode, direction: -1 | 1) {
  if (mode === "week") return addDays(key, 7 * direction);
  const date = keyDate(`${key.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}

export function TravelCalendar({
  employee,
  initialEvents,
  canAdminister,
  initialError = "",
}: {
  employee: EmployeeSession;
  initialEvents: EmployeeTravelEvent[];
  canAdminister: boolean;
  initialError?: string;
}) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => dateKey(initialEvents[0]?.start ?? new Date()));
  const [selectedAssignees, setSelectedAssignees] = useState<Assignee[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EmployeeTravelEvent | null>(null);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState(initialError);
  const today = dateKey(new Date());

  const filteredEvents = useMemo(
    () => initialEvents.filter((event) => selectedAssignees.length === 0 || selectedAssignees.includes(event.assignee)),
    [initialEvents, selectedAssignees],
  );
  const eventMap = useMemo(() => eventsByDay(filteredEvents), [filteredEvents]);
  const visibleDays = mode === "month" ? monthGrid(anchor) : weekGrid(anchor);

  useEffect(() => {
    if (!selectedEvent) return;
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedEvent(null);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedEvent]);

  function toggleAssignee(assignee: Assignee) {
    setSelectedAssignees((current) => current.includes(assignee)
      ? current.filter((item) => item !== assignee)
      : [...current, assignee]);
  }

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
    <main className="calendar-shell">
      <header className="map-header calendar-header">
        <div>
          <p className="eyebrow">ShipHero employee view</p>
          <h1>Calendar view</h1>
          <p>Explore approved visits by date, traveler, and customer.</p>
        </div>
        <div className="map-account"><span>{employee.name}</span><form action="/api/auth/signout" method="post"><button className="filter" type="submit">Sign out</button></form></div>
      </header>

      <nav className="view-tabs map-workspace-nav" aria-label="Travel workspace">
        <Link href="/">Upcoming travel</Link>
        <Link href="/?view=submit">Requests</Link>
        <Link href="/map">Map view</Link>
        <Link href="/calendar" className="active" aria-current="page">Calendar view</Link>
        <Link href="/how-to-use">How to use</Link>
        {canAdminister && <Link href="/admin">Approvals</Link>}
      </nav>

      {message && <div className="submit-status error calendar-status" role="status">{message}</div>}

      <section className="calendar-toolbar" aria-label="Calendar controls">
        <div className="calendar-period-controls">
          <button className="calendar-icon-button" type="button" onClick={() => setAnchor(shiftAnchor(anchor, mode, -1))} aria-label={`Previous ${mode}`}>←</button>
          <button className="filter" type="button" onClick={() => setAnchor(today)}>Today</button>
          <button className="calendar-icon-button" type="button" onClick={() => setAnchor(shiftAnchor(anchor, mode, 1))} aria-label={`Next ${mode}`}>→</button>
          <h2 aria-live="polite">{mode === "month" ? monthLabel(anchor) : weekLabel(anchor)}</h2>
        </div>
        <div className="calendar-mode-switch" aria-label="Calendar view type">
          <button type="button" className={mode === "month" ? "active" : ""} aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
          <button type="button" className={mode === "week" ? "active" : ""} aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
        </div>
      </section>

      <section className="calendar-filter-bar" aria-label="Filter visits by traveler">
        <span>Travelers</span>
        <div className="calendar-filter-list">
          {ASSIGNEES.map((assignee) => {
            const active = selectedAssignees.includes(assignee);
            return (
              <button key={assignee} type="button" className={active ? "calendar-person-filter active" : "calendar-person-filter"} aria-pressed={active} onClick={() => toggleAssignee(assignee)}>
                <span style={{ backgroundColor: TRAVELER_MAP_COLORS[assignee] }} aria-hidden="true" />
                {assignee}
              </button>
            );
          })}
        </div>
        {selectedAssignees.length > 0 && <button className="calendar-clear" type="button" onClick={() => setSelectedAssignees([])}>Clear filters</button>}
      </section>

      <div className="calendar-scroll" tabIndex={0} aria-label={`${mode} calendar, horizontally scrollable on small screens`}>
        <section className={`travel-calendar ${mode === "week" ? "week" : "month"}`} aria-label={`${mode} calendar`}>
          <div className="calendar-weekdays" aria-hidden="true">
            {DAY_NAMES.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}
          </div>
          <div className="calendar-grid">
            {visibleDays.map((day) => {
              const dayEvents = eventMap.get(day) ?? [];
              const outsideMonth = mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <article className={`calendar-day${outsideMonth ? " outside" : ""}${day === today ? " today" : ""}`} key={day} aria-label={`${dayHeading(day)}, ${dayEvents.length} ${dayEvents.length === 1 ? "visit" : "visits"}`}>
                  <div className="calendar-day-heading"><span>{mode === "week" ? dayHeading(day) : dayNumber(day)}</span>{day === today && <small>Today</small>}</div>
                  <div className="calendar-day-events">
                    {dayEvents.map((event) => {
                      const spanDays = calendarEventDayKeys(event);
                      const isContinuation = day !== spanDays[0];
                      const style = { "--traveler-color": TRAVELER_MAP_COLORS[event.assignee] } as CSSProperties;
                      return (
                        <button className={`calendar-event${isContinuation ? " continuation" : ""}`} style={style} type="button" key={`${day}-${event.calendarEventId}`} onClick={() => setSelectedEvent(event)}>
                          <span>{eventTime(event)}</span>
                          <strong>{event.customer}</strong>
                          {mode === "week" && <small>{event.assignee}</small>}
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {filteredEvents.length === 0 && (
        <div className="empty-state calendar-empty"><h3>No visits match this view</h3><p>Clear traveler filters or move to another date range.</p></div>
      )}

      {selectedEvent && (
        <div className="calendar-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedEvent(null); }}>
          <section className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
            <button className="calendar-dialog-close" type="button" onClick={() => setSelectedEvent(null)} aria-label="Close visit details">×</button>
            <span className="calendar-dialog-accent" style={{ backgroundColor: TRAVELER_MAP_COLORS[selectedEvent.assignee] }} aria-hidden="true" />
            <p className="eyebrow">Approved customer visit</p>
            <h2 id="calendar-event-title">{selectedEvent.customer}</h2>
            <dl>
              <div><dt>Dates</dt><dd>{eventRange(selectedEvent)}</dd></div>
              <div><dt>Location</dt><dd>{selectedEvent.location || "Location pending"}</dd></div>
              <div><dt>Traveler</dt><dd>{selectedEvent.assignee}</dd></div>
              <div><dt>Joining</dt><dd>{selectedEvent.participants.length > 0 ? selectedEvent.participants.join(", ") : "No additional teammates"}</dd></div>
            </dl>
            {(() => {
              const isPrimaryTraveler = TRAVELER_EMAILS[selectedEvent.assignee].toLowerCase() === employee.email.toLowerCase();
              return (
                <button className={selectedEvent.joined || isPrimaryTraveler ? "filter active" : "btn-primary"} type="button" disabled={isPrimaryTraveler || workingId === selectedEvent.calendarEventId} onClick={() => void attendance(selectedEvent)}>
                  {isPrimaryTraveler ? "Assigned traveler" : workingId === selectedEvent.calendarEventId ? "Updating…" : selectedEvent.joined ? "Leave visit" : "Join and shadow"}
                </button>
              );
            })()}
          </section>
        </div>
      )}
    </main>
  );
}
