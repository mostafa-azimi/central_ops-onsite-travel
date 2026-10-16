import { postalCodeFromLocation, postalLookupCode, type AddressSuggestion, type PostalLookup } from "@/lib/geocoding";
import type { EmployeeTravelEvent } from "@/lib/types";

export type MapCoordinate = { lat: number; lng: number; approximate: boolean };
const coordinateCache = new Map<string, MapCoordinate>();

function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Publish the postal-area pin immediately, then refine it if the street resolves.
// Cache only successful results in memory, never private event data in browser storage.
export async function resolveMapCoordinate(
  event: EmployeeTravelEvent,
  publish: (coordinate: MapCoordinate) => void,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<MapCoordinate | null> {
  if (validCoordinate(event.latitude, event.longitude)) {
    const coordinate = { lat: event.latitude!, lng: event.longitude!, approximate: false };
    if (!signal.aborted) publish(coordinate);
    return coordinate;
  }
  if (!event.location || signal.aborted) return null;
  const countryCode = (event.countryCode || "US").toUpperCase();
  const key = `${countryCode}:${event.location}`;
  const cached = fetchImpl === fetch ? coordinateCache.get(key) : undefined;
  if (cached) { publish(cached); return cached; }

  async function readJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) });
      return response.ok ? await response.json() as T : null;
    } catch { return null; }
  }

  const rawPostal = postalCodeFromLocation(event.location, countryCode);
  const postal = rawPostal ? postalLookupCode(countryCode, rawPostal) : "";
  const postalMatch = postal
    ? (await readJson<{ match?: PostalLookup }>(`/api/postal?postalCode=${encodeURIComponent(postal)}&countryCode=${countryCode}`))?.match
    : null;
  let position: MapCoordinate | null = null;
  if (!signal.aborted && postalMatch && validCoordinate(postalMatch.latitude, postalMatch.longitude)) {
    position = { lat: postalMatch.latitude!, lng: postalMatch.longitude!, approximate: true };
    publish(position);
  }
  if (signal.aborted) return null;
  const query = postalMatch ? `${event.location}, ${postalMatch.city}, ${postalMatch.state}` : event.location;
  const body = await readJson<{ suggestions?: AddressSuggestion[] }>(`/api/geocode?q=${encodeURIComponent(query)}&countryCode=${countryCode}`);
  const first = body?.suggestions?.find((item) => item.countryCode.toUpperCase() === countryCode
    && validCoordinate(item.latitude, item.longitude));
  if (!signal.aborted && first) {
    // The free provider can return a city/street rather than a warehouse. Label it honestly.
    position = { lat: first.latitude, lng: first.longitude, approximate: true };
    publish(position);
  }
  if (position && !signal.aborted && fetchImpl === fetch) {
    if (coordinateCache.size >= 200) coordinateCache.delete(coordinateCache.keys().next().value!);
    coordinateCache.set(key, position);
  }
  return position;
}
