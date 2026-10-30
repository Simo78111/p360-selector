"use client";
// The diary (schedule board), modelled on Fergus's Calendar.
//   * A row per person (a column when Vertical) plus Unassigned at the top; Day and Week views.
//   * Day view: bookings sit at their real times (15-minute steps). Drag on an empty spot to book, drag a booking to
//     move it (to another person or time), drag its right/bottom edge to change the length.
//   * Week view: a cell per person per day; drag a booking to another day or person (times stay the same).
//   * "To schedule" list: drag a phase onto someone (books 7:30 AM for 7.5 hours, or where you drop it in Day view).
//   * Click a booking to change it by keyboard: person, times, note, add another person, remove, job colour.
//   * "Schedule not sent" on a person until their changes are sent; Send schedule = an app notification.
//   * The Plumbing 360 booking engine's appointments show greyed and can't be moved (its own scheduler books them).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  removeBookingAction,
  saveBookingAction,
  sendScheduleAction,
  setColourAction,
  type BookingInput,
  type DiaryResult,
} from "@/app/dashboard/diary-actions";
import {
  addDays,
  dayLabel,
  DEFAULT_LENGTH_MIN,
  DEFAULT_START_MIN,
  hourLabel,
  lengthLabel,
  nzInstant,
  nzParts,
  snap,
  SLOT_MIN,
  timeLabel,
  type Diary,
  type DiaryAppointment,
  type DiaryBooking,
  type DiaryPerson,
  type DiaryPhase,
} from "@/lib/diary-shared";

type View = "day" | "week";
type Orientation = "horizontal" | "vertical";
type Props = {
  diary: Diary; phases: DiaryPhase[]; date: string; view: View; orientation: Orientation; companyCode: string;
  personFilter: string; today: string;
};
type Lane = { id: string; person: DiaryPerson | null };
type Item =
  | { kind: "booking"; b: DiaryBooking; start: number; end: number; day: string }
  | { kind: "appt"; a: DiaryAppointment; start: number; end: number; day: string };
type Placed = Item & { track: number; tracks: number };

const UNASSIGNED = "unassigned";
const AXIS_START = 5 * 60; // 5 am
const AXIS_END = 20 * 60; // 8 pm
const HOUR_H = 92; // px per hour, horizontal day view
const HOUR_V = 60; // px per hour, vertical day view
const TRACK_H = 92; // height of one booking row in a horizontal lane
const LANE_W = 200; // width of a lane column (vertical)
const LABEL_W = 210; // staff column (horizontal)
const DAY_W = 196; // week view: width of a day (horizontal)
const CARD_H = 82; // week view: height of a card
const AVATAR = ["#8b5cf6", "#9d6b7d", "#6875c9", "#5a8f9a", "#7a9d4a", "#c08a3e", "#c26a5c", "#4f86c6", "#a08c55", "#5aa77a"];
const COLOURS = ["#e3dcf2", "#e6d6dc", "#dcdff4", "#d3e3e6", "#dfeccf", "#f6e3c8", "#f3d9d4", "#d6e6f5", "#e9e2cf", "#d9eedf"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const avatarColour = (id: string) => AVATAR[Math.abs(hash(id)) % AVATAR.length];
const darker = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.62)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
};

/** Minutes of this booking on this day (clipped to the day for multi-day bookings). */
function onDay(startIso: string, endIso: string, day: string): { start: number; end: number } | null {
  const s = nzParts(startIso);
  const e = nzParts(new Date(Date.parse(endIso) - 1000)); // last second, so 3 pm–midnight stays on its day
  if (day < s.date || day > e.date) return null;
  const start = day === s.date ? s.min : 0;
  const end = day === e.date ? nzParts(endIso).date === day ? nzParts(endIso).min : 24 * 60 : 24 * 60;
  return { start, end: Math.max(end, start + SLOT_MIN) };
}

