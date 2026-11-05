"use client";
// AI list of what changed between two revisions (Phase 4c). The browser does the looking: each matching pair of pages
// is drawn and compared, the changes are grouped into areas, the words on both sheets are compared, and pictures are
// cut out (each whole sheet small, and each changed area old and new, bigger). The pictures go to the job's files; the
// database then asks Claude (the takeoff-compare function) to describe the changes, and the list comes back here.
import type { PDFDocumentProxy } from "pdfjs-dist";
import { takeoffCompareStartAction, takeoffCompareUploadsAction } from "@/app/dashboard/takeoff-actions";
import { alignTurn, changeRegions, diffInk, inkOf, matchPages, wordDiff, type TakeoffPage, type TakeoffPlan } from "@/lib/takeoff-shared";
import { renderPage } from "./pdf";

const INK_PX = 1800;        // pages drawn this size to find the changes
const SHEET_PX = 1400;      // each whole sheet, for context
const DETAIL_PX = 4096;     // drawn this size to cut out the changed areas
const AREA_MAX_PX = 1150;   // a changed area's picture, longest side
const MAX_AREAS = 6;        // per sheet (the biggest changes)
const MIN_SHEET_PIXELS = 150; // fewer changed pixels than this on a sheet (and no words changed): treated as unchanged

type Pic = { name: string; blob: Blob };
const jpeg = (c: HTMLCanvasElement, q = 0.82) =>
  new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("Couldn't make a picture."))), "image/jpeg", q));

async function draw(doc: PDFDocumentProxy, pg: TakeoffPage, longPx: number, turn: number) {
  const page = await doc.getPage(pg.page_no);
  const c = document.createElement("canvas");
  await renderPage(page, c, longPx, turn, true).done;
  const words = (await page.getTextContent().catch(() => ({ items: [] }))).items
    .map((i) => ("str" in i ? i.str : "")).filter((s) => s.trim());
  page.cleanup();
  return { c, words, pxPerPt: c.width / pg.width };
}

