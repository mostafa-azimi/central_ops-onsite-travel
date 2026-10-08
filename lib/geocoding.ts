export type AddressSuggestion = {
  label: string;
  fullAddress: string;
  city: string;
  state: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: unknown[] };
  properties?: Record<string, unknown>;
};

export function normalizeCountryCode(value: unknown) {
  const countryCode = text(value).toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function photonFeatureToSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  const houseNumber = text(properties.housenumber);
  const street = text(properties.street);
  const name = text(properties.name);
  const addressLine = [houseNumber, street].filter(Boolean).join(" ") || name || street;
  const city = text(properties.city) || text(properties.locality) || text(properties.district) || text(properties.county);
  const state = text(properties.state) || text(properties.county) || text(properties.district);
  const postcode = text(properties.postcode);
  const country = text(properties.country);
  const countryCode = text(properties.countrycode).toUpperCase();
  const parts = [...new Set([addressLine, city, state, postcode, country].filter(Boolean))];
  const fullAddress = parts.join(", ");
  if (!fullAddress || !city || !countryCode) return null;
  const osmType = text(properties.osm_type) || "place";
  const osmId = String(properties.osm_id ?? `${latitude},${longitude}`);
  return {
    label: fullAddress,
    fullAddress,
    city,
    state,
    countryCode,
    latitude,
    longitude,
    placeId: `osm:${osmType}:${osmId}`,
  };
}

export function parsePhotonResponse(input: unknown): AddressSuggestion[] {
  if (!input || typeof input !== "object") return [];
  const features = (input as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.map((feature) => photonFeatureToSuggestion(feature as PhotonFeature)).filter((item): item is AddressSuggestion => Boolean(item)).slice(0, 5);
}
