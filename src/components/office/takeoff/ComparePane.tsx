"use client";
// Compare revisions (Phase 4c): the other revision's matching page, shown beside the current one with the same pan and
// zoom (scroll or drag on either side moves both). Its marks are drawn too, read only — handy to see what was
// measured on Rev A next to Rev B.
import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TakeoffItem, TakeoffMark, TakeoffPage, TakeoffPlan } from "@/lib/takeoff-shared";
import { renderPage } from "./pdf";
import { turnPoints } from "./turn";

type View = { z: number; tx: number; ty: number };

export function ComparePane({ plan, page, current, turn, marks, items, view, setView, getDoc }: {
  /** turn: extra degrees so the other revision's page lines up with this one when they were rotated differently. */
  plan: TakeoffPlan; page: TakeoffPage | null; current: TakeoffPage; turn: number; marks: TakeoffMark[]; items: Map<string, TakeoffItem>;
  view: View; setView: (f: (v: View) => View) => void; getDoc: () => Promise<PDFDocumentProxy>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    if (!page || !canvas.current) return;
    let stop = false;
    let cancel: (() => void) | null = null;
    (async () => {
      const doc = await getDoc();
      if (stop) return;
      const p = await doc.getPage(page.page_no);
      if (stop || !canvas.current) return;
      const first = document.createElement("canvas");
      const show = (from: HTMLCanvasElement) => {
        if (!canvas.current) return;
        canvas.current.width = from.width;
        canvas.current.height = from.height;
        canvas.current.getContext("2d", { alpha: false, willReadFrequently: true })?.drawImage(from, 0, 0);
      };
      try {
        const quick = renderPage(p, first, 1400, (page.rotation ?? 0) + turn);
        cancel = quick.cancel;
        await quick.done;
        if (stop) return;
        show(first);
        const off = document.createElement("canvas");
        const sharp = renderPage(p, off, 3072, (page.rotation ?? 0) + turn);
        cancel = sharp.cancel;
        await sharp.done;
        if (stop) return;
        show(off);
      } catch {
        /* cancelled */
      }
    })();
    return () => {
      stop = true;
      cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.rotation, turn]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stopScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stopScroll, { passive: false });
    return () => el.removeEventListener("wheel", stopScroll);
  }, []);

  // the page as shown (turned to line up), and the same drawing printed at another size lines up with the current page
  const quarter = (((turn / 90) % 4) + 4) % 4;
  const shown = page ? (quarter % 2 ? { width: page.height, height: page.width } : { width: page.width, height: page.height }) : null;
  const k = shown ? current.width / shown.width : 1;
  const z = view.z * k;
  const px = 1 / z;
  const onPage = page ? marks.filter((m) => m.page_id === page.id && items.get(m.item_id) && !items.get(m.item_id)!.hidden)
    .map((m) => (quarter ? { ...m, points: turnPoints(m.points, turn, page.width, page.height) } : m)) : [];
  const numbering = new Map<string, number>();

  return (
    <div ref={box} className="relative min-w-0 flex-1 overflow-hidden border-r-2 border-ink/30 bg-[#e7ebef]" data-testid="compare-pane"
      style={{ cursor: pan.current ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={(e) => {
        pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = pan.current;
        if (s) setView((v) => ({ ...v, tx: s.tx + e.clientX - s.x, ty: s.ty + e.clientY - s.y }));
      }}
      onPointerUp={() => {
        pan.current = null;
      }}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        setView((v) => {
          const nz = Math.min(8, Math.max(0.05, v.z * Math.exp(-e.deltaY * 0.0015)));
          return { z: nz, tx: mx - ((mx - v.tx) / v.z) * nz, ty: my - ((my - v.ty) / v.z) * nz };
        });
      }}>
      <div className="absolute left-3 top-3 z-10 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow">
        {plan.name} Rev {plan.revision}{page ? ` · page ${page.page_no}${page.label ? ` · ${page.label}` : ""}` : ""}
        {plan.superseded_at ? " (replaced: doesn't count)" : ""}
      </div>
      {page && shown ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: shown.width, height: shown.height, transformOrigin: "0 0",
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${z})` }}>
          <canvas ref={canvas} style={{ width: shown.width, height: shown.height, display: "block", background: "#fff",
            boxShadow: "0 2px 12px rgba(0,0,0,.15)", pointerEvents: "none" }} />
          <svg width={shown.width} height={shown.height} viewBox={`0 0 ${shown.width} ${shown.height}`}
            style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {onPage.map((m) => {
              const it = items.get(m.item_id)!;
              if (it.tool === "count") {
                const n = (numbering.get(it.id) ?? 0) + 1;
                numbering.set(it.id, n);
                return (
                  <g key={m.id}>
                    <circle cx={m.points[0][0]} cy={m.points[0][1]} r={9 * px} fill={it.colour} fillOpacity={0.6} stroke="#fff" strokeWidth={1.5 * px} />
                    <text x={m.points[0][0]} y={m.points[0][1] + 3.5 * px} fontSize={10 * px} textAnchor="middle" fill="#fff" fontWeight={700}>{n}</text>
                  </g>
                );
              }
              const pts = m.points.map((q) => q.join(",")).join(" ");
              return it.tool === "area"
                ? <polygon key={m.id} points={pts} fill={it.colour} fillOpacity={0.12} stroke={it.colour} strokeWidth={2.5 * px} strokeOpacity={0.7} />
                : <polyline key={m.id} points={pts} fill="none" stroke={it.colour} strokeWidth={3 * px} strokeOpacity={0.7} strokeLinejoin="round" />;
            })}
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate">
          Rev {plan.revision} has no page matching this one (sheet number {current.label ?? `page ${current.page_no}`}).
        </div>
      )}
    </div>
  );
}
