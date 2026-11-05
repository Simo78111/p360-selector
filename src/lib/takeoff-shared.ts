// Takeoff (Phase 4): types, measuring maths and the summary CSV — shared by the server and the browser.
// Marks are stored in PDF units (points, 1/72 inch; y down as pdf.js shows the page). A page's scale is real
// millimetres per PDF unit, so: length (m) = units × mm_per_unit / 1000. The database works the totals out the same
// way (engine migration 20261105000100_jm_takeoff); the browser uses these to show totals straight away while saving.

export type Pt = [number, number];
export type Tool = "count" | "length" | "area";

export type TakeoffPage = {
  id: string; page_no: number; label: string | null; width: number; height: number;
  mm_per_unit: number | null; method: "calibrated" | "ratio" | null; ratio: number | null;
  sheet: "A0" | "A1" | "A2" | "A3" | "A4" | null; calib: { a: Pt; b: Pt; mm: number } | null;
  checked: boolean; set_by: string | null; set_at: string | null;
};
export type TakeoffPlan = {
  id: string; name: string; revision: string; file_id: string; page_count: number; file_name: string; bytes: number | null;
  created_at: string; created_by: string; shared_file_id: string | null; shared_at: string | null; latest: boolean;
  pages: TakeoffPage[];
};
export type TakeoffItem = {
  id: string; group: string; name: string; tool: Tool; colour: string; source: "favourite" | "price_book" | "typed";
  favourite_id: string | null; favourite_name: string | null; price_book_item_id: string | null; code: string | null;
  unit: string; waste_pct: number; extra_m_per_run: number; labour_item_id: string | null; labour_name: string | null;
  labour_hours_per_unit: number; position: number; hidden: boolean;
  marks: number; unscaled: number; measured: number; quantity: number;
  per_page: Record<string, { marks: number; measured: number }>;
  on_quote: boolean; unit_sell?: number | null;
};
export type TakeoffMark = { id: string; item_id: string; page_id: string; points: Pt[] };
export type TakeoffQuote = {
  version_id: string; number: string; status: "draft" | "published" | "superseded"; quote_status: string;
  sections: string[]; from_takeoff: boolean;
};
export type LabourRateRow = { id: string; code: string; description: string; unit: string | null; cost: number; sell: number };
export type Takeoff = {
  job: { id: string; ref: string; title: string | null; company_id: string; managed: boolean };
  can: { edit: boolean; costs: boolean; quote: boolean };
  groups: string[];
  plans: TakeoffPlan[];
  items: TakeoffItem[];
  marks: TakeoffMark[];
  quotes: TakeoffQuote[];
  labour_rates: LabourRateRow[];
};
/** One change to the marks, saved in batches. "id" is made in the browser so undo can refer to it. */
export type MarkOp =
  | { op: "add"; id: string; item_id: string; page_id: string; points: Pt[] }
  | { op: "move"; id: string; points: Pt[] }
  | { op: "remove"; id: string }
  | { op: "restore"; id: string };

