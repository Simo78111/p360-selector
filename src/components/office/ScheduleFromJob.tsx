"use client";
// Schedule from the job (Simon, 6 Nov): the phase card's "Schedule" button books people on this phase without going
// to the Calendar. It offers everyone in the job's company who works on jobs — but once people have worked on (or been
// booked on) this job or its variations, only they are shown, with "+ Add someone else" for the rest. Pick the people,
// the first day, start and finish, and how many working days; each booking is made the same way as on the Calendar
// ("Can book the diary", clash warnings). Bookings still need sending from the Calendar, as there.
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { scheduleFromJobAction } from "@/app/dashboard/diary-actions";
import { DEFAULT_LENGTH_MIN, DEFAULT_START_MIN, type JobSchedule, type JobSchedulePerson } from "@/lib/diary-shared";

const TRADE: Record<string, string> = { plumber: "Plumber", gasfitter: "Gas fitter", drainlayer: "Drainlayer", plumber_gasfitter: "Plumber + gas fitter",
  plumber_gasfitter_drainlayer: "Plumber, gas fitter + drainlayer" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "Pacific/Auckland" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** The next working day in Auckland, as YYYY-MM-DD. */
function nextWorkingDay() {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }) + "T12:00:00Z");
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export function ScheduleFromJob({ phaseId, phaseRef, schedule, back }: { phaseId: string; phaseRef: string; schedule: JobSchedule; back: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const worked = useMemo(() => schedule.people.filter((p) => p.worked), [schedule.people]);
  const others = useMemo(() => schedule.people.filter((p) => !p.worked), [schedule.people]);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState(nextWorkingDay);
  const [start, setStart] = useState(toTime(DEFAULT_START_MIN));
  const [end, setEnd] = useState(toTime(DEFAULT_START_MIN + DEFAULT_LENGTH_MIN));
  const [days, setDays] = useState(1);
  const [skip, setSkip] = useState(true);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string; warnings?: string[] }>({});
  const [busy, start_] = useTransition();
  const upcoming = schedule.upcoming.filter((b) => b.phase_id === phaseId);
  const listed = worked.length && !showAll ? worked : [...worked, ...others];

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const book = () => start_(async () => {
    const r = await scheduleFromJobAction({ phase_id: phaseId, plumber_ids: picked, date, start_min: toMin(start), end_min: toMin(end),
      days, skip_weekends: skip, note: note || null, back });
    if (r.ok) {
      setMsg({ ok: r.message, warnings: r.warnings });
      setPicked([]);
      setNote("");
      router.refresh();
    } else setMsg({ err: r.error });
  });

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-aqua-deep px-4 py-2 text-sm font-semibold text-white" data-testid="schedule-open">
          Schedule
        </button>
        {upcoming.length > 0 && (
          <span className="text-xs text-slate">Booked: {upcoming.slice(0, 3).map((b) => `${b.name.split(" ")[0]} ${day(b.starts_at)}`).join(" · ")}
            {upcoming.length > 3 ? ` +${upcoming.length - 3} more` : ""}</span>
        )}
      </span>
    );
  }

  const person = (p: JobSchedulePerson) => (
    <label key={p.plumber_id} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${picked.includes(p.plumber_id) ? "bg-aqua-pale ring-1 ring-aqua-deep" : "bg-mist/40"}`}>
      <input type="checkbox" checked={picked.includes(p.plumber_id)} onChange={() => toggle(p.plumber_id)} className="mt-1" />
      <span>
        <span className="font-medium">{p.name}</span>
        <span className="block text-xs text-slate">
          {[p.trade ? TRADE[p.trade] ?? p.trade : null, p.apprentice ? "apprentice" : null].filter(Boolean).join(" · ")}
          {p.worked && <> · on this job {p.days} day{p.days === 1 ? "" : "s"}{p.last ? `, last ${day(p.last)}` : ""}</>}
          {p.next && <> · next here {day(p.next)}</>}
        </span>
      </span>
    </label>
  );

  return (
    <div className="mt-3 w-full space-y-3 rounded-2xl border-2 border-aqua/50 bg-white p-4" data-testid="schedule-panel">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-bold">Schedule {phaseRef}</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate underline">Close</button>
      </div>
      {!schedule.can_book && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can see who&apos;s available, but booking needs &ldquo;Can book the diary&rdquo; (Settings → Staff).
        </p>
      )}

      <div>
        <p className="text-sm font-semibold">
          {worked.length ? "People who've worked on this job" : "Who"}
          {worked.length > 0 && <span className="font-normal text-slate"> — {worked.length} so far</span>}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{listed.map(person)}</div>
        {worked.length > 0 && others.length > 0 && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-sm font-semibold text-aqua-deep underline" data-testid="schedule-add-more">
            {showAll ? "Only show people who've worked here" : `+ Add someone else (${others.length} more)`}
          </button>
        )}
        {schedule.people.length === 0 && <p className="text-sm text-slate">Nobody in this company is set up to work on jobs (Settings → Staff → &ldquo;Works on jobs&rdquo;).</p>}
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-xs font-semibold text-slate">First day
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-full border border-black/10 px-3 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate">Start
          <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block rounded-full border border-black/10 px-3 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate">Finish
          <input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block rounded-full border border-black/10 px-3 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate">Working days
          <input type="number" min={1} max={20} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} className="mt-1 block w-20 rounded-full border border-black/10 px-3 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip weekends
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note for the booking (optional, shows in the plumber app)"
        className="w-full rounded-full border border-black/10 px-3 py-1.5 text-sm" aria-label="Booking note" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !schedule.can_book || picked.length === 0} onClick={book}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="schedule-book">
          {busy ? "Booking…" : picked.length ? `Book ${picked.length} ${picked.length === 1 ? "person" : "people"} × ${days} day${days === 1 ? "" : "s"}` : "Book"}
        </button>
        <a href="/dashboard/office/diary" className="text-xs text-aqua-deep underline">Open the Calendar</a>
      </div>
      {msg.ok && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">{msg.ok}</p>}
      {msg.warnings?.length ? (
        <ul className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
      ) : null}
      {msg.err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{msg.err}</p>}

      {upcoming.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Already booked on {phaseRef}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {upcoming.map((b) => <li key={b.id}>{b.name} · {day(b.starts_at)} {time(b.starts_at)}–{time(b.ends_at)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
