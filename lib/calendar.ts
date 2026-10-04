import * as ical from "node-ical";
import snapshot from "@/data/snapshot.json";
import { ASSIGNEES, type Assignee, type TravelEvent, type TravelFeed } from "@/lib/types";

export const CALENDAR_ID =
  "c_8c7ba0dba70e52cecccbcaf595c59c55462074d031f50eecca5138a8303bc6f2@group.calendar.google.com";
export const CALENDAR_TIME_ZONE = "America/New_York";
export const DEFAULT_CALENDAR_ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;

type CalendarEvent = ical.VEvent;

function canonical(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

export function allowedAssignee(summary: string): Assignee | null {
  const normalized = ` ${canonical(summary)} `;
  return (
    ASSIGNEES.find((name) => normalized.includes(` ${canonical(name)} `)) ?? null
  );
}

function cleanText(value: unknown, max = 100) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeLocation(value: unknown) {
  const location = cleanText(value, 80);
  if (
    !location ||
    /(?:https?:\/\/|www\.|@|zoom|meet\.google|teams\.microsoft)/i.test(location)
  ) {
    return "";
  }
  return location;
}

export function publicFields(summary: string, assignee: Assignee, rawLocation: unknown) {
  let customer = cleanText(summary, 120)
    .replace(new RegExp(assignee.replace(" ", "\\s+"), "i"), "")
    .replace(/^[\s:|/,-]+|[\s:|/,-]+$/g, "")
    .trim();

  let location = safeLocation(rawLocation);
  const parenthetical = customer.match(/\s*\(([^()]*)\)\s*$/);
  if (parenthetical && !location) {
    location = safeLocation(parenthetical[1]);
    customer = customer.slice(0, parenthetical.index).trim();
  }

  return {
    customer: customer || "Customer onsite",
    location,
  };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function recurrenceKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function eventDuration(event: CalendarEvent) {
  return Math.max(0, event.end.getTime() - event.start.getTime());
}

function occurrenceToPublic(
  event: CalendarEvent,
  occurrenceStart: Date,
  occurrenceEnd: Date,
): TravelEvent | null {
  if (String(event.status ?? "").toUpperCase() === "CANCELLED") return null;
  const summary = cleanText(event.summary, 140);
  const assignee = allowedAssignee(summary);
  if (!assignee) return null;
  const fields = publicFields(summary, assignee, event.location);
  const allDay = event.datetype === "date";

  return {
    id: `${cleanText(event.uid, 80) || "event"}-${occurrenceStart.toISOString()}`,
    assignee,
    ...fields,
    start: allDay ? dayKey(occurrenceStart) : occurrenceStart.toISOString(),
    end: allDay ? dayKey(occurrenceEnd) : occurrenceEnd.toISOString(),
    allDay,
  };
}

export function parseCalendar(
  raw: string,
  from = new Date(),
  through = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000),
) {
  const parsed = ical.sync.parseICS(raw);
  const output: TravelEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (component.type !== "VEVENT") continue;
    const event = component as CalendarEvent;
    if (!event.start || !event.end) continue;

    if (!event.rrule) {
      if (event.end >= from && event.start <= through) {
        const item = occurrenceToPublic(event, event.start, event.end);
        if (item) output.push(item);
      }
      continue;
    }

    const duration = eventDuration(event);
    const starts = event.rrule.between(
      new Date(from.getTime() - duration),
      through,
      true,
    );

    for (const start of starts) {
      const key = recurrenceKey(start);
      if (event.exdate?.[key]) continue;
      const override = event.recurrences?.[key] as CalendarEvent | undefined;
      const occurrence = override ?? event;
      const actualStart = override?.start ?? start;
      const actualEnd = override?.end ?? new Date(start.getTime() + duration);
      const item = occurrenceToPublic(occurrence, actualStart, actualEnd);
      if (item) output.push(item);
    }
  }

  const deduped = new Map(output.map((item) => [item.id, item]));
  return [...deduped.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function snapshotFeed(now: Date): TravelFeed {
  const events = snapshot.events
    .filter((event) => event.end >= now.toISOString().slice(0, 10))
    .map((event) => event as TravelEvent);
  return {
    events,
    refreshedAt: snapshot.capturedAt,
    source: "snapshot",
  };
}

export async function getTravelFeed(now = new Date()): Promise<TravelFeed> {
  try {
    const calendarUrl = process.env.CALENDAR_ICS_URL ?? DEFAULT_CALENDAR_ICS_URL;
    const response = await fetch(calendarUrl, {
      next: { revalidate: 900 },
      headers: { Accept: "text/calendar" },
    });
    if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
    const raw = await response.text();
    if (!raw.includes("BEGIN:VCALENDAR")) throw new Error("Invalid calendar response");
    return {
      events: parseCalendar(raw, now),
      refreshedAt: new Date().toISOString(),
      source: "live",
    };
  } catch {
    return snapshotFeed(now);
  }
}