/** Side-by-side tracks for overlapping items. */
function placeTracks(items: Item[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const ends: number[] = [];
  const placed = sorted.map((it) => {
    let t = ends.findIndex((e) => e <= it.start);
    if (t < 0) t = ends.length;
    ends[t] = it.end;
    return { ...it, track: t, tracks: 0 };
  });
  return placed.map((p) => ({ ...p, tracks: Math.max(1, ends.length) }));
}

const minutesOptions = (from = 0, to = 24 * 60) => {
  const out: number[] = [];
  for (let m = from; m <= to; m += SLOT_MIN) out.push(m);
  return out;
};

export function DiaryBoard({ diary, phases, date, view, orientation, companyCode, personFilter, today }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(null);
  const [dialog, setDialog] = useState<
    | { mode: "edit"; booking: DiaryBooking }
    | { mode: "new"; phaseId: string | null; lane: string; day: string; start: number; end: number }
    | null
  >(null);
  const [panel, setPanel] = useState(true);
  const [phaseSearch, setPhaseSearch] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const horizontal = orientation === "horizontal";
  const canBookAny = diary.companies.some((c) => c.can_book);
  const days = useMemo(() => Array.from({ length: diary.days }, (_, i) => addDays(diary.from, i)), [diary.from, diary.days]);

  // ── navigation ───────────────────────────────────────────────────────────
  const url = (changes: Record<string, string>) => {
    const p = new URLSearchParams({
      d: date, v: view, o: horizontal ? "h" : "v", ...(companyCode ? { co: companyCode } : {}), ...(personFilter ? { p: personFilter } : {}),
    });
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/dashboard/office/diary?${p}`;
  };
  const go = (changes: Record<string, string>) => router.push(url(changes));

  // ── lanes (Unassigned + people, filtered) ────────────────────────────────
  const lanes: Lane[] = useMemo(() => {
    const people = diary.people.filter((p) => !personFilter || p.plumber_id === personFilter);
    return [...(personFilter ? [] : [{ id: UNASSIGNED, person: null }]), ...people.map((p) => ({ id: p.plumber_id, person: p }))];
  }, [diary.people, personFilter]);
  const peopleById = useMemo(() => new Map(diary.people.map((p) => [p.plumber_id, p])), [diary.people]);
  const companyByCode = useMemo(() => new Map(diary.companies.map((c) => [c.code, c])), [diary.companies]);
  const totalNotSent =
    diary.people.reduce((n, p) => n + Number(p.not_sent), 0) + Object.values(diary.removed_unsent).reduce((n, v) => n + Number(v), 0);

  // ── items per lane per day ───────────────────────────────────────────────
  const itemsFor = (laneId: string, day: string): Item[] => {
    const out: Item[] = [];
    for (const b of diary.bookings) {
      if ((b.plumber_id ?? UNASSIGNED) !== laneId) continue;
      const r = onDay(b.starts_at, b.ends_at, day);
      if (r) out.push({ kind: "booking", b, ...r, day });
    }
    for (const a of diary.appointments) {
      if (a.plumber_id !== laneId) continue;
      const r = onDay(a.starts_at, a.ends_at, day);
      if (r) out.push({ kind: "appt", a, ...r, day });
    }
    return out;
  };

  // Day view geometry
  const hourPx = horizontal ? HOUR_H : HOUR_V;
  const axisLen = ((AXIS_END - AXIS_START) / 60) * hourPx;
  const toPx = (min: number) => ((Math.min(Math.max(min, AXIS_START), AXIS_END) - AXIS_START) / 60) * hourPx;
  const dayPlaced = useMemo(
    () => (view === "day" ? new Map(lanes.map((l) => [l.id, placeTracks(itemsFor(l.id, date))])) : new Map<string, Placed[]>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diary, lanes, view, date],
  );
  // Week view: cards per lane per day; vertical needs the same row height for a day across people
  const weekCells = useMemo(() => {
    const m = new Map<string, Item[]>();
    if (view === "week") for (const l of lanes) for (const d of days) m.set(`${l.id}|${d}`, itemsFor(l.id, d).sort((a, b) => a.start - b.start));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary, lanes, view, days]);
  const weekStack = (laneId: string) => Math.max(1, ...days.map((d) => weekCells.get(`${laneId}|${d}`)?.length ?? 0));
  const weekDayStack = (d: string) => Math.max(1, ...lanes.map((l) => weekCells.get(`${l.id}|${d}`)?.length ?? 0));

  // Scroll a day view to 7 am
  useEffect(() => {
    const el = scroller.current;
    if (!el || view !== "day") return;
    const px = ((7 * 60 - AXIS_START) / 60) * hourPx;
    if (horizontal) el.scrollLeft = px;
    else el.scrollTop = px;
  }, [view, horizontal, hourPx, date]);

  // ── saving ───────────────────────────────────────────────────────────────
  const run = (fn: () => Promise<DiaryResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setToast({ ok: true, text: r.message ?? "Saved.", warnings: r.warnings });
        after?.();
        router.refresh();
      } else setToast({ ok: false, text: r.error });
    });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.warnings?.length || !toast.ok ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const save = (b: BookingInput, after?: () => void) => run(() => saveBookingAction(b), after);
  const canEditCompany = (code: string | undefined) => !!code && !!companyByCode.get(code)?.can_book;

  // ── pointer: create, move, resize ────────────────────────────────────────
  type Drag =
    | { kind: "create"; lane: string; day: string; anchor: number; cur: number; moved: boolean }
    | { kind: "move"; b: DiaryBooking; x0: number; y0: number; dx: number; dy: number; t0: number | null; day0: string; moved: boolean }
    | { kind: "resize"; b: DiaryBooking; lane: string; day: string; end: number };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  /** Minutes at the pointer within a lane track (day view). */
  const minAt = (track: Element, e: { clientX: number; clientY: number }) => {
    const r = track.getBoundingClientRect();
    const off = horizontal ? e.clientX - r.left : e.clientY - r.top;
    return Math.min(AXIS_END, Math.max(AXIS_START, AXIS_START + (off / hourPx) * 60));
  };
  /** The lane cell under the pointer. */
  const cellAt = (e: { clientX: number; clientY: number }) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-lane]");
    return el ? { el, lane: el.dataset.lane!, day: el.dataset.day! } : null;
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "create") {
        const cell = document.querySelector(`[data-lane="${d.lane}"][data-day="${d.day}"]`);
        if (cell) setD({ ...d, cur: minAt(cell, e), moved: true });
      } else if (d.kind === "move") {
        const dx = e.clientX - d.x0;
        const dy = e.clientY - d.y0;
        setD({ ...d, dx, dy, moved: d.moved || Math.abs(dx) + Math.abs(dy) > 5 });
      } else if (d.kind === "resize") {
        const cell = document.querySelector(`[data-lane="${d.lane}"][data-day="${d.day}"]`);
        if (cell) setD({ ...d, end: Math.max(snap(minAt(cell, e)), (onDay(d.b.starts_at, d.b.ends_at, d.day)?.start ?? 0) + SLOT_MIN) });
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setD(null);
      if (!d) return;
      if (d.kind === "create") {
        let a = snap(d.anchor);
        let b = snap(d.cur);
        if (!d.moved || Math.abs(b - a) < SLOT_MIN) {
          a = snap(d.anchor);
          b = Math.min(24 * 60, a + DEFAULT_LENGTH_MIN);
        }
        if (b < a) [a, b] = [b, a];
        setDialog({ mode: "new", phaseId: null, lane: d.lane, day: d.day, start: a, end: b });
      } else if (d.kind === "move") {
        if (!d.moved) {
          setDialog({ mode: "edit", booking: d.b });
          return;
        }
        const cell = cellAt(e);
        if (!cell) return;
        const plumber = cell.lane === UNASSIGNED ? null : cell.lane;
        let delta: number;
        if (view === "day" && d.t0 !== null) delta = snap(minAt(cell.el, e) - d.t0);
        else delta = Math.round((Date.parse(`${cell.day}T12:00:00Z`) - Date.parse(`${d.day0}T12:00:00Z`)) / 60000);
        const s = Date.parse(d.b.starts_at) + delta * 60000;
        const en = Date.parse(d.b.ends_at) + delta * 60000;
        if (delta === 0 && plumber === d.b.plumber_id) return;
        // keep the wall-clock times across a daylight-saving change in week view
        const sp = nzParts(d.b.starts_at);
        const ep = nzParts(d.b.ends_at);
        const starts_at = view === "week" ? nzInstant(addDays(sp.date, delta / 1440), sp.min) : new Date(s).toISOString();
        const ends_at = view === "week" ? nzInstant(addDays(ep.date, delta / 1440), ep.min) : new Date(en).toISOString();
        save({ id: d.b.id, plumber_id: plumber, starts_at, ends_at });
      } else if (d.kind === "resize") {
        save({ id: d.b.id, ends_at: nzInstant(d.day, d.end) });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.kind]);

  // Phases dragged in from the "To schedule" list
  const dropPhase = (e: React.DragEvent<HTMLElement>, lane: string, day: string) => {
    const phaseId = e.dataTransfer.getData("text/x-phase");
    if (!phaseId) return;
    e.preventDefault();
    let s = DEFAULT_START_MIN;
    if (view === "day") s = snap(minAt(e.currentTarget, e));
    const en = Math.min(24 * 60, s + DEFAULT_LENGTH_MIN);
    save({ phase_id: phaseId, plumber_id: lane === UNASSIGNED ? null : lane, starts_at: nzInstant(day, s), ends_at: nzInstant(day, en) });
  };

  // ── rendering pieces ─────────────────────────────────────────────────────
  const LaneLabel = ({ lane }: { lane: Lane }) => {
    const p = lane.person;
    const removed = p ? Number(diary.removed_unsent[p.plumber_id] ?? 0) : 0;
    const notSent = p ? Number(p.not_sent) + removed : 0;
    const off = p?.off?.filter((d) => days.includes(d)) ?? [];
    return (
      <div className={`flex h-full items-center gap-3 px-3 ${p ? "bg-white" : "bg-[#d6d6dc]"}`}>
        {p ? (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ background: avatarColour(p.plumber_id) }}
            aria-hidden
          >
            {p.initials}
          </span>
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/60 text-lg" aria-hidden>
            ⊘
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p ? p.name : "Unassigned"}</div>
          {p && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {notSent > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => sendScheduleAction(p.plumber_id))}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
                  title={`${notSent} change${notSent === 1 ? "" : "s"} not sent. Click to send ${p.name.split(" ")[0]} their schedule.`}
                  data-testid="not-sent"
                >
                  Schedule not sent · Send
                </button>
              )}
              {off.length > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                  Off {view === "week" ? off.map((d) => dayLabel(d).split(" ")[0]).join(", ") : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const BookingCard = ({ it, style, compact }: { it: Item; style: React.CSSProperties; compact?: boolean }) => {
    if (it.kind === "appt") {
      const a = it.a;
      return (
        <Link
          href={`/dashboard/office/jobs/${a.job_number}`}
          className="absolute overflow-hidden rounded-md border border-dashed border-black/25 bg-[repeating-linear-gradient(45deg,#f1f1f3,#f1f1f3_6px,#e7e7ea_6px,#e7e7ea_12px)] px-2 py-1 text-[11px] leading-tight text-slate hover:border-black/50"
          style={style}
          title={`Booking engine job #${a.job_ref} (read-only here): ${a.start_label}, ${a.length_label}. ${a.customer}, ${a.site}`}
          data-testid="appointment"
        >
          <div className="font-semibold text-ink">#{a.job_ref} {a.description}</div>
          {!compact && <div className="truncate">{a.customer}</div>}
          <div className="truncate">{compact ? `${a.start_label} · ${a.site}` : a.site}</div>
          {!compact && <div className="text-[10px] uppercase tracking-wide">Booking engine · {a.start_label}</div>}
        </Link>
      );
    }
    const b = it.b;
    const editable = !b.busy && !!b.can_edit;
    const isDragging = drag?.kind === "move" && drag.b.id === b.id && drag.moved;
    const resizing = drag?.kind === "resize" && drag.b.id === b.id && drag.day === it.day;
    const sty: React.CSSProperties = { ...style, background: b.colour, borderColor: darker(b.colour) };
    if (isDragging && drag?.kind === "move") {
      sty.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
      sty.zIndex = 50;
      sty.opacity = 0.85;
      sty.pointerEvents = "none";
      sty.boxShadow = "0 8px 24px rgba(0,0,0,.18)";
    }
    if (resizing && drag?.kind === "resize") {
      const size = ((drag.end - Math.max(it.start, AXIS_START)) / 60) * hourPx;
      if (horizontal) sty.width = Math.max(18, size);
      else sty.height = Math.max(18, size);
    }
    // "PTSL-3000b Lot 12 new house plumbing – Rough-in": phase number, job name and phase name (when different)
    const title = b.job_title ?? b.phase_name;
    const label = `${b.phase_ref}${title ? ` ${title}` : ""}${b.job_title && b.phase_name && b.phase_name !== b.job_title ? ` – ${b.phase_name}` : ""}`;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label}, ${b.start_label}, ${b.length_label}${b.busy ? "" : `. ${b.customer}, ${b.site}`}`}
        className={`group absolute select-none overflow-hidden rounded-md border-l-4 px-2 py-1 text-[12px] leading-snug text-ink shadow-sm ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${b.busy ? "border border-dashed" : ""}`}
        style={sty}
        data-testid="booking"
        data-booking={b.id}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !b.busy) {
            e.preventDefault();
            setDialog({ mode: "edit", booking: b });
          }
        }}
        onPointerDown={(e) => {
          if (b.busy || e.button !== 0) return;
          e.stopPropagation();
          if (!editable) {
            setDialog({ mode: "edit", booking: b });
            return;
          }
          const cell = (e.currentTarget.closest("[data-lane]") as HTMLElement | null) ?? null;
          setD({
            kind: "move", b, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, day0: it.day,
            t0: view === "day" && cell ? minAt(cell, e) : null,
          });
        }}
      >
        {!compact && view === "day" && (
          <div className="mb-0.5 flex gap-1">
            <span className="rounded bg-[#1d3fce] px-1 text-[10px] font-bold text-white">{b.start_label}</span>
            <span className="rounded bg-[#1d3fce] px-1 text-[10px] font-bold text-white">
              {resizing && drag?.kind === "resize" ? lengthLabel(drag.end - it.start) : b.length_label}
            </span>
            {b.not_sent && <span className="rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-900">Not sent</span>}
            {b.started_at && <span className="rounded bg-emerald-200 px-1 text-[10px] font-bold text-emerald-900">{b.finished_at ? "Done" : "On site"}</span>}
          </div>
        )}
        <div className="truncate font-bold">{label}</div>
        {!b.busy && (
          <>
            {compact ? (
              <div className="truncate">
                {b.start_label} · {b.length_label}
                {b.not_sent ? " · Not sent" : ""}
              </div>
            ) : null}
            <div className="truncate">{b.customer}</div>
            <div className="truncate">{b.site}</div>
            {!compact && <div className="truncate">{b.description}</div>}
          </>
        )}
        {b.busy && <div className="truncate">{b.description}</div>}
        {editable && view === "day" && (
          <span
            aria-hidden
            className={`absolute opacity-0 group-hover:opacity-100 ${horizontal ? "inset-y-0 right-0 w-2 cursor-ew-resize" : "inset-x-0 bottom-0 h-2 cursor-ns-resize"} bg-black/20`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setD({ kind: "resize", b, lane: b.plumber_id ?? UNASSIGNED, day: it.day, end: it.end });
            }}
          />
        )}
      </div>
    );
  };

  /** One lane's track for the day view. */
  const DayTrack = ({ lane }: { lane: Lane }) => {
    const placed = dayPlaced.get(lane.id) ?? [];
    const tracks = Math.max(1, ...placed.map((p) => p.tracks));
    const off = lane.person?.off?.includes(date);
    const create = drag?.kind === "create" && drag.lane === lane.id ? drag : null;
    const nowMin = date === today ? nzParts(new Date()).min : null;
    return (
      <div
        className={`relative ${lane.person ? (off ? "bg-[repeating-linear-gradient(45deg,#fff5f5,#fff5f5_8px,#fdecec_8px,#fdecec_16px)]" : "bg-[#f4f4f6]") : "bg-[#d6d6dc]"}`}
        style={horizontal ? { width: axisLen, height: tracks * TRACK_H + 6 } : { height: axisLen, width: LANE_W }}
        data-lane={lane.id}
        data-day={date}
        onPointerDown={(e) => {
          if (e.button !== 0 || !canBookAny || e.target !== e.currentTarget) return;
          const m = minAt(e.currentTarget, e);
          setD({ kind: "create", lane: lane.id, day: date, anchor: m, cur: m, moved: false });
        }}
        onDragOver={(e) => canBookAny && e.preventDefault()}
        onDrop={(e) => dropPhase(e, lane.id, date)}
      >
        {/* hour lines */}
        {Array.from({ length: (AXIS_END - AXIS_START) / 60 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute border-black/10"
            style={horizontal ? { left: i * hourPx, top: 0, bottom: 0, borderLeftWidth: 1 } : { top: i * hourPx, left: 0, right: 0, borderTopWidth: 1 }}
          />
        ))}
        {nowMin !== null && nowMin > AXIS_START && nowMin < AXIS_END && (
          <span
            aria-hidden
            className="pointer-events-none absolute z-10 bg-red-500"
            style={horizontal ? { left: toPx(nowMin), top: 0, bottom: 0, width: 2 } : { top: toPx(nowMin), left: 0, right: 0, height: 2 }}
          />
        )}
        {create && create.moved && (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-[#1d3fce] bg-[#1d3fce]/10"
            style={
              horizontal
                ? { left: toPx(snap(Math.min(create.anchor, create.cur))), width: toPx(snap(Math.max(create.anchor, create.cur))) - toPx(snap(Math.min(create.anchor, create.cur))), top: 3, bottom: 3 }
                : { top: toPx(snap(Math.min(create.anchor, create.cur))), height: toPx(snap(Math.max(create.anchor, create.cur))) - toPx(snap(Math.min(create.anchor, create.cur))), left: 3, right: 3 }
            }
          />
        )}
        {placed.map((p) => {
          const pos = toPx(p.start);
          const size = Math.max(22, toPx(p.end) - pos);
          const style: React.CSSProperties = horizontal
            ? { left: pos + 1, width: size - 2, top: p.track * TRACK_H + 4, height: TRACK_H - 6 }
            : { top: pos + 1, height: size - 2, left: (p.track * LANE_W) / p.tracks + 2, width: LANE_W / p.tracks - 4 };
          return <Fragment key={p.kind === "booking" ? p.b.id : p.a.id}>{BookingCard({ it: p, style })}</Fragment>;
        })}
      </div>
    );
  };

  /** One person's day cell in the week view. */
  const WeekCell = ({ lane, day, height }: { lane: Lane; day: string; height: number }) => {
    const items = weekCells.get(`${lane.id}|${day}`) ?? [];
    const off = lane.person?.off?.includes(day);
    return (
      <div
        className={`relative border-black/10 ${horizontal ? "border-l" : "border-t"} ${lane.person ? (off ? "bg-red-50" : day === today ? "bg-aqua-pale" : "bg-[#f4f4f6]") : "bg-[#d6d6dc]"}`}
        style={horizontal ? { width: DAY_W, height } : { width: LANE_W, height }}
        data-lane={lane.id}
        data-day={day}
        onPointerDown={(e) => {
          if (e.button !== 0 || !canBookAny || e.target !== e.currentTarget) return;
          setDialog({ mode: "new", phaseId: null, lane: lane.id, day, start: DEFAULT_START_MIN, end: DEFAULT_START_MIN + DEFAULT_LENGTH_MIN });
        }}
        onDragOver={(e) => canBookAny && e.preventDefault()}
        onDrop={(e) => dropPhase(e, lane.id, day)}
      >
        {items.map((it, i) => (
          <Fragment key={it.kind === "booking" ? it.b.id : it.a.id}>
            {BookingCard({ it, compact: true, style: { top: i * CARD_H + 4, left: 4, right: 4, height: CARD_H - 6 } })}
          </Fragment>
        ))}
      </div>
    );
  };

  // ── the board ────────────────────────────────────────────────────────────
  const headerDays = view === "week" ? days : [date];
  const Board = () => {
    if (horizontal) {
      return (
        <div className="inline-block min-w-full">
          <div className="sticky top-0 z-30 flex border-b border-black/10 bg-white">
            <div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-black/10 bg-white px-3 text-lg font-bold" style={{ width: LABEL_W, height: 52 }}>
              Staff
            </div>
            {view === "day"
              ? Array.from({ length: (AXIS_END - AXIS_START) / 60 }, (_, i) => (
                  <div key={i} className="shrink-0 border-l border-black/10 px-2 pt-3 text-sm text-slate" style={{ width: hourPx }}>
                    {hourLabel(AXIS_START / 60 + i)}
                  </div>
                ))
              : headerDays.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => go({ d, v: "day" })}
                    className={`shrink-0 border-l border-black/10 px-2 pt-3 text-left text-sm font-semibold hover:bg-mist ${d === today ? "text-[#1d3fce]" : ""}`}
                    style={{ width: DAY_W }}
                    title="Open this day"
                  >
                    {dayLabel(d)}
                  </button>
                ))}
          </div>
          {lanes.map((l) => (
            <div key={l.id} className="flex border-b border-black/10">
              <div className="sticky left-0 z-20 shrink-0 border-r border-black/10" style={{ width: LABEL_W }}>
                {LaneLabel({ lane: l })}
              </div>
              {view === "day" ? (
                DayTrack({ lane: l })
              ) : (
                <div className="flex">
                  {days.map((d) => (
                    <Fragment key={d}>{WeekCell({ lane: l, day: d, height: weekStack(l.id) * CARD_H + 8 })}</Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    // vertical: people across the top, time (or days) down the side
    return (
      <div className="inline-block min-w-full">
        <div className="sticky top-0 z-30 flex border-b border-black/10 bg-white">
          <div className="sticky left-0 z-40 shrink-0 border-r border-black/10 bg-white" style={{ width: 70 }} />
          {lanes.map((l) => (
            <div key={l.id} className="shrink-0 border-r border-black/10" style={{ width: LANE_W, height: 64 }}>
              {LaneLabel({ lane: l })}
            </div>
          ))}
        </div>
        {view === "day" ? (
          <div className="flex">
            <div className="sticky left-0 z-20 shrink-0 border-r border-black/10 bg-white" style={{ width: 70 }}>
              {Array.from({ length: (AXIS_END - AXIS_START) / 60 }, (_, i) => (
                <div key={i} className="border-t border-black/10 px-2 text-xs text-slate" style={{ height: hourPx }}>
                  {hourLabel(AXIS_START / 60 + i)}
                </div>
              ))}
            </div>
            {lanes.map((l) => (
              <div key={l.id} className="shrink-0 border-r border-black/10">
                {DayTrack({ lane: l })}
              </div>
            ))}
          </div>
        ) : (
          days.map((d) => {
            const h = weekDayStack(d) * CARD_H + 8;
            return (
              <div key={d} className="flex">
                <button
                  type="button"
                  onClick={() => go({ d, v: "day" })}
                  className={`sticky left-0 z-20 shrink-0 border-r border-t border-black/10 bg-white px-2 pt-2 text-left text-xs font-semibold hover:bg-mist ${d === today ? "text-[#1d3fce]" : ""}`}
                  style={{ width: 70, height: h }}
                >
                  {dayLabel(d)}
                </button>
                {lanes.map((l) => (
                  <div key={l.id} className="shrink-0 border-r border-black/10">
                    {WeekCell({ lane: l, day: d, height: h })}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const shownPhases = phases.filter((p) => {
    const q = phaseSearch.trim().toLowerCase();
    return !q || `${p.phase_ref} ${p.phase_name} ${p.job_title ?? ""} ${p.customer} ${p.site}`.toLowerCase().includes(q);
  });
  const toSchedule = shownPhases.filter((p) => p.stage === "to_schedule");
  const others = shownPhases.filter((p) => p.stage !== "to_schedule");
  const navBtn = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg bg-[#eef1fb] px-3 text-sm font-semibold text-[#1d3fce] hover:bg-[#dfe5f8]";

  return (
    <div className="-my-8 ml-[calc(50%-50vw)] w-screen px-3 py-4 sm:px-4">
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="sr-only">Diary</h1>
        <label className="sr-only" htmlFor="diary-staff">Show</label>
        <select
          id="diary-staff"
          className="h-10 rounded-lg bg-[#eef1fb] px-3 text-sm font-semibold text-[#1d3fce]"
          value={personFilter ? `p:${personFilter}` : companyCode ? `c:${companyCode}` : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) go({ co: "", p: "" });
            else if (v.startsWith("c:")) go({ co: v.slice(2), p: "" });
            else go({ p: v.slice(2) });
          }}
        >
          <option value="">All staff</option>
          {diary.companies.map((c) => (
            <option key={c.code} value={`c:${c.code}`}>{c.name} staff</option>
          ))}
          <optgroup label="One person">
            {diary.people.map((p) => (
              <option key={p.plumber_id} value={`p:${p.plumber_id}`}>{p.name}</option>
            ))}
          </optgroup>
        </select>
        <div className="mx-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className={navBtn} aria-label={view === "week" ? "Back four weeks" : "Back a week"} onClick={() => go({ d: addDays(date, view === "week" ? -28 : -7) })}>«</button>
          <button type="button" className={navBtn} aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => go({ d: addDays(date, view === "week" ? -7 : -1) })}>‹</button>
          <button type="button" className={navBtn} onClick={() => go({ d: today })}>Today</button>
          <label className={`${navBtn} relative cursor-pointer gap-2 px-4`}>
            <span aria-hidden>📅</span>
            <span>
              {view === "week" ? `Week of ${dayLabel(diary.from)}` : dayLabel(date, true)}
            </span>
            <input
              type="date"
              value={date}
              aria-label="Pick a date"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => e.target.value && go({ d: e.target.value })}
            />
          </label>
          <button type="button" className={navBtn} aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => go({ d: addDays(date, view === "week" ? 7 : 1) })}>›</button>
          <button type="button" className={navBtn} aria-label={view === "week" ? "Forward four weeks" : "Forward a week"} onClick={() => go({ d: addDays(date, view === "week" ? 28 : 7) })}>»</button>
        </div>
        <div className="flex rounded-lg bg-[#eef1fb] p-1" role="group" aria-label="Layout">
          {(["vertical", "horizontal"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={orientation === o}
              onClick={() => go({ o: o === "vertical" ? "v" : "h" })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${orientation === o ? "bg-[#1d3fce] text-white" : "text-[#1d3fce]"}`}
            >
              {o}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="diary-view">View</label>
        <select
          id="diary-view"
          className="h-10 rounded-lg bg-[#eef1fb] px-3 text-sm font-semibold text-[#1d3fce]"
          value={view}
          onChange={(e) => go({ v: e.target.value })}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
        </select>
        {canBookAny && (
          <>
            <button
              type="button"
              disabled={pending || totalNotSent === 0}
              onClick={() => run(() => sendScheduleAction(null))}
              className="h-10 rounded-lg bg-[#1d3fce] px-4 text-sm font-semibold text-white disabled:bg-black/20"
              data-testid="send-all"
              title="Sends each person with changes an app notification with their new, changed and removed bookings"
            >
              Send schedule{totalNotSent ? ` (${totalNotSent})` : ""}
            </button>
            <button type="button" onClick={() => setPanel(!panel)} aria-expanded={panel} className="h-10 rounded-lg bg-[#eef1fb] px-3 text-sm font-semibold text-[#1d3fce]">
              To schedule ({phases.filter((p) => p.stage === "to_schedule").length})
            </button>
          </>
        )}
      </div>

      {!canBookAny && (
        <p className="mb-2 text-sm text-slate">You can look at the diary. Booking and moving people needs &ldquo;Can book the diary&rdquo; (Office → Staff).</p>
      )}

      <div className="flex gap-3">
        <div
          ref={scroller}
          className={`relative min-w-0 flex-1 overflow-auto rounded-xl border border-black/10 bg-white ${pending ? "opacity-80" : ""}`}
          style={{ maxHeight: "calc(100vh - 170px)" }}
          data-testid="diary-board"
        >
          {Board()}
        </div>

        {canBookAny && panel && (
          <aside className="hidden w-72 shrink-0 flex-col rounded-xl border border-black/10 bg-white lg:flex" style={{ maxHeight: "calc(100vh - 170px)" }} aria-label="Phases to schedule">
            <div className="border-b border-black/10 p-3">
              <h2 className="text-sm font-bold">To schedule</h2>
              <p className="mt-0.5 text-xs text-slate">Drag a phase onto someone. It books 7:30 AM for 7.5 hrs (or where you drop it in Day view).</p>
              <input
                value={phaseSearch}
                onChange={(e) => setPhaseSearch(e.target.value)}
                placeholder="Find a phase, customer, site…"
                aria-label="Find a phase"
                className="mt-2 w-full rounded-full border border-black/10 bg-mist px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1.5 overflow-auto p-2">
              {[...toSchedule, ...others].map((p, i) => (
                <div key={p.phase_id}>
                  {i === toSchedule.length && others.length > 0 && (
                    <div className="px-1 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate">Already started or booked</div>
                  )}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-phase", p.phase_id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="cursor-grab rounded-md border-l-4 px-2 py-1.5 text-xs leading-snug"
                    style={{ background: p.colour, borderColor: darker(p.colour) }}
                    data-testid="phase-to-schedule"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">{p.phase_ref} {p.phase_name}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded bg-white/70 px-1.5 text-[11px] font-semibold hover:bg-white"
                        onClick={() =>
                          setDialog({ mode: "new", phaseId: p.phase_id, lane: UNASSIGNED, day: view === "day" ? date : diary.from, start: DEFAULT_START_MIN, end: DEFAULT_START_MIN + DEFAULT_LENGTH_MIN })
                        }
                        aria-label={`Book ${p.phase_ref}`}
                      >
                        Book
                      </button>
                    </div>
                    <div className="truncate">{p.customer}</div>
                    <div className="truncate">{p.site}</div>
                    <div className="truncate text-slate">
                      {p.stage_label}
                      {p.booked ? ` · ${p.booked} booking${p.booked === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {!shownPhases.length && <p className="p-2 text-xs text-slate">Nothing to schedule{phaseSearch ? " matches that" : ""}.</p>}
            </div>
          </aside>
        )}
      </div>

      {toast && (
        <div
          role={toast.ok ? "status" : "alert"}
          className={`fixed bottom-4 left-1/2 z-[60] max-w-lg -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg ${toast.ok ? (toast.warnings?.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950") : "bg-red-50 text-red-900"}`}
          data-testid="diary-toast"
        >
          <div className="font-medium">{toast.text}</div>
          {toast.warnings?.map((w) => (
            <div key={w} className="mt-1">⚠ {w}</div>
          ))}
        </div>
      )}

      {dialog && (
        <BookingDialog
          key={dialog.mode === "edit" ? dialog.booking.id : `${dialog.lane}-${dialog.day}-${dialog.start}`}
          dialog={dialog}
          phases={phases}
          people={diary.people}
          peopleById={peopleById}
          canEdit={(code) => canEditCompany(code)}
          pending={pending}
          onClose={() => setDialog(null)}
          onSave={(b) => save(b, () => setDialog(null))}
          onAddPerson={(b) => save(b)}
          onRemove={(id) => run(() => removeBookingAction(id), () => setDialog(null))}
          onColour={(jobId, c) => run(() => setColourAction(jobId, c))}
        />
      )}
    </div>
  );
}

// ── the booking dialog (keyboard way to do everything the drag does) ───────────
function BookingDialog({
  dialog, phases, people, peopleById, canEdit, pending, onClose, onSave, onAddPerson, onRemove, onColour,
}: {
  dialog: { mode: "edit"; booking: DiaryBooking } | { mode: "new"; phaseId: string | null; lane: string; day: string; start: number; end: number };
  phases: DiaryPhase[]; people: DiaryPerson[]; peopleById: Map<string, DiaryPerson>; canEdit: (code: string | undefined) => boolean;
  pending: boolean; onClose: () => void; onSave: (b: BookingInput) => void; onAddPerson: (b: BookingInput) => void;
  onRemove: (id: string) => void; onColour: (jobId: string, colour: string | null) => void;
}) {
  const b = dialog.mode === "edit" ? dialog.booking : null;
  const s0 = b ? nzParts(b.starts_at) : { date: dialog.mode === "new" ? dialog.day : "", min: dialog.mode === "new" ? dialog.start : 0 };
  const e0 = b ? nzParts(b.ends_at) : { date: dialog.mode === "new" ? dialog.day : "", min: dialog.mode === "new" ? dialog.end : 0 };
  const [phaseId, setPhaseId] = useState<string | null>(dialog.mode === "new" ? dialog.phaseId : b?.phase_id ?? null);
  const [find, setFind] = useState("");
  const [plumber, setPlumber] = useState<string>(b ? b.plumber_id ?? "" : dialog.mode === "new" && dialog.lane !== UNASSIGNED ? dialog.lane : "");
  const [sDate, setSDate] = useState(s0.date);
  const [sMin, setSMin] = useState(s0.min);
  const [eDate, setEDate] = useState(e0.date === s0.date || e0.min > 0 ? e0.date : addDays(e0.date, -1));
  const [eMin, setEMin] = useState(e0.min === 0 && e0.date !== s0.date ? 24 * 60 : e0.min);
  const [note, setNote] = useState(b?.note ?? "");
  const [another, setAnother] = useState("");
  const phase = phases.find((p) => p.phase_id === phaseId) ?? null;
  const company = b?.company_code ?? phase?.company_code;
  const editable = b ? !!b.can_edit : canEdit(company);
  const eligible = people.filter((p) => !company || (p.companies ?? []).includes(company));
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const startsAt = sDate ? nzInstant(sDate, sMin) : "";
  const endsAt = eDate ? (eMin >= 24 * 60 ? nzInstant(addDays(eDate, 1), 0) : nzInstant(eDate, eMin)) : "";
  const valid = !!phaseId && !!startsAt && !!endsAt && Date.parse(endsAt) > Date.parse(startsAt);
  const mins = Date.parse(endsAt) - Date.parse(startsAt);
  const field = "w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm disabled:bg-mist";
  const lbl = "block text-xs font-semibold text-slate";
  const filtered = phases.filter((p) => {
    const q = find.trim().toLowerCase();
    return !q || `${p.phase_ref} ${p.phase_name} ${p.job_title ?? ""} ${p.customer} ${p.site}`.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-title" className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="booking-title" className="text-lg font-bold">
              {b
                ? `${b.phase_ref} ${b.job_title ?? b.phase_name ?? ""}${b.job_title && b.phase_name && b.phase_name !== b.job_title ? ` – ${b.phase_name}` : ""}`
                : phase ? `Book ${phase.phase_ref} ${phase.phase_name}` : "New booking"}
            </h2>
            {(b || phase) && (
              <p className="text-sm text-slate">
                {b?.customer ?? phase?.customer} · {b?.site ?? phase?.site}
                <br />
                {b?.stage_label ?? phase?.stage_label}
                {b && (b.not_sent ? " · Not sent yet" : b.sent_at ? " · Sent to the plumber" : "")}
                {b?.started_at ? ` · Started ${new Date(b.started_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-mist px-3 py-1 text-sm font-semibold" aria-label="Close">
            ✕
          </button>
        </div>

        {!b && (
          <div className="mt-4">
            <label className={lbl} htmlFor="bk-find">Job phase</label>
            <input id="bk-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a phase, customer or site" className={field} />
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg border border-black/10 p-1" role="listbox" aria-label="Phases">
              {filtered.slice(0, 40).map((p) => (
                <button
                  key={p.phase_id}
                  type="button"
                  role="option"
                  aria-selected={p.phase_id === phaseId}
                  onClick={() => setPhaseId(p.phase_id)}
                  className={`block w-full rounded-md px-2 py-1 text-left text-xs ${p.phase_id === phaseId ? "ring-2 ring-[#1d3fce]" : ""}`}
                  style={{ background: p.colour }}
                >
                  <span className="font-bold">{p.phase_ref} {p.phase_name}</span> · {p.customer} · {p.stage_label}
                </button>
              ))}
              {!filtered.length && <p className="p-2 text-xs text-slate">No phases to book{find ? " match that" : ""}.</p>}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={lbl} htmlFor="bk-person">Person</label>
            <select id="bk-person" disabled={!editable} value={plumber} onChange={(e) => setPlumber(e.target.value)} className={field}>
              <option value="">Unassigned</option>
              {eligible.map((p) => (
                <option key={p.plumber_id} value={p.plumber_id}>{p.name}</option>
              ))}
              {plumber && !eligible.some((p) => p.plumber_id === plumber) && <option value={plumber}>{peopleById.get(plumber)?.name ?? "Someone else"}</option>}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={lbl} htmlFor="bk-sdate">Start</label>
            <div className="grid grid-cols-[1fr_7.5rem] gap-1">
              <input id="bk-sdate" type="date" disabled={!editable} value={sDate} onChange={(e) => { setSDate(e.target.value); if (e.target.value > eDate) setEDate(e.target.value); }} className={field} />
              <select aria-label="Start time" disabled={!editable} value={sMin} onChange={(e) => setSMin(Number(e.target.value))} className={field}>
                {minutesOptions(0, 24 * 60 - SLOT_MIN).map((m) => <option key={m} value={m}>{timeLabel(m)}</option>)}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={lbl} htmlFor="bk-edate">Finish</label>
            <div className="grid grid-cols-[1fr_7.5rem] gap-1">
              <input id="bk-edate" type="date" disabled={!editable} value={eDate} min={sDate} onChange={(e) => setEDate(e.target.value)} className={field} />
              <select aria-label="Finish time" disabled={!editable} value={eMin} onChange={(e) => setEMin(Number(e.target.value))} className={field}>
                {minutesOptions(SLOT_MIN, 24 * 60).map((m) => <option key={m} value={m}>{m === 24 * 60 ? "Midnight" : timeLabel(m)}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate sm:col-span-2">
            {valid ? (sDate === eDate ? lengthLabel(mins / 60000) : `${Math.round(mins / 86400000 + 0.49)} days`) : "The finish has to be after the start."}
            {" · "}15-minute steps. Several people on one phase: book each person (or use “Add another person” below).
          </p>
          <div className="sm:col-span-2">
            <label className={lbl} htmlFor="bk-note">Note for the plumber</label>
            <textarea id="bk-note" disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={`${field} rounded-xl`} />
          </div>
        </div>

        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || !valid}
              onClick={() => onSave({ id: b?.id ?? null, phase_id: phaseId ?? undefined, plumber_id: plumber || null, starts_at: startsAt, ends_at: endsAt, note })}
              className="rounded-full bg-[#1d3fce] px-4 py-2 text-sm font-semibold text-white disabled:bg-black/20"
            >
              {b ? "Save" : "Book"}
            </button>
            {b && (
              <button
                type="button"
                disabled={pending || !!b.started_at}
                title={b.started_at ? "The plumber has started this booking" : undefined}
                onClick={() => confirm(`Remove ${b.phase_ref} from ${peopleById.get(b.plumber_id ?? "")?.name ?? "Unassigned"}'s diary?`) && onRemove(b.id)}
                className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            {b?.job_ref && (
              <Link href={`/dashboard/office/job/${encodeURIComponent(b.job_ref)}`} className="ml-auto text-sm font-semibold text-aqua-deep hover:underline">
                Open job {b.job_ref}
              </Link>
            )}
          </div>
        )}
        {!editable && b?.job_ref && (
          <p className="mt-4 text-sm">
            <Link href={`/dashboard/office/job/${encodeURIComponent(b.job_ref)}`} className="font-semibold text-aqua-deep hover:underline">Open job {b.job_ref}</Link>
            <span className="text-slate"> · Changing the diary needs &ldquo;Can book the diary&rdquo;.</span>
          </p>
        )}

        {b && editable && (
          <div className="mt-5 grid gap-3 border-t border-black/10 pt-4 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="bk-another">Add another person (same times)</label>
              <div className="flex gap-1">
                <select id="bk-another" value={another} onChange={(e) => setAnother(e.target.value)} className={field}>
                  <option value="">Pick someone</option>
                  {eligible.filter((p) => p.plumber_id !== b.plumber_id).map((p) => (
                    <option key={p.plumber_id} value={p.plumber_id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !another}
                  onClick={() => {
                    onAddPerson({ phase_id: b.phase_id, plumber_id: another, starts_at: b.starts_at, ends_at: b.ends_at, note: b.note ?? "" });
                    setAnother("");
                  }}
                  className="rounded-full bg-mist px-3 text-sm font-semibold disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
            <div>
              <span className={lbl}>Job colour</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={b.colour === c}
                    onClick={() => b.job_id && onColour(b.job_id, c)}
                    className={`size-6 rounded-full border ${b.colour === c ? "border-2 border-ink" : "border-black/20"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
