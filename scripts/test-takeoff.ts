// Takeoff (Phase 4) checks with no database: the browser's measuring maths gives the same totals as the database test
// (engine supabase/tests/jm_takeoff_test.sql), reading a real drawing's text finds its sheet number and scales, and the
// marked-up PDF is made from a real plan set. Run: npm run test:takeoff [path to a sample plans PDF]
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { markedUpPdf } from "../src/components/office/takeoff/export";
import {
  alignTurn, countingPages, diffInk, likelySet, inkOf, itemTotals, markChanged, markQty, matchPages, ratioScale, readPageText, samePageSize, summaryCsv,
  type Takeoff, type TakeoffMark, type TakeoffPage, type TakeoffPlan,
} from "../src/lib/takeoff-shared";
import { turnPoints } from "../src/components/office/takeoff/turn";

const page = (id: string, mm: number | null, w = 2384, h = 1684): TakeoffPage => ({
  id, page_no: 1, label: null, width: w, height: h, mm_per_unit: mm, method: mm ? "calibrated" : null, ratio: null, sheet: null,
  calib: null, checked: true, set_by: null, set_at: null,
});

// 1. scale from a ratio: 1:50 at A1 on an A1-sized page; 1:100 at A3
assert.equal(ratioScale(50, "A1", { width: 2384, height: 1684 }).toFixed(4), (841 / 2384 * 50).toFixed(4));
assert.equal(ratioScale(100, "A3", { width: 2384, height: 1684 }).toFixed(4), (420 / 2384 * 100).toFixed(4));

