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
  /** Quarter turns clockwise the office added (0, 90, 180, 270); width and height are as turned. */
  rotation?: number;
};
export type TakeoffPlan = {
  id: string; name: string; revision: string; file_id: string; page_count: number; file_name: string; bytes: number | null;
  created_at: string; created_by: string; shared_file_id: string | null; shared_at: string | null; latest: boolean;
  /** 4c: this revision's takeoff was copied onto a newer one, so its marks no longer count (still readable). */
  superseded_by?: string | null; superseded_at?: string | null; superseded_rev?: string | null;
  /** 4c: the older revision this one's takeoff was copied from. */
  copied_from_rev?: string | null;
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
  /** 4c: copied marks where the drawing changed, still to look at. */
  to_check?: number;
};
/** needs_check: copied onto a new revision where the drawing changed (4c). */
export type TakeoffMark = { id: string; item_id: string; page_id: string; points: Pt[]; needs_check?: boolean; copied_from?: string };
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
  | { op: "restore"; id: string }
  | { op: "check"; id: string }
  | { op: "uncheck"; id: string };

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

/** The pages whose marks count: live plans that haven't been replaced by a newer revision (4c). */
export const countingPages = (plans: TakeoffPlan[]) =>
  new Map(plans.filter((p) => !p.superseded_at).flatMap((p) => p.pages).map((p) => [p.id, p]));

/** Item totals worked out in the browser (same rules as the database). Pass countingPages() so replaced revisions don't count. */
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

// ── Revisions (4c) ────────────────────────────────────────────────────────────────────────────

/** Rev A's pages matched to Rev B's the way the database does: same sheet number (H-110 is H-110 wherever it moved),
 *  else the same page number when either has no sheet number. */
export function matchPages(from: TakeoffPage[], to: TakeoffPage[]) {
  const out = new Map<string, TakeoffPage>();
  const norm = (s: string | null) => (s ?? "").trim().toUpperCase();
  for (const a of from) {
    const byLabel = a.label ? to.find((b) => b.label && norm(b.label) === norm(a.label)) : undefined;
    const byNo = byLabel ? undefined : to.find((b) => b.page_no === a.page_no && (!b.label || !a.label));
    const b = byLabel ?? byNo;
    if (b) out.set(a.id, b);
  }
  return out;
}

export const samePageSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  Math.abs(a.width - b.width) <= Math.max(a.width, 1) * 0.005 && Math.abs(a.height - b.height) <= Math.max(a.height, 1) * 0.005;

/**
 * Comparing Rev A's page with Rev B's when one has been turned: how many extra degrees Rev B needs to line up (the same
 * rule as the database's copy: a half turn always, a quarter turn when the shapes then match).
 */
export function alignTurn(a: TakeoffPage, b: TakeoffPage) {
  const turn = (((a.rotation ?? 0) - (b.rotation ?? 0)) % 360 + 360) % 360;
  if (turn === 0) return { turn: 0, width: b.width, height: b.height };
  if (turn === 180) return { turn, width: b.width, height: b.height };
  const fits = Math.abs(b.height / b.width - a.width / a.height) <= (a.width / a.height) * 0.02;
  return fits ? { turn, width: b.height, height: b.width } : { turn: 0, width: b.width, height: b.height };
}

/** Which existing set the new PDF looks like: most sheet numbers in common (at least half), else the same page count. */
export function likelySet(sets: { name: string; labels: (string | null)[]; pages: number }[], pages: { label: string | null }[]) {
  const norm = (s: string | null) => (s ?? "").trim().toUpperCase();
  const mine = new Set(pages.map((p) => norm(p.label)).filter(Boolean));
  let best: { name: string; why: string; score: number } | null = null;
  for (const s of sets) {
    const theirs = s.labels.map(norm).filter(Boolean);
    const same = theirs.filter((l) => mine.has(l)).length;
    if (theirs.length && mine.size && same >= Math.max(1, Math.ceil(Math.min(theirs.length, mine.size) / 2))) {
      const score = same / Math.max(theirs.length, mine.size);
      if (!best || score > best.score) best = { name: s.name, score, why: `${same} of ${theirs.length} sheet numbers match` };
    }
  }
  if (best) return best;
  if (!mine.size) {
    const byCount = sets.filter((s) => s.pages === pages.length);
    if (byCount.length === 1) return { name: byCount[0].name, score: 0, why: `same number of pages as ${byCount[0].name}` };
  }
  return null;
}

/** Ink (dark pixels) from RGBA image data: 1 where something is drawn. */
export function inkOf(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number) {
  const ink = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) {
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    ink[j] = lum < 200 ? 1 : 0;
  }
  return ink;
}

/**
 * What changed between two drawings of the same page, rendered at the same size: 1 = drawn on Rev A only (removed),
 * 2 = drawn on Rev B only (added). A pixel within `slack` pixels of ink on the other drawing doesn't count, so the
 * same line drawn a hair differently isn't a change.
 */
export function diffInk(a: Uint8Array, b: Uint8Array, w: number, h: number, slack = 1) {
  const out = new Uint8Array(w * h);
  const near = (ink: Uint8Array, x: number, y: number) => {
    for (let dy = -slack; dy <= slack; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -slack; dx <= slack; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && ink[yy * w + xx]) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (a[i] === b[i]) continue;
      if (a[i] && !near(b, x, y)) out[i] = 1;
      else if (b[i] && !near(a, x, y)) out[i] = 2;
    }
  }
  return out;
}

/**
 * Has the drawing changed where this mark sits? Looks `radius` pixels round each point and along each segment of a run
 * or area (the mask is the page at `pxPerPt` pixels per PDF unit). `minPixels` changed pixels count as a change.
 */
export function markChanged(points: Pt[], closed: boolean, mask: Uint8Array, w: number, h: number, pxPerPt: number,
  radius = 10, minPixels = 6) {
  const seen = new Set<number>();
  let hits = 0;
  const look = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (mask[i] && !seen.has(i)) {
          seen.add(i);
          hits++;
        }
      }
    }
    return hits >= minPixels;
  };
  const px = points.map(([x, y]) => [x * pxPerPt, y * pxPerPt] as const);
  const path = closed && px.length > 2 ? [...px, px[0]] : px;
  if (path.length === 1) return look(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / radius));
    for (let s = 0; s <= steps; s++) {
      if (look(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps)) return true;
    }
  }
  return false;
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
