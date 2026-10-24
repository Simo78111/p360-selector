import Link from "next/link";
import { bookNowAction, moveJobAction, planRouteAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, hours, JobLink, JobStatusBadge, NotConnected, shortDate, TierLabel } from "@/components/office/bits";
import { aucklandToday, loadDay, officeEnabled, shiftDate, validDate, type OfficeDay, type PlumberDay } from "@/lib/office";

export const metadata = { title: "Today" };

type Props = { searchParams: Promise<{ date?: string; ok?: string; err?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { date: dateParam, ok, err } = await searchParams;
  const today = aucklandToday();
  const date = validDate(dateParam) ?? today;
  const here = `/dashboard/office?date=${date}`;

  let day: OfficeDay;
  try {
    day = await loadDay(date);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const jobCount = day.plumbers.reduce((n, p) => n + p.jobs.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate">{date === today ? "Today" : date < today ? "Past day" : "Coming up"}</p>
          <h1 className="text-2xl font-bold">{day.date_local}</h1>
          <p className="mt-1 text-sm text-slate">
            {jobCount} job{jobCount === 1 ? "" : "s"} booked across {day.plumbers.length} plumber
            {day.plumbers.length === 1 ? "" : "s"}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Choose day">
          <DayLink date={shiftDate(date, -1)} label="← Prev" />
          {date !== today && <DayLink date={today} label="Today" />}
          <DayLink date={shiftDate(date, 1)} label="Next →" />
          <form className="flex items-center sm:ml-2" action="/dashboard/office">
            <label className="sr-only" htmlFor="pick-date">Go to date</label>
            <input
              id="pick-date"
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm"
            />
            <button type="submit" className="ml-1 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white">
              Go
            </button>
          </form>
        </nav>
      </div>

      <Flash ok={ok} err={err} />

      {day.attention > 0 && (
        <Link
          href="/dashboard/office/attention"
          className="flex items-center justify-between gap-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 hover:bg-amber-100"
        >
          <span>
            <strong>{day.attention} thing{day.attention === 1 ? "" : "s"} need{day.attention === 1 ? "s" : ""} you.</strong>{" "}
            <span className="text-sm text-amber-900">Everything else is running itself.</span>
          </span>
          <span className="text-sm font-semibold">Open →</span>
        </Link>
      )}

      {date >= today && jobCount > 0 && (
        day.planned ? (
          <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <strong>Planned.</strong> Routes are set and every customer has been texted their arrival time. Changes from
            here text the customer.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4">
            <p className="max-w-2xl text-sm">
              <strong>Not planned yet.</strong> Customers know the day and morning or afternoon. At {day.plan_time} the
              day before, each plumber&apos;s jobs are put in the shortest driving order and customers are texted exact
              times. Times below are estimates.
            </p>
            <form action={planRouteAction}>
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="back" value={here} />
              <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold whitespace-nowrap text-white">
                Work out best route now
              </button>
              <span className="mt-1 block text-center text-xs text-slate">No texts are sent</span>
            </form>
          </div>
        )
      )}

      {day.plumbers.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate">No active plumbers. Add one in the engine first.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {day.plumbers.map((p) => (
            <PlumberColumn key={p.id} plumber={p} planned={day.planned} />
          ))}
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Waiting for a time</h2>
        <p className="mt-1 text-sm text-slate">
          The scheduler books Priority and Standard jobs every 5 minutes. Flexi jobs wait for a nearby slot and are
          booked automatically before their deadline.
        </p>
        {day.waiting.length === 0 ? (
          <p className="mt-4 text-sm text-slate">Nothing waiting.</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/5">
            {day.waiting.map((j) => (
              <li key={j.job_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <JobLink job={j} />
                    <TierLabel tier={j.tier} />
                    <JobStatusBadge status={j.status} />
                  </div>
                  <p className="text-sm text-slate">
                    {j.customer} · {j.suburb ?? j.address}
                    {j.preferred && <> · wants {j.preferred}</>}
                    {j.flexi_latest && <> · book by {j.flexi_latest}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={bookNowAction}>
                    <input type="hidden" name="jobId" value={j.job_id} />
                    <input type="hidden" name="back" value={here} />
                    <button
                      type="submit"
                      disabled={j.status === "offered"}
                      className="rounded-full bg-aqua px-4 py-1.5 text-sm font-semibold hover:bg-[#35b9df] disabled:opacity-40"
                    >
                      Book first free slot
                    </button>
                  </form>
                  {day.plumbers.length > 0 && j.status !== "offered" && (
                    <form action={moveJobAction} className="flex items-center gap-1">
                      <input type="hidden" name="jobId" value={j.job_id} />
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="date" value={date} />
                      <label className="sr-only" htmlFor={`pl-${j.job_id}`}>Plumber</label>
                      <select id={`pl-${j.job_id}`} name="plumberId" className="rounded-full border border-black/10 px-2 py-1.5 text-sm">
                        {day.plumbers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:border-ink">
                        Add to {shortDate(date)}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DayLink({ date, label }: { date: string; label: string }) {
  return (
    <Link href={`/dashboard/office?date=${date}`} className="rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate hover:bg-white hover:text-ink">
      {label}
    </Link>
  );
}

function PlumberColumn({ plumber: p, planned }: { plumber: PlumberDay; planned: boolean }) {
  const stops = p.jobs.filter((j) => j.lat && j.lng);
  const route =
    stops.length > 0
      ? `https://www.google.com/maps/dir/${stops.map((j) => `${j.lat},${j.lng}`).join("/")}`
      : null;

  return (
    <section className="min-w-0 rounded-2xl bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{p.name}</h2>
          <p className="text-xs text-slate">
            {p.shift} · {p.booked_min ? `${hours(p.booked_min)} booked` : "free"}
            {p.drive_min > 0 && <> · {hours(p.drive_min)} driving</>}
            {p.last_seen?.today && <> · last seen {p.last_seen.at}</>}
          </p>
        </div>
        {route && (
          <a href={route} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-aqua-deep hover:underline">
            Route ↗
          </a>
        )}
      </div>
      {p.home && (
        <p className="mt-2 text-xs text-slate">
          Home: {p.home.to_first} min to the first job · {p.home.from_last} min back from the last
        </p>
      )}
      {p.jobs.length === 0 ? (
        <p className="mt-4 rounded-xl bg-mist p-4 text-sm text-slate">Nothing booked. The standby pool will offer this time to Flexi customers.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {p.jobs.map((j, i) => (
            <li key={j.job_id}>
              {i > 0 && j.drive_min ? (
                <p className="py-1 pl-[6.25rem] text-xs text-slate">↓ {j.drive_min} min drive and park</p>
              ) : null}
              <div className="flex gap-3 rounded-xl border border-black/5 p-3">
              <div className="w-[5.25rem] shrink-0 text-right whitespace-nowrap">
                <div className="font-display font-bold">
                  {!planned && !j.arrived && <span className="font-normal text-slate">≈</span>}
                  {j.arrived ?? j.eta ?? j.planned_start}
                </div>
                <div className="text-xs text-slate">
                  {j.duration_min ? hours(j.duration_min) : ""}
                  {j.time_window && <span className="block uppercase">{j.time_window === "morning" ? "am" : "pm"}</span>}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <JobLink job={j} className="text-sm" />
                  <JobStatusBadge status={j.status} />
                </div>
                <p className="truncate text-sm text-slate">
                  {j.customer} · {j.suburb ?? j.address}
                </p>
                <p className="mt-0.5 text-xs">
                  <TierLabel tier={j.tier} />
                  {j.from_pool && <span className="ml-2 text-violet-700">from standby pool</span>}
                  {j.eta && j.planned_start && j.eta !== j.planned_start && !j.arrived && (
                    <span className="ml-2 text-amber-800">booked {j.planned_start}</span>
                  )}
                </p>
              </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