// 2. the same numbers as the SQL test: 36 mm a unit; runs of 150 and 100 units; 10% waste + 0.5 m a run → 10.90 m
const pages = new Map([["p2", page("p2", 36)], ["p0", page("p0", null)]]);
const marks: TakeoffMark[] = [
  { id: "a", item_id: "pipe", page_id: "p2", points: [[0, 0], [100, 0], [100, 50]] },
  { id: "b", item_id: "pipe", page_id: "p2", points: [[0, 100], [0, 200]] },
  { id: "c", item_id: "pipe", page_id: "p0", points: [[0, 0], [10, 0]] },   // a page with no scale: not counted
  { id: "d", item_id: "wc", page_id: "p0", points: [[5, 5]] },              // counting needs no scale
  { id: "e", item_id: "slab", page_id: "p2", points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
];
const pipe = itemTotals({ id: "pipe", tool: "length", waste_pct: 10, extra_m_per_run: 0.5 }, marks, pages);
assert.equal(pipe.quantity, 10.9);
assert.equal(pipe.unscaled, 1);
assert.equal(itemTotals({ id: "wc", tool: "count", waste_pct: 0, extra_m_per_run: 0 }, marks, pages).quantity, 1);
assert.equal(itemTotals({ id: "slab", tool: "area", waste_pct: 0, extra_m_per_run: 0 }, marks, pages).quantity, 12.96);
assert.equal(markQty("length", [[0, 0], [100, 0]], null), null);
console.log("✓ measuring matches the database: 10.90 m of pipe (10% waste + 0.5 m a run), 12.96 m², counts need no scale");

// 3. a real drawing's text (page 4 of the airport set): sheet number, scales written on it, and the A1 note
const t = readPageText("H-100 SANITARY PLUMBING H-110 1:25 1:40 1:50 H-110 SCALE @ A1: SCALES SHOWN ON THIS DRAWING ARE FOR AN A1 SCALE WITH CAUTION.");
assert.deepEqual(t, { label: "H-110", ratios: [25, 40, 50], sheet: "A1" });
console.log("✓ drawing text: sheet H-110, scales 1:25 · 1:40 · 1:50, for A1");

// 3b. revisions (4c): pages matched by sheet number like the database; replaced revisions don't count;
// what changed between two drawings, and which marks sit where it changed
{
  const pg = (id: string, no: number, label: string | null, w = 2384, h = 1684) => ({ ...page(id, 10, w, h), page_no: no, label });
  const A = [pg("a1", 1, "H-110"), pg("a2", 2, "H-210"), pg("a3", 3, "H-900"), pg("a4", 4, null)];
  const B = [pg("b1", 1, "H-210", 1190.55, 842), pg("b2", 2, "h-110"), pg("b3", 3, "H-300"), pg("b4", 4, null)];
  const m = matchPages(A, B);
  assert.equal(m.get("a1")?.id, "b2", "H-110 found on another page (and lower case)");
  assert.equal(m.get("a2")?.id, "b1");
  assert.equal(m.get("a3"), undefined, "H-900 has nowhere to go");
  assert.equal(m.get("a4")?.id, "b4", "no sheet numbers: same page number");
  assert.ok(samePageSize(A[0], B[1]) && !samePageSize(A[1], B[0]), "A1 vs the same drawing on A3");

  const plan = (id: string, pages: TakeoffPage[], superseded: boolean): TakeoffPlan => ({ id, name: "H", revision: id, file_id: "f", page_count: 1,
    file_name: "", bytes: null, created_at: "", created_by: "", shared_file_id: null, shared_at: null, latest: !superseded, pages,
    superseded_at: superseded ? "2026-11-05" : null });
  const counting = countingPages([plan("A", A, true), plan("B", B, false)]);
  const ms: TakeoffMark[] = [{ id: "x", item_id: "s", page_id: "a1", points: [[1, 1]] }, { id: "y", item_id: "s", page_id: "b2", points: [[1, 1]] }];
  assert.equal(itemTotals({ id: "s", tool: "count", waste_pct: 0, extra_m_per_run: 0 }, ms, counting).quantity, 1, "Rev A's copy doesn't count twice");

  // two 100 × 100 drawings: a line along y = 20 on both, a box at (70–80, 70–80) on B only, a line moved by one pixel
  const W = 100, H = 100;
  const draw = (box: boolean, nudge: number) => {
    const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
    const dot = (x: number, y: number) => rgba.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
    for (let x = 5; x < 95; x++) dot(x, 20 + nudge);
    if (box) for (let y = 70; y < 80; y++) for (let x = 70; x < 80; x++) dot(x, y);
    return inkOf(rgba, W, H);
  };
  const diff = diffInk(draw(false, 0), draw(true, 1), W, H);
  let added = 0, removed = 0;
  for (const v of diff) { if (v === 2) added++; if (v === 1) removed++; }
  assert.equal(added, 100, "the new box is found");
  assert.equal(removed, 0, "a line drawn a pixel lower isn't a change");
  // marks at 1 pixel per unit: a sink on the line (no change), a sink by the box (changed), a run passing the box
  assert.equal(markChanged([[30, 20]], false, diff, W, H, 1), false);
  assert.equal(markChanged([[76, 76]], false, diff, W, H, 1), true);
  assert.equal(markChanged([[50, 60], [90, 60], [90, 95]], false, diff, W, H, 1), true, "the run passes within 10 px of the box");
  assert.equal(markChanged([[10, 40], [40, 40]], false, diff, W, H, 1), false);
  // turned pages (6 Nov): a quarter turn moves (x, y) to (H - y, x); four turns = back; Rev B lines up with a turned Rev A
  const pts: [number, number][] = [[500, 500], [100, 200]];
  assert.deepEqual(turnPoints(pts, 90, 2384, 1684), [[1184, 500], [1484, 100]]);
  assert.deepEqual(turnPoints(pts, 360, 2384, 1684), pts);
  assert.deepEqual(turnPoints(turnPoints(pts, 90, 2384, 1684), 270, 1684, 2384), pts);
  const turnedA = { ...pg("ta", 1, "H-110", 1684, 2384), rotation: 90 };
  const rawB = pg("tb", 1, "H-110", 2384, 1684);
  const al = alignTurn(turnedA, rawB);
  assert.equal(al.turn, 90);
  assert.ok(samePageSize(turnedA, al), "lined up after turning");
  assert.equal(alignTurn(turnedA, pg("tc", 1, "H-110", 1684, 2384)).turn, 0, "already the same shape: not turned");
  // a new upload: the same sheet numbers as an existing set = a new revision of it (6 Nov, Simon's upload went in as a new set)
  const sheets = (labels: (string | null)[]) => labels.map((label, i) => ({ page_no: i + 1, width: 2384, height: 1684, label }));
  const existing = [{ name: "Hydraulics", labels: ["H-000", "H-001", "H-100", "H-110", "H-210", "H-510", "H-710", "H-720"], pages: 8 },
    { name: "Architectural", labels: ["A-100", "A-200"], pages: 2 }];
  assert.equal(likelySet(existing, sheets(["H-000", "H-001", "H-100", "H-110", "H-210", "H-510", "H-710", "H-720"]))?.name, "Hydraulics");
  assert.equal(likelySet(existing, sheets(["H-110", "H-210", "H-300"]))?.name, "Hydraulics", "a part set still matches");
  assert.equal(likelySet(existing, sheets(["M-100", "M-200"])), null, "mechanical: a new set");
  assert.equal(likelySet(existing, sheets([null, null]))?.name, "Architectural", "no sheet numbers: same page count");
  console.log("✓ revisions: pages matched by sheet number, replaced revisions don't count, changes found and marks near them flagged");
}

// 4. the marked-up PDF from a real plan set
const sample = process.argv[2] ?? "../ai_native_plumbing_maintenance/docs/takeoff-samples/1044_AUCKLAND_COFFEE_EXPORTS_EDV_NTT.pdf";
(async () => {
  if (!existsSync(sample)) {
    console.log(`- skipped the marked-up PDF (no sample at ${sample})`);
    return;
  }
  const bytes = readFileSync(sample);
  const src = await PDFDocument.load(bytes);
  const n = src.getPageCount();
  const pg = src.getPage(3).getSize();
  const plan = { id: "pl", name: "Airport kiosk", revision: "A", file_id: "f", page_count: n, file_name: "x.pdf", bytes: bytes.length,
    created_at: "", created_by: "", shared_file_id: null, shared_at: null, latest: true,
    pages: Array.from({ length: n }, (_, i) => ({ ...page(`pg${i + 1}`, i === 3 ? ratioScale(50, "A1", pg) : null, pg.width, pg.height), page_no: i + 1 })) };
  const tk: Takeoff = {
    job: { id: "j", ref: "PTSL-TEST", title: "Airport kiosk", company_id: "c", managed: true },
    can: { edit: true, costs: false, quote: true }, groups: ["Drainage", "Fixtures"], plans: [plan], quotes: [], labour_rates: [],
    items: [
      { id: "wc", group: "Fixtures", name: "Toilet – 1st fix", tool: "count", colour: "#2563eb", source: "favourite", favourite_id: "f", favourite_name: "Toilet – 1st fix",
        price_book_item_id: null, code: null, unit: "ea", waste_pct: 0, extra_m_per_run: 0, labour_item_id: null, labour_name: null, labour_hours_per_unit: 0,
        position: 0, hidden: false, marks: 2, unscaled: 0, measured: 2, quantity: 2, per_page: {}, on_quote: false },
      { id: "dr", group: "Drainage", name: "DN100 PVC drainage", tool: "length", colour: "#e11d48", source: "typed", favourite_id: null, favourite_name: null,
        price_book_item_id: null, code: null, unit: "m", waste_pct: 5, extra_m_per_run: 0, labour_item_id: null, labour_name: null, labour_hours_per_unit: 0,
        position: 1, hidden: false, marks: 1, unscaled: 0, measured: 12, quantity: 12.6, per_page: {}, on_quote: false },
    ],
    marks: [],
  };
  const ms: TakeoffMark[] = [
    { id: "1", item_id: "wc", page_id: "pg4", points: [[600, 500]] },
    { id: "2", item_id: "wc", page_id: "pg4", points: [[700, 500]] },
    { id: "3", item_id: "dr", page_id: "pg4", points: [[500, 800], [900, 800], [900, 1000]] },
  ];
  const out = await markedUpPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer, plan, tk, ms);
  const back = await PDFDocument.load(out);
  assert.equal(back.getPageCount(), n + 1, "the plan set plus a summary page");
  const csv = summaryCsv(tk, false);
  assert.match(csv, /Fixtures,Toilet – 1st fix,count/);
  assert.doesNotMatch(csv, /Sell/, "no prices without see-costs");
  // a page the office turned comes out turned, with its marks still on the page
  const turnedPlan = { ...plan, pages: plan.pages.map((x) => (x.id === "pg4" ? { ...x, rotation: 90, width: pg.height, height: pg.width } : x)) };
  const turnedMarks = ms.map((m) => ({ ...m, points: turnPoints(m.points, 90, pg.width, pg.height) }));
  const out2 = await PDFDocument.load(await markedUpPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer,
    turnedPlan, tk, turnedMarks));
  assert.equal(out2.getPage(3).getRotation().angle, 90, "turned page exported turned");
  assert.equal(out2.getPage(2).getRotation().angle, 0);
  console.log(`✓ marked-up PDF: ${n} plan pages + summary (${(out.length / 1048576).toFixed(1)} MB); CSV without prices`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