export const DEFAULT_GROUPS = ["Drainage", "Underslab", "Fixtures", "Pipework"];
export const SHEETS = ["A0", "A1", "A2", "A3", "A4"] as const;
export const SHEET_MM: Record<(typeof SHEETS)[number], number> = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 };
export const RATIOS = [1, 2, 5, 10, 20, 25, 40, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
/** Colour-blind-friendly, distinct on white drawings. */
export const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569"];

export const runLength = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
export function polyArea(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** A mark's amount in the item's unit (count 1, metres, m²); null when the page has no scale. */
export function markQty(tool: Tool, points: Pt[], mmPerUnit: number | null) {
  if (tool === "count") return 1;
  if (!mmPerUnit) return null;
  return tool === "length" ? (runLength(points) * mmPerUnit) / 1000 : (polyArea(points) * mmPerUnit ** 2) / 1e6;
}

/** mm per PDF unit from a ratio, for the page printed at the sheet the scale is stated for (the long edges match). */
export const ratioScale = (ratio: number, sheet: keyof typeof SHEET_MM, page: { width: number; height: number }) =>
  (SHEET_MM[sheet] / Math.max(page.width, page.height)) * ratio;

/** Item totals worked out in the browser (same rules as the database). */
export function itemTotals(item: Pick<TakeoffItem, "id" | "tool" | "waste_pct" | "extra_m_per_run">, marks: TakeoffMark[],
  pages: Map<string, TakeoffPage>) {
  let measured = 0, runs = 0, unscaled = 0;
  const perPage: Record<string, { marks: number; measured: number }> = {};
  for (const m of marks) {
    if (m.item_id !== item.id) continue;
    const pg = pages.get(m.page_id);
    if (!pg) continue;
    const q = markQty(item.tool, m.points, pg.mm_per_unit);
    const pp = (perPage[m.page_id] ??= { marks: 0, measured: 0 });
    pp.marks++;
    if (q === null) unscaled++;
    else {
      measured += q;
      runs++;
      pp.measured += q;
    }
  }
  const waste = 1 + Number(item.waste_pct || 0) / 100;
  const quantity = item.tool === "count" ? runs
    : item.tool === "length" ? round2(measured * waste + Number(item.extra_m_per_run || 0) * runs)
    : round2(measured * waste);
  return { measured, runs, unscaled, quantity, perPage };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmtQty = (n: number, tool: Tool) =>
  tool === "count" ? String(Math.round(n)) : n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const unitOf = (tool: Tool, unit?: string | null) => unit || (tool === "count" ? "ea" : tool === "length" ? "m" : "m²");

/** "1:50 @ A1", "Calibrated (3,600 mm)" or "No scale". */
export function scaleText(p: TakeoffPage) {
  if (!p.mm_per_unit) return "No scale";
  if (p.method === "ratio") return `1:${Number(p.ratio)} @ ${p.sheet}`;
  return `Calibrated (${Number(p.calib?.mm ?? 0).toLocaleString("en-NZ")} mm)`;
}

/** What the page's text says: a sheet number like "H-110" (the one that appears most) and the scales written on it. */
export function readPageText(text: string) {
  const sheets = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Z]{1,2}-?\d{3}[A-Z]?)\b/g)) sheets.set(m[1], (sheets.get(m[1]) ?? 0) + 1);
  const label = [...sheets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const ratios = [...new Set([...text.matchAll(/\b1\s?:\s?(\d{1,4})\b/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 5000))]
    .sort((a, b) => a - b);
  const sheet = (text.match(/@\s?(A[0-4])\b/) ?? text.match(/\bFOR AN (A[0-4])\b/i))?.[1]?.toUpperCase() as TakeoffPage["sheet"] ?? null;
  return { label, ratios, sheet };
}

/** The takeoff summary as CSV rows (prices only when the person can see them). */
export function summaryCsv(t: Takeoff, withPrices: boolean) {
  const pages = new Map(t.plans.flatMap((pl) => pl.pages.map((p) => [p.id, { p, pl }] as const)));
  const q = (s: unknown) => {
    const v = s === null || s === undefined ? "" : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = ["Group", "Item", "Measured by", "From", "Page", "Marks", "Measured", "Waste %", "Extra m per run", "Quantity", "Unit",
    "Labour", "Labour hours"];
  if (withPrices) head.push("Sell each (excl GST)", "Sell total (excl GST)");
  const rows = [head];
  for (const g of t.groups) {
    for (const it of t.items.filter((i) => i.group === g)) {
      const from = it.source === "favourite" ? `Favourite: ${it.favourite_name ?? ""}` : it.source === "price_book" ? `Price book: ${it.code ?? ""}` : "Typed";
      const labourH = it.labour_item_id ? round2(it.quantity * it.labour_hours_per_unit) : "";
      const r = [g, it.name, it.tool, from, "All pages", it.marks, round2(it.measured), it.waste_pct, it.extra_m_per_run, it.quantity,
        unitOf(it.tool, it.unit), it.labour_name ?? "", labourH];
      if (withPrices) r.push(it.unit_sell ?? "", it.unit_sell != null ? round2(it.unit_sell * it.quantity) : "");
      rows.push(r.map(String));
      for (const [pid, pp] of Object.entries(it.per_page)) {
        const x = pages.get(pid);
        const r2 = ["", "", "", "", x ? `${x.pl.name} Rev ${x.pl.revision} p${x.p.page_no}${x.p.label ? ` ${x.p.label}` : ""}` : pid, pp.marks,
          round2(pp.measured), "", "", "", "", "", ""];
        if (withPrices) r2.push("", "");
        rows.push(r2.map(String));
      }
    }
  }
  return rows.map((r) => r.map(q).join(",")).join("\r\n");
}
