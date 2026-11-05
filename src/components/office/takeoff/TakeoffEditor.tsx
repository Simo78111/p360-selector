"use client";
// The takeoff screen (Phase 4, desktop only). Left: plan sets and pages with their scale. Middle: the page with the
// marks on top (pan with the hand, the middle mouse button or by holding Space; zoom with the wheel). Right: the items
// being taken off with their running totals. Pick an item, then click the plan: a count drops a numbered marker, a
// length is clicked along the run (double-click or Enter to finish), an area is clicked round the shape.
// Marks save as you go (in batches); undo/redo; the scale is set per page by calibrating or from a ratio.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  takeoffItemAction,
  takeoffLoadAction,
  takeoffMarksAction,
  takeoffRemovePlanAction,
  takeoffScaleAction,
  takeoffShareAction,
  takeoffToQuoteAction,
  takeoffUploadUrlAction,
} from "@/app/dashboard/takeoff-actions";
import {
  fmtQty,
  itemTotals,
  markQty,
  readPageText,
  runLength,
  scaleText,
  unitOf,
  type MarkOp,
  type Pt,
  type Takeoff,
  type TakeoffItem,
  type TakeoffMark,
  type TakeoffPage,
  type TakeoffPlan,
} from "@/lib/takeoff-shared";
import { ItemForm } from "./ItemForm";
import { PlanUpload } from "./PlanUpload";
import { ScaleDialog, SendToQuote } from "./dialogs";
import { csvFor, download, markedUpPdf } from "./export";
import { fetchJobFile, openPdf, pageText, renderPage } from "./pdf";

