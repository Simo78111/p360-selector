// SWMS / JSA as PDF (Phase 5b): draws a hs-layout.ts description on landscape A4 with pdf-lib — logo header and
// "Page x of y" footer on every page, tables that wrap their text, break across pages and repeat their heading row,
// coloured cells, tick boxes, and signatures drawn in the plumber app. Helvetica, like the quote and invoice PDFs
// (macrons and other characters Helvetica lacks are swapped by quote-pdf's clean()).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { HS_LOGO_PNG, HS_LOGO_SIZE } from "./hs-logo";
import type { Block, Cell, Layout, Para, Row, Run, Table } from "./hs-layout";
import { C } from "./hs-layout";

const PAGE: [number, number] = [841.89, 595.28];
const MX = 30, TOP = 58, BOTTOM = 34;
const W = PAGE[0] - 2 * MX;
const PAD = 3;
const LINE = 1.22;

type Fonts = { reg: PDFFont; bold: PDFFont; ital: PDFFont; boldItal: PDFFont };
const hex = (h: string): RGB => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const BORDER = hex("BFC5CC");

// Characters Helvetica (WinAnsi) can't draw.
const SWAP: Record<string, string> = { "→": "->", "←": "<-", "↓": "v", "↑": "^", "≤": "<=", "≥": ">=", "✓": "", "☐": "", "✕": "x", "−": "-", "‑": "-", " ": " " };
function clean(font: PDFFont, t: string) {
  let out = "";
  for (const ch of t.normalize("NFKD").replace(/[̀-ͯ]/g, "")) {
    const c = SWAP[ch] ?? ch;
    if (!c) continue;
    try {
      font.encodeText(c);
      out += c;
    } catch { /* not in Helvetica: drop */ }
  }
  return out;
}

type Seg = { t: string; font: PDFFont; size: number; color: RGB; w: number };
type Line = { segs: Seg[]; w: number; h: number };

