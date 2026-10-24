import Link from "next/link";
import { notFound } from "next/navigation";
import { bookNowAction, cancelJobAction, moveJobAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, hours, JobStatusBadge, NotConnected, TierLabel } from "@/components/office/bits";
import { formatPrice } from "@/lib/site";
import { aucklandToday, loadJob, officeEnabled, type JobDetail, type TimelineEntry } from "@/lib/office";

export const metadata = { title: "Job" };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const kindStyle: Record<TimelineEntry["kind"], { label: string; dot: string }> = {
  text_out: { label: "Text to customer", dot: "bg-aqua" },
  text_in: { label: "Text from customer", dot: "bg-amber-400" },
  status: { label: "Plumber", dot: "bg-emerald-500" },
  system: { label: "System", dot: "bg-black/20" },
};

export default async function JobPage({ params, searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { number } = await params;
  const { ok, err } = await searchParams;
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) notFound();

  let job: JobDetail | null;
  try {
    job = await loadJob(n);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!job) notFound();

  const here = `/dashboard/office/jobs/${job.job_number}`;
  const waiting = ["requested", "pooled", "offered"].includes(job.status);
  const movable = job.status === "scheduled" || (waiting && job.status !== "offered");
  const cancellable = !["on_site", "completed", "invoiced", "paid", "cancelled"].includes(job.status);

  const details: [string, React.ReactNode][] = [
    ["Customer", <>{job.customer}{job.other_jobs > 0 && <span className="text-slate"> · {job.other_jobs} other job{job.other_jobs === 1 ? "" : "s"}</span>}</>],
    ["Phone", <a key="p" href={`tel:${job.phone}`} className="text-aqua-deep hover:underline">{job.phone}</a>],
    ["Email", job.email ?? "None"],
    ["Address", <a key="a" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.address}, ${job.suburb ?? ""} ${job.postcode ?? ""}`)}`} target="_blank" rel="noreferrer" className="text-aqua-deep hover:underline">{job.address}, {job.suburb} {job.postcode}</a>],
    ["Access", job.access_notes || "None"],
    ["Price", `from ${formatPrice(Number(job.price_incl_gst))} incl. GST`],
    ["Length", job.duration_min ? hours(job.duration_min) : "Not set"],
    ["Wants", job.preferred ?? (job.tier === "flexi" ? `any time before ${job.flexi_latest}` : "Soonest")],
    ["Texts", job.sms_opt_out ? "Opted out (replied STOP)" : job.pool_consent ? "OK, including standby offers" : "Booking texts only"],
    ["Booked in", `${job.created_local}${job.web_reference ? ` · website ${job.web_reference}` : ` · ${job.source}`}`],
  ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/office/jobs" className="text-sm font-medium text-slate hover:text-ink">
        ← All jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate">Job #{job.job_number}</p>
          <h1 className="text-2xl font-bold">{job.service}</h1>
          <div className="mt-2 flex items-center gap-3">
            <JobStatusBadge status={job.status} />
            <TierLabel tier={job.tier} />
          </div>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 text-right">
          {job.when_local ? (
            <>
              <p className="text-xs text-slate">{job.plumber}</p>
              <p className="font-display text-xl font-bold">{job.when_local}</p>
              {job.eta && job.eta !== job.planned_start && !job.arrived && (
                <p className="text-sm text-amber-800">now expected {job.eta}</p>
              )}
              {job.arrived && <p className="text-sm text-slate">arrived {job.arrived}{job.finished && `, finished ${job.finished}`}</p>}
              {job.work_date && (
                <Link href={`/dashboard/office?date=${job.work_date}`} className="text-sm font-medium text-aqua-deep hover:underline">
                  See that day →
                </Link>
              )}
            </>
          ) : (
            <p className="text-slate">No time booked yet</p>
          )}
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold">What the customer said</h2>
            <p className="mt-2 whitespace-pre-line text-sm">{job.description || "Nothing written."}</p>
            <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              {details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold">History</h2>
            {job.timeline.length === 0 ? (
              <p className="mt-3 text-sm text-slate">Nothing yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {job.timeline.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${kindStyle[e.kind].dot}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs text-slate">
                        {e.at} · {kindStyle[e.kind].label}
                        {e.by && <> · {e.by}</>}
                      </p>
                      <p className={`text-sm ${e.kind.startsWith("text") ? "rounded-xl bg-mist px-3 py-2" : ""}`}>{e.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {job.invoices.length > 0 && (
            <section className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold">Invoice</h2>
              {job.invoices.map((inv) => (
                <div key={inv.number ?? "draft"} className="mt-3">
                  <p className="text-sm">
                    <strong>{inv.number ?? "Draft"}</strong> · {inv.status.replaceAll("_", " ")} · total{" "}
                    {formatPrice(Number(inv.total))} · paid {formatPrice(Number(inv.paid))}
                    {inv.due && <> · due {inv.due}</>}
                  </p>
                  <ul className="mt-2 text-sm text-slate">
                    {inv.lines.map((l, i) => (
                      <li key={i}>
                        {l.quantity} × {l.description} @ {formatPrice(Number(l.unit_price_incl_gst))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {waiting && job.status !== "offered" && (
            <form action={bookNowAction} className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">Book a time</h2>
              <p className="mt-1 text-sm text-slate">Puts it in the first free slot that suits the customer and texts them.</p>
              <input type="hidden" name="jobId" value={job.job_id} />
              <input type="hidden" name="back" value={here} />
              <button type="submit" className="mt-3 w-full rounded-full bg-aqua px-4 py-2 font-semibold hover:bg-[#35b9df]">
                Book first free slot
              </button>
            </form>
          )}
          {job.status === "offered" && (
            <p className="rounded-2xl bg-violet-50 p-5 text-sm text-violet-900">
              A standby offer is out to this customer. It&apos;ll be booked if they reply YES, or go back to the pool when the
              offer expires.
            </p>
          )}

          {movable && (
            <form action={moveJobAction} className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">{job.status === "scheduled" ? "Move to another day or plumber" : "Book with a plumber"}</h2>
              <p className="mt-1 text-sm text-slate">
                Goes after their last job that day. The customer is texted the new time.
              </p>
              <input type="hidden" name="jobId" value={job.job_id} />
              <input type="hidden" name="back" value={here} />
              <label className="mt-3 block text-sm font-medium" htmlFor="plumberId">Plumber</label>
              <select id="plumberId" name="plumberId" defaultValue={job.plumber_id ?? undefined} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2">
                {job.plumbers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label className="mt-3 block text-sm font-medium" htmlFor="date">Day</label>
              <input id="date" name="date" type="date" min={aucklandToday()} defaultValue={job.work_date ?? aucklandToday()} required className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
              <button type="submit" className="mt-4 w-full rounded-full bg-ink px-4 py-2 font-semibold text-white">
                {job.status === "scheduled" ? "Move job" : "Book it"}
              </button>
            </form>
          )}

          {cancellable && (
            <form action={cancelJobAction} className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">Cancel job</h2>
              <input type="hidden" name="jobId" value={job.job_id} />
              <input type="hidden" name="back" value={here} />
              <label className="mt-3 block text-sm font-medium" htmlFor="reason">Reason (for your records)</label>
              <input id="reason" name="reason" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" placeholder="e.g. Customer fixed it" />
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-aqua-deep" />
                Text the customer that it&apos;s cancelled
              </label>
              <button type="submit" className="mt-4 w-full rounded-full border-2 border-red-300 px-4 py-2 font-semibold text-red-800 hover:bg-red-50">
                Cancel job #{job.job_number}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
