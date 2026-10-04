import assert from "node:assert/strict";
import test from "node:test";
import { allowedAssignee, parseCalendar, publicFields } from "@/lib/calendar";

test("only the four allowlisted people can match", () => {
  assert.equal(allowedAssignee("Sam Armenia - Velocity"), "Sam Armenia");
  assert.equal(allowedAssignee("Joey - Customer visit"), null);
  assert.equal(allowedAssignee("Samantha Armenia - Customer visit"), null);
});

test("the public DTO removes names and unsafe locations", () => {
  assert.deepEqual(
    publicFields("Sam Armenia - Fulfillmate (San Diego)", "Sam Armenia", "https://meet.google.com/secret"),
    { customer: "Fulfillmate", location: "San Diego" },
  );
});

test("parses recurrence, exclusion, cancellation, and all-day end-exclusive dates", () => {
  const fixture = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:series-1\r
DTSTART;VALUE=DATE:20261006\r
DTEND;VALUE=DATE:20261008\r
RRULE:FREQ=WEEKLY;COUNT=4\r
EXDATE;VALUE=DATE:20261013\r
SUMMARY:Sam Armenia - Velocity\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled-1\r
DTSTART;VALUE=DATE:20261009\r
DTEND;VALUE=DATE:20261010\r
STATUS:CANCELLED\r
SUMMARY:Mike Azimi - Hidden cancelled trip\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:excluded-person\r
DTSTART;VALUE=DATE:20261010\r
DTEND;VALUE=DATE:20261011\r
SUMMARY:Joey - Excluded visit\r
DESCRIPTION:private@example.com https://meet.google.com/secret\r
END:VEVENT\r
END:VCALENDAR\r
`;
  const events = parseCalendar(
    fixture,
    new Date("2026-10-01T00:00:00Z"),
    new Date("2026-11-30T00:00:00Z"),
  );
  assert.equal(events.length, 3);
  assert.equal(events[0].start, "2026-10-06");
  assert.equal(events[0].end, "2026-10-08");
  assert.ok(events.every((event) => event.assignee === "Sam Armenia"));
  assert.ok(!JSON.stringify(events).includes("private@example.com"));
  assert.ok(!JSON.stringify(events).includes("meet.google.com"));
});
