// Checks the booking-engine adapter without touching the network.
//   npx tsx --conditions=react-server scripts/test-engine.ts
import assert from "node:assert/strict";

process.env.GOOGLE_MAPS_SERVER_KEY = "test";

async function main() {
const { toE164, geocode } = await import("../src/lib/engine");

assert.equal(toE164("021 123 4567"), "+64211234567");
assert.equal(toE164("+64 21 123 4567"), "+64211234567");
assert.equal(toE164("6493001234"), "+6493001234");
assert.equal(toE164("09 300 1234"), "+6493001234");

const reply = (body: object) => (globalThis.fetch = (async () => new Response(JSON.stringify(body))) as typeof fetch);
reply({ status: "OK", results: [{ geometry: { location: { lat: -36.857, lng: 174.744 }, location_type: "ROOFTOP" } }] });
assert.deepEqual(await geocode("12 Ponsonby Rd", "Ponsonby", "1011"), { lat: -36.857, lng: 174.744 });
reply({ status: "OK", results: [{ geometry: { location: { lat: -36.85, lng: 174.76 }, location_type: "APPROXIMATE" } }] });
assert.equal(await geocode("Nowhere St", "Ponsonby", "1011"), null, "suburb-only match is not an address");
reply({ status: "ZERO_RESULTS", results: [] });
assert.equal(await geocode("x", "y", "0000"), null);
reply({ status: "REQUEST_DENIED", error_message: "key not allowed", results: [] });
await assert.rejects(geocode("a", "b", "1011"), /REQUEST_DENIED/);
console.log("engine adapter: ALL CHECKS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