/** A piece of a drawn page (box in page units, with some room round it), scaled to fit `max` pixels. */
function cut(src: HTMLCanvasElement, pxPerPt: number, box: [number, number, number, number], pad: number, max: number) {
  const x0 = Math.max(0, (box[0] - pad) * pxPerPt), y0 = Math.max(0, (box[1] - pad) * pxPerPt);
  const x1 = Math.min(src.width, (box[2] + pad) * pxPerPt), y1 = Math.min(src.height, (box[3] + pad) * pxPerPt);
  const w = x1 - x0, h = y1 - y0;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
  return c;
}
function shrink(src: HTMLCanvasElement, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  c.getContext("2d", { alpha: false })!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Finds what changed between `from` (older) and `to` (newer), uploads the pictures and starts the AI. Returns the
 * report id, or null when nothing changed. `docFrom` / `docTo` are the two open PDFs; `step` reports progress.
 */
export async function startAiCompare(jobId: string, from: TakeoffPlan, to: TakeoffPlan, docFrom: PDFDocumentProxy,
  docTo: PDFDocumentProxy, step: (s: string) => void): Promise<{ id: string } | { nothing: true }> {
  const pairs = [...matchPages(from.pages, to.pages).entries()].map(([a, b]) => [from.pages.find((p) => p.id === a)!, b] as const);
  const pics: Pic[] = [];
  const pages: Record<string, unknown>[] = [];
  const unchanged: string[] = [];
  let n = 0;
  for (const [a, b] of pairs) {
    n++;
    const name = b.label ?? `page ${b.page_no}`;
    step(`Comparing ${name} (${n} of ${pairs.length})…`);
    // both in the newer page's frame (the older one turned to line up if they were rotated differently)
    const turnA = (a.rotation ?? 0) + alignTurn(b, a).turn;
    const [ia, ib] = await Promise.all([draw(docFrom, a, INK_PX, turnA), draw(docTo, b, INK_PX, b.rotation ?? 0)]);
    const w = Math.min(ia.c.width, ib.c.width), h = Math.min(ia.c.height, ib.c.height);
    const inkA = inkOf(ia.c.getContext("2d")!.getImageData(0, 0, w, h).data, w, h);
    const inkB = inkOf(ib.c.getContext("2d")!.getImageData(0, 0, w, h).data, w, h);
    const mask = diffInk(inkA, inkB, w, h);
    let changed = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) changed++;
    const words = wordDiff(ia.words, ib.words);
    if (changed < MIN_SHEET_PIXELS && !words.added.length && !words.removed.length) {
      unchanged.push(name);
      continue;
    }
    const regions = changeRegions(mask, w, h, ib.pxPerPt).slice(0, MAX_AREAS);
    const key = `p${b.page_no}`;
    // whole sheets small, then each changed area bigger from a sharp drawing
    pics.push({ name: `${key}-old.jpg`, blob: await jpeg(shrink(ia.c, SHEET_PX)) });
    pics.push({ name: `${key}-new.jpg`, blob: await jpeg(shrink(ib.c, SHEET_PX)) });
    const rs: Record<string, unknown>[] = [];
    if (regions.length) {
      step(`Cutting out the changes on ${name}…`);
      const [da, db] = await Promise.all([draw(docFrom, a, DETAIL_PX, turnA), draw(docTo, b, DETAIL_PX, b.rotation ?? 0)]);
      for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        const pad = Math.max(30, (r.box[2] - r.box[0] + r.box[3] - r.box[1]) * 0.08);
        pics.push({ name: `${key}-a${i + 1}-old.jpg`, blob: await jpeg(cut(da.c, da.pxPerPt, r.box, pad, AREA_MAX_PX)) });
        pics.push({ name: `${key}-a${i + 1}-new.jpg`, blob: await jpeg(cut(db.c, db.pxPerPt, r.box, pad, AREA_MAX_PX)) });
        rs.push({ n: i + 1, box: r.box, pixels: r.pixels, old_image: `${key}-a${i + 1}-old.jpg`, new_image: `${key}-a${i + 1}-new.jpg` });
      }
    }
    pages.push({ label: b.label, from_page: a.id, to_page: b.id, old_image: `${key}-old.jpg`, new_image: `${key}-new.jpg`,
      regions: rs, words_added: words.added, words_removed: words.removed, changed_pixels: changed,
      resized: Math.abs(a.width - b.width) > b.width * 0.005 && Math.abs(a.width - b.height) > b.width * 0.005 });
  }
  if (!pages.length) return { nothing: true };

  step(`Uploading ${pics.length} pictures…`);
  const up = await takeoffCompareUploadsAction(jobId, pics.map((p) => p.name));
  if (!up.ok) throw new Error(up.error);
  const where = new Map(pics.map((p, i) => [p.name, up.data[i].path]));
  let done = 0;
  const queue = pics.map((p, i) => ({ p, url: up.data[i].url }));
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let q = queue.shift(); q; q = queue.shift()) {
      const r = await fetch(q.url, { method: "PUT", body: q.p.blob, headers: { "Content-Type": "image/jpeg" } });
      if (!r.ok) throw new Error(`Picture upload failed (${r.status}).`);
      step(`Uploading pictures… ${++done} of ${pics.length}`);
    }
  }));
  const fix = (name: unknown) => (typeof name === "string" ? where.get(name) ?? null : null);
  const input = {
    pages: pages.map((p) => ({ ...p, old_image: fix(p.old_image), new_image: fix(p.new_image),
      regions: (p.regions as Record<string, unknown>[]).map((r) => ({ ...r, old_image: fix(r.old_image), new_image: fix(r.new_image) })) })),
    unchanged,
  };
  step("Asking the AI…");
  const r = await takeoffCompareStartAction(from.id, to.id, input);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
