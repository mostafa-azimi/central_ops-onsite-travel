import assert from "node:assert/strict";
import test from "node:test";
import { calendarEventDayKeys, eventsByDay, monthGrid, startOfWeek, weekGrid } from "../lib/calendar-view";
import type { EmployeeTravelEvent } from "../lib/types";

function event(overrides: Partial<EmployeeTravelEvent> = {}): EmployeeTravelEvent {
  return {
    id: "public-1",
    calendarEventId: "calendar-1",
    assignee: "Mike Azimi",
    customer: "Example customer",
    location: "New York, NY",
    start: "2026-10-08",
    end: "2026-10-10",
    allDay: true,
    participants: [],
    joined: false,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

test("all-day calendar ranges treat the end date as exclusive", () => {
  assert.deepEqual(calendarEventDayKeys(event()), ["2026-10-08", "2026-10-09"]);
});

test("timed events use America/New_York days and do not include a midnight-exclusive end", () => {
  assert.deepEqual(calendarEventDayKeys(event({
    allDay: false,
    start: "2026-10-09T03:00:00.000Z",
    end: "2026-10-09T04:00:00.000Z",
  })), ["2026-10-08"]);

  assert.deepEqual(calendarEventDayKeys(event({
    allDay: false,
    start: "2026-10-09T03:00:00.000Z",
    end: "2026-10-09T05:00:00.000Z",
  })), ["2026-10-08", "2026-10-09"]);
});

test("month and week grids begin on Sunday and remain deterministic", () => {
  assert.equal(startOfWeek("2026-10-09"), "2026-10-04");
  assert.deepEqual(weekGrid("2026-10-09"), [
    "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10",
  ]);
  const october = monthGrid("2026-10-09");
  assert.equal(october.length, 42);
  assert.equal(october[0], "2026-09-27");
  assert.equal(october[41], "2026-11-07");
});

test("multi-day visits are indexed on every visible day", () => {
  const visit = event();
  const index = eventsByDay([visit]);
  assert.equal(index.get("2026-10-08")?.[0], visit);
  assert.equal(index.get("2026-10-09")?.[0], visit);
  assert.equal(index.has("2026-10-10"), false);
});
