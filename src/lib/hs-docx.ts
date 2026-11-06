// SWMS / JSA as Word (.docx) (Phase 5b): the same hs-layout.ts description as the PDF, so the office can tweak a
// document in Word before sending it. Landscape A4, Arial, the logo header and "Page x of y" footer, table heading
// rows repeat on each page and rows don't split. Signatures drawn in the plumber app show as "Signed in the plumber
// app" with the time (the PDF draws the signature itself).
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber,
  PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, WidthType,
} from "docx";
import { HS_LOGO_PNG, HS_LOGO_SIZE } from "./hs-logo";
import { C, type Cell, type Layout, type Para, type Table as LTable } from "./hs-layout";

const MARGIN = 567;                         // 1 cm
const PAGE_W = 16838, PAGE_H = 11906;       // landscape A4 in twips
const CONTENT = PAGE_W - 2 * MARGIN;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFC5CC" };
const half = (pt: number) => Math.round(pt * 2);

function runs(q: Para, size: number) {
  const out: TextRun[] = [];
  if (q.box) out.push(new TextRun({ text: "☐ ", size: half(size + 1), font: "Segoe UI Symbol" }));
  for (const r of q.runs) {
    out.push(new TextRun({ text: r.t, bold: r.b, italics: r.i, color: r.color ?? C.ink, size: half(r.size ?? size), font: "Arial" }));
  }
  return out;
}
const para = (q: Para, size: number, after = 0) => new Paragraph({
  children: runs(q, size),
  alignment: q.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
  numbering: q.bullet ? { reference: "bullets", level: 0 } : undefined,
  spacing: { after, line: 240 },
});

/** An empty line exactly `pt` high (Word needs a paragraph between tables). */
const spacer = (pt: number) =>
  new Paragraph({ children: [new TextRun({ text: "", size: 2 })], spacing: { before: 0, after: 0, line: Math.max(20, Math.round(pt * 20)), lineRule: LineRuleType.EXACT } });

function cell(c: Cell, width: number, size: number) {
  const paras = c.paras.map((q) => para(q, size, 20));
  if (c.sig) paras.unshift(new Paragraph({ children: [new TextRun({ text: "✓ Signed in the plumber app", italics: true, size: half(7.5), font: "Arial", color: "1F3A93" })] }));
  return new TableCell({
    children: paras.length ? paras : [new Paragraph("")],
    columnSpan: c.span && c.span > 1 ? c.span : undefined,
    width: { size: width, type: WidthType.DXA },
    shading: c.fill ? { type: ShadingType.CLEAR, fill: c.fill, color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function table(t: LTable, base: number) {
  const size = t.size ?? base;
  const total = t.widths.reduce((a, b) => a + b, 0);
  const widths = t.widths.map((x) => Math.round((x / total) * CONTENT));
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: t.rows.map((row, i) => {
      let col = 0;
      const cells = row.cells.map((c) => {
        const span = c.span ?? 1;
        const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
        col += span;
        return cell(c, w, size);
      });
      return new TableRow({
        children: cells, cantSplit: true, tableHeader: i < (t.repeatHeader ?? 0),
        height: Math.max(...row.cells.map((c) => c.minH ?? 0)) ? { value: Math.round(Math.max(...row.cells.map((c) => c.minH ?? 0)) * 20), rule: "atLeast" } : undefined,
      });
    }),
  });
}

export async function layoutDocx(l: Layout): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];
  for (const b of l.blocks) {
    if (b.kind === "title") {
      children.push(new Paragraph({ children: [new TextRun({ text: b.text, bold: true, size: half(16), font: "Arial", color: C.ink })], spacing: { after: 40 } }));
      if (b.sub) children.push(new Paragraph({ children: [new TextRun({ text: b.sub, bold: true, size: half(10.5), font: "Arial", color: C.aqua })], spacing: { after: 40 } }));
      if (b.note) children.push(new Paragraph({ children: [new TextRun({ text: b.note, italics: true, size: half(8), font: "Arial" })], spacing: { after: 80 } }));
    } else if (b.kind === "h") {
      children.push(new Paragraph({
        children: [new TextRun({ text: b.text, bold: true, size: half(11), font: "Arial", color: b.color ?? C.ink })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: C.aqua, space: 2 } }, spacing: { before: 200, after: 80 }, keepNext: true,
      }));
    } else if (b.kind === "p") children.push(para(b.para, b.size ?? 8.5, 60));
    else if (b.kind === "table") {
      children.push(table(b, 8));
      children.push(spacer(4));
    } else if (b.kind === "gap") children.push(spacer(b.pt));
    else if (b.kind === "break") children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  const lg = l.logo ?? { png: HS_LOGO_PNG, ...HS_LOGO_SIZE };
  const lh = 34, lw = Math.round((lg.w / lg.h) * lh);
  const doc = new Document({
    title: l.title, creator: "Project Three Sixty job management",
    styles: { default: { document: { run: { font: "Arial", size: 17 } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 220, hanging: 160 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGIN * 2, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 300, footer: 300 } } },
      headers: { default: new Header({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFC5CC", space: 2 } },
        children: [
          new ImageRun({ type: "png", data: Buffer.from(lg.png, "base64"), transformation: { width: lw, height: lh } }),
          new TextRun({ text: `    ${l.header}`, size: half(7.5), color: C.grey, font: "Arial" }),
          ...(l.draft ? [new TextRun({ text: "\tDRAFT – NOT APPROVED – NOT FOR ISSUE", bold: true, size: half(9), color: C.red, font: "Arial" })] : []),
        ],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
        children: [
          new TextRun({ text: l.footer, size: half(6.5), color: C.grey, font: "Arial" }),
          new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: half(7.5), color: C.grey, font: "Arial" }),
        ],
      })] }) },
      children,
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
