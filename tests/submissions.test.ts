import assert from "node:assert/strict";
import test from "node:test";
import { addressWithPostalCode, cashAccountIdFromLink, inclusiveEndToExclusive, normalizeCustomerLink, validateVisitChange, validateVisitRequest, validateVisitSubmission } from "@/lib/submissions";

const valid = {
  submissionId: "4f75767a-905d-4b80-b185-f942d659b25f",
  tripType: "Onboarding",
  traveler: "Mike Azimi",
  dateConfidence: "high",
  accountName: "GTI Properties",
  cashUrl: "https://cash.shiphero.com/client/100000",
  fullAddress: "123 Peachtree St NE, Atlanta, GA 30303, USA",
  city: "Atlanta",
  state: "ga",
  postalCode: "30303",
  countryCode: "US",
  latitude: 33.77,
  longitude: -84.38,
  placeId: "test-place",
  start: "2026-10-05",
  end: "2026-10-07",
};

test("converts inclusive visit end to Calendar end-exclusive date", () => {
  assert.equal(inclusiveEndToExclusive("2026-10-07"), "2026-10-08");
  assert.equal(inclusiveEndToExclusive("2026-12-31"), "2027-01-01");
});

test("postal codes are validated and appended to manual addresses once", () => {
  assert.equal(addressWithPostalCode("2109 N US Hwy 31, Bay Minette, AL", "36507"), "2109 N US Hwy 31, Bay Minette, AL, 36507");
  assert.equal(addressWithPostalCode("123 Peachtree St, Atlanta, GA 30303", "30303"), "123 Peachtree St, Atlanta, GA 30303");
  assert.equal(validateVisitSubmission({ ...valid, postalCode: "1234" }).ok, false);
});

test("accepts only the fixed travelers and a normal customer link", () => {
  const result = validateVisitSubmission(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.state, "GA");
    assert.equal(result.value.accountName, "GTI Properties");
    assert.equal(result.value.cashAccountId, "100000");
    assert.equal(result.value.cashUrl, "https://cash.shiphero.com/client/100000");
  }

  assert.equal(validateVisitSubmission({ ...valid, traveler: "Joey Buckley" }).ok, false);
  assert.equal(validateVisitSubmission({ ...valid, dateConfidence: "maybe" }).ok, false);
  assert.equal(validateVisitSubmission({ ...valid, accountName: "  " }).ok, false);
  assert.equal(validateVisitSubmission({ ...valid, cashUrl: "not a link" }).ok, false);
});

test("accepts flexible HTTP links and extracts known CASH account IDs", () => {
  assert.equal(normalizeCustomerLink("cash.shiphero.com/client/100000"), "https://cash.shiphero.com/client/100000");
  assert.equal(cashAccountIdFromLink("https://cash.shiphero.com/client/100000/details?tab=overview"), "100000");
  assert.equal(cashAccountIdFromLink("https://example.com/client/100000"), "");

  for (const cashUrl of [
    "http://cash.shiphero.com/client/100000",
    "https://cash.shiphero.com/client/not-a-number",
    "https://cash.shiphero.com/client/100000/details?tab=overview#customer",
    "https://example.com/customer/acme",
    "example.com/customer/acme",
  ]) {
    assert.equal(validateVisitSubmission({ ...valid, cashUrl }).ok, true, cashUrl);
  }

  for (const cashUrl of [
    "javascript:alert(1)",
    "mailto:mike@shiphero.com",
    "https://user:secret@example.com/customer",
    "just some text",
  ]) {
    assert.equal(validateVisitSubmission({ ...valid, cashUrl }).ok, false, cashUrl);
  }
});

test("public requests cannot assign a traveler", () => {
  const request: Record<string, unknown> = { ...valid };
  delete request.traveler;
  assert.equal(validateVisitRequest(request).ok, true);
  const assigned = validateVisitRequest(valid);
  assert.equal(assigned.ok, false);
  if (!assigned.ok) assert.match(assigned.message, /administrator/i);
});

test("accepts international regions and full structured addresses", () => {
  const result = validateVisitSubmission({
    ...valid,
    fullAddress: "10 Downing Street, London SW1A 2AA, UK",
    city: "London",
    state: "Greater London",
    postalCode: "SW1A 2AA",
    countryCode: "gb",
    latitude: 51.5034,
    longitude: -0.1276,
    placeId: "london-place",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.countryCode, "GB");
    assert.equal(result.value.state, "Greater London");
  }
});

test("requester changes accept cancellation or an inclusive replacement date range", () => {
  assert.deepEqual(validateVisitChange({ action: "request_cancel" }), {
    ok: true,
    value: { type: "cancel", start: null, end: null },
  });
  assert.equal(validateVisitChange({ action: "request_reschedule", start: "2026-10-31", end: "2026-11-02" }).ok, true);
  assert.equal(validateVisitChange({ action: "request_reschedule", start: "2026-11-02", end: "2026-10-31" }).ok, false);
});
