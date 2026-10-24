// Checks the drive-time lookup against a local engine, with Google's answers faked.
//   ENGINE_SUPABASE_URL=... ENGINE_SUPABASE_SERVICE_ROLE_KEY=... npx tsx --conditions=react-server scripts/test-drive-times.ts
import assert from "node:assert/strict";

process.env.GOOGLE_MAPS_SERVER_KEY = "test";

async function main() {
  const { departureFor, fetchDriveTimes } = await import("../src/lib/drive-times");
  const { engine } = await import("../src/lib/engine");
  const { aucklandToday, shiftDate } = await import("../src/lib/office");

  // 9am Auckland: +13 in summer, +12 in winter
  assert.equal(departureFor("2026-10-27", new Date("2026-10-24T00:00:00Z")), "2026-10-26T20:00:00.000Z");
  assert.equal(departureFor("2026-07-15", new Date("2026-07-01T00:00:00Z")), "2026-07-14T21:00:00.000Z");
  // already past → a minute from now
  assert.equal(departureFor("2026-10-01", new Date("2026-10-24T00:00:00Z")), "2026-10-24T00:01:00.000Z");

  const realFetch = globalThis.fetch;
  let googleCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("routes.googleapis.com")) return realFetch(input, init);
    googleCalls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.routingPreference, "TRAFFIC_AWARE");
    assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "test");
    // pretend every trip takes 1000 s (17 min) and 9.9 km
    return new Response(
      JSON.stringify(body.destinations.map((_: unknown, i: number) => ({
        originIndex: 0, destinationIndex: i, duration: "1000s", distanceMeters: 9900, condition: "ROUTE_EXISTS",
      }))),
    );
  }) as typeof fetch;

  const day = shiftDate(aucklandToday(), 3);
  const first = await fetchDriveTimes(day);
  console.log("first lookup:", first, "google requests:", googleCalls);
  assert.equal(first.needed, 12, "4 jobs → 12 journeys");
  assert.equal(first.saved, 12);
  assert.equal(googleCalls, 4, "one request per starting point");

  const again = await fetchDriveTimes(day);
  assert.equal(again.needed, 0, "nothing to look up the second time");
  assert.equal(googleCalls, 4);

  const { data } = await engine()!.rpc("travel_min", { p_from_lat: -36.787, p_from_lng: 174.773, p_to_lat: -36.861, p_to_lng: 174.735 });
  assert.equal(data, 17, "engine now uses Google's 17 min");
  console.log("drive times: ALL CHECKS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
