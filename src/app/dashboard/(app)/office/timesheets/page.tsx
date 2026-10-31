import Link from "next/link";
import {
  approveAction, decideLeaveAction, reopenAction, removeLineAction, saveLeaveAction, saveLineAction,
} from "@/app/dashboard/timesheet-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn, quietBtn } from "@/components/office/jm";
import { loadWeek, smartlyFile, type SmartlyFile, type TsDay, type TsLine, type TsPerson, type TsWeek } from "@/lib/timesheets";
import { aucklandToday, officeEnabled, shiftDate, validDate } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Timesheets" };

type Props = { searchParams: Promise<{ week?: string; ok?: string; err?: string; p?: string; check?: string }> };

const STATUS = {
  auto: { label: "From the app", tone: "bg-mist text-slate" },
  confirmed: { label: "Confirmed", tone: "bg-sky-50 text-sky-900" },
  approved: { label: "Approved", tone: "bg-emerald-50 text-emerald-900" },
} as const;
const SOURCE: Record<TsLine["source"], string> = { diary: "Diary", engine: "Booking", plumber: "Plumber", office: "Office" };
const KIND: Record<TsLine["kind"], string> = { job: "Job", travel: "Yard travel", other: "Not on a job" };
const field = "rounded-lg border border-black/10 bg-white px-2 py-1 text-sm";
const dayName = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function TimesheetsPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { week, ok, err, p, check } = await searchParams;
  let w: TsWeek;
  let file: SmartlyFile | null = null;
  try {
    w = await loadWeek(session, validDate(week) ?? aucklandToday());
    if (check) file = await smartlyFile(session, w.from, false);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const self = `/dashboard/office/timesheets?week=${w.from}${p ? `&p=${p}` : ""}`;
  const people = p ? w.people.filter((x) => x.staff_id === p) : w.people;
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(w.from, i));
  const today = aucklandToday();
  const waiting = w.people.reduce((n, x) => n + x.days.filter((d) => d.status !== "approved").length, 0);
  const rateOptions = [
    ...w.settings.rules.filter((r) => r.active).map((r) => ({ value: `rule:${r.id}`, label: `${r.name} (Rate ${r.pay_rate})` })),
    { value: "1", label: "Ordinary time (Rate 1)" },
    { value: "2", label: "Rate 2 (other)" },
    { value: "3", label: "Rate 3 (other)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            Hours by job and phase, from the plumber app&rsquo;s Start / Done for today (diary) and On my way / Job done (bookings),
            rounded to the nearest 15 minutes. Time between two jobs counts on the next job. Plumbers confirm their day and add
            yard travel against a job; you approve it (that signs off the travel) and download the Smartly file.
            Pay week: Wednesday to Tuesday.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/dashboard/office/timesheets?week=${shiftDate(w.from, -7)}`} className="rounded-full bg-white px-3 py-1.5">‹ Previous</Link>
          <Link href="/dashboard/office/timesheets" className="rounded-full bg-white px-3 py-1.5">This week</Link>
          <span className="font-semibold" data-testid="ts-week">{w.label}</span>
          <Link href={`/dashboard/office/timesheets?week=${shiftDate(w.from, 7)}`} className="rounded-full bg-white px-3 py-1.5">Next ›</Link>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="from" value={w.from} />
          <input type="hidden" name="to" value={w.to} />
          <input type="hidden" name="back" value={self} />
          <button className={primaryBtn} disabled={!waiting}>Approve everyone&rsquo;s week{waiting ? ` (${waiting} day${waiting === 1 ? "" : "s"})` : ""}</button>
        </form>
        <Link href={`${self}&check=1#smartly`} className="rounded-full bg-white px-4 py-2 text-sm font-semibold">Check the Smartly file</Link>
        <Link href="/dashboard/office/timesheets/settings" className="rounded-full bg-white px-4 py-2 text-sm font-semibold">Pay rates &amp; allowances</Link>
        <form className="ml-auto flex items-center gap-2 text-sm" action="/dashboard/office/timesheets">
          <input type="hidden" name="week" value={w.from} />
          <label htmlFor="ts-person" className="text-slate">Show</label>
          <select id="ts-person" name="p" defaultValue={p ?? ""} className={field}>
            <option value="">Everyone</option>
            {w.people.map((x) => <option key={x.staff_id} value={x.staff_id}>{x.name}</option>)}
          </select>
          <button className={quietBtn}>Go</button>
        </form>
      </div>

      {file && <SmartlyPanel file={file} week={w.from} />}

      {w.leave_requests.length > 0 && (
        <section className="rounded-2xl bg-amber-50 p-5" data-testid="leave-requests">
          <h2 className="text-lg font-bold">Leave waiting for you</h2>
          <ul className="mt-2 divide-y divide-black/5">
            {w.leave_requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-semibold">{r.staff}</span>
                <span>{r.type} · {r.dates_label} · {r.hours} h{r.note ? ` · “${r.note}”` : ""}</span>
                <form action={decideLeaveAction} className="ml-auto flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={self} />
                  <input name="reason" placeholder="Reason if declining" aria-label="Reason if declining" className={`${field} w-44`} />
                  <button name="decision" value="approve" className={primaryBtn}>Approve</button>
                  <button name="decision" value="decline" className={quietBtn}>Decline</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {people.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate">Nobody who works on jobs that you approve timesheets for.</p>
      ) : (
        people.map((x) => (
          <PersonSection key={x.staff_id} x={x} days={days} today={today} self={self} rateOptions={rateOptions}
                         leaveTypes={w.settings.leave_types} />
        ))
      )}
      <p className="text-xs text-slate">Signed in as {session.name}. You can&rsquo;t approve your own timesheet or leave.</p>
    </div>
  );
}

function SmartlyPanel({ file, week }: { file: SmartlyFile; week: string }) {
  return (
    <section id="smartly" className="rounded-2xl bg-white p-5" data-testid="smartly-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Smartly file · {dayName(file.from)} – {dayName(file.to)}</h2>
        <a href={`/api/office/smartly?week=${week}`} className={primaryBtn}>Download {file.file_name}</a>
      </div>
      <p className="mt-1 text-sm text-slate">
        Approved days only. #50 = normal pay by Smartly rate (days paid on each person&rsquo;s last #50 line), #51 = allowances,
        #60 sick, #70 annual and the other leave lines. Upload it in Smartly under Timesheets → Import.
      </p>
      {file.left_out.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-900">
          {file.left_out.map((o, i) => <li key={i}><strong>{o.name}</strong> left out: {o.why}</li>)}
        </ul>
      )}
      {file.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {file.warnings.map((o, i) => <li key={i}><strong>{o.name}</strong>: {o.why}</li>)}
        </ul>
      )}
      <pre className="mt-3 overflow-x-auto rounded-xl bg-mist/50 p-3 text-xs" data-testid="smartly-rows">
        {file.rows.length ? file.rows.join("\n") : "Nothing to export yet: approve the week first."}
      </pre>
    </section>
  );
}

