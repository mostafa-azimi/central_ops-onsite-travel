import assert from "node:assert/strict";
import test from "node:test";
import { inclusiveEndToExclusive, validateVisitRequest, validateVisitSubmission } from "@/lib/submissions";

const valid = {
  submissionId: "4f75767a-905d-4b80-b185-f942d659b25f",
  tripType: "Onboarding",
  traveler: "Mike Azimi",
  accountName: "GTI Properties",
  cashUrl: "https://cash.shiphero.com/client/100000",
  fullAddress: "123 Peachtree St NE, Atlanta, GA 30303, USA",
  city: "Atlanta",
  state: "ga",
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

test("accepts only the fixed travelers and exact CASH account path", () => {
  const result = validateVisitSubmission(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.state, "GA");
    assert.equal(result.value.accountName, "GTI Properties");
    assert.equal(result.value.cashAccountId, "100000");
    assert.equal(result.value.cashUrl, "https://cash.shiphero.com/client/100000");
  }

  assert.equal(validateVisitSubmission({ ...valid, traveler: "Joey Buckley" }).ok, false);
  assert.equal(validateVisitSubmission({ ...valid, accountName: "  " }).ok, false);
  assert.equal(validateVisitSubmission({ ...valid, cashUrl: "https://evil.test/client/100000" }).ok, false);
});

test("allows one trailing slash but rejects arbitrary CASH URL variants", () => {
  const trailingSlash = validateVisitSubmission({
    ...valid,
    cashUrl: "https://cash.shiphero.com/client/100000/",
  });
  assert.equal(trailingSlash.ok, true);
  if (trailingSlash.ok) assert.equal(trailingSlash.value.cashUrl, valid.cashUrl);

  for (const cashUrl of [
    "http://cash.shiphero.com/client/100000",
    "https://cash.shiphero.com/client/not-a-number",
    "https://cash.shiphero.com/client/100000/details",
    "https://cash.shiphero.com/client/100000?next=https://evil.test",
    "https://cash.shiphero.com/client/100000#fragment",
    "https://cash.shiphero.com.evil.test/client/100000",
    "https://user@cash.shiphero.com/client/100000",
    "https://cash.shiphero.com:8443/client/100000",
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
