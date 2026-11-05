// Takeoff (Phase 4) checks with no database: the browser's measuring maths gives the same totals as the database test
// (engine supabase/tests/jm_takeoff_test.sql), reading a real drawing's text finds its sheet number and scales, and the
// marked-up PDF is made from a real plan set. Run: npm run test:takeoff [path to a sample plans PDF]
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { markedUpPdf } from "../src/components/office/takeoff/export";
import { itemTotals, markQty, ratioScale, readPageText, summaryCsv, type Takeoff, type TakeoffMark, type TakeoffPage } from "../src/lib/takeoff-shared";

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
  console.log(`✓ marked-up PDF: ${n} plan pages + summary (${(out.length / 1048576).toFixed(1)} MB); CSV without prices`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
