import "server-only";
// The quote PDF, laid out like Project 360's Fergus quotes (e.g. PTSL-19530): logo top left and the company
// block top right; the customer's address on the left and a grey box with the site address, job number, GST
// number, order number, quote date and valid-until; a green "Accept Quote" button (a link); "Quote | heading";
// the Description of Works; "No Allowance Has been made for" (exclusions); the note; each section (its lines
// with quantities, or full line items, or just one price); Subtotal / GST / Total; the terms; page numbers.
// Never shows costs: it's built from the customer's copy of the quote (no cost fields).
import { PDFDocument, PDFFont, PDFName, PDFPage, PDFString, rgb, StandardFonts } from "pdf-lib";
import { PLUMBING360_LOGO_PNG, PROJECT360_LOGO_PNG } from "./quote-logos";
import { lines as splitLines, textBlocks, type QuoteDoc } from "./quotes";

const A4: [number, number] = [595.28, 841.89];
const M = 40;                       // margin
const W = A4[0] - 2 * M;
const INK = rgb(0.1, 0.1, 0.12);
const GREY = rgb(0.42, 0.44, 0.48);
const BOX = rgb(0.95, 0.95, 0.96);
const GREEN = rgb(0.13, 0.62, 0.33);
const RULE = rgb(0.85, 0.86, 0.88);

