import Link from "next/link";
import { approveTimesheetsAction, saveTimesheetAction } from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadTimesheets, type TimesheetPlumber } from "@/lib/automation";
import { aucklandToday, officeEnabled, shiftDate, validDate } from "@/lib/office";

export const metadata = { title: "Timesheets" };

type Props = { searchParams: Promise<{ week?: string; ok?: string; err?: string }> };

/** The Monday of the week a date is in. */
function monday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return shiftDate(date, -back);
}
const dayName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const statusTone = { auto: "text-slate", confirmed: "text-aqua-deep", approved: "text-emerald-700" } as const;
const statusLabel = { auto: "From the app", confirmed: "Confirmed", approved: "Approved" } as const;

export default async function TimesheetsPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { week, ok, err } = await searchParams;
  const from = monday(validDate(week) ?? aucklandToday());
  const to = shiftDate(from, 6);
  const self = `/dashboard/office/timesheets?week=${from}`;
  let people: TimesheetPlumber[];
  try {
    people = await loadTimesheets(from, to);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const field = "rounded-lg border border-black/10 px-2 py-1 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="mt-1 text-sm text-slate">
            Built from the plumber app: first &ldquo;On my way&rdquo; to last &ldquo;Job done&rdquo;, less the unpaid break.
            Plumbers can confirm or correct their day in the app; approve the week, then download it for payroll.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/dashboard/office/timesheets?week=${shiftDate(from, -7)}`} className="rounded-full bg-white px-3 py-1.5">‹ Previous</Link>
          <span className="font-semibold">{dayName(from)} – {dayName(to)}</span>
          <Link href={`/dashboard/office/timesheets?week=${shiftDate(from, 7)}`} className="rounded-full bg-white px-3 py-1.5">Next ›</Link>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      <div className="flex flex-wrap gap-2">
        <form action={approveTimesheetsAction}>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="back" value={self} />
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" disabled={!people.length}>Approve the whole week</button>
        </form>
        <a href={`/api/office/timesheets?from=${from}&to=${to}`} className="rounded-full bg-white px-4 py-2 text-sm font-semibold">Download CSV for payroll</a>
      </div>

      {people.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate">No days worked this week.</p>
      ) : (
        people.map((p) => (
          <section key={p.plumber_id} className="rounded-2xl bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{p.plumber}</h2>
              <p className="text-sm"><strong>{p.total_hours}</strong> paid hours</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-slate">
                  <tr><th className="py-1">Day</th><th>Start</th><th>Finish</th><th>Break</th><th>Hours</th><th>On jobs</th><th>Status</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {p.days.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 pr-2 font-medium">{dayName(d.work_date)}</td>
                      <td colSpan={7}>
                        <form action={saveTimesheetAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="back" value={self} />
                          <input name="start" aria-label="Start" defaultValue={d.start ?? ""} disabled={d.status === "approved"} className={`${field} w-20`} />
                          <input name="finish" aria-label="Finish" defaultValue={d.finish ?? ""} disabled={d.status === "approved"} className={`${field} w-20`} />
                          <input name="break" aria-label="Break minutes" type="number" min={0} max={240} defaultValue={d.break_min} disabled={d.status === "approved"} className={`${field} w-16`} />
                          <span className="w-12 font-semibold">{d.hours}</span>
                          <span className="w-24 text-slate">{Math.floor(d.job_min / 60)}h {d.job_min % 60}m · {d.jobs} job{d.jobs === 1 ? "" : "s"}</span>
                          <span className={`w-24 text-xs font-semibold ${statusTone[d.status]}`}>{statusLabel[d.status]}</span>
                          {d.note && <span className="text-xs text-slate">“{d.note}”</span>}
                          {d.status !== "approved" && <button className="ml-auto rounded-full bg-mist px-3 py-1 text-xs font-semibold">Save</button>}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
