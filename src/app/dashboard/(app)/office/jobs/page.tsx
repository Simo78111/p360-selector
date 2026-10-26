import Link from "next/link";
import { bulkCancelAction, bulkMoveAction } from "@/app/dashboard/office-actions";
import { SelectAll } from "@/components/office/BulkSelect";
import { EngineError, Flash, JobLink, JobStatusBadge, NotConnected, TierLabel } from "@/components/office/bits";
import { aucklandToday, loadJobs, loadPlumbers, officeEnabled, type JobCard } from "@/lib/office";

export const metadata = { title: "Jobs" };

const filters = [
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "callbacks", label: "Callbacks" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

type Props = { searchParams: Promise<{ q?: string; f?: string; ok?: string; err?: string }> };

export default async function JobsPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { q = "", f, ok, err } = await searchParams;
  const filter = filters.some((x) => x.id === f) ? f! : q ? "all" : "open";
  const search = q.trim().slice(0, 100);
  const here = `/dashboard/office/jobs?f=${filter}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  let jobs: JobCard[];
  let plumbers: { id: string; name: string }[] = [];
  let overdueCount = 0;
  try {
    const [j, p, o] = await Promise.all([loadJobs(search, filter), loadPlumbers(), filter === "overdue" ? null : loadJobs("", "overdue")]);
    jobs = j;
    plumbers = p.plumbers.filter((x) => x.active);
    overdueCount = o ? o.length : j.length;
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const canAct = jobs.some((j) => !["completed", "invoiced", "paid", "cancelled"].includes(j.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <form className="flex w-full gap-2 sm:w-auto" action="/dashboard/office/jobs">
          <input type="hidden" name="f" value={filter} />
          <label className="sr-only" htmlFor="q">Search jobs</label>
          <input
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Name, phone, address, job #, invoice #, notes"
            className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm sm:w-96"
          />
          <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </div>

      <Flash ok={ok} err={err} />

      {filter !== "overdue" && overdueCount > 0 && (
        <Link
          href="/dashboard/office/jobs?f=overdue"
          className="flex items-center justify-between gap-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 hover:bg-red-100"
        >
          <span>
            <strong>
              {overdueCount} job{overdueCount === 1 ? " was" : "s were"} booked for an earlier day and{" "}
              {overdueCount === 1 ? "isn't" : "aren't"} done.
            </strong>{" "}
            <span className="text-sm text-red-900">Move them, book a return visit or cancel them.</span>
          </span>
          <span className="text-sm font-semibold whitespace-nowrap">Review →</span>
        </Link>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Filter jobs">
        {filters.map((x) => (
          <Link
            key={x.id}
            href={`/dashboard/office/jobs?f=${x.id}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            aria-current={x.id === filter ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ${x.id === filter ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`}
          >
            {x.label}
            {x.id === "overdue" && overdueCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{overdueCount}</span>
            )}
          </Link>
        ))}
      </nav>

      <form id="jobs-form" className="space-y-3">
        <input type="hidden" name="back" value={here} />
        {canAct && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-ink p-3 text-sm text-white shadow-lg">
            <span data-selected-count className="font-medium">
              Tick jobs to move or cancel them together
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="bulk-date">Move to</label>
              <input id="bulk-date" type="date" name="date" min={aucklandToday()} defaultValue={aucklandToday()} className="rounded-full bg-white px-3 py-1 text-ink" />
              <label htmlFor="bulk-plumber" className="sr-only">Plumber</label>
              <select id="bulk-plumber" name="plumberId" defaultValue="" className="rounded-full bg-white px-3 py-1 text-ink">
                <option value="">their own plumber</option>
                {plumbers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                formAction={bulkMoveAction}
                data-needs-selection
                className="rounded-full bg-aqua px-4 py-1.5 font-semibold text-ink disabled:opacity-40"
              >
                Move
              </button>
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="notify" defaultChecked className="h-4 w-4" /> text customers
              </label>
              <label htmlFor="bulk-reason" className="sr-only">Reason</label>
              <input id="bulk-reason" name="reason" placeholder="Reason (optional)" className="w-40 rounded-full bg-white px-3 py-1 text-ink" />
              <button
                formAction={bulkCancelAction}
                data-needs-selection
                className="rounded-full border border-white/40 px-4 py-1.5 font-semibold disabled:opacity-40"
              >
                Cancel jobs
              </button>
            </span>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white">
          {jobs.length === 0 ? (
            <p className="p-6 text-sm text-slate">No jobs match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-mist text-slate">
                  <tr>
                    <th className="w-10 py-3 pl-5">{canAct && <SelectAll formId="jobs-form" />}</th>
                    <th className="px-3 py-3 font-medium">Job</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">Where</th>
                    <th className="px-3 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const actionable = !["completed", "invoiced", "paid", "cancelled"].includes(j.status);
                    return (
                      <tr key={j.job_id} className={`border-t border-black/5 hover:bg-aqua-pale/50 ${j.overdue ? "bg-red-50/60" : ""}`}>
                        <td className="py-3 pl-5 align-top">
                          {actionable && (
                            <input
                              type="checkbox"
                              name="jobIds"
                              value={j.job_id}
                              aria-label={`Select job #${j.job_number}`}
                              className="mt-1 h-4 w-4 accent-aqua-deep"
                            />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <JobLink job={j} />
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <TierLabel tier={j.tier} />
                            {j.callback_of && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">
                                Callback for #{j.callback_of}
                              </span>
                            )}
                            {j.callbacks > 0 && (
                              <span className="text-xs text-orange-800">
                                {j.callbacks} callback{j.callbacks === 1 ? "" : "s"}
                              </span>
                            )}
                            {j.web_reference && <span className="text-xs text-slate">{j.web_reference}</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {j.customer}
                          <span className="block text-xs text-slate">{j.phone}</span>
                        </td>
                        <td className="px-3 py-3">{j.suburb ?? j.address}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {j.when_local ? (
                            <>
                              {j.when_local}
                              <span className="block text-xs text-slate">{j.plumber}</span>
                            </>
                          ) : (
                            <span className="text-slate">Booked in {j.created_local}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <JobStatusBadge status={j.status} />
                          {j.overdue && <span className="mt-1 block text-xs font-semibold text-red-700">Overdue</span>}
                          {j.couldnt_finish && <span className="mt-1 block text-xs font-semibold text-red-700">Couldn&apos;t finish</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </form>
      <p className="text-xs text-slate">
        Showing {jobs.length} job{jobs.length === 1 ? "" : "s"}
        {jobs.length === 200 ? " (the newest 200; search to narrow it down)" : ""}. Moving a job texts the customer
        its new day and time. Jobs that were started but not finished get a return visit.
      </p>
    </div>
  );
}
