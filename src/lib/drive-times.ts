import "server-only";
// Real drive times from Google (Routes API, traffic-aware) for the booking
// engine. The engine asks which journeys it doesn't know yet for a day
// (travel_pairs_needed); we look them up and save them (save_travel_times).
// Anything not looked up is estimated from distance, so this only makes the
// plan better: nothing breaks without it. Runs each afternoon before the 3pm
// planning (Vercel cron, see vercel.json) and from the office "Work out route" button.
import { engine } from "./engine";

type Pair = { from_lat: number; from_lng: number; to_lat: number; to_lng: number };
type Saved = Pair & { minutes: number; meters: number | null };

const ROUTES_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const MAX_ELEMENTS = 600; // Google allows 625 per request with traffic

/** 9am on that day in Auckland (or a minute from now, if that has passed), as an ISO time. */
export function departureFor(date: string, now = new Date()) {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", timeZoneName: "longOffset" })
      .formatToParts(noonUtc)
      .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "+13:00";
  const nineAm = new Date(`${date}T09:00:00${offset}`);
  const soon = new Date(now.getTime() + 60_000);
  return (nineAm > soon ? nineAm : soon).toISOString();
}

const waypoint = (lat: number, lng: number) => ({ waypoint: { location: { latLng: { latitude: lat, longitude: lng } } } });

async function matrix(origin: { lat: number; lng: number }, dests: { lat: number; lng: number }[], departure: string) {
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_SERVER_KEY ?? "",
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: [waypoint(origin.lat, origin.lng)],
      destinations: dests.map((d) => waypoint(d.lat, d.lng)),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: departure,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Routes ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as {
    destinationIndex?: number;
    duration?: string;
    distanceMeters?: number;
    condition?: string;
  }[];
}

/** Looks up and saves every journey the engine needs for a day. */
export async function fetchDriveTimes(date: string): Promise<{ date: string; needed: number; saved: number }> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected.");
  const { data, error } = await db.rpc("travel_pairs_needed", { p_date: date });
  if (error) throw new Error(error.message);
  const pairs = (data ?? []) as Pair[];
  if (pairs.length === 0) return { date, needed: 0, saved: 0 };

  // One request per starting point, with all the places we need from there
  const byOrigin = new Map<string, { lat: number; lng: number; dests: { lat: number; lng: number }[] }>();
  for (const p of pairs) {
    const key = `${p.from_lat},${p.from_lng}`;
    if (!byOrigin.has(key)) byOrigin.set(key, { lat: p.from_lat, lng: p.from_lng, dests: [] });
    byOrigin.get(key)!.dests.push({ lat: p.to_lat, lng: p.to_lng });
  }

  const departure = departureFor(date);
  const rows: Saved[] = [];
  for (const o of byOrigin.values()) {
    for (let i = 0; i < o.dests.length; i += MAX_ELEMENTS) {
      const chunk = o.dests.slice(i, i + MAX_ELEMENTS);
      for (const el of await matrix(o, chunk, departure)) {
        if (el.condition !== "ROUTE_EXISTS" || el.destinationIndex === undefined || !el.duration) continue;
        const d = chunk[el.destinationIndex];
        rows.push({
          from_lat: o.lat,
          from_lng: o.lng,
          to_lat: d.lat,
          to_lng: d.lng,
          minutes: Math.max(1, Math.round(parseFloat(el.duration) / 60)),
          meters: el.distanceMeters ?? null,
        });
      }
    }
  }
  const { data: saved, error: saveError } = await db.rpc("save_travel_times", { p_rows: rows });
  if (saveError) throw new Error(saveError.message);
  return { date, needed: pairs.length, saved: Number(saved ?? 0) };
}
