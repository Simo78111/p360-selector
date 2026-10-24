// Writes the booking engine's service menu from the job finder, so every job
// the website can book exists in the engine with matching prices.
//   npm run export:menu > ../ai_native_plumbing_maintenance/supabase/migrations/<timestamp>_service_menu_update.sql
// Prices: the website shows prices including GST; the engine stores them
// excluding GST and adds 15% itself.
import { outcomeList } from "../src/lib/finder";
import { tierPrices, tiersFor } from "../src/lib/tiers";

// PLACEHOLDER job lengths in minutes [low, high]. The scheduler books the high
// number, so a plumber's day doesn't overrun. Confirm with the plumbers.
const durations: Record<string, [number, number]> = {
  "leak-hidden": [60, 120],
  "leak-cylinder": [60, 120],
  "hw-none": [60, 120],
  "hw-lukewarm": [60, 120],
  "hw-other": [60, 120],
  "pressure-hot": [60, 120],
  "install-tap": [45, 90],
  "install-toilet": [120, 180],
  "install-cylinder": [240, 360],
  "install-other": [60, 120],
  "drain-main": [60, 120],
  "drain-stormwater": [60, 120],
  "drain-damaged": [60, 90],
  "drain-cctv": [60, 90],
  "gas-install": [120, 240],
  "gas-cert": [45, 60],
};
const defaultDuration: [number, number] = [30, 90];

const exGst = (n: number) => (n / 1.15).toFixed(2);
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

const rows = outcomeList.map((o) => {
  const p = tierPrices(o.price.amount);
  const [lo, hi] = durations[o.id] ?? defaultDuration;
  const flexiOk = tiersFor(o, o.urgency).includes("flexi");
  const active = o.urgency !== "emergency"; // gas smells: call, never book online
  return `  (${q(o.id)}, ${q(o.title)}, ${q(o.price.label)}, ${lo}, ${hi}, ${exGst(p.priority)}, ${exGst(p.standard)}, ${exGst(p.flexi)}, ${flexiOk}, ${active})`;
});

console.log(`-- Service menu from the website's job finder (p360-selector: npm run export:menu).
-- Generated ${new Date().toISOString().slice(0, 10)}. Prices exclude GST. Re-running updates in place; nothing is deleted.
insert into public.service_types
  (code, name, description, duration_min_min, duration_max_min, price_priority, price_standard, price_flexi, pool_eligible, active)
values
${rows.join(",\n")}
on conflict (code) do update set
  name = excluded.name, description = excluded.description,
  duration_min_min = excluded.duration_min_min, duration_max_min = excluded.duration_max_min,
  price_priority = excluded.price_priority, price_standard = excluded.price_standard, price_flexi = excluded.price_flexi,
  pool_eligible = excluded.pool_eligible, active = excluded.active;`);
