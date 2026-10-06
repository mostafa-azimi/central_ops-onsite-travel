import assert from "node:assert/strict";
import test from "node:test";
import { parsePhotonResponse, photonFeatureToSuggestion } from "@/lib/geocoding";

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
