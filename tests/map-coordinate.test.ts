import assert from "node:assert/strict";
import test from "node:test";
import { resolveMapCoordinate, type MapCoordinate } from "@/lib/map-coordinate";
import type { EmployeeTravelEvent } from "@/lib/types";

const visit: EmployeeTravelEvent = {
  id: "fixture", calendarEventId: "fixture", customer: "Test warehouse", assignee: "Test Traveler",
  location: "1301 WATERS RIDGE DR, 75057-6022", countryCode: "US", latitude: null, longitude: null,
  start: "2026-10-21", end: "2026-10-22", allDay: true, participants: [], joined: false,
};
const postal = { postalCode: "75057", countryCode: "US", city: "Lewisville", state: "TX", latitude: 33.0532, longitude: -96.9999 };

test("ZIP+4 visit gets an approximate pin before street lookup finishes", async () => {
  const published: MapCoordinate[] = [];
  let finishStreet!: (response: Response) => void;
  const street = new Promise<Response>((resolve) => { finishStreet = resolve; });
  let postalPublished!: () => void;
  const ready = new Promise<void>((resolve) => { postalPublished = resolve; });
  const fetcher = (async (input: string | URL | Request) => {
    if (String(input).includes("/api/postal")) {
      assert.match(String(input), /postalCode=75057&/);
      return Response.json({ match: postal });
    }
    assert.equal(published.length, 1);
    return street;
  }) as typeof fetch;
  const pending = resolveMapCoordinate(visit, (point) => { published.push(point); postalPublished(); }, new AbortController().signal, fetcher);
  await ready;
  assert.deepEqual(published[0], { lat: 33.0532, lng: -96.9999, approximate: true });
  finishStreet(Response.json({ suggestions: [] }));
  assert.deepEqual(await pending, published[0]);
});

test("failed geocoding preserves postal fallback and receives a bounded signal", async () => {
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.signal);
    if (String(input).includes("/api/postal")) return Response.json({ match: postal });
    throw new Error("upstream unavailable");
  }) as typeof fetch;
  const result = await resolveMapCoordinate(visit, () => {}, new AbortController().signal, fetcher);
  assert.equal(result?.approximate, true);
});

test("unresolvable visits return no fabricated coordinates", async () => {
  const fetcher = (async () => Response.json({ match: null, suggestions: [] })) as typeof fetch;
  assert.equal(await resolveMapCoordinate(visit, () => assert.fail("must not publish a fake pin"), new AbortController().signal, fetcher), null);
});

test("stored coordinates bypass external lookups and aborted work publishes nothing", async () => {
  const fetcher = (async () => { throw new Error("unexpected lookup"); }) as typeof fetch;
  const result = await resolveMapCoordinate({ ...visit, latitude: 33, longitude: -97 }, () => {}, new AbortController().signal, fetcher);
  assert.deepEqual(result, { lat: 33, lng: -97, approximate: false });
  const controller = new AbortController();
  controller.abort();
  assert.equal(await resolveMapCoordinate(visit, () => assert.fail("aborted"), controller.signal, fetcher), null);
});
