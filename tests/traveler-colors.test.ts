import assert from "node:assert/strict";
import test from "node:test";
import { ASSIGNEES } from "@/lib/types";
import { TRAVELER_MAP_COLORS, travelerColorClass } from "@/lib/traveler-colors";

test("every approved traveler has a unique map color and marker class", () => {
  const colors = ASSIGNEES.map((assignee) => TRAVELER_MAP_COLORS[assignee]);
  const classes = ASSIGNEES.map(travelerColorClass);

  assert.equal(new Set(colors).size, ASSIGNEES.length);
  assert.equal(new Set(classes).size, ASSIGNEES.length);
  for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/i);
});
