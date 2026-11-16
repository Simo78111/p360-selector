import type { Van, VanState } from "@/lib/vans";

export const STATE_LABEL: Record<VanState, string> = {
  moving: "Moving", idling: "Engine on", parked: "Parked", offline: "No signal", no_data: "No data yet",
};
const STATE_STYLE: Record<VanState, string> = {
  moving: "bg-emerald-600 text-white", idling: "bg-amber-500 text-amber-950", parked: "bg-blue-600 text-white",
  offline: "bg-slate-400 text-white", no_data: "bg-slate-200 text-slate-700",
};

export function VanStateChip({ state }: { state: VanState }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>;
}

/** "2 min ago", "3 h ago", "Mon 9:14 am". */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "—";
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 12 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "2-digit" });
}

export const nzTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" });

export const distance = (m: number | null) => (m == null ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** The line under a van on the map and in the table. */
export function vanLine(v: Van) {
  const parts = [STATE_LABEL[v.state]];
  if (v.state === "moving" && v.pos?.speed) parts.push(`${Math.round(v.pos.speed)} km/h`);
  if (v.pos) parts.push(ago(v.pos.at));
  if (v.driver) parts.push(v.driver.name);
  if (v.booking) {
    const d = v.booking.distance_m;
    parts.push(d != null && d <= 200 ? `On site ${v.booking.job_ref ?? ""}`.trim() : `${v.booking.label}${d != null ? ` (${distance(d)} away)` : ""}`);
  }
  return parts.join(" · ");
}
