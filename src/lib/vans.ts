import "server-only";
// Van tracking (17 Nov): Teltonika trackers in the vans report to Traccar; the engine pulls their positions every minute
// (edge function traccar-sync, migration jm_vans) and these office_van* functions read them. The engine checks the role
// again: owner/admin, office manager and supervisor see vans; owner/admin and office manager edit them; the Traccar
// connection is owner/admin only.
import type { OfficeSession } from "./auth";
import { engine } from "./engine";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type VanState = "moving" | "idling" | "parked" | "offline" | "no_data";
export type VanPos = { lat: number; lng: number; at: string; speed: number | null; heading: number | null; ignition: boolean | null };
export type Van = {
  id: string; name: string; rego: string | null; active: boolean; notes: string | null;
  company_id: string; company: string; can_edit: boolean;
  device_id: number | null;
  device: { id: number; name: string; imei: string | null; status: string | null; last_update: string | null } | null;
  driver: { staff_id: string; name: string; phone: string | null } | null;
  pos: VanPos | null;
  state: VanState;
  booking: { job_ref: string | null; label: string; site: string | null; starts_at: string; ends_at: string; distance_m: number | null } | null;
};
export type Tracking = {
  enabled: boolean; traccar_url: string | null; last_sync_at: string | null; last_ok_at: string | null; last_error: string | null;
  last_devices: number | null; last_positions: number | null; can_edit: boolean;
};
export type TraccarDevice = { id: number; name: string; imei: string | null; status: string | null; last_update: string | null; van: string | null };
export type VanList = {
  tracking: Tracking;
  vans: Van[];
  devices: TraccarDevice[];
  drivers: { id: string; name: string }[];
  companies: { id: string; code: string; name: string }[];
};
/** [fix time, lat, lng, km/h, ignition] */
export type TrailPoint = [string, number, number, number | null, boolean | null];
export type VanBooking = { job_ref: string | null; label: string; site: string | null; lat: number | null; lng: number | null; starts_at: string; ends_at: string };
export type VanDetail = Van & { day: string; trail: TrailPoint[]; bookings: VanBooking[] };

export const loadVans = (s: OfficeSession) => rpc<VanList>("office_vans", { p_staff_id: s.staffId });
export const loadVan = (s: OfficeSession, id: string, day: string | null) =>
  rpc<VanDetail | null>("office_van", { p_staff_id: s.staffId, p_vehicle_id: id, p_day: day });
export const saveVan = (s: OfficeSession, id: string | null, data: Record<string, string>) =>
  rpc<{ id: string; message: string }>("office_save_van", { p_staff_id: s.staffId, p_vehicle_id: id, p_data: data });
export const saveTracking = (s: OfficeSession, data: Record<string, string>) =>
  rpc<{ message: string }>("office_save_van_tracking", { p_staff_id: s.staffId, p_data: data });

// ── The day's trail: distance, stops and drive time ───────────────────────────────────────────────────────────────

export function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export type Stop = { from: string; to: string; minutes: number; lat: number; lng: number; near: VanBooking | null };
export type DaySummary = { km: number; driveMinutes: number; firstMove: string | null; lastMove: string | null; stops: Stop[] };

/** A stop: the van stays within 150 m for 5 minutes or more. Jitter under 30 m doesn't count as driving. */
export function summariseDay(trail: TrailPoint[], bookings: VanBooking[]): DaySummary {
  let km = 0;
  let driveMs = 0;
  let firstMove: string | null = null;
  let lastMove: string | null = null;
  const stops: Stop[] = [];
  let anchor = 0;
  const closeStop = (i: number, j: number) => {
    const ms = Date.parse(trail[j][0]) - Date.parse(trail[i][0]);
    if (ms < 5 * 60000) return;
    const [, lat, lng] = trail[i];
    const near = bookings
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) => ({ b, d: metres(lat, lng, b.lat!, b.lng!) }))
      .filter((x) => x.d <= 250)
      .sort((x, y) => x.d - y.d)[0]?.b ?? null;
    stops.push({ from: trail[i][0], to: trail[j][0], minutes: Math.round(ms / 60000), lat, lng, near });
  };
  for (let i = 1; i < trail.length; i++) {
    const [t0, la0, ln0] = trail[i - 1];
    const [t1, la1, ln1, spd] = trail[i];
    const d = metres(la0, ln0, la1, ln1);
    if (d >= 30) {
      km += d / 1000;
      if ((spd ?? 0) > 0 || d > 100) {
        driveMs += Date.parse(t1) - Date.parse(t0);
        firstMove ??= t0;
        lastMove = t1;
      }
    }
    if (metres(trail[anchor][1], trail[anchor][2], la1, ln1) > 150) {
      closeStop(anchor, i - 1);
      anchor = i;
    }
  }
  if (trail.length) closeStop(anchor, trail.length - 1);
  return { km: Math.round(km * 10) / 10, driveMinutes: Math.round(driveMs / 60000), firstMove, lastMove, stops };
}
