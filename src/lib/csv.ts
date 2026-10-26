// Reading supplier price books in the browser. Each supplier's file is laid out
// differently, so we guess which column is which and let the office correct it.

/** Splits CSV text into rows of cells. Handles quotes, "" inside quotes, line breaks inside
 *  quotes, a BOM, and comma, semicolon or tab separators (whichever the first line uses most). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? undefined : src.indexOf("\n"));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === sep) {
      row.push(cell.trim()); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export type Field = "code" | "description" | "cost" | "unit" | "brand" | "discount" | "per";

export const fieldLabels: Record<Field, { label: string; required: boolean; help?: string }> = {
  code: { label: "Product code", required: true },
  description: { label: "Description", required: true },
  cost: { label: "Your price (cost)", required: true, help: "The price you pay, not the retail price" },
  unit: { label: "Unit", required: false, help: "e.g. EA, M, PK" },
  brand: { label: "Brand", required: false },
  discount: { label: "Discount %", required: false, help: "Only if the price column is before your discount" },
  per: { label: "Price is per (qty)", required: false, help: "Only if prices are per 10, per 100…" },
};

const patterns: Record<Field, RegExp[]> = {
  code: [/^(item|product|stock|part|article)\s*(code|no\.?|number|#)$/, /^(code|sku|part\s*no\.?|item)$/, /code|sku/],
  description: [/^(description|product description|item description|desc)$/, /desc/, /^(product|item)?\s*name$/],
  cost: [/(nett|net|trade|your|buy|cost|account)\s*(price|cost|rate)?/, /^(price|unit price|rate|ex gst|excl gst)$/, /price/],
  unit: [/^(uom|unit|units|unit of measure|u\/m|um)$/, /uom|unit of/],
  brand: [/^(brand|manufacturer|make|mfr)$/, /brand|manufact/],
  discount: [/^disc(ount)?\.?\s*(%|pct|percent(age)?)?$/],
  per: [/^(per|price per|per qty|price unit|pricing unit)$/],
};

/** Picks the header row (the first row that looks like headings) and guesses the columns. */
export function guessColumns(rows: string[][]): { headerRow: number; map: Partial<Record<Field, number>> } {
  let best = { headerRow: 0, score: -1, map: {} as Partial<Record<Field, number>> };
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const heads = rows[r].map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
    const map: Partial<Record<Field, number>> = {};
    const used = new Set<number>();
    for (const field of ["code", "description", "cost", "unit", "brand", "discount", "per"] as Field[]) {
      for (const re of patterns[field]) {
        const i = heads.findIndex((h, idx) => !used.has(idx) && h !== "" && re.test(h)
          && !(field === "cost" && /rrp|retail|list|recommended|incl/.test(h)));
        if (i !== -1) { map[field] = i; used.add(i); break; }
      }
    }
    const score = (map.code !== undefined ? 2 : 0) + (map.description !== undefined ? 2 : 0) + (map.cost !== undefined ? 2 : 0)
      + Object.keys(map).length;
    if (score > best.score) best = { headerRow: r, score, map };
  }
  return { headerRow: best.headerRow, map: best.map };
}

/** "$1,234.50" → 1234.5; anything that isn't a price → null. */
export function money(s: string | undefined): number | null {
  if (!s) return null;
  const clean = s.replace(/[$\s,]|NZD/gi, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

/** Cost per unit, excl GST, from one row with the chosen columns. */
export function rowCost(
  row: string[],
  map: Partial<Record<Field, number>>,
  includesGst: boolean,
): number | null {
  let price = money(row[map.cost ?? -1]);
  if (price === null) return null;
  if (map.discount !== undefined) {
    const d = money(row[map.discount]?.replace("%", ""));
    if (d !== null && d > 0 && d < 100) price = price * (1 - d / 100);
  }
  if (map.per !== undefined) {
    const per = money(row[map.per]);
    if (per !== null && per > 0) price = price / per;
  }
  if (includesGst) price = price / 1.15;
  return Math.round(price * 10000) / 10000;
}
