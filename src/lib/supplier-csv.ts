// Job management Phase 3b: reading the suppliers' daily invoice CSVs (no server-only imports, so it can be tested).
//   Reece detail file (…D_1_….csv): header row, one row per item with the invoice fields repeated.
//   Reece summary file (…S_1_….csv): header row, one row per invoice, no items (brought in as one line each).
//   Chesters (CSV_dd-mm-yyyy_…csv): no header; "H" rows start an invoice, "D" rows are its items.

export type SupplierLine = { code: string | null; description: string; quantity: number; unit: string | null; total: number };
export type SupplierDoc = {
  number: string; date: string; type: string | null; branch: string | null; order_no: string | null; receiver: string | null;
  job_name: string | null; subtotal: number; gst: number; total: number; lines: SupplierLine[];
};
export type ParsedFile = { supplier: "Reece" | "Chesters"; format: string; docs: SupplierDoc[]; problems: string[] };

/** CSV text → rows of cells (quoted fields and "" inside them handled; a stray quote mid-field is kept as text). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;     // a quote only opens a field at its start (Reece writes 1/2"fi bare)
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** 31/10/2026 → 2026-10-31 (anything else is passed on and the database refuses it with a message) */
const isoDate = (v: string | undefined) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(v ?? "").trim();
};
const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

function reece(rows: string[][]): ParsedFile {
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name.toLowerCase());
  const detail = col("product code") >= 0;
  const c = {
    date: col("date"), type: col("type"), branch: col("sale branch"), number: col("number"), order: col("order no"),
    job: col("job name"), receiver: col("receiver"),
    code: col("product code"), desc: col("product description"), qty: col("quantity"), unit: col("unit"),
    ex: detail ? col("gst excl total price") : col("gst excl total value"), gst: col("gst amount"),
    inc: detail ? col("gst incl total price") : col("gst incl total value"),
  };
  const problems: string[] = [];
  if (c.number < 0 || c.date < 0 || c.ex < 0) problems.push("This Reece file doesn't have the columns expected (Number, Date, GST Excl Total).");
  const docs = new Map<string, SupplierDoc>();
  for (const r of rows.slice(1)) {
    const number = (r[c.number] ?? "").trim();
    if (!number) continue;
    let d = docs.get(number);
    if (!d) {
      d = { number, date: isoDate(r[c.date]), type: blank(r[c.type]), branch: blank(r[c.branch]), order_no: blank(r[c.order]),
            receiver: blank(r[c.receiver]), job_name: blank(r[c.job]), subtotal: 0, gst: 0, total: 0, lines: [] };
      docs.set(number, d);
    }
    d.subtotal = round2(d.subtotal + num(r[c.ex]));
    d.gst = round2(d.gst + num(r[c.gst]));
    d.total = round2(d.total + num(r[c.inc]));
    if (detail) {
      d.lines.push({ code: blank(r[c.code]), description: (r[c.desc] ?? "").trim() || "Item", quantity: num(r[c.qty]) || 1,
                     unit: blank(r[c.unit]), total: num(r[c.ex]) });
    }
  }
  return { supplier: "Reece", format: detail ? "Reece invoice lines" : "Reece invoice totals (no items)", docs: [...docs.values()], problems };
}

function chesters(rows: string[][]): ParsedFile {
  const docs: SupplierDoc[] = [];
  const problems: string[] = [];
  let d: SupplierDoc | null = null;
  rows.forEach((r, i) => {
    const kind = (r[0] ?? "").trim().toUpperCase();
    if (kind === "H") {
      const total = num(r[3]), gst = num(r[4]);
      d = { number: (r[2] ?? "").trim(), date: isoDate(r[1]), type: null, branch: null, order_no: blank(r[6]), receiver: null,
            job_name: null, subtotal: round2(total - gst), gst, total, lines: [] };
      docs.push(d);
    } else if (kind === "D") {
      if (!d) { problems.push(`Line ${i + 1}: an item before any invoice; left out.`); return; }
      d.lines.push({ code: blank(r[1]), description: (r[2] ?? "").trim() || "Item", quantity: num(r[3]) || 1, unit: null,
                     total: num(r[6]) });
    } else {
      problems.push(`Line ${i + 1} isn't an H or D row; left out.`);
    }
  });
  return { supplier: "Chesters", format: "Chesters invoices", docs, problems };
}

/** Works out which supplier's file it is and reads it. */
export function parseSupplierCsv(text: string): ParsedFile {
  const rows = csvRows(text);
  if (!rows.length) throw new Error("The file is empty.");
  const first = rows[0].map((c) => c.trim().toLowerCase());
  if (first[0] === "supplier" && first.includes("number")) return reece(rows);
  if (["h", "d"].includes(first[0])) return chesters(rows);
  throw new Error("That doesn't look like a Reece or Chesters invoice file.");
}