type Opt = { value: string; label: string };

function PersonSection({ x, days, today, self, rateOptions, leaveTypes }: {
  x: TsPerson; days: string[]; today: string; self: string; rateOptions: Opt[]; leaveTypes: { code: number; name: string }[];
}) {
  const byDate = new Map(x.days.map((d) => [d.work_date, d]));
  const open = x.days.some((d) => d.status !== "approved");
  return (
    <section className="rounded-2xl bg-white p-5" data-testid="ts-person" data-name={x.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{x.name}</h2>
          <p className="text-xs text-slate">
            {x.companies.join(" · ")} · Smartly {x.smartly_code ?? <span className="font-semibold text-red-700">no employee code</span>}
          </p>
        </div>
        <div className="text-right text-sm">
          <p><strong>{x.hours}</strong> paid hours</p>
          <p className="text-xs text-slate">
            {Object.entries(x.by_rate).map(([r, h]) => `Rate ${r}: ${h} h`).join(" · ") || "—"}
          </p>
        </div>
      </div>

      {x.leave.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2 text-xs">
          {x.leave.map((l) => (
            <span key={l.id} className={`rounded-full px-2 py-0.5 ${l.status === "approved" ? "bg-violet-100 text-violet-900" : "bg-amber-100 text-amber-900"}`}>
              {l.type} {l.dates_label} · {l.hours} h{l.status === "requested" ? " (waiting)" : ""}
            </span>
          ))}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {days.filter((d) => byDate.has(d)).map((d) => (
          <DayBlock key={d} x={x} day={byDate.get(d)!} self={self} rateOptions={rateOptions} />
        ))}
        {x.days.length === 0 && <p className="text-sm text-slate">No hours this week yet.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {open && (
          <form action={approveAction}>
            <input type="hidden" name="from" value={days[0]} />
            <input type="hidden" name="to" value={days[6]} />
            <input type="hidden" name="plumberId" value={x.plumber_id} />
            <input type="hidden" name="back" value={self} />
            <button className={primaryBtn}>Approve {x.name.split(" ")[0]}&rsquo;s week</button>
          </form>
        )}
        <details className="rounded-xl border border-dashed border-black/15 px-3 py-1.5 text-sm open:w-full open:border-solid">
          <summary className="cursor-pointer font-semibold text-aqua-deep">+ Add time</summary>
          <form action={saveLineAction} className="mt-2 grid gap-2 sm:grid-cols-7">
            <input type="hidden" name="plumberId" value={x.plumber_id} />
            <input type="hidden" name="back" value={self} />
            <div>
              <label className={label}>Day</label>
              <select name="date" className={input} defaultValue={days.filter((d) => d <= today).at(-1) ?? days[0]}>
                {days.filter((d) => d <= today).map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Kind</label>
              <select name="kind" className={input} defaultValue="job">
                <option value="job">Job</option>
                <option value="travel">Yard travel (for a job)</option>
                <option value="other">Not on a job</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Job or phase number</label>
              <input name="job_ref" placeholder="e.g. PTSL-3000a or 123" className={input} />
            </div>
            <div>
              <label className={label}>Start</label>
              <input name="start" type="time" step={900} required className={input} />
            </div>
            <div>
              <label className={label}>Finish</label>
              <input name="finish" type="time" step={900} required className={input} />
            </div>
            <div>
              <label className={label}>Note</label>
              <input name="note" maxLength={300} className={input} />
            </div>
            <div className="sm:col-span-7"><button className={primaryBtn}>Add</button></div>
          </form>
        </details>
        <details className="rounded-xl border border-dashed border-black/15 px-3 py-1.5 text-sm open:w-full open:border-solid">
          <summary className="cursor-pointer font-semibold text-aqua-deep">+ Enter leave</summary>
          <form action={saveLeaveAction} className="mt-2 grid gap-2 sm:grid-cols-6">
            <input type="hidden" name="staffId" value={x.staff_id} />
            <input type="hidden" name="back" value={self} />
            <div className="sm:col-span-2">
              <label className={label}>Kind of leave</label>
              <select name="code" className={input}>
                {leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.name} (#{t.code})</option>)}
              </select>
            </div>
            <div><label className={label}>First day</label><input name="date_from" type="date" required className={input} /></div>
            <div><label className={label}>Last day</label><input name="date_to" type="date" className={input} /></div>
            <div><label className={label}>Hours a day</label><input name="hours_per_day" inputMode="decimal" defaultValue="8" className={input} /></div>
            <div><label className={label}>Note</label><input name="note" maxLength={300} className={input} /></div>
            <div className="sm:col-span-6"><button className={primaryBtn}>Enter and approve</button>
              <span className="ml-2 text-xs text-slate">Weekends aren&rsquo;t counted. They&rsquo;re marked off in the diary.</span></div>
          </form>
        </details>
      </div>
    </section>
  );
}

function DayBlock({ x, day, self, rateOptions }: { x: TsPerson; day: TsDay; self: string; rateOptions: Opt[] }) {
  const st = STATUS[day.status];
  const locked = day.status === "approved";
  return (
    <div className="rounded-xl border border-black/5 p-3" data-testid="ts-day" data-date={day.work_date}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{dayName(day.work_date)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
        <span className="text-sm"><strong>{day.hours}</strong> h{day.break_min ? ` · ${day.break_min} min break` : ""}</span>
        {day.needs_finish && <span className="text-xs font-semibold text-red-700">A line has no finish time</span>}
        {day.travel_to_sign && !locked && <span className="text-xs font-semibold text-amber-800">Yard travel to sign off</span>}
        {day.note && <span className="text-xs text-slate">“{day.note}”</span>}
        {locked && <span className="text-xs text-slate">by {day.approved_by}{day.exported_at ? " · in a Smartly file" : ""}</span>}
        <span className="ml-auto flex gap-2">
          {!locked ? (
            <form action={approveAction}>
              <input type="hidden" name="from" value={day.work_date} />
              <input type="hidden" name="to" value={day.work_date} />
              <input type="hidden" name="plumberId" value={x.plumber_id} />
              <input type="hidden" name="back" value={self} />
              <button className={quietBtn}>Approve day</button>
            </form>
          ) : (
            <form action={reopenAction}>
              <input type="hidden" name="id" value={day.id} />
              <input type="hidden" name="back" value={self} />
              <button className={quietBtn}>Reopen</button>
            </form>
          )}
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-slate">
            <tr><th className="py-1">Time</th><th>Job / phase</th><th>Pay rate</th><th>Break</th><th>Hours</th><th>Note</th><th>From</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {day.lines.map((l) => (
              <tr key={l.id} data-testid="ts-line">
                <td colSpan={8} className="py-1.5">
                  <form action={saveLineAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="plumberId" value={x.plumber_id} />
                    <input type="hidden" name="date" value={day.work_date} />
                    <input type="hidden" name="back" value={self} />
                    <input name="start" type="time" step={900} aria-label="Start" defaultValue={l.start} disabled={locked} className={`${field} w-24`} />
                    <span>–</span>
                    <input name="finish" type="time" step={900} aria-label="Finish" defaultValue={l.finish ?? ""} disabled={locked}
                           className={`${field} w-24 ${l.needs_finish ? "border-red-400" : ""}`} />
                    <span className="w-64 truncate" title={l.customer ?? ""}>
                      {l.kind !== "job" && <span className="mr-1 rounded bg-amber-100 px-1 text-xs text-amber-900">{KIND[l.kind]}</span>}
                      {l.kind === "other" ? "" : l.label}
                      {l.company && <span className="ml-1 text-xs text-slate">{l.company}</span>}
                    </span>
                    <select name="rate" aria-label="Pay rate" disabled={locked} className={`${field} w-56`}
                            defaultValue={l.pay_rule_id ? `rule:${l.pay_rule_id}` : String(l.pay_rate)}>
                      {rateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input name="break_min" type="number" min={0} max={240} step={5} aria-label="Break minutes" defaultValue={l.break_min}
                           disabled={locked} className={`${field} w-16`} />
                    <span className="w-12 font-semibold">{l.hours}</span>
                    <input name="note" aria-label="Note" defaultValue={l.note ?? ""} disabled={locked} maxLength={300} className={`${field} w-40`} />
                    <span className="w-16 text-xs text-slate">{SOURCE[l.source]}{l.kind === "travel" && l.signed_off_by ? " ✓" : ""}</span>
                    {!locked && <button className={quietBtn}>Save</button>}
                    {!locked && <button formAction={removeLineAction} className="text-xs text-red-700 underline">Remove</button>}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
