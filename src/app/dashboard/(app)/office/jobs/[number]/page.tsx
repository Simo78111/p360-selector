import { QuoteReview } from "@/components/office/QuoteReview";
import { loadJobCosts, loadJobQuotes, type JobCosts, type Quote } from "@/lib/automation";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNoteAction,
  bookCallbackAction,
  confirmNoteAction,
  forgetProfileAction,
  removeNoteAction,
  bookNowAction,
  cancelJobAction,
  moveJobAction,
  returnVisitAction,
  simulateTextAction,
  updateJobAction,
} from "@/app/dashboard/office-actions";
import { EngineError, Flash, hours, JobLink, JobStatusBadge, NotConnected, TierLabel } from "@/components/office/bits";
import { formatPrice } from "@/lib/site";
import { ExtraWorkBuilder } from "@/components/office/ExtraWorkBuilder";
import { JobPhotos } from "@/components/office/JobPhotos";
import {
  aucklandToday,
  loadJob,
  loadJobMaterials,
  loadJobPhotos,
  loadJobVisit,
  loadProfile,
  NOTE_KINDS,
  type ProfileNote,
  loadLabourRates,
  loadTextSettings,
  officeEnabled,
  type JobDetail,
  type JobMaterialLine,
  type JobPhoto,
  type Visit,
  type LabourRates,
  type TextSettings,
  type TimelineEntry,
} from "@/lib/office";

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
  let materials: JobMaterialLine[] = [];
  let rates: LabourRates | null = null;
  let visit: Visit | null = null;
  let texts: TextSettings | null = null;
  let profile: ProfileNote[] = [];
  let photos: JobPhoto[] = [];
  let photoError: string | null = null;
  let quotes: Quote[] = [];
  let costs: JobCosts | null = null;
  try {
    job = await loadJob(n);
    if (job) {
      [materials, rates, visit, texts, profile] = await Promise.all([
        loadJobMaterials(job.job_id),
        loadLabourRates(job.job_id),
        loadJobVisit(job.job_id),
        loadTextSettings().catch(() => null),
        loadProfile(job.job_id),
      ]);
      [quotes, costs] = await Promise.all([
        loadJobQuotes(job.job_id).catch(() => []),
        loadJobCosts(job.job_id).catch(() => null),
      ]);
      photos = await loadJobPhotos(job.job_id).catch((e) => {
        photoError = e instanceof Error ? e.message : String(e);
        return [];
      });
    }
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!job) notFound();

  const here = `/dashboard/office/jobs/${job.job_number}`;
  const waiting = ["requested", "pooled", "offered"].includes(job.status);
  const movable = job.status === "scheduled" || (waiting && job.status !== "offered");
  const cancellable = !["on_site", "completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const done = ["completed", "invoiced", "paid"].includes(job.status);
  // started but never finished (or marked "couldn't finish"): back in the diary
  const needsReturn = job.couldnt_finish || (job.overdue && ["en_route", "on_site"].includes(job.status));
  const input = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2";
  const canAddWork = ["scheduled", "en_route", "on_site"].includes(job.status);
  const extraPending = materials.some((m) => m.quote_status === "sent");
  const quoteLabel: Record<string, string> = {
    sent: "Waiting for YES", accepted: "Approved", declined: "Declined", no_reply: "No reply", expired: "No reply",
  };

  const details: [string, React.ReactNode][] = [
    ["Customer", <>{job.customer}{job.other_jobs > 0 && <span className="text-slate"> · {job.other_jobs} other job{job.other_jobs === 1 ? "" : "s"}</span>}</>],
    ["Phone", <a key="p" href={`tel:${job.phone}`} className="text-aqua-deep hover:underline">{job.phone}</a>],
    ["Email", job.email ?? "None"],
    ["Address", <a key="a" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.address}, ${job.suburb ?? ""} ${job.postcode ?? ""}`)}`} target="_blank" rel="noreferrer" className="text-aqua-deep hover:underline">{job.address}, {job.suburb} {job.postcode}</a>],
    ["Access", job.access_notes || "None"],
    ["Price", job.callback_of ? "No charge (callback)" : `from ${formatPrice(Number(job.price_incl_gst))} incl. GST`],
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
              {job.day_planned === false && (
                <p className="text-xs text-slate">Exact time texted the afternoon before</p>
              )}
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

      {job.callback_of && (
        <p className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4 text-sm">
          <strong>Callback for <JobLink job={{ job_number: job.callback_of, service: "" }} className="font-bold" /></strong>, no
          charge. {job.callback_reason}
          {job.callback_plumber && <span className="text-slate"> · original work by {job.callback_plumber}</span>}
        </p>
      )}
      {(job.overdue || job.couldnt_finish) && (
        <p className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {job.couldnt_finish
            ? "The plumber marked this job as couldn't be finished. Book a return visit below."
            : needsReturn
              ? "This job was started on an earlier day but never marked done. Book a return visit, or check with the plumber."
              : "This job was booked for an earlier day and hasn't been done. Move it to a new day below."}
        </p>
      )}
      {job.office_notes && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm whitespace-pre-line">
          <strong>Office notes:</strong> {job.office_notes}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {visit && (visit.arrived || visit.on_my_way || done) && <WhatHappened visit={visit} job={job} />}
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

            <details className="mt-6 rounded-xl border border-black/10 p-4">
              <summary className="cursor-pointer font-semibold">Edit details</summary>
              <form action={updateJobAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="jobId" value={job.job_id} />
                <input type="hidden" name="back" value={here} />
                <label className="text-sm font-medium">Customer name<input name="full_name" defaultValue={job.customer} className={input} /></label>
                <label className="text-sm font-medium">Mobile<input name="phone" defaultValue={job.phone.replace(/^\+64/, "0")} className={input} /></label>
                <label className="text-sm font-medium sm:col-span-2">Email<input name="email" type="email" defaultValue={job.email ?? ""} className={input} /></label>
                <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-[1fr_12rem_7rem]">
                  <legend className="mb-1 text-sm font-medium">
                    Address <span className="font-normal text-slate">(changes are checked on the map)</span>
                  </legend>
                  <input aria-label="Street" name="address_line" defaultValue={job.address} className={input} />
                  <input aria-label="Suburb" name="suburb" defaultValue={job.suburb ?? ""} className={input} />
                  <input aria-label="Postcode" name="postcode" defaultValue={job.postcode ?? ""} className={input} />
                  <label className="flex items-center gap-2 text-sm text-slate sm:col-span-3">
                    <input type="checkbox" name="address_changed" value="1" className="h-4 w-4 accent-aqua-deep" />
                    Tick if you changed the address
                  </label>
                </fieldset>
                <label className="text-sm font-medium sm:col-span-2">What&apos;s the job
                  <textarea name="description" defaultValue={job.description ?? ""} rows={3} className={input} />
                </label>
                <label className="text-sm font-medium sm:col-span-2">Access notes (gate codes, dogs, parking)
                  <input name="access_notes" defaultValue={job.access_notes ?? ""} className={input} />
                </label>
                <label className="text-sm font-medium">Service
                  <select name="service_code" defaultValue={job.service_code ?? ""} disabled={job.invoiced} className={input}>
                    {job.services.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({formatPrice(Number(s.price_incl_gst))})
                      </option>
                    ))}
                  </select>
                  {job.invoiced && <span className="text-xs font-normal text-slate">Invoiced: change it in Xero</span>}
                </label>
                <label className="text-sm font-medium">Job length (minutes)
                  <input name="duration_min" type="number" min={15} max={600} step={15} defaultValue={job.duration_min ?? 60} className={input} />
                </label>
                <label className="text-sm font-medium sm:col-span-2">Office notes <span className="font-normal text-slate">(never sent to the customer)</span>
                  <textarea name="office_notes" defaultValue={job.office_notes ?? ""} rows={2} className={input} />
                </label>
                <button type="submit" className="w-fit rounded-full bg-ink px-5 py-2 font-semibold text-white">
                  Save changes
                </button>
              </form>
            </details>
          </section>

          {job.callback_jobs.length > 0 && (
            <section className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold">Callbacks for this job</h2>
              <ul className="mt-3 divide-y divide-black/5">
                {job.callback_jobs.map((c) => (
                  <li key={c.job_number} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <JobLink job={{ job_number: c.job_number, service: "" }} /> {c.reason}
                    </span>
                    <span className="flex items-center gap-2 text-slate">
                      {c.when_local ?? "not booked yet"} <JobStatusBadge status={c.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Profile notes={profile} jobId={job.job_id} back={here} firstName={job.customer.split(" ")[0]} />

          {(quotes.length > 0 || (costs && (costs.orders.length > 0 || costs.bills.length > 0))) && (
            <section className="rounded-2xl bg-white p-5 sm:p-6" id="quotes">
              <h2 className="text-lg font-bold">Quotes, parts and costs</h2>
              {quotes.map((q) => (
                <div key={q.id} className="mt-3 border-t border-black/5 pt-3 text-sm">
                  <p>
                    <strong>Quote:</strong> {q.summary} — ${Number(q.total).toFixed(2)} incl GST ·{" "}
                    {{ draft: "waiting for you to check", sent: "sent, waiting for YES", accepted: "accepted", declined: "declined" }[q.status] ?? q.status}
                    {q.booked_job_number && (
                      <> · booked as <Link href={`/dashboard/office/jobs/${q.booked_job_number}`} className="text-aqua-deep hover:underline">job #{q.booked_job_number}</Link></>
                    )}
                  </p>
                  {q.status === "draft" && <QuoteReview quote={q} back={here} />}
                </div>
              ))}
              {costs && (costs.orders.length > 0 || costs.bills.length > 0) && (
                <div className="mt-3 border-t border-black/5 pt-3 text-sm">
                  {costs.orders.map((o) => (
                    <p key={o.po_number}>{o.po_number} · {o.supplier} · {o.status}{o.estimate != null && ` · about $${Number(o.estimate).toFixed(2)}`}</p>
                  ))}
                  {costs.bills.map((b, i) => (
                    <p key={i} className="text-slate">Bill {b.number} · {b.supplier} · ${Number(b.total ?? 0).toFixed(2)}</p>
                  ))}
                  <p className="mt-2 font-semibold">
                    Supplier bills ${Number(costs.bills_total).toFixed(2)} · invoiced ${Number(costs.invoiced).toFixed(2)}
                    {costs.invoiced > 0 && ` · materials ${Math.round((Number(costs.bills_total) / Number(costs.invoiced)) * 100)}% of the invoice`}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 sm:p-6" id="materials">
            <h2 className="text-lg font-bold">Materials and extra work</h2>
            {materials.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-slate">
                    <tr>
                      <th className="py-1 font-medium">Item</th>
                      <th className="py-1 font-medium">Qty</th>
                      <th className="py-1 text-right font-medium">Charged excl GST</th>
                      <th className="py-1 text-right font-medium">Cost</th>
                      <th className="py-1 pl-3 font-medium">Customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="py-2">
                          {m.description}
                          {m.code && <span className="block font-mono text-xs text-slate">{m.code} · {m.supplier}</span>}
                        </td>
                        <td className="py-2">{Number(m.quantity)}</td>
                        <td className="py-2 text-right">${Number(m.line_total).toFixed(2)}</td>
                        <td className="py-2 text-right text-slate">{m.cost_total !== null ? `$${Number(m.cost_total).toFixed(2)}` : "–"}</td>
                        <td className="py-2 pl-3 text-xs">
                          {quoteLabel[m.quote_status] ?? m.quote_status}
                          <span className="block text-slate">{m.sent}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canAddWork ? (
              <div className="mt-4">
                <p className="mb-3 text-sm text-slate">
                  Add materials from the price books, labour or anything else. {job.customer.split(" ")[0]} is texted the price
                  and replies YES; approved work goes on the invoice.
                </p>
                <ExtraWorkBuilder jobId={job.job_id} firstName={job.customer.split(" ")[0]} pending={extraPending} rates={rates} />
              </div>
            ) : (
              materials.length === 0 && <p className="mt-3 text-sm text-slate">No extra work or materials on this job.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 sm:p-6" id="photos">
            <h2 className="text-lg font-bold">Photos</h2>
            {photoError && <p className="mt-2 text-sm text-red-800">{photoError}</p>}
            <div className="mt-3">
              <JobPhotos
                jobId={job.job_id}
                jobNumber={job.job_number}
                photos={photos}
                customerEmail={job.email}
                firstName={job.customer.split(" ")[0]}
                back={here}
              />
            </div>
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
          {texts?.sms_mode === "test" && (
            <section className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-5">
              <h2 className="font-bold">Test: text as {job.customer.split(" ")[0]}</h2>
              <p className="mt-1 text-sm text-slate">
                Texts are in test mode, so you can pretend to be the customer. Try YES to approve extra work, or a question like
                &ldquo;what time are you coming?&rdquo;. The reply shows under History.
              </p>
              <form action={simulateTextAction} className="mt-3 space-y-2">
                <input type="hidden" name="jobId" value={job.job_id} />
                <input type="hidden" name="back" value={here} />
                <label className="sr-only" htmlFor="sim-text">Customer&apos;s text</label>
                <textarea id="sim-text" name="body" rows={2} required maxLength={500} placeholder="Their text…"
                          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
                <button className="rounded-full bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Send as customer</button>
              </form>
            </section>
          )}
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
                Planned days (today, or tomorrow after the afternoon planning): after their last job, and the customer
                is texted the time. Other days: wherever it adds the least driving, and the customer is texted the day
                and window.
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

          {needsReturn && (
            <form action={returnVisitAction} className="rounded-2xl border-2 border-red-200 bg-white p-5">
              <h2 className="font-bold">Book a return visit</h2>
              <p className="mt-1 text-sm text-slate">Same job, back in the diary. The customer is texted the new day.</p>
              <input type="hidden" name="jobId" value={job.job_id} />
              <input type="hidden" name="back" value={here} />
              <label className="mt-3 block text-sm font-medium" htmlFor="rv-plumber">Plumber</label>
              <select id="rv-plumber" name="plumberId" defaultValue={job.plumber_id ?? undefined} className={input}>
                {job.plumbers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label className="mt-3 block text-sm font-medium" htmlFor="rv-date">Day</label>
              <input id="rv-date" name="date" type="date" min={aucklandToday()} defaultValue={aucklandToday()} required className={input} />
              <button type="submit" className="mt-4 w-full rounded-full bg-ink px-4 py-2 font-semibold text-white">
                Book return visit
              </button>
            </form>
          )}

          {done && (
            <form action={bookCallbackAction} className="rounded-2xl border-2 border-orange-200 bg-white p-5">
              <h2 className="font-bold">Book a callback</h2>
              <p className="mt-1 text-sm text-slate">
                Rework on this job, at no charge. It becomes a new job linked to this one, and is tracked against the
                plumber who did the work.
              </p>
              <input type="hidden" name="jobId" value={job.job_id} />
              <input type="hidden" name="back" value={here} />
              <label className="mt-3 block text-sm font-medium" htmlFor="cb-reason">What needs fixing</label>
              <textarea id="cb-reason" name="reason" required rows={2} className={input} placeholder="e.g. Mixer still dripping" />
              <label className="mt-3 block text-sm font-medium" htmlFor="cb-plumber">Plumber</label>
              <select id="cb-plumber" name="plumberId" defaultValue="" className={input}>
                <option value="">First free slot (any plumber)</option>
                {job.plumbers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label className="mt-3 block text-sm font-medium" htmlFor="cb-date">Day <span className="font-normal text-slate">(with a plumber)</span></label>
              <input id="cb-date" name="date" type="date" min={aucklandToday()} className={input} />
              <button type="submit" className="mt-4 w-full rounded-full bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700">
                Book callback
              </button>
            </form>
          )}

          {job.customer_jobs.length > 0 && (
            <section className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">{job.customer}&apos;s other jobs</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {job.customer_jobs.slice(0, 10).map((o) => (
                  <li key={o.job_number} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <JobLink job={{ job_number: o.job_number, service: o.service }} className="font-medium" />
                    </span>
                    <span className="shrink-0 text-xs text-slate">{o.created}</span>
                  </li>
                ))}
              </ul>
            </section>
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

const mins = (m: number) => (m >= 60 ? hours(m) : `${m} min`);

function WhatHappened({ visit: v, job }: { visit: Visit; job: JobDetail }) {
  const late = v.arrived_vs_planned_min;
  const rows: [string, React.ReactNode][] = [
    ["Booked", job.created_local],
    ["Planned for", v.planned_start ? `${v.planned_start}${v.planned_min ? ` · ${mins(v.planned_min)} planned` : ""}` : null],
    ["On the way", v.on_my_way ? `${v.on_my_way}${v.drive_min ? ` · about ${v.drive_min} min drive` : ""}` : null],
    [
      "Arrived",
      v.arrived ? (
        <>
          {v.arrived}
          {late !== null && (
            <span className={`ml-2 text-xs font-semibold ${late > 15 ? "text-red-700" : late < -5 ? "text-emerald-700" : "text-slate"}`}>
              {Math.abs(late) <= 5 ? "on time" : late > 0 ? `${mins(late)} late` : `${mins(-late)} early`}
            </span>
          )}
        </>
      ) : null,
    ],
    ["Ran long", v.running_long_min ? `Plumber added ${mins(v.running_long_min)}` : null],
    ["Couldn't finish", v.cant_finish],
    [
      "Finished",
      v.finished ? (
        <>
          {v.finished}
          {v.on_site_min !== null && (
            <span className="ml-2 text-xs text-slate">
              {mins(v.on_site_min)} on site{v.planned_min ? ` (planned ${mins(v.planned_min)})` : ""}
            </span>
          )}
        </>
      ) : null,
    ],
    ["Plumber's note", v.completion_note],
    ["Return visit", v.return_visit ? "Yes — this job was booked back in after the first visit" : null],
    ["Invoice sent", v.invoice_sent],
    ["Paid", v.paid],
    ["Texts", `${v.texts_sent} sent, ${v.texts_received} received`],
    ["Photos", v.photos ? <a key="ph" href="#photos" className="text-aqua-deep hover:underline">{v.photos} photo{v.photos === 1 ? "" : "s"}</a> : "None yet"],
  ];
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="what-happened">
      <h2 id="what-happened" className="text-lg font-bold">What happened</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        {rows
          .filter(([, value]) => value !== null && value !== undefined && value !== "")
          .map(([k, value]) => (
            <div key={k} className="contents">
              <dt className="text-slate">{k}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-3 text-xs text-slate">Every text and update, in order, is under History below.</p>
    </section>
  );
}

function Profile({ notes, jobId, back, firstName }: { notes: ProfileNote[]; jobId: string; back: string; firstName: string }) {
  const small = "rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:border-ink";
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" id="profile" aria-labelledby="profile-h">
      <h2 id="profile-h" className="text-lg font-bold">About {firstName} and the property</h2>
      <p className="mt-1 text-sm text-slate">
        Practical things that make visits smoother. Plumbers see these on the job; gate codes only on the day. Not for
        children&apos;s names or health details.
      </p>
      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-slate">Nothing noted yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5" aria-label="Profile notes">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm">
                  <span aria-hidden className="mr-1.5">{NOTE_KINDS[n.kind]?.icon}</span>
                  <span className="font-semibold">{n.label}:</span> {n.body}
                  {n.stale && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">over a year old: check it</span>}
                </p>
                <p className="text-xs text-slate">
                  {n.about === "customer" ? "About the customer" : "About the property"} · {n.source} · {n.noted}
                  {n.checked !== n.noted && ` · checked ${n.checked}`}
                  {n.job_number && ` · job #${n.job_number}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                <form action={confirmNoteAction}>
                  <input type="hidden" name="noteId" value={n.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className={small}>Still right</button>
                </form>
                <form action={removeNoteAction}>
                  <input type="hidden" name="noteId" value={n.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className={`${small} hover:border-red-700 hover:text-red-700`} aria-label={`Remove ${n.label}`}>Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form action={addNoteAction} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="back" value={back} />
        <label className="sr-only" htmlFor="note-kind">Kind of note</label>
        <select id="note-kind" name="kind" defaultValue="access" className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm">
          {Object.entries(NOTE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="note-body">Note</label>
        <input id="note-body" name="body" required maxLength={300} placeholder="e.g. Max the labrador, friendly"
               className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm" />
        <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Add note</button>
      </form>
      {notes.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate hover:text-ink">Customer asked us to forget their details?</summary>
          <form action={forgetProfileAction} className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3">
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="back" value={back} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sure" className="h-4 w-4" /> Wipe every note about {firstName} and their property
            </label>
            <button className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white">Wipe notes</button>
          </form>
        </details>
      )}
    </section>
  );
}
