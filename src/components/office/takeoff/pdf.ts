"use client";
// pdf.js in the browser: open a plan set, draw a page onto a canvas, and read its text (sheet number, scales written on
// it). The worker file is copied to /pdf.worker.min.mjs by scripts/copy-pdf-worker.mjs (predev / prebuild).
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { readPageText } from "@/lib/takeoff-shared";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
export function pdfjs() {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

/** Opens a PDF from its bytes. pdf.js takes over the buffer it's given, so it gets a copy. */
export async function openPdf(bytes: ArrayBuffer): Promise<{ doc: PDFDocumentProxy; close: () => Promise<void> }> {
  const m = await pdfjs();
  const task = m.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  return { doc: await task.promise, close: () => task.destroy() };
}

/** A job file's bytes, through the office's file link (checks the person can see the job). */
export async function fetchJobFile(fileId: string, onProgress?: (done: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(`/api/office/job-file?id=${fileId}`);
  if (!res.ok) throw new Error(`Couldn't open the plans (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress) return res.arrayBuffer();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let done = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    parts.push(r.value);
    done += r.value.length;
    onProgress(done, total);
  }
  const out = new Uint8Array(done);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

/** Page size in PDF units as the page is shown (rotation applied). */
export function pageSize(page: PDFPageProxy) {
  const v = page.getViewport({ scale: 1 });
  return { width: Math.round(v.width * 100) / 100, height: Math.round(v.height * 100) / 100 };
}

export async function pageText(page: PDFPageProxy) {
  try {
    const t = await page.getTextContent();
    return t.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  } catch {
    return "";
  }
}

/** Each page's size and a suggested label (sheet number), for a new plan set. */
export async function describePages(doc: PDFDocumentProxy, onPage?: (n: number) => void) {
  const pages: { page_no: number; width: number; height: number; label: string | null }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = pageSize(page);
    const { label } = readPageText(await pageText(page));
    pages.push({ page_no: n, width, height, label });
    page.cleanup();
    onPage?.(n);
  }
  return pages;
}

/**
 * Draws a page into a canvas with its long side `longPx` pixels (sharp enough to zoom in on an A1 sheet), returning
 * a cancel function. The canvas is shown at the page's size in PDF units and scaled by the viewer.
 */
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, longPx: number, turn = 0) {
  const rotation = (((page.rotate ?? 0) + turn) % 360 + 360) % 360;   // the PDF's own turn plus the office's
  const base = page.getViewport({ scale: 1, rotation });
  const scale = longPx / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale, rotation });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't draw the plans.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
  return { done: task.promise, cancel: () => task.cancel() };
}

/**
 * A page drawn small and turned into ink (1 = something drawn), for comparing two revisions (4c). The long side is
 * `longPx` pixels; pxPerPt converts PDF units to these pixels.
 */
export async function pageInk(doc: PDFDocumentProxy, pageNo: number, longPx = 1800, turn = 0) {
  const { inkOf } = await import("@/lib/takeoff-shared");
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const pxPerPt = longPx / Math.max(base.width, base.height);
  const canvas = document.createElement("canvas");
  const r = renderPage(page, canvas, longPx, turn);
  await r.done;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  page.cleanup();
  return { ink: inkOf(img.data, canvas.width, canvas.height), w: canvas.width, h: canvas.height, pxPerPt };
}

/** The changes between two revisions of a page as a see-through picture: red = only on the older one, blue = new. */
export function changesImage(mask: Uint8Array, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    if (mask[i] === 1) [img.data[o], img.data[o + 1], img.data[o + 2]] = [220, 38, 38];
    else [img.data[o], img.data[o + 1], img.data[o + 2]] = [37, 99, 235];
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // thicken thin changes so they're easy to see at a glance
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const o2 = out.getContext("2d")!;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) o2.drawImage(canvas, dx, dy);
  return out.toDataURL("image/png");
}
