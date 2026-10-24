import Link from "next/link";
import { EngineError, JobLink, JobStatusBadge, NotConnected, TierLabel } from "@/components/office/bits";
import { loadJobs, officeEnabled, type JobCard } from "@/lib/office";

export const metadata = { title: "Jobs" };

const filters = [
  { id: "open", label: "Open" },
  { id: "today", label: "Today" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

type Props = { searchParams: Promise<{ q?: string; f?: string }> };

export default async function JobsPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { q = "", f } = await searchParams;
  const filter = filters.some((x) => x.id === f) ? f! : q ? "all" : "open";
  const search = q.trim().slice(0, 100);

  let jobs: JobCard[];
  try {
    jobs = await loadJobs(search, filter);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

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
            placeholder="Name, phone, address, suburb or job #"
            className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm sm:w-80"
          />
          <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filter jobs">
        {filters.map((x) => (
          <Link
            key={x.id}
            href={`/dashboard/office/jobs?f=${x.id}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            aria-current={x.id === filter ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ${x.id === filter ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl bg-white">
        {jobs.length === 0 ? (
          <p className="p-6 text-sm text-slate">No jobs match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-5 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Where</th>
                  <th className="px-3 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.job_id} className="border-t border-black/5 hover:bg-aqua-pale/50">
                    <td className="px-5 py-3">
                      <JobLink job={j} />
                      <span className="block">
                        <TierLabel tier={j.tier} />
                        {j.web_reference && <span className="ml-2 text-xs text-slate">{j.web_reference}</span>}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate">
        Showing {jobs.length} job{jobs.length === 1 ? "" : "s"}
        {jobs.length === 200 ? " (the newest 200; search to narrow it down)" : ""}.
      </p>
    </div>
  );
}
