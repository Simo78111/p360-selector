// Van day summary (17 Nov): distance, drive time and stops from a trail. Run: npm run test:vans
import assert from "node:assert/strict";
import { metres, summariseDay, type TrailPoint, type VanBooking } from "../src/lib/vans";

const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 16, h, m)).toISOString();

// 07:30–07:55 NZDT drive Avondale → Ponsonby (one point a minute), parked there 08:00–10:20, then a short hop.
const trail: TrailPoint[] = [];
for (let g = 0; g <= 25; g++) {
  trail.push([at(18, 30 + g), -36.8946 + ((-36.856 + 36.8946) * g) / 25, 174.6922 + ((174.744 - 174.6922) * g) / 25, 40, true]);
}
for (let g = 0; g <= 14; g++) trail.push([new Date(Date.UTC(2026, 10, 16, 19, 0) + g * 600000).toISOString(), -36.856, 174.744, 0, false]);
for (let g = 1; g <= 5; g++) trail.push([new Date(Date.UTC(2026, 10, 16, 21, 20) + g * 60000).toISOString(), -36.856 + 0.0015 * g, 174.744 + 0.004 * g, 30, true]);

const bookings: VanBooking[] = [
  { job_ref: "PTSL-3027a", label: "PTSL-3027a Rough-in", site: "1 Ponsonby Rd", lat: -36.8565, lng: 174.7445, starts_at: at(19, 0), ends_at: at(21, 0) },
];

const s = summariseDay(trail, bookings);
const straight = metres(-36.8946, 174.6922, -36.856, 174.744) / 1000;
assert.ok(s.km > straight && s.km < straight + 3, `km ${s.km} vs straight line ${straight.toFixed(1)}`);
assert.equal(s.stops.length, 1, "one long stop");
assert.ok(s.stops[0].minutes >= 140 && s.stops[0].minutes <= 150, `stop ${s.stops[0].minutes} min`);
assert.equal(s.stops[0].near?.job_ref, "PTSL-3027a", "stop matched to the booked site");
assert.ok(s.driveMinutes >= 25 && s.driveMinutes <= 35, `drive ${s.driveMinutes} min`);
assert.equal(s.firstMove, at(18, 30));

// GPS jitter while parked isn't driving and isn't a stop break.
const jitter: TrailPoint[] = Array.from({ length: 30 }, (_, i) => [new Date(Date.UTC(2026, 10, 16, 20) + i * 60000).toISOString(),
  -36.85 + (i % 2 ? 0.0001 : -0.0001), 174.76, 0, false]);
const j = summariseDay(jitter, []);
assert.equal(j.km, 0);
assert.equal(j.driveMinutes, 0);
assert.equal(j.stops.length, 1);
assert.equal(j.stops[0].minutes, 29);

assert.deepEqual(summariseDay([], []), { km: 0, driveMinutes: 0, firstMove: null, lastMove: null, stops: [] });
console.log("vans: all good", { km: s.km, drive: s.driveMinutes, stop: s.stops[0].minutes });
