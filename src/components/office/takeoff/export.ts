"use client";
// The marked-up PDF (the original plan set with every mark drawn on it, a legend on each marked page and a summary
// page at the end) and the summary CSV. Made in the browser from the plan's own bytes, so nothing leaves the office
// unless it's downloaded or shared.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtQty, itemTotals, summaryCsv, unitOf, type Pt, type Takeoff, type TakeoffMark, type TakeoffPlan } from "@/lib/takeoff-shared";

const hex = (c: string) => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);
/** The standard PDF font only has Western characters. */
const clean = (s: string) => s.replace(/²/g, "2").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->")
  .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

export function download(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export const csvFor = (t: Takeoff) => summaryCsv(t, t.can.costs);

/** Maps a point as the page is shown (y down, rotation applied) to the page's own PDF space. */
function mapper(page: PDFPage) {
  const { x: ox, y: oy, width: w, height: h } = page.getMediaBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  return ([x, y]: Pt): [number, number] => {
    switch (rot) {
      case 90: return [ox + y, oy + x];
      case 180: return [ox + w - x, oy + y];
      case 270: return [ox + w - y, oy + h - x];
      default: return [ox + x, oy + h - y];
    }
  };
}

export async function markedUpPdf(bytes: ArrayBuffer, plan: TakeoffPlan, t: Takeoff, marks: TakeoffMark[]) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const pageById = new Map(plan.pages.map((p) => [p.id, p]));
  const items = new Map(t.items.map((i) => [i.id, i]));

  for (const pg of plan.pages) {
    const page = pages[pg.page_no - 1];
    if (!page) continue;
    const onPage = marks.filter((m) => m.page_id === pg.id && items.get(m.item_id) && !items.get(m.item_id)!.hidden);
    if (onPage.length === 0) continue;
    const map = mapper(page);
    const rot = page.getRotation().angle;
    const k = Math.max(pg.width, pg.height) / 1190;   // marks sized for the sheet (A1 ≈ 2× an A3)
    const counter = new Map<string, number>();
    for (const m of onPage) {
      const it = items.get(m.item_id)!;
      const c = hex(it.colour);
      if (it.tool === "count") {
        const n = (counter.get(it.id) ?? 0) + 1;
        counter.set(it.id, n);
        const [x, y] = map(m.points[0]);
        page.drawCircle({ x, y, size: 7 * k, color: c, opacity: 0.85, borderColor: rgb(1, 1, 1), borderWidth: 1 * k });
        const s = String(n);
        page.drawText(s, { x: x - (bold.widthOfTextAtSize(s, 7 * k) / 2), y: y - 2.5 * k, size: 7 * k, font: bold, color: rgb(1, 1, 1),
          rotate: degrees(rot) });
      } else {
        const pts = m.points.map(map);
        const closed = it.tool === "area" ? [...pts, pts[0]] : pts;
        for (let i = 1; i < closed.length; i++) {
          page.drawLine({ start: { x: closed[i - 1][0], y: closed[i - 1][1] }, end: { x: closed[i][0], y: closed[i][1] },
            thickness: 2.5 * k, color: c, opacity: 0.85 });
        }
        for (const [x, y] of pts) page.drawCircle({ x, y, size: 2 * k, color: c });
      }
    }
    legend(page, t, plan, pg.id, marks, pageById, font, bold, k);
  }
  summaryPage(doc, t, plan, font, bold);
  return doc.save();
}

function legend(page: PDFPage, t: Takeoff, plan: TakeoffPlan, pageId: string, marks: TakeoffMark[],
  pages: Map<string, TakeoffPlan["pages"][number]>, font: PDFFont, bold: PDFFont, k: number) {
  const rows = t.items.filter((i) => !i.hidden && marks.some((m) => m.item_id === i.id && m.page_id === pageId)).map((i) => {
    const pt = itemTotals(i, marks.filter((m) => m.page_id === pageId), pages);
    return { i, text: `${i.name}: ${fmtQty(pt.quantity, i.tool)} ${unitOf(i.tool, i.unit)}` };
  });
  if (rows.length === 0 || page.getRotation().angle % 360 !== 0) return;   // legend only on upright pages
  const pg = pages.get(pageId)!;
  const size = 7 * k, lh = size * 1.6, w = 220 * k, h = lh * (rows.length + 2.2);
  const { x: ox, y: oy, height } = page.getMediaBox();
  const x = ox + 20 * k, y = oy + height - 20 * k - h;
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), opacity: 0.92, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 * k });
  page.drawText(clean(`Takeoff - ${t.job.ref} - ${plan.name} Rev ${plan.revision} p${pg.page_no}`), {
    x: x + 6 * k, y: y + h - lh, size, font: bold, color: rgb(0, 0, 0) });
  rows.forEach((r, n) => {
    const ry = y + h - lh * (n + 2.1);
    page.drawRectangle({ x: x + 6 * k, y: ry - 1 * k, width: size, height: size, color: hex(r.i.colour) });
    page.drawText(clean(r.text).slice(0, 60), { x: x + 6 * k + size * 1.6, y: ry, size, font, color: rgb(0, 0, 0) });
  });
}

function summaryPage(doc: PDFDocument, t: Takeoff, plan: TakeoffPlan, font: PDFFont, bold: PDFFont) {
  let page = doc.addPage([842, 595]);   // A4 landscape
  let y = 545;
  const line = (s: string, f = font, size = 10, x = 40, colour = rgb(0, 0, 0)) => page.drawText(clean(s), { x, y, size, font: f, color: colour });
  line(`Takeoff summary - ${t.job.ref}${t.job.title ? ` ${t.job.title}` : ""}`, bold, 16);
  y -= 20;
  line(`${plan.name} Rev ${plan.revision} - totals for the whole takeoff (all plan sets). Made ${new Date().toLocaleDateString("en-NZ")}.`, font, 9);
  y -= 26;
  for (const g of t.groups) {
    const its = t.items.filter((i) => i.group === g && i.marks > 0);
    if (its.length === 0) continue;
    if (y < 80) {
      page = doc.addPage([842, 595]);
      y = 545;
    }
    line(g, bold, 12);
    y -= 16;
    for (const i of its) {
      if (y < 50) {
        page = doc.addPage([842, 595]);
        y = 545;
      }
      page.drawRectangle({ x: 40, y: y - 1, width: 8, height: 8, color: hex(i.colour) });
      line(i.name.slice(0, 70), font, 10, 54);
      const extras = [i.waste_pct ? `+${i.waste_pct}% waste` : "", i.tool === "length" && i.extra_m_per_run ? `+${i.extra_m_per_run} m a run` : ""]
        .filter(Boolean).join(", ");
      line(`${fmtQty(i.quantity, i.tool)} ${unitOf(i.tool, i.unit)}${extras ? ` (${extras})` : ""}`, bold, 10, 470);
      if (i.unscaled) line(`${i.unscaled} not measured (page has no scale)`, font, 8, 640, rgb(0.7, 0.1, 0.1));
      y -= 15;
    }
    y -= 8;
  }
}
