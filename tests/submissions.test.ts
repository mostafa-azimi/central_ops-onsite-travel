import assert from "node:assert/strict";
import test from "node:test";
import { inclusiveEndToExclusive, validateVisitSubmission } from "@/lib/submissions";

const valid = {
  submissionId: "4f75767a-905d-4b80-b185-f942d659b25f",
  tripType: "Onboarding",
  traveler: "Mike Azimi",
  cashUrl: "https://cash.example.test/customer/123",
  city: "Atlanta",
  state: "ga",
  start: "2026-10-05",
  end: "2026-10-07",
};

test("converts inclusive visit end to Calendar end-exclusive date", () => {
  assert.equal(inclusiveEndToExclusive("2026-10-07"), "2026-10-08");
  assert.equal(inclusiveEndToExclusive("2026-12-31"), "2027-01-01");
});

test("accepts only the fixed travelers and exact configured CASH host", () => {
  const result = validateVisitSubmission(valid, "cash.example.test");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.state, "GA");

  assert.equal(validateVisitSubmission({ ...valid, traveler: "Joey Buckley" }, "cash.example.test").ok, false);
  assert.equal(validateVisitSubmission({ ...valid, cashUrl: "https://evil.test/customer/123" }, "cash.example.test").ok, false);
});

test("fails closed while the verified CASH host is unknown", () => {
  const result = validateVisitSubmission(valid);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});
