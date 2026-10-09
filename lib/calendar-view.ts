import type { EmployeeTravelEvent, TravelEvent } from "@/lib/types";

export const CALENDAR_VIEW_TIME_ZONE = "America/New_York";

type CalendarEvent = Pick<TravelEvent, "start" | "end" | "allDay">;

function dateKeyFromInstant(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_VIEW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateKey(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateKeyFromInstant(value);
}

export function addDays(key: string, amount: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(key: string) {
  const date = new Date(`${key}T12:00:00Z`);
  return addDays(key, -date.getUTCDay());
}

export function calendarEventDayKeys(event: CalendarEvent) {
  const startKey = event.allDay ? event.start.slice(0, 10) : dateKey(event.start);
  const endKey = event.allDay
    ? addDays(event.end.slice(0, 10), -1)
    : dateKey(new Date(Math.max(new Date(event.start).getTime(), new Date(event.end).getTime() - 1)));
  const keys: string[] = [];
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) keys.push(key);
  return keys;
}

export function monthGrid(anchorKey: string) {
  const monthStart = `${anchorKey.slice(0, 7)}-01`;
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function weekGrid(anchorKey: string) {
  const first = startOfWeek(anchorKey);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export function eventsByDay(events: EmployeeTravelEvent[]) {
  const output = new Map<string, EmployeeTravelEvent[]>();
  for (const event of events) {
    for (const key of calendarEventDayKeys(event)) {
      const current = output.get(key) ?? [];
      current.push(event);
      output.set(key, current);
    }
  }
  return output;
}
