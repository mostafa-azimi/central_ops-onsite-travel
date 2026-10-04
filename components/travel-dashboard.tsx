"use client";

import { useMemo, useState } from "react";
import { ASSIGNEES, type Assignee, type TravelFeed } from "@/lib/types";

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

export function TravelDashboard({ feed }: { feed: TravelFeed }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Assignee[]>([]);
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

  function toggle(assignee: Assignee) {
    setSelected((current) =>
      current.includes(assignee)
        ? current.filter((item) => item !== assignee)
        : [...current, assignee],
    );
  }

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <p className="eyebrow">ShipHero customer success</p>
          <h1>Upcoming onsite travel</h1>
          <p className="hero-copy">A focused view of customer visits for the CS team.</p>
          <div className={feed.source === "live" ? "sync-pill" : "sync-pill pending"} aria-label="Calendar refresh status">
            <span aria-hidden="true" />
            {feed.source === "live" ? "Private calendar sync · Every 15 minutes" : "Verified snapshot · Live sync pending"}
          </div>
        </div>
      </header>

      <section className="content" aria-labelledby="travel-list-heading">
        <div className="toolbar">
          <label className="search-label">
            <span>Search travel</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Customer, city, or teammate"
            />
          </label>
          <fieldset>
            <legend>Filter by teammate</legend>
            <div className="filters">
              {ASSIGNEES.map((assignee) => {
                const active = selected.includes(assignee);
                const count = feed.events.filter((event) => event.assignee === assignee).length;
                return (
                  <button
                    key={assignee}
                    type="button"
                    className={active ? "filter active" : "filter"}
                    aria-pressed={active}
                    onClick={() => toggle(assignee)}
                  >
                    <span>{assignee}</span>
                    <small>{count}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="stats" aria-label="Travel summary">
          <div className="stat-card">
            <span>Upcoming trips</span>
            <strong>{feed.events.length}</strong>
          </div>
          <div className="stat-card">
            <span>Traveling teammates</span>
            <strong>{travelerCount}</strong>
          </div>
          <div className="stat-card wide">
            <span>Next visit</span>
            <strong>{nextTrip ? `${nextTrip.customer} · ${formatDate(nextTrip.start, nextTrip.allDay)}` : "No travel scheduled"}</strong>
          </div>
        </div>

        <div className="list-heading">
          <div>
            <p className="eyebrow">Next visits</p>
            <h2 id="travel-list-heading">{events.length} upcoming {events.length === 1 ? "trip" : "trips"}</h2>
          </div>
          <p className="updated">
            {feed.source === "live" ? "Live calendar" : "Verified snapshot"} · Updated {formatDate(feed.refreshedAt, false)}
          </p>
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
                  <div className="event-title-row">
                    <h3>{event.customer}</h3>
                    <span className="duration">{durationLabel(event.start, event.end, event.allDay)}</span>
                  </div>
                  <p className="date-line">{formatRange(event.start, event.end, event.allDay)}</p>
                  {event.location && <p className="location">{event.location}</p>}
                </div>
                <span className="assignee">{event.assignee}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <h3>No matching travel</h3>
            <p>Try another search or clear a teammate filter.</p>
          </div>
        )}
      </section>
      <footer>Times shown in America/New_York. Calendar details are limited to travel essentials.</footer>
    </main>
  );
}