class Pdf {
  doc: PDFDocument;
  f: Fonts;
  page!: PDFPage;
  pages: PDFPage[] = [];
  y = 0;
  base: number;
  constructor(doc: PDFDocument, f: Fonts, base: number) {
    this.doc = doc;
    this.f = f;
    this.base = base;
  }
  font(run: Run) {
    return run.b && run.i ? this.f.boldItal : run.b ? this.f.bold : run.i ? this.f.ital : this.f.reg;
  }
  newPage() {
    this.page = this.doc.addPage(PAGE);
    this.pages.push(this.page);
    this.y = PAGE[1] - TOP;
  }
  room(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  /** Break a paragraph into lines that fit `width`. */
  lines(para: Para, width: number, sizeDefault: number): Line[] {
    const indent = para.bullet ? 9 : para.box ? 11 : 0;
    const max = Math.max(10, width - indent);
    const out: Line[] = [];
    let cur: Seg[] = [];
    let cw = 0;
    let ch = sizeDefault;
    const push = () => {
      out.push({ segs: cur, w: cw, h: ch * LINE });
      cur = [];
      cw = 0;
      ch = sizeDefault;
    };
    for (const run of para.runs) {
      const font = this.font(run);
      const size = run.size ?? sizeDefault;
      const color = hex(run.color ?? C.ink);
      const words = clean(font, run.t).split(/(\s+)/).filter((x) => x.length);
      for (const word of words) {
        const isSpace = /^\s+$/.test(word);
        if (isSpace && !cur.length) continue;
        let w = font.widthOfTextAtSize(word, size);
        if (!isSpace && cw + w > max && cur.length) {
          while (cur.length && /^\s+$/.test(cur[cur.length - 1].t)) cw -= cur.pop()!.w;
          push();
        }
        let piece = word;
        // a single word wider than the column: cut it
        while (!isSpace && w > max) {
          let k = piece.length;
          while (k > 1 && font.widthOfTextAtSize(piece.slice(0, k), size) > max - cw) k--;
          cur.push({ t: piece.slice(0, k), font, size, color, w: font.widthOfTextAtSize(piece.slice(0, k), size) });
          push();
          piece = piece.slice(k);
          w = font.widthOfTextAtSize(piece, size);
        }
        if (isSpace && !cur.length) continue;
        cur.push({ t: piece, font, size, color, w });
        cw += w;
        ch = Math.max(ch, size);
      }
    }
    if (cur.length || !out.length) push();
    return out;
  }
  parasHeight(paras: Para[], width: number, size: number) {
    return paras.reduce((h, q, i) => h + this.lines(q, width, size).reduce((a, l) => a + l.h, 0) + (i ? 1.5 : 0), 0);
  }
  drawParas(paras: Para[], x: number, top: number, width: number, size: number) {
    let y = top;
    paras.forEach((q, i) => {
      if (i) y -= 1.5;
      const ls = this.lines(q, width, size);
      const indent = q.bullet ? 9 : q.box ? 11 : 0;
      ls.forEach((l, li) => {
        const baseline = y - (l.h / LINE) * 0.95;
        if (li === 0 && q.bullet) this.page.drawText("•", { x: x + 1.5, y: baseline, size, font: this.f.reg, color: hex(C.ink) });
        if (li === 0 && q.box) this.page.drawRectangle({ x, y: baseline - 1, width: 7.5, height: 7.5, borderColor: hex(C.ink), borderWidth: 0.8 });
        let cx = x + indent + (q.align === "center" ? Math.max(0, (width - indent - l.w) / 2) : 0);
        for (const sg of l.segs) {
          if (sg.t.trim()) this.page.drawText(sg.t, { x: cx, y: baseline, size: sg.size, font: sg.font, color: sg.color });
          cx += sg.w;
        }
        y -= l.h;
      });
    });
    return top - y;
  }

  // ── blocks ──
  title(text: string, sub?: string, note?: string) {
    this.room(50);
    this.page.drawText(clean(this.f.bold, text), { x: MX, y: this.y - 15, size: 16, font: this.f.bold, color: hex(C.ink) });
    this.y -= 21;
    if (sub) {
      const h = this.drawParas([{ runs: [{ t: sub, b: true, color: C.aqua, size: 10.5 }] }], MX, this.y, W, 10.5);
      this.y -= h + 2;
    }
    if (note) {
      const h = this.drawParas([{ runs: [{ t: note, i: true, size: 8 }] }], MX, this.y, W, 8);
      this.y -= h + 2;
    }
    this.y -= 4;
  }
  heading(text: string, color = C.ink) {
    this.room(70);
    this.y -= 6;
    this.page.drawText(clean(this.f.bold, text), { x: MX, y: this.y - 11, size: 11, font: this.f.bold, color: hex(color) });
    this.y -= 14;
    this.page.drawLine({ start: { x: MX, y: this.y }, end: { x: MX + W, y: this.y }, thickness: 1.2, color: hex(C.aqua) });
    this.y -= 5;
  }
  para(q: Para, size: number) {
    const h = this.parasHeight([q], W, size);
    this.room(h + 2);
    this.y -= this.drawParas([q], MX, this.y, W, size) + 3;
  }

  rowHeights(t: Table, row: Row, widths: number[], size: number) {
    let col = 0;
    let h = 0;
    for (const c of row.cells) {
      const span = c.span ?? 1;
      const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
      col += span;
      h = Math.max(h, this.parasHeight(c.paras, w - 2 * PAD, size) + 2 * PAD, c.minH ?? 0, c.sig ? 26 : 0);
    }
    return h;
  }
  drawRow(row: Row, widths: number[], size: number, h: number) {
    let col = 0;
    let x = MX;
    for (const c of row.cells) {
      const span = c.span ?? 1;
      const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
      col += span;
      this.cell(c, x, this.y, w, h, size);
      x += w;
    }
    this.y -= h;
  }
  cell(c: Cell, x: number, top: number, w: number, h: number, size: number) {
    this.page.drawRectangle({ x, y: top - h, width: w, height: h, color: c.fill ? hex(c.fill) : undefined, borderColor: BORDER, borderWidth: 0.6 });
    this.drawParas(c.paras, x + PAD, top - PAD, w - 2 * PAD, size);
    if (c.sig) {
      try {
        const scale = Math.min((h - 4) / 100, (w - 6) / 300);
        this.page.drawSvgPath(c.sig, { x: x + 3, y: top - 2, scale, borderColor: hex("1F3A93"), borderWidth: 1.4 / scale });
      } catch { /* a bad signature path: leave the box */ }
    }
  }
  table(t: Table) {
    const size = t.size ?? this.base;
    const total = t.widths.reduce((a, b) => a + b, 0);
    const widths = t.widths.map((x) => (x / total) * W);
    const heads = t.rows.slice(0, t.repeatHeader ?? 0);
    const headH = heads.reduce((a, r) => a + this.rowHeights(t, r, widths, size), 0);
    t.rows.forEach((row, i) => {
      let h = this.rowHeights(t, row, widths, size);
      const max = PAGE[1] - TOP - BOTTOM - headH - 4;
      if (h > max) h = max;
      // keep the heading row with the first body row, and a task heading with its first hazard
      const next = t.rows[i + 1];
      const keep = (i < heads.length || (row.cells.length === 1 && next)) && next ? this.rowHeights(t, next, widths, size) : 0;
      if (this.y - h - Math.min(keep, 120) < BOTTOM) {
        this.newPage();
        if (i >= heads.length) for (const hr of heads) this.drawRow(hr, widths, size, this.rowHeights(t, hr, widths, size));
      }
      this.drawRow(row, widths, size, h);
    });
    this.y -= 4;
  }
}

export async function layoutPdf(l: Layout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(l.title);
  doc.setAuthor("Project Three Sixty Limited");
  doc.setCreator("Project Three Sixty job management");
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItal: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const P = new Pdf(doc, f, 8);
  P.newPage();
  for (const b of l.blocks as Block[]) {
    if (b.kind === "title") P.title(b.text, b.sub, b.note);
    else if (b.kind === "h") P.heading(b.text, b.color);
    else if (b.kind === "p") P.para(b.para, b.size ?? 8.5);
    else if (b.kind === "table") P.table(b);
    else if (b.kind === "gap") P.y -= b.pt;
    else if (b.kind === "break") P.newPage();
  }
  // header and footer on every page
  const lg = l.logo ?? { png: HS_LOGO_PNG, ...HS_LOGO_SIZE };
  const logo = await doc.embedPng(Buffer.from(lg.png, "base64"));
  const lh = 24, lw = (lg.w / lg.h) * lh;
  P.pages.forEach((pg, i) => {
    pg.drawImage(logo, { x: MX, y: PAGE[1] - 14 - lh, width: lw, height: lh });
    pg.drawText(clean(f.reg, l.header), { x: MX + lw + 12, y: PAGE[1] - 32, size: 7.5, font: f.reg, color: hex(C.grey) });
    if (l.draft) {
      const t = "DRAFT – NOT APPROVED – NOT FOR ISSUE";
      pg.drawText(clean(f.bold, t), { x: MX + W - f.bold.widthOfTextAtSize(clean(f.bold, t), 9), y: PAGE[1] - 32, size: 9, font: f.bold, color: hex(C.red) });
    }
    pg.drawLine({ start: { x: MX, y: PAGE[1] - 42 }, end: { x: MX + W, y: PAGE[1] - 42 }, thickness: 0.5, color: BORDER });
    pg.drawText(clean(f.reg, l.footer), { x: MX, y: 16, size: 6.5, font: f.reg, color: hex(C.grey) });
    const pn = `Page ${i + 1} of ${P.pages.length}`;
    pg.drawText(pn, { x: MX + W - f.reg.widthOfTextAtSize(pn, 7.5), y: 16, size: 7.5, font: f.reg, color: hex(C.grey) });
  });
  return doc.save();
}
