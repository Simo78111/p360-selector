import Link from "next/link";
import { bookNowAction, moveJobAction, planRouteAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, hours, JobLink, JobStatusBadge, NotConnected, shortDate, TierLabel } from "@/components/office/bits";
import { aucklandToday, loadDay, loadJobs, officeEnabled, shiftDate, validDate, type OfficeDay, type PlumberDay } from "@/lib/office";
import { can, requireOffice } from "@/lib/auth";
import { loadTodayActions, type TodayActions } from "@/lib/reports";
import { loadHsToday, type HsToday } from "@/lib/hs";

export const metadata = { title: "Today" };

type Props = { searchParams: Promise<{ date?: string; ok?: string; err?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { date: dateParam, ok, err } = await searchParams;
  let actions: TodayActions | null = null;
  let actionsError: string | null = null;
  try {
    actions = await loadTodayActions(session);
  } catch (e) {
    actionsError = e instanceof Error ? e.message : String(e);
  }
  // Phase 5b: health and safety cards (left out quietly if they can't be read)
  const hsToday: HsToday | null = can(session, "jobs") ? await loadHsToday(session).catch(() => null) : null;

  // Project 360-only office managers: the to-do cards (the booking engine's day board is Plumbing 360's).
  if (!can(session, "bookings")) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate">Today</p>
          <h1 className="text-2xl font-bold">What&apos;s waiting</h1>
        </div>
        <Flash ok={ok} err={err} />
        <ActionCards actions={actions} error={actionsError} hs={hsToday} />
      </div>
    );
  }
  const today = aucklandToday();
  const date = validDate(dateParam) ?? today;
  const here = `/dashboard/office?date=${date}`;

  let day: OfficeDay;
  let overdue = 0;
  try {
    const [d, o] = await Promise.all([loadDay(date), loadJobs("", "overdue")]);
    day = d;
    overdue = o.length;
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const jobCount = day.plumbers.reduce((n, p) => n + p.jobs.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate">{date === today ? "Today" : date < today ? "Past day" : "Coming up"}</p>
          <h1 className="text-3xl font-bold">{day.date_local}</h1>
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
            <button type="submit" className="ml-1 rounded-xl bg-[#0F172A] px-3 py-1.5 text-sm font-semibold text-white">
              Go
            </button>
          </form>
        </nav>
      </div>

      <Flash ok={ok} err={err} />

      {date === today && <ActionCards actions={actions} error={actionsError} hs={hsToday} />}

      {(overdue > 0 || day.attention > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {overdue > 0 && (
            <Link href="/dashboard/office/jobs?f=overdue"
              className="flex items-center gap-4 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 hover:bg-red-100">
              <span className="text-3xl font-bold text-red-700 tabular-nums">{overdue}</span>
              <span className="min-w-0 flex-1 text-sm text-red-950">
                <strong>job{overdue === 1 ? " was" : "s were"} booked for an earlier day and {overdue === 1 ? "isn't" : "aren't"} done.</strong>{" "}
                Move them in one go from the Jobs list.
              </span>
              <span className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white">Review</span>
            </Link>
          )}
          {day.attention > 0 && (
            <Link href="/dashboard/office/attention"
              className="flex items-center gap-4 rounded-2xl bg-[#0F172A] px-5 py-4 text-white hover:bg-slate-800">
              <span className="text-3xl font-bold text-sky-400 tabular-nums">{day.attention}</span>
              <span className="min-w-0 flex-1 text-sm text-slate-200">
                <strong className="text-white">thing{day.attention === 1 ? "" : "s"} need{day.attention === 1 ? "s" : ""} you.</strong> Everything else is running itself.
              </span>
              <span className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold whitespace-nowrap text-sky-950">Open</span>
            </Link>
          )}
        </div>
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
              <button type="submit" className="rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white">
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
        <>
          {day.plumbers.some((p) => p.jobs.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {day.plumbers.filter((p) => p.jobs.length > 0).map((p) => (
                <PlumberColumn key={p.id} plumber={p} planned={day.planned} />
              ))}
            </div>
          )}
          {day.plumbers.some((p) => p.jobs.length === 0) && <FreePlumbers plumbers={day.plumbers.filter((p) => p.jobs.length === 0)} />}
        </>
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
                      className="rounded-xl bg-sky-400 px-4 py-1.5 text-sm font-semibold text-sky-950 hover:bg-sky-300 disabled:opacity-40"
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
                      <select id={`pl-${j.job_id}`} name="plumberId" className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm">
                        {day.plumbers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-500">
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

// ── What's waiting for the office (Phase 3e) ────────────────────────────────
const TILE = {
  red: { border: "border-red-600", text: "text-red-700" },
  amber: { border: "border-amber-500", text: "text-amber-700" },
  blue: { border: "border-sky-500", text: "text-[#0F172A]" },
} as const;
type Card = { key: string; count: number; title: string; detail?: string; href: string; tone?: "red" | "amber" };

function ActionCards({ actions: a, error, hs }: { actions: TodayActions | null; error: string | null; hs: HsToday | null }) {
  if (!a) {
    return error ? <p className="rounded-2xl bg-white p-4 text-sm text-slate">The to-do list didn&apos;t load: {error}</p> : null;
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const cards: Card[] = [
    { key: "to_invoice", count: a.to_invoice + a.labour_complete,
      title: plural(a.to_invoice + a.labour_complete, "phase ready to invoice", "phases ready to invoice"),
      detail: [a.to_invoice && `${a.to_invoice} To Invoice`, a.labour_complete && `${a.labour_complete} Labour Complete`].filter(Boolean).join(" · ") || undefined,
      // Labour Complete phases aren't on the Invoices → To Invoice tab yet; the Unbilled work report shows both
      href: a.labour_complete ? "/dashboard/office/reports/unbilled" : "/dashboard/office/invoices?tab=to_invoice" },
    { key: "approve", count: a.can_approve_invoices ? a.invoices_to_approve : a.invoices_draft,
      title: a.can_approve_invoices ? plural(a.invoices_to_approve, "invoice to approve", "invoices to approve")
                                    : plural(a.invoices_draft, "draft invoice", "draft invoices"),
      href: "/dashboard/office/invoices?tab=draft" },
    { key: "supplier", count: a.supplier_to_approve, title: plural(a.supplier_to_approve, "supplier invoice to approve", "supplier invoices to approve"),
      detail: a.supplier_no_job ? `${a.supplier_no_job} with no job found` : undefined,
      href: "/dashboard/office/supplier-invoices", tone: a.supplier_no_job ? "amber" : undefined },
    ...(a.can_approve_timesheets ? [
      { key: "timesheets", count: a.timesheet_days, title: plural(a.timesheet_days, "timesheet day to approve", "timesheet days to approve"),
        detail: "Confirmed by the plumber", href: "/dashboard/office/timesheets" },
      { key: "leave", count: a.leave_waiting, title: plural(a.leave_waiting, "leave request waiting", "leave requests waiting"),
        detail: a.leave_names.length ? a.leave_names.join(", ") : undefined, href: "/dashboard/office/timesheets", tone: "amber" as const },
    ] : []),
    { key: "schedule", count: a.to_schedule, title: plural(a.to_schedule, "phase to schedule", "phases to schedule"),
      href: "/dashboard/office/diary" },
    ...(hs ? hsCards(hs, plural) : []),
  ];
  const xero = a.invoices_xero_failed + a.supplier_xero_failed;
  const waiting = cards.filter((c) => c.count > 0);
  const clear = cards.filter((c) => c.count === 0);

  return (
    <section aria-labelledby="todo-heading" className="space-y-3" data-testid="today-actions">
      <h2 id="todo-heading" className="sr-only">Waiting for the office</h2>
      {xero > 0 && (
        <Link href={a.invoices_xero_failed ? "/dashboard/office/invoices?tab=approved" : "/dashboard/office/supplier-invoices"}
          className="flex items-center justify-between gap-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 hover:bg-red-100" role="alert">
          <strong>{plural(xero, "invoice", "invoices")} didn&apos;t go to Xero.</strong>
          <span className="text-sm font-semibold whitespace-nowrap">Fix →</span>
        </Link>
      )}
      {waiting.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {waiting.map((c) => (
            <li key={c.key}>
              {/* Big-number tiles (Simon, 8 Nov): red needs someone now, amber keep an eye on, blue routine work */}
              <Link href={c.href} data-testid={`todo-${c.key}`} title={c.detail ? `${c.title} — ${c.detail}` : c.title}
                className={`flex h-full flex-col gap-1 rounded-2xl border-t-[5px] bg-white p-4 shadow-sm hover:shadow-md ${TILE[c.tone ?? "blue"].border}`}>
                <span className={`text-4xl leading-none font-bold tabular-nums ${TILE[c.tone ?? "blue"].text}`}>{c.count}</span>
                <span className="mt-1 text-sm leading-snug font-semibold">{c.title.replace(/^\d+ /, "")}</span>
                {c.detail && <span className="line-clamp-2 text-xs text-slate-500">{c.detail}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"><strong>All clear.</strong> Nothing waiting for the office.</p>
      )}
      {waiting.length > 0 && clear.length > 0 && (
        <p className="text-xs text-slate">Nothing waiting: {clear.map((c) => c.title.replace(/^0 /, "")).join(" · ")}</p>
      )}
      {a.quotes_accepted_7d > 0 && (
        <p className="text-sm text-slate">{plural(a.quotes_accepted_7d, "quote", "quotes")} accepted in the last 7 days.</p>
      )}
    </section>
  );
}

// Phase 5b/5c: SWMS to approve, jobs starting within 3 days with no approved SWMS (red), workers still to sign.
function hsCards(hs: HsToday, plural: (n: number, one: string, many: string) => string): Card[] {
  const REG = "/dashboard/office/health-safety?show=action";
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", timeZone: "Pacific/Auckland" });
  const approve = hs.can_approve ? hs.to_approve : hs.to_check;
  return [
    { key: "hs_start", count: hs.start_soon.length, tone: "red",
      title: `${plural(hs.start_soon.length, "job starts", "jobs start")} within 3 days with no approved SWMS`,
      detail: hs.start_soon.map((x) => `${x.job_ref} ${when(x.starts)}`).join(" · "), href: REG },
    { key: "hs_approve", count: approve, title: plural(approve, hs.can_approve ? "SWMS to approve" : "SWMS to check", hs.can_approve ? "SWMSs to approve" : "SWMSs to check"),
      href: REG },
    { key: "hs_sign", count: hs.to_sign.length, tone: "amber",
      title: `${plural(hs.to_sign.length, "worker", "workers")} still to sign the SWMS`,
      detail: hs.to_sign.map((x) => `${x.name.split(" ")[0]} (${x.job_ref}, ${when(x.starts)})`).join(" · "), href: REG },
    // 5c: scope changes to check, ticket gaps on jobs starting soon, tickets running out in the next 30 days
    { key: "hs_scope", count: hs.scope_changed?.length ?? 0, tone: "amber",
      title: `${plural(hs.scope_changed?.length ?? 0, "job's scope", "jobs' scope")} changed — update the SWMS?`,
      detail: (hs.scope_changed ?? []).map((x) => x.job_ref).join(" · "),
      href: hs.scope_changed?.length === 1 ? `/dashboard/office/job/${encodeURIComponent(hs.scope_changed[0].job_ref)}?tab=hs` : REG },
    { key: "hs_tickets", count: hs.ticket_gaps?.length ?? 0, tone: "amber",
      title: `${plural(hs.ticket_gaps?.length ?? 0, "job starts", "jobs start")} within 3 days with a missing or expired ticket`,
      detail: (hs.ticket_gaps ?? []).map((x) => `${x.job_ref} ${when(x.starts)} (${x.warnings})`).join(" · "),
      href: hs.ticket_gaps?.length === 1 ? `/dashboard/office/job/${encodeURIComponent(hs.ticket_gaps[0].job_ref)}?tab=hs` : REG },
    { key: "hs_expiring", count: hs.tickets_expiring?.length ?? 0, tone: (hs.tickets_expiring ?? []).some((x) => x.expired) ? "red" : "amber",
      title: `${plural(hs.tickets_expiring?.length ?? 0, "licence or ticket", "licences and tickets")} expired or expiring in 30 days`,
      detail: (hs.tickets_expiring ?? []).map((x) => `${x.name.split(" ")[0]}: ${x.label} ${x.expired ? "expired" : "expires"} ${new Date(x.expires_on).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}`).join(" · "),
      href: "/dashboard/office/staff" },
  ];
}

function DayLink({ date, label }: { date: string; label: string }) {
  return (
    <Link href={`/dashboard/office?date=${date}`} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-800 hover:border-slate-500">
      {label}
    </Link>
  );
}

/** Plumbers with nothing booked: one line each instead of a card each (Simon, 8 Nov). */
function FreePlumbers({ plumbers }: { plumbers: PlumberDay[] }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white" data-testid="free-plumbers">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-bold">Nothing booked</h2>
        <span className="text-xs text-slate-600">The standby pool will offer this time to Flexi customers.</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
          <tr><th className="px-5 py-2">Plumber</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Status</th><th className="px-5 py-2 text-right">Last seen</th></tr>
        </thead>
        <tbody>
          {plumbers.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-5 py-2.5">
                <span className="flex items-center gap-3">
                  <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-xs font-semibold text-white">
                    {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className="font-medium">{p.name}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{p.shift}</td>
              <td className="px-3 py-2.5"><span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">Free</span></td>
              <td className="px-5 py-2.5 text-right text-slate-600">{p.last_seen?.today ? p.last_seen.at : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