type ToolMode = "select" | "pan" | "measure" | "calibrate" | "check";
type LocalMark = TakeoffMark & { removed?: boolean };
type Step = { label: string; undo: MarkOp[]; redo: MarkOp[] };
type View = { z: number; tx: number; ty: number };

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
  (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const btn = "rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40";
const RENDER_PX = 4096;   // long side of the page image: sharp enough to zoom in on an A1 sheet

export function TakeoffEditor({ initial, jobPath, testSite, startPlan }: {
  initial: Takeoff; jobPath: string; testSite: boolean; startPlan?: string;
}) {
  const [t, setT] = useState(initial);
  const [marks, setMarks] = useState<LocalMark[]>(initial.marks);
  const [planId, setPlanId] = useState<string | null>(
    initial.plans.find((p) => p.id === startPlan)?.id ?? initial.plans.find((p) => p.latest)?.id ?? initial.plans[0]?.id ?? null);
  const plan = t.plans.find((p) => p.id === planId) ?? null;
  const [pageId, setPageId] = useState<string | null>(plan?.pages[0]?.id ?? null);
  const page = plan?.pages.find((p) => p.id === pageId) ?? plan?.pages[0] ?? null;
  const [activeId, setActiveId] = useState<string | null>(initial.items[0]?.id ?? null);
  const active = t.items.find((i) => i.id === activeId) ?? null;
  const [mode, setMode] = useState<ToolMode>(initial.can.edit ? "measure" : "pan");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>({ z: 0.3, tx: 0, ty: 0 });
  const [undo, setUndo] = useState<Step[]>([]);
  const [redo, setRedo] = useState<Step[]>([]);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ kind: "ok" | "err" | "info"; text: string; href?: string } | null>(null);
  const [dialog, setDialog] = useState<null | "scale" | "item" | "quote" | "upload" | "export">(null);
  const [editItem, setEditItem] = useState<TakeoffItem | null>(null);
  const [scalePts, setScalePts] = useState<Pt[] | null>(null);
  const [hints, setHints] = useState<{ ratios: number[]; sheet: TakeoffPage["sheet"] }>({ ratios: [], sheet: null });
  const [loading, setLoading] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const viewer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<{ planId: string; doc: PDFDocumentProxy; bytes: ArrayBuffer } | null>(null);
  const queue = useRef<MarkOp[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef<Promise<void> | null>(null);
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragging = useRef<{ id: string; idx: number; before: Pt[] } | null>(null);
  const space = useRef(false);

  const pages = useMemo(() => new Map(t.plans.flatMap((p) => p.pages).map((p) => [p.id, p])), [t.plans]);
  const live = useMemo(() => marks.filter((m) => !m.removed), [marks]);
  const totals = useMemo(() => new Map(t.items.map((i) => [i.id, itemTotals(i, live, pages)])), [t.items, live, pages]);
  const canMeasure = t.can.edit && !!active && !!page;
  const scaled = !!page?.mm_per_unit;

  // ── Saving marks (batched) ──────────────────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    if (flushing.current) await flushing.current;
    if (queue.current.length === 0) return;
    const ops = queue.current.splice(0, queue.current.length);
    setStatus("saving");
    flushing.current = (async () => {
      const r = await takeoffMarksAction(t.job.id, ops);
      if (r.ok) {
        setStatus(queue.current.length ? "saving" : "saved");
      } else {
        setStatus("error");
        setNotice({ kind: "err", text: `Not saved: ${r.error} The takeoff has been reloaded.` });
        const fresh = await takeoffLoadAction(t.job.id);
        if (fresh.ok) {
          setT(fresh.data);
          setMarks(fresh.data.marks);
          setUndo([]);
          setRedo([]);
          setStatus("saved");
        }
      }
    })();
    await flushing.current;
    flushing.current = null;
    if (queue.current.length) void flush();
  }, [t.job.id]);

  const send = useCallback((ops: MarkOp[]) => {
    queue.current.push(...ops);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }, [flush]);

  const apply = useCallback((ops: MarkOp[]) => {
    setMarks((ms) => {
      let next = ms;
      for (const o of ops) {
        if (o.op === "add") next = [...next.filter((m) => m.id !== o.id), { id: o.id, item_id: o.item_id, page_id: o.page_id, points: o.points }];
        else next = next.map((m) => m.id !== o.id ? m
          : o.op === "move" ? { ...m, points: o.points } : { ...m, removed: o.op === "remove" });
      }
      return next;
    });
    send(ops);
  }, [send]);

  const doStep = useCallback((step: Step, first: MarkOp[]) => {
    apply(first);
    setUndo((u) => [...u.slice(-199), step]);
    setRedo([]);
  }, [apply]);

  const doUndo = useCallback(() => {
    const s = undo.at(-1);
    if (!s) return;
    apply(s.undo);
    setUndo((u) => u.slice(0, -1));
    setRedo((r) => [...r, s]);
    setNotice({ kind: "info", text: `Undone: ${s.label}` });
  }, [undo, apply]);
  const doRedo = useCallback(() => {
    const s = redo.at(-1);
    if (!s) return;
    apply(s.redo);
    setRedo((r) => r.slice(0, -1));
    setUndo((u) => [...u, s]);
    setNotice({ kind: "info", text: `Redone: ${s.label}` });
  }, [redo, apply]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue.current.length || flushing.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1100);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── The plan's PDF and the page image ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!plan || docRef.current?.planId === plan.id) return;
    let stop = false;
    setLoading("Opening the plans…");
    (async () => {
      try {
        const bytes = await fetchJobFile(plan.file_id, (d, all) =>
          !stop && setLoading(`Opening the plans… ${Math.round(d / 1048576)}${all ? ` of ${Math.round(all / 1048576)}` : ""} MB`));
        const doc = await openPdf(bytes);
        if (stop) return;
        await docRef.current?.doc.destroy();
        docRef.current = { planId: plan.id, doc, bytes };
        setLoading(null);
        setPageId((p) => (plan.pages.some((x) => x.id === p) ? p : plan.pages[0]?.id ?? null));
        setRenderKey((k) => k + 1);
      } catch (e) {
        if (!stop) setLoading(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [plan]);

  const [renderKey, setRenderKey] = useState(0);
  const fit = useCallback(() => {
    const el = viewer.current;
    if (!el || !page) return;
    const z = Math.min(el.clientWidth / page.width, el.clientHeight / page.height) * 0.97;
    setView({ z, tx: (el.clientWidth - page.width * z) / 2, ty: (el.clientHeight - page.height * z) / 2 });
  }, [page]);

  useEffect(() => {
    const d = docRef.current;
    if (!d || !page || !canvas.current || d.planId !== planId) return;
    let cancel: (() => void) | null = null;
    let stop = false;
    setRendering(true);
    (async () => {
      const p = await d.doc.getPage(page.page_no);
      if (stop) return;
      const r = renderPage(p, canvas.current!, RENDER_PX);
      cancel = r.cancel;
      fit();
      try {
        await r.done;
      } catch {
        /* cancelled */
      }
      if (!stop) setRendering(false);
      const h = readPageText(await pageText(p));
      if (!stop) setHints({ ratios: h.ratios, sheet: h.sheet });
    })();
    setDraft([]);
    setSelected(null);
    return () => {
      stop = true;
      cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, renderKey]);

  // ── Pointer → page units ──────────────────────────────────────────────────────────────────
  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const r = viewer.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.tx) / view.z, (e.clientY - r.top - view.ty) / view.z];
  };
  const round = (p: Pt): Pt => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

  const finishDraft = useCallback((pts: Pt[]) => {
    if (!active || !page) return;
    const need = active.tool === "length" ? 2 : 3;
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
    if (clean.length < need) {
      setNotice({ kind: "info", text: active.tool === "length" ? "A run needs at least two points." : "An area needs at least three points." });
      return;
    }
    const id = uuid();
    const q = markQty(active.tool, clean, page.mm_per_unit) ?? 0;
    doStep({ label: `${active.name} ${fmtQty(q, active.tool)} ${unitOf(active.tool, active.unit)}`,
      undo: [{ op: "remove", id }], redo: [{ op: "restore", id }] },
    [{ op: "add", id, item_id: active.id, page_id: page.id, points: clean.map(round) }]);
    setDraft([]);
  }, [active, page, doStep]);

  function onPointerDown(e: React.PointerEvent) {
    if (!page || loading) return;
    const panNow = e.button === 1 || space.current || mode === "pan" || (mode === "select" && e.target === e.currentTarget);
    if (panNow || e.button !== 0) {
      if (e.button === 2) return;
      panning.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const p = toPage(e);
    if (p[0] < 0 || p[1] < 0 || p[0] > page.width || p[1] > page.height) return;
    if (mode === "calibrate" || mode === "check") {
      const pts = [...(scalePts ?? []), p];
      if (pts.length === 2) {
        setScalePts(pts);
        setDialog("scale");
      } else setScalePts(pts);
      return;
    }
    if (mode !== "measure") return;
    if (!canMeasure) {
      setNotice({ kind: "info", text: t.can.edit ? "Pick or add an item on the right first." : "You can look but not change this takeoff." });
      return;
    }
    if (active!.tool !== "count" && !scaled) {
      setNotice({ kind: "err", text: "Set this page's scale before measuring lengths or areas." });
      setDialog("scale");
      return;
    }
    if (active!.tool === "count") {
      const id = uuid();
      doStep({ label: `${active!.name} marker`, undo: [{ op: "remove", id }], redo: [{ op: "restore", id }] },
        [{ op: "add", id, item_id: active!.id, page_id: page.id, points: [round(p)] }]);
      return;
    }
    if (e.detail >= 2) return;   // the double-click that finishes a run
    setDraft((d) => [...d, p]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panning.current) {
      const s = panning.current;
      setView((v) => ({ ...v, tx: s.tx + e.clientX - s.x, ty: s.ty + e.clientY - s.y }));
      return;
    }
    const p = toPage(e);
    if (dragging.current) {
      const d = dragging.current;
      setMarks((ms) => ms.map((m) => m.id === d.id ? { ...m, points: m.points.map((q, i) => (i === d.idx ? round(p) : q)) } : m));
      return;
    }
    if (mode === "measure" && draft.length) setCursor(p);
    else if ((mode === "calibrate" || mode === "check") && scalePts?.length === 1) setCursor(p);
    else if (cursor) setCursor(null);
  }

  function onPointerUp() {
    panning.current = null;
    const d = dragging.current;
    if (d) {
      dragging.current = null;
      const m = marks.find((x) => x.id === d.id);
      if (m && JSON.stringify(m.points) !== JSON.stringify(d.before)) {
        const it = t.items.find((i) => i.id === m.item_id);
        setUndo((u) => [...u, { label: `moved ${it?.name ?? "mark"}`, undo: [{ op: "move", id: m.id, points: d.before }],
          redo: [{ op: "move", id: m.id, points: m.points }] }]);
        setRedo([]);
        send([{ op: "move", id: m.id, points: m.points }]);
      }
    }
  }

  function onWheel(e: React.WheelEvent) {
    const r = viewer.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView((v) => {
      const z = Math.min(8, Math.max(0.05, v.z * Math.exp(-e.deltaY * 0.0015)));
      return { z, tx: mx - ((mx - v.tx) / v.z) * z, ty: my - ((my - v.ty) / v.z) * z };
    });
  }

  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const stopScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stopScroll, { passive: false });
    return () => el.removeEventListener("wheel", stopScroll);
  }, []);

  const removeMark = useCallback((id: string) => {
    const m = marks.find((x) => x.id === id);
    if (!m || !t.can.edit) return;
    const it = t.items.find((i) => i.id === m.item_id);
    doStep({ label: `removed ${it?.name ?? "mark"}`, undo: [{ op: "restore", id }], redo: [{ op: "remove", id }] }, [{ op: "remove", id }]);
    setSelected(null);
  }, [marks, t, doStep]);

  // keyboard: Esc, Enter, Backspace/Delete, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Space (hold to pan), F (fit)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (dialog) return;
      if (e.key === " ") {
        space.current = true;
        e.preventDefault();
      } else if (e.key === "Escape") {
        setDraft([]);
        setScalePts(null);
        setSelected(null);
        if (mode === "calibrate" || mode === "check") setMode("measure");
      } else if (e.key === "Enter" && draft.length) {
        finishDraft(draft);
      } else if ((e.key === "Backspace" || e.key === "Delete") && draft.length) {
        setDraft((d) => d.slice(0, -1));
      } else if ((e.key === "Backspace" || e.key === "Delete") && selected) {
        removeMark(selected);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        fit();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [dialog, draft, selected, mode, finishDraft, removeMark, doUndo, doRedo, fit]);

  // ── Server round trips for items, scale, plans ────────────────────────────────────────────
  async function reload(next?: Takeoff) {
    await flush();
    const r = next ? { ok: true as const, data: next } : await takeoffLoadAction(t.job.id);
    if (r.ok) {
      setT(r.data);
      setMarks((ms) => {
        const server = new Map(r.data.marks.map((m) => [m.id, m]));
        // keep local removed marks (undo can bring them back); everything else as the server has it
        return [...r.data.marks, ...ms.filter((m) => m.removed && !server.has(m.id))];
      });
    } else setNotice({ kind: "err", text: r.error });
    return r.ok ? r.data : null;
  }

  async function saveItem(itemId: string | null, changes: Record<string, unknown>) {
    await flush();
    const r = await takeoffItemAction(t.job.id, itemId, changes);
    if (!r.ok) {
      setNotice({ kind: "err", text: r.error });
      return false;
    }
    const before = new Set(t.items.map((i) => i.id));
    await reload(r.data);
    if (itemId === null) {
      const added = r.data.items.find((i) => !before.has(i.id));
      if (added) {
        setActiveId(added.id);
        setMode("measure");
        setNotice({ kind: "ok", text: `${added.name} added: click the plan to ${added.tool === "count" ? "count each one" : added.tool === "length" ? "trace each run" : "outline the area"}.` });
      }
    }
    return true;
  }

  async function saveScale(change: Parameters<typeof takeoffScaleAction>[1], message: string) {
    if (!page) return false;
    const r = await takeoffScaleAction(page.id, change);
    if (!r.ok) {
      setNotice({ kind: "err", text: r.error });
      return false;
    }
    await reload();
    setNotice({ kind: "ok", text: message });
    return true;
  }

  async function exportPdf(share: boolean) {
    if (!plan || !docRef.current) return;
    await flush();
    setNotice({ kind: "info", text: share ? "Making the marked-up PDF and sharing it…" : "Making the marked-up PDF…" });
    try {
      const bytes = await markedUpPdf(docRef.current.bytes.slice(0), plan, t, live);
      const name = `${t.job.ref} ${plan.name} Rev ${plan.revision} - takeoff marked up.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      if (!share) {
        download(bytes, name, "application/pdf");
        setNotice({ kind: "ok", text: "Marked-up PDF downloaded." });
        return;
      }
      const up = await takeoffUploadUrlAction(t.job.id, name);
      if (!up.ok) throw new Error(up.error);
      const put = await fetch(up.data.url, { method: "PUT", body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error(`Couldn't upload it (${put.status}).`);
      const r = await takeoffShareAction(t.job.id, plan.id, up.data.path, name, bytes.length);
      if (!r.ok) throw new Error(r.error);
      await reload();
      setNotice({ kind: "ok", text: `${r.data.message}. Plumbers booked on the job can open it in the app (read only).` });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function removePlan() {
    if (!plan || !confirm(`Remove ${plan.name} Rev ${plan.revision} from the takeoff? Its marks stop counting (the PDF stays in the job's files).`)) return;
    const r = await takeoffRemovePlanAction(plan.id);
    if (!r.ok) return setNotice({ kind: "err", text: r.error });
    docRef.current = null;
    const next = await reload();
    setPlanId(next?.plans[0]?.id ?? null);
    setPageId(next?.plans[0]?.pages[0]?.id ?? null);
    setNotice({ kind: "ok", text: r.data.message });
  }

  // ── Drawing ───────────────────────────────────────────────────────────────────────────────
  const items = new Map(t.items.map((i) => [i.id, i]));
  const onThisPage = page ? live.filter((m) => m.page_id === page.id && items.get(m.item_id) && !items.get(m.item_id)!.hidden) : [];
  const px = 1 / view.z;   // one screen pixel in page units
  const numbering = new Map<string, number>();
  const pageQty = (it: TakeoffItem) => (page ? totals.get(it.id)?.perPage[page.id] : undefined);

  const draftLen = page?.mm_per_unit && draft.length
    ? (runLength(cursor ? [...draft, cursor] : draft) * page.mm_per_unit) / 1000 : null;

  const groups = t.groups.filter((g) => t.items.some((i) => i.group === g));
  const totalSell = t.can.costs
    ? t.items.reduce((s, i) => s + (i.unit_sell ?? 0) * (totals.get(i.id)?.quantity ?? 0), 0) : null;

  if (narrow) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-white p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="font-semibold">The takeoff is made for a desktop or laptop screen.</p>
          <p className="text-sm text-slate">Open this job on a computer (at least 1100 pixels wide) to measure plans.</p>
          <Link href={`${jobPath}?tab=takeoff`} className="inline-block rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Back to the job</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white text-ink" data-testid="takeoff-editor">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2">
        <Link href={`${jobPath}?tab=takeoff`} className="rounded-full bg-mist px-3 py-1.5 text-xs font-semibold" onClick={() => void flush()}>
          ← {t.job.ref}
        </Link>
        <span className="truncate text-sm font-semibold">Takeoff{t.job.title ? ` · ${t.job.title}` : ""}</span>
        {testSite && <span className="rounded bg-red-200 px-2 py-0.5 text-xs font-bold text-red-950">TEST SITE</span>}
        <div className="ml-3 flex items-center gap-1" role="toolbar" aria-label="Tools">
          <ToolBtn on={mode === "select"} onClick={() => setMode("select")} title="Select a mark to move its points or delete it (drag empty space to pan)">Select</ToolBtn>
          <ToolBtn on={mode === "pan"} onClick={() => setMode("pan")} title="Pan (or hold Space, or drag with the middle button)">Pan</ToolBtn>
          {t.can.edit && (
            <ToolBtn on={mode === "measure"} onClick={() => setMode("measure")} disabled={!active}
              title={active ? `Measure ${active.name}` : "Pick an item first"}>
              {active ? `${active.tool === "count" ? "Count" : active.tool === "length" ? "Length" : "Area"}: ${active.name.slice(0, 22)}` : "Measure"}
            </ToolBtn>
          )}
        </div>
        <div className="ml-2 flex items-center gap-1">
          <button type="button" className={`${btn} bg-mist`} onClick={() => setView((v) => ({ ...v, z: v.z / 1.25 }))} aria-label="Zoom out">−</button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(view.z * 100)}%</span>
          <button type="button" className={`${btn} bg-mist`} onClick={() => setView((v) => ({ ...v, z: v.z * 1.25 }))} aria-label="Zoom in">+</button>
          <button type="button" className={`${btn} bg-mist`} onClick={fit} title="Fit the page (F)">Fit</button>
        </div>
        {t.can.edit && (
          <div className="ml-2 flex items-center gap-1">
            <button type="button" className={`${btn} bg-mist`} disabled={!undo.length} onClick={doUndo} title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" className={`${btn} bg-mist`} disabled={!redo.length} onClick={doRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          </div>
        )}
        <span className={`ml-2 text-xs ${status === "error" ? "font-semibold text-red-700" : "text-slate"}`} role="status" data-testid="save-status">
          {status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "All changes saved"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={`${btn} bg-mist`} onClick={() => setDialog("export")} disabled={!plan}>Export</button>
          {t.can.quote && (
            <button type="button" className={`${btn} bg-ink text-white`} onClick={async () => {
              await flush();
              await reload();
              setDialog("quote");
            }} disabled={!t.items.length} data-testid="send-to-quote">Send to quote</button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-3 px-4 py-1.5 text-sm ${notice.kind === "err" ? "bg-red-50 text-red-800" : notice.kind === "ok" ? "bg-green-50 text-green-900" : "bg-aqua-pale/60"}`}
          role={notice.kind === "err" ? "alert" : "status"} data-testid="takeoff-notice">
          <span>{notice.text}</span>
          {notice.href && <Link href={notice.href} className="font-semibold underline">Open the quote →</Link>}
          <button type="button" className="ml-auto text-xs font-semibold" onClick={() => setNotice(null)}>Close</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* plans and pages */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-black/10 bg-mist/60" aria-label="Plans and pages">
          <div className="space-y-2 border-b border-black/10 p-2">
            {t.plans.length > 0 ? (
              <select aria-label="Plan set" value={planId ?? ""} onChange={async (e) => {
                await flush();
                setPlanId(e.target.value);
              }} className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs">
                {t.plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · Rev {p.revision}{p.latest ? "" : " (older)"}</option>
                ))}
              </select>
            ) : <p className="text-xs text-slate">No plans yet.</p>}
            {t.can.edit && (
              <div className="flex gap-1">
                <button type="button" className={`${btn} flex-1 bg-white`} onClick={() => setDialog("upload")}>Add plans</button>
                {plan && <button type="button" className={`${btn} bg-white text-red-700`} onClick={removePlan} title="Remove this plan set from the takeoff">Remove</button>}
              </div>
            )}
          </div>
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" data-testid="page-list">
            {plan?.pages.map((p) => {
              const n = live.filter((m) => m.page_id === p.id).length;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setPageId(p.id)} aria-current={p.id === page?.id ? "page" : undefined}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${p.id === page?.id ? "bg-ink text-white" : "bg-white hover:bg-aqua-pale/50"}`}>
                    <span className="block font-semibold">Page {p.page_no}{p.label ? ` · ${p.label}` : ""}</span>
                    <span className={`block ${p.id === page?.id ? "text-white/80" : p.mm_per_unit ? (p.checked ? "text-green-700" : "text-amber-700") : "text-slate"}`}>
                      {scaleText(p)}{p.mm_per_unit && !p.checked ? " · check a dimension" : ""}{n ? ` · ${n} marks` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* the page */}
        <div className="relative min-w-0 flex-1 bg-[#e7ebef]">
          {page && t.can.edit && (
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs shadow">
              <span className={`font-semibold ${scaled ? (page.checked ? "text-green-700" : "text-amber-700") : "text-red-700"}`} data-testid="page-scale">
                {scaleText(page)}
              </span>
              {scaled && !page.checked && <span className="text-amber-700">Scale off the drawing with caution: check a dimension</span>}
              <button type="button" className={`${btn} bg-mist`} onClick={() => {
                setScalePts(null);
                setDialog("scale");
              }}>{scaled ? "Change scale" : "Set scale"}</button>
              {scaled && (
                <button type="button" className={`${btn} ${mode === "check" ? "bg-ink text-white" : "bg-mist"}`} onClick={() => {
                  setScalePts([]);
                  setMode("check");
                  setNotice({ kind: "info", text: "Click both ends of a dimension written on the drawing." });
                }}>Check a dimension</button>
              )}
            </div>
          )}
          {(mode === "calibrate" || mode === "check") && (
            <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow">
              {mode === "calibrate" ? "Calibrate:" : "Check:"} click {scalePts?.length ? "the second point" : "the first point"} of a known length (Esc to stop)
            </div>
          )}
          {mode === "measure" && draft.length > 0 && (
            <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow">
              {active?.tool === "length" ? `Run ${draftLen !== null ? `${draftLen.toFixed(2)} m` : ""}` : `${draft.length} points`} ·
              double-click or Enter to finish · Backspace removes the last point · Esc cancels
            </div>
          )}
          <div ref={viewer} className="absolute inset-0 overflow-hidden"
            style={{ cursor: panning.current ? "grabbing" : mode === "pan" ? "grab" : mode === "select" ? "default" : "crosshair", touchAction: "none" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setCursor(null)}
            onWheel={onWheel}
            onDoubleClick={() => mode === "measure" && draft.length && finishDraft(draft)}
            onContextMenu={(e) => e.preventDefault()} data-testid="takeoff-viewer">
            {page && (
              <div style={{ position: "absolute", left: 0, top: 0, width: page.width, height: page.height, transformOrigin: "0 0",
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})` }}>
                <canvas ref={canvas} style={{ width: page.width, height: page.height, display: "block", background: "#fff",
                  boxShadow: "0 2px 12px rgba(0,0,0,.15)", pointerEvents: "none" }} />
                <svg width={page.width} height={page.height} viewBox={`0 0 ${page.width} ${page.height}`}
                  style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} data-testid="takeoff-marks">
                  {onThisPage.map((m) => {
                    const it = items.get(m.item_id)!;
                    const sel = m.id === selected;
                    const hit = mode === "select" ? "auto" : "none";
                    const pick = (e: React.PointerEvent) => {
                      if (mode !== "select") return;
                      e.stopPropagation();
                      setSelected(m.id);
                    };
                    if (it.tool === "count") {
                      const n = (numbering.get(it.id) ?? 0) + 1;
                      numbering.set(it.id, n);
                      return (
                        <g key={m.id} style={{ pointerEvents: hit }} onPointerDown={pick} data-item={it.id}>
                          <circle cx={m.points[0][0]} cy={m.points[0][1]} r={9 * px} fill={it.colour} fillOpacity={0.85}
                            stroke={sel ? "#000" : "#fff"} strokeWidth={(sel ? 3 : 1.5) * px} />
                          <text x={m.points[0][0]} y={m.points[0][1] + 3.5 * px} fontSize={10 * px} textAnchor="middle" fill="#fff"
                            fontWeight={700} style={{ pointerEvents: "none" }}>{n}</text>
                        </g>
                      );
                    }
                    const pts = m.points.map((q) => q.join(",")).join(" ");
                    const q = markQty(it.tool, m.points, page.mm_per_unit);
                    const end = m.points[m.points.length - 1];
                    return (
                      <g key={m.id} style={{ pointerEvents: hit }} onPointerDown={pick} data-item={it.id}>
                        {it.tool === "area"
                          ? <polygon points={pts} fill={it.colour} fillOpacity={0.18} stroke={it.colour} strokeWidth={(sel ? 4 : 2.5) * px} />
                          : <polyline points={pts} fill="none" stroke={it.colour} strokeWidth={(sel ? 5 : 3) * px} strokeOpacity={0.9}
                              strokeLinejoin="round" strokeLinecap="round" />}
                        {/* a wide invisible line makes it easier to click */}
                        {mode === "select" && <polyline points={it.tool === "area" ? `${pts} ${m.points[0].join(",")}` : pts} fill="none"
                          stroke="transparent" strokeWidth={12 * px} />}
                        {(sel || view.z > 0.6) && q !== null && (
                          <text x={end[0] + 6 * px} y={end[1] - 6 * px} fontSize={11 * px} fill={it.colour} fontWeight={700}
                            stroke="#fff" strokeWidth={3 * px} paintOrder="stroke">
                            {fmtQty(q, it.tool)} {unitOf(it.tool, it.unit)}
                          </text>
                        )}
                        {sel && t.can.edit && m.points.map((pt, i) => (
                          <rect key={i} x={pt[0] - 5 * px} y={pt[1] - 5 * px} width={10 * px} height={10 * px} fill="#fff" stroke="#000"
                            strokeWidth={1.5 * px} style={{ cursor: "move", pointerEvents: "auto" }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              dragging.current = { id: m.id, idx: i, before: m.points };
                              viewer.current?.setPointerCapture(e.pointerId);
                            }} />
                        ))}
                      </g>
                    );
                  })}
                  {/* the run being drawn */}
                  {draft.length > 0 && active && (
                    <g>
                      <polyline points={[...draft, ...(cursor ? [cursor] : [])].map((q) => q.join(",")).join(" ")}
                        fill={active.tool === "area" ? active.colour : "none"} fillOpacity={0.12}
                        stroke={active.colour} strokeWidth={3 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
                      {draft.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3.5 * px} fill={active.colour} />)}
                    </g>
                  )}
                  {/* calibrate / check points */}
                  {scalePts && scalePts.length > 0 && (
                    <g>
                      <polyline points={[...scalePts, ...(cursor && scalePts.length === 1 ? [cursor] : [])].map((q) => q.join(",")).join(" ")}
                        fill="none" stroke="#0f172a" strokeWidth={2 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
                      {scalePts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={5 * px} fill="none" stroke="#0f172a" strokeWidth={2 * px} />)}
                    </g>
                  )}
                </svg>
              </div>
            )}
            {!plan && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="max-w-sm space-y-3 rounded-2xl bg-white p-6 text-center shadow">
                  <p className="font-semibold">No plans on this takeoff yet.</p>
                  <p className="text-sm text-slate">Add the PDF plan set from the builder or designer. Each page gets its own scale.</p>
                  {t.can.edit && <button type="button" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" onClick={() => setDialog("upload")}>Add plans</button>}
                </div>
              </div>
            )}
            {(loading || rendering) && plan && (
              <div className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs shadow" role="status">{loading ?? "Drawing the page…"}</div>
            )}
          </div>
        </div>

        {/* items (the legend) */}
        <aside className="flex w-[22rem] shrink-0 flex-col border-l border-black/10" aria-label="Items being taken off">
          <div className="flex items-center justify-between border-b border-black/10 p-2">
            <h2 className="text-sm font-semibold">Items</h2>
            {t.can.edit && (
              <button type="button" className={`${btn} bg-ink text-white`} onClick={() => {
                setEditItem(null);
                setDialog("item");
              }} data-testid="add-item">+ Add item</button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="item-list">
            {t.items.length === 0 && (
              <p className="p-2 text-xs text-slate">
                Add what you&apos;re taking off: a fixture favourite (one click on the plan brings in its 1st-fix lines and labour),
                a price book item or just a name. Pick it, then click the plan.
              </p>
            )}
            {groups.map((g) => (
              <section key={g} className="mb-3">
                <h3 className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-slate">{g}</h3>
                <ul className="space-y-1">
                  {t.items.filter((i) => i.group === g).map((i) => {
                    const tot = totals.get(i.id);
                    const pq = pageQty(i);
                    const on = i.id === activeId;
                    return (
                      <li key={i.id} className={`rounded-xl border ${on ? "border-ink bg-aqua-pale/40" : "border-black/5 bg-white"} p-2`} data-testid="item-row">
                        <div className="flex items-start gap-2">
                          <button type="button" className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ background: i.colour }}
                            onClick={() => {
                              setActiveId(i.id);
                              if (t.can.edit) setMode("measure");
                            }} aria-label={`Measure ${i.name}`} />
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
                            setActiveId(i.id);
                            if (t.can.edit) setMode("measure");
                          }}>
                            <span className={`block truncate text-sm font-semibold ${i.hidden ? "text-slate line-through" : ""}`}>{i.name}</span>
                            <span className="block text-xs text-slate">
                              {i.tool === "count" ? "Count" : i.tool === "length" ? "Length" : "Area"}
                              {i.source === "favourite" ? " · favourite" : i.source === "price_book" ? ` · ${i.code ?? "price book"}` : ""}
                              {i.waste_pct ? ` · +${i.waste_pct}% waste` : ""}
                              {i.tool === "length" && i.extra_m_per_run ? ` · +${i.extra_m_per_run} m a run` : ""}
                              {i.labour_item_id && i.labour_hours_per_unit ? ` · ${i.labour_hours_per_unit} h ${i.labour_name ?? "labour"} per ${unitOf(i.tool, i.unit)}` : ""}
                            </span>
                          </button>
                          <div className="text-right">
                            <span className="block text-sm font-bold tabular-nums" data-testid="item-qty">
                              {fmtQty(tot?.quantity ?? 0, i.tool)} {unitOf(i.tool, i.unit)}
                            </span>
                            {pq && <span className="block text-xs text-slate">this page {fmtQty(i.tool === "count" ? pq.marks : pq.measured, i.tool)}</span>}
                            {t.can.costs && i.unit_sell != null && tot && (
                              <span className="block text-xs text-slate">≈ {money(i.unit_sell * tot.quantity)}</span>
                            )}
                          </div>
                        </div>
                        {(tot?.unscaled ?? 0) > 0 && (
                          <p className="mt-1 text-xs font-medium text-red-700">{tot!.unscaled} not measured: their page has no scale</p>
                        )}
                        {t.can.edit && on && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <button type="button" className={`${btn} bg-mist`} onClick={() => {
                              setEditItem(i);
                              setDialog("item");
                            }}>Edit</button>
                            <button type="button" className={`${btn} bg-mist`} onClick={() => saveItem(i.id, { hidden: !i.hidden })}>{i.hidden ? "Show" : "Hide"}</button>
                            <button type="button" className={`${btn} bg-mist`} onClick={() => saveItem(i.id, { move: "up" })} aria-label="Move up">↑</button>
                            <button type="button" className={`${btn} bg-mist`} onClick={() => saveItem(i.id, { move: "down" })} aria-label="Move down">↓</button>
                            <button type="button" className={`${btn} bg-mist text-red-700`} onClick={() => {
                              if (confirm(`Remove ${i.name} and its ${tot?.measured ? "marks" : "item"} from the takeoff?`)) void saveItem(i.id, { remove: true });
                            }}>Remove</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          {totalSell !== null && t.items.length > 0 && (
            <div className="border-t border-black/10 p-2 text-xs text-slate">
              Rough sell from the takeoff (excl GST, at the customer&apos;s tier): <span className="font-semibold text-ink">{money(totalSell)}</span>.
              Typed items have no price until they&apos;re priced on the quote.
            </div>
          )}
          {!t.can.edit && (
            <p className="border-t border-black/10 p-2 text-xs text-slate">
              You can look at this takeoff. To change it you need &quot;Can do takeoffs&quot; (Settings → Staff).
            </p>
          )}
        </aside>
      </div>

      {dialog === "item" && (
        <ItemForm takeoff={t} item={editItem} onClose={() => setDialog(null)} onSave={async (changes) => {
          const ok = await saveItem(editItem?.id ?? null, changes);
          if (ok) setDialog(null);
          return ok;
        }} />
      )}
      {dialog === "scale" && page && (
        <ScaleDialog page={page} hints={hints} points={scalePts} mode={mode} onClose={() => {
          setDialog(null);
          setScalePts(null);
          if (mode === "calibrate" || mode === "check") setMode("measure");
        }}
          onCalibrateStart={() => {
            setDialog(null);
            setScalePts([]);
            setMode("calibrate");
          }}
          onSave={async (change, message) => {
            const ok = await saveScale(change, message);
            if (ok) {
              setDialog(null);
              setScalePts(null);
              if ("method" in change && change.method === "ratio") {
                setScalePts([]);
                setMode("check");
                setNotice({ kind: "info", text: "Scale set from the ratio. Now check it: click both ends of a dimension written on the drawing." });
              } else setMode("measure");
            }
            return ok;
          }} />
      )}
      {dialog === "quote" && (
        <SendToQuote takeoff={t} totals={totals} onClose={() => setDialog(null)} onSend={async (versionId) => {
          await flush();
          const r = await takeoffToQuoteAction(t.job.id, versionId);
          if (!r.ok) return r.error;
          setDialog(null);
          await reload();
          setNotice({ kind: "ok", text: r.data.message, href: r.data.href });
          return null;
        }} />
      )}
      {dialog === "upload" && (
        <Modal title="Add plans" onClose={() => setDialog(null)}>
          <PlanUpload jobId={t.job.id} names={[...new Set(t.plans.map((p) => p.name))]} onDone={async (id, message) => {
            setDialog(null);
            const next = await reload();
            const pl = next?.plans.find((p) => p.id === id);
            if (pl) {
              setPlanId(pl.id);
              setPageId(pl.pages[0]?.id ?? null);
            }
            setNotice({ kind: "ok", text: `${message}. Set each page's scale before measuring lengths.` });
          }} />
        </Modal>
      )}
      {dialog === "export" && plan && (
        <Modal title="Export" onClose={() => setDialog(null)}>
          <div className="space-y-3 text-sm">
            <ExportRow title="Takeoff summary (CSV)" text="Every item with its quantity, and per page. Opens in Excel."
              action="Download" onClick={() => {
                download(csvFor(t), `${t.job.ref} takeoff summary.csv`, "text/csv");
                setDialog(null);
              }} />
            <ExportRow title={`Marked-up plans: ${plan.name} Rev ${plan.revision} (PDF)`}
              text="The plan set with every mark drawn on, a legend on each marked page and a summary page. To print or send."
              action="Download" onClick={() => {
                setDialog(null);
                void exportPdf(false);
              }} />
            {t.can.edit && (
              <ExportRow title="Share with plumbers"
                text={`Puts the marked-up PDF in the job's files so plumbers booked on the job can open it in the app (read only).${plan.shared_at ? ` Last shared ${new Date(plan.shared_at).toLocaleString("en-NZ")}; sharing again replaces it.` : ""}`}
                action={plan.shared_at ? "Share again" : "Share"} onClick={() => {
                  setDialog(null);
                  void exportPdf(true);
                }} />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ToolBtn({ on, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button type="button" aria-pressed={on} className={`${btn} ${on ? "bg-ink text-white" : "bg-mist hover:bg-aqua-pale"}`} {...rest}>
      {children}
    </button>
  );
}

function ExportRow({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-black/10 p-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-slate">{text}</p>
      </div>
      <button type="button" className={`${btn} shrink-0 bg-ink text-white`} onClick={onClick}>{action}</button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type Totals = Map<string, ReturnType<typeof itemTotals>>;
export type { TakeoffPlan };
