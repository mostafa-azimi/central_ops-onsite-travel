import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCountryCode, normalizePostalCode, parsePhotonResponse, parsePostalResponse, photonFeatureToSuggestion, postalCodeFromLocation, postalLookupCode } from "@/lib/geocoding";

test("country codes are normalized before Photon searches", () => {
  assert.equal(normalizeCountryCode(" us "), "US");
  assert.equal(normalizeCountryCode("GB"), "GB");
  assert.equal(normalizeCountryCode("USA"), "");
  assert.equal(normalizeCountryCode("U1"), "");
});

test("postal lookups normalize codes and return city and state", () => {
  assert.equal(normalizePostalCode(" 36507 "), "36507");
  assert.equal(normalizePostalCode("sw1a 2aa"), "SW1A 2AA");
  assert.equal(postalLookupCode("CA", "M5V 3A8"), "M5V");
  assert.deepEqual(parsePostalResponse({
    "post code": "36507",
    "country abbreviation": "US",
    places: [{
      "place name": "Bay Minette",
      "state abbreviation": "AL",
      latitude: "30.8635",
      longitude: "-87.7644",
    }],
  }, "US"), {
    postalCode: "36507",
    countryCode: "US",
    city: "Bay Minette",
    state: "AL",
    latitude: 30.8635,
    longitude: -87.7644,
  });
});

test("map locations expose supported postal codes for coordinate fallback", () => {
  assert.equal(postalCodeFromLocation("124 Venture Court Suite 1, 40511", "US"), "40511");
  assert.equal(postalCodeFromLocation("1 King St W, Toronto, ON M5V 3A8", "CA"), "M5V 3A8");
  assert.equal(postalCodeFromLocation("10 Downing Street, London SW1A 2AA", "GB"), "SW1A 2AA");
  assert.equal(postalCodeFromLocation("North Charleston", "US"), "");
});

test("Photon results become minimal structured international addresses", () => {
  const result = photonFeatureToSuggestion({
    geometry: { coordinates: [-0.1276, 51.5034] },
    properties: {
      osm_type: "W",
      osm_id: 123,
      housenumber: "10",
      street: "Downing Street",
      city: "London",
      state: "England",
      postcode: "SW1A 2AA",
      country: "United Kingdom",
      countrycode: "gb",
    },
  });
  assert.deepEqual(result, {
    label: "10 Downing Street, London, England, SW1A 2AA, United Kingdom",
    fullAddress: "10 Downing Street, London, England, SW1A 2AA, United Kingdom",
    city: "London",
    state: "England",
    postalCode: "SW1A 2AA",
    countryCode: "GB",
    latitude: 51.5034,
    longitude: -0.1276,
    placeId: "osm:W:123",
  });
});

test("Photon parser rejects invalid coordinates and caps suggestions", () => {
  const valid = {
    geometry: { coordinates: [-84.388, 33.749] },
    properties: { name: "Atlanta", city: "Atlanta", state: "Georgia", country: "United States", countrycode: "US" },
  };
  const suggestions = parsePhotonResponse({
    features: [
      { ...valid, geometry: { coordinates: [999, 999] } },
      valid, valid, valid, valid, valid, valid,
    ],
  });
  assert.equal(suggestions.length, 5);
  assert.equal(suggestions[0].countryCode, "US");
});
