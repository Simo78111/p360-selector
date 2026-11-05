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
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  return m.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
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
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, longPx: number) {
  const base = page.getViewport({ scale: 1 });
  const scale = longPx / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't draw the plans.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
  return { done: task.promise, cancel: () => task.cancel() };
}