const nzMoney = (n: number | null | undefined) =>
  `$${Number(n ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nzDay = (d: string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return x.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Pacific/Auckland" });
};
const qty = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2).replace(/0$/, ""));

// Helvetica only has Western characters: swap the common ones out (macrons, arrows, odd dashes) and drop the rest.
const SWAP: Record<string, string> = {
  "ā": "a", "ē": "e", "ī": "i", "ō": "o", "ū": "u", "Ā": "A", "Ē": "E", "Ī": "I", "Ō": "O", "Ū": "U",
  "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "‑": "-", " ": " ", "\t": " ",
};
function clean(font: PDFFont, s: string) {
  let out = "";
  for (const ch of s.replace(/[̀-ͯ]/g, "")) {
    const c = SWAP[ch] ?? ch;
    try {
      font.encodeText(c);
      out += c;
    } catch {
      out += "";
    }
  }
  return out;
}

type Fonts = { reg: PDFFont; bold: PDFFont; ital: PDFFont };

class Writer {
  doc: PDFDocument;
  f: Fonts;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(doc: PDFDocument, f: Fonts) {
    this.doc = doc;
    this.f = f;
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M;
  }
  need(h: number) {
    if (this.y - h < M + 24) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of clean(font, text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width || !line) {
          // a single very long word: hard-break it
          if (!line && font.widthOfTextAtSize(word, size) > width) {
            let part = "";
            for (const ch of word) {
              if (font.widthOfTextAtSize(part + ch, size) > width) {
                out.push(part);
                part = ch;
              } else part += ch;
            }
            line = part;
          } else line = next;
        } else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, x: number, y: number, size: number, font: PDFFont = this.f.reg, color = INK) {
    this.page.drawText(clean(font, s), { x, y, size, font, color });
  }
  right(s: string, xRight: number, y: number, size: number, font: PDFFont = this.f.reg, color = INK) {
    const t = clean(font, s);
    this.page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
  }
  /** A wrapped paragraph from the current y; returns nothing, moves y down. */
  para(s: string, opts: { size?: number; font?: PDFFont; x?: number; width?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 9;
    const font = opts.font ?? this.f.reg;
    const x = opts.x ?? M;
    const width = opts.width ?? W - (x - M);
    for (const l of this.wrap(s, font, size, width)) {
      this.need(size + 3);
      this.y -= size + 3;
      this.text(l, x, this.y, size, font, opts.color ?? INK);
    }
    this.y -= opts.gap ?? 3;
  }
  bullet(s: string, x = M + 4) {
    const size = 9;
    const ls = this.wrap(s, this.f.reg, size, W - (x - M) - 12);
    ls.forEach((l, i) => {
      this.need(size + 3);
      this.y -= size + 3;
      if (i === 0) this.text("•", x, this.y, size);
      this.text(l, x + 12, this.y, size);
    });
    this.y -= 1;
  }
  rule(gapAbove = 6, gapBelow = 10) {
    this.need(gapAbove + gapBelow);
    this.y -= gapAbove;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.6, color: RULE });
    this.y -= gapBelow;
  }
}

function link(doc: PDFDocument, page: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  const annot = doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  const ref = doc.context.register(annot);
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (annots && "push" in annots) (annots as unknown as { push: (r: unknown) => void }).push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/** Builds the PDF. acceptUrl: the customer's link (Accept button and footer); omitted for a draft preview. */
export async function quotePdf(q: QuoteDoc, opts: { acceptUrl?: string | null; draft?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Quote ${q.number}`);
  doc.setAuthor(q.company.legal_name);
  doc.setCreator("Project Three Sixty job management");
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const w = new Writer(doc, f);

  // ── Letterhead ───────────────────────────────────────────────────────────
  const logo = await doc.embedPng(Buffer.from(q.company.code === "PTSL" ? PROJECT360_LOGO_PNG : PLUMBING360_LOGO_PNG, "base64"));
  const lh = 52;
  const lw = (logo.width / logo.height) * lh;
  w.page.drawImage(logo, { x: M, y: w.y - lh, width: Math.min(lw, 230), height: lh * (Math.min(lw, 230) / lw) });
  const co = q.company;
  const coLines = [
    co.address_line, co.suburb, [co.city, co.postcode].filter(Boolean).join(" "), co.city,
    co.phone ? `Phone: ${co.phone}` : null,
  ].filter((x): x is string => Boolean(x && x.trim()));
  let cy = w.y - 9;
  w.right(co.legal_name, A4[0] - M, cy, 9.5, f.bold);
  for (const l of coLines) {
    cy -= 12;
    w.right(l, A4[0] - M, cy, 9);
  }
  w.y = Math.min(w.y - lh, cy) - 26;

  // ── Customer (left) and the grey box (right) ─────────────────────────────
  const top = w.y;
  const cust = [q.customer.name, ...(q.customer.billing_address ?? "").split(/\r?\n|,\s*/).filter(Boolean)];
  let ly = top;
  for (const l of cust.slice(0, 6)) {
    ly -= 12;
    w.text(l, M, ly, 9);
  }
  const boxX = M + W * 0.47;
  const boxW = A4[0] - M - boxX;
  const facts: [string, string][] = [
    ["Job Number", q.phase_ref ?? q.job_ref],
    ["GST Number", co.gst_number ?? ""],
    ["Order Number", q.order_number ?? ""],
    ["Quote Date", nzDay(q.published_at ?? q.updated_at)],
    ["Valid Until", q.valid_until ? nzDay(q.valid_until) : opts.draft ? `${q.valid_days} days from sending` : ""],
  ];
  const site = [q.site.site_name, q.site.address_line, q.site.suburb, [q.site.city, q.site.postcode].filter(Boolean).join(" ")]
    .filter((x): x is string => Boolean(x && x.trim()));
  const boxH = Math.max(facts.length, site.length + 1) * 12 + 16;
  w.page.drawRectangle({ x: boxX, y: top - boxH, width: boxW, height: boxH, color: BOX });
  let by = top - 6;
  by -= 10;
  w.text("Site Address", boxX + 10, by, 9, f.bold);
  for (const l of site) {
    by -= 12;
    w.text(l, boxX + 10, by, 9);
  }
  let fy = top - 16;
  for (const [k, v] of facts) {
    w.right(`${k}: ${v}`, A4[0] - M - 10, fy, 9);
    fy -= 12;
  }
  w.y = Math.min(ly, top - boxH) - 16;

  // ── Accept button ────────────────────────────────────────────────────────
  if (opts.acceptUrl) {
    const bw = 110, bh = 24;
    const bx = A4[0] - M - bw;
    w.page.drawRectangle({ x: bx, y: w.y - bh, width: bw, height: bh, color: GREEN });
    const t = "Accept Quote";
    w.page.drawText(t, { x: bx + (bw - f.bold.widthOfTextAtSize(t, 9)) / 2, y: w.y - bh + 8, size: 9, font: f.bold, color: rgb(1, 1, 1) });
    link(doc, w.page, bx, w.y - bh, bw, bh, opts.acceptUrl);
    w.y -= bh + 14;
  }
  if (opts.draft) {
    w.para("DRAFT: not sent to the customer yet. Prices may change.", { font: f.bold, size: 9, color: rgb(0.75, 0.2, 0.15), gap: 6 });
  }

  // ── Heading and Description of Works ─────────────────────────────────────
  w.need(30);
  w.y -= 14;
  w.text(`Quote | ${q.heading}`, M, w.y, 13, f.bold);
  w.y -= 8;
  const blocks = textBlocks(q.description);
  if (blocks.length) {
    w.para("Description of Works", { font: f.bold, size: 9.5, gap: 6 });
    for (const b of blocks) {
      if (b.kind === "heading") {
        w.y -= 4;
        w.para(b.text, { font: f.bold, size: 9.5, gap: 2 });
      } else if (b.kind === "bullet") w.bullet(b.text);
      else w.para(b.text, { gap: 4 });
    }
  }
  const excl = splitLines(q.exclusions);
  if (excl.length) {
    w.y -= 4;
    w.para("No Allowance Has been made for", { font: f.bold, size: 9.5, gap: 2 });
    for (const e of excl) w.bullet(e, M + 16);
  }
  if (q.note) {
    w.y -= 4;
    w.para(q.note, { gap: 4 });
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  const xQty = A4[0] - M - (q.sections.some((s) => s.appears_as === "lines") ? 190 : 0);
  w.y -= 8;
  if (q.sections.some((s) => s.appears_as !== "fixed")) {
    w.need(30);
    w.y -= 10;
    if (q.sections.some((s) => s.appears_as === "lines")) {
      w.right("Quantity", xQty, w.y, 8.5, f.bold);
      w.right("Unit Price", A4[0] - M - 90, w.y, 8.5, f.bold);
      w.right("Amount", A4[0] - M, w.y, 8.5, f.bold);
    } else w.right("Quantity", A4[0] - M, w.y, 8.5, f.bold);
    w.y -= 4;
  }
  for (const s of q.sections) {
    w.need(50);
    w.y -= 18;
    w.text(s.name, M, w.y, 11, f.bold);
    w.y -= 4;
    if (s.description) w.para(s.description, { color: GREY, gap: 2 });
    if (s.appears_as !== "fixed") {
      s.lines.forEach((l, li) => {
        const name = l.description + (l.unit && s.appears_as === "lines" ? ` (${l.unit})` : "");
        const wrapW = s.appears_as === "lines" ? xQty - M - 70 : W - 60;
        const ls = w.wrap(name, f.reg, 8.5, wrapW);
        // keep the last line with the section's total
        w.need(ls.length * 12 + 6 + (li === s.lines.length - 1 ? 22 : 0));
        w.y -= 6;
        ls.forEach((t, i) => {
          w.y -= i === 0 ? 8.5 : 11;
          w.text(t, M, w.y, 8.5);
          if (i === 0) {
            if (s.appears_as === "lines") {
              w.right(qty(l.quantity), xQty, w.y, 8.5);
              w.right(nzMoney(l.unit_sell) + (Number(l.discount_pct) > 0 ? ` less ${Number(l.discount_pct)}%` : ""), A4[0] - M - 90, w.y, 8.5);
              w.right(nzMoney(l.total), A4[0] - M, w.y, 8.5);
            } else w.right(qty(l.quantity), A4[0] - M, w.y, 8.5);
          }
        });
        w.y -= 4;
      });
    }
    w.need(20);
    w.y -= 14;
    w.right(nzMoney(s.sell), A4[0] - M, w.y, 9, f.bold);
    w.y -= 4;
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const t = q.totals;
  w.rule(14, 6);
  const rows: [string, string, boolean][] = [["Subtotal", nzMoney(t.subtotal), false]];
  if (Number(t.discount) > 0) {
    rows.push([`Discount (${Number(t.discount_pct)}%)`, `-${nzMoney(t.discount)}`, false]);
    rows.push(["Subtotal after discount", nzMoney(t.net), false]);
  }
  rows.push(["GST Amount", nzMoney(t.gst), false], ["Total", nzMoney(t.total), true]);
  if (t.deposit) rows.push([q.deposit_kind === "percent" ? `Required deposit (${Number(q.deposit_value)}%)` : "Required deposit", nzMoney(t.deposit), true]);
  for (const [k, v, b] of rows) {
    w.need(16);
    w.y -= 15;
    w.right(k, A4[0] - M - 90, w.y, 9.5, b ? f.bold : f.reg);
    w.right(v, A4[0] - M, w.y, 9.5, b ? f.bold : f.reg);
  }
  w.rule(10, 8);

  // ── Terms ────────────────────────────────────────────────────────────────
  if (q.terms) {
    for (const p of q.terms.split(/\r?\n/)) {
      if (p.trim()) w.para(p, { font: f.ital, size: 8.5, gap: 1 });
      else w.y -= 8;
    }
  }
  w.y -= 6;
  w.para(`This quote is valid for ${q.valid_days} days`, { font: f.ital, size: 8.5 });
  if (opts.acceptUrl) {
    w.y -= 4;
    w.para(`To accept online: ${opts.acceptUrl}`, { size: 7.5, color: GREY });
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  w.pages.forEach((p, i) => {
    p.drawText(clean(f.reg, `Quote ${q.number}.pdf`), { x: M, y: M - 14, size: 7.5, font: f.reg, color: GREY });
    const pn = `Page ${i + 1}/${w.pages.length}`;
    p.drawText(pn, { x: A4[0] - M - f.reg.widthOfTextAtSize(pn, 7.5), y: M - 14, size: 7.5, font: f.reg, color: GREY });
  });
  return doc.save();
}

export const quoteFileName = (q: QuoteDoc) => `Quote ${q.number}.pdf`.replace(/[^\w .-]/g, "");
