import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addNoteAction,
  addPhaseAction,
  addTaskAction,
  addVariationAction,
  jobStateAction,
  movePhaseAction,
  removeFileAction,
  removeNoteAction,
  saveJobAction,
  savePhaseAction,
  taskAction,
} from "@/app/dashboard/job-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { JobFileUpload } from "@/components/office/JobFileUpload";
import { CompanyBadge, PipelineBar, StageChip, StateBadge } from "@/components/office/jobs-ui";
import { area, input, label, money, nzDate, primaryBtn, quietBtn } from "@/components/office/jm";
import { requireOffice } from "@/lib/auth";
import { fmtBytes, loadJobPage, nzDateTime, STAGES, type JobPage, type Phase } from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";
import { newQuoteAction } from "@/app/dashboard/quote-actions";
import { loadJobMoney, loadJobQuotes, STATUS_LABEL, type JobMoney, type JobQuotes, type Money as MoneyT } from "@/lib/quotes";

export const metadata = { title: "Job" };

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ ok?: string; err?: string; log?: string; tab?: string; scope?: string }> };

const TABS = [
  ["summary", "Job Summary"],
  ["quotes", "Quotes"],
  ["money", "Financial Summary"],
  ["log", "Notes & History"],
  ["files", "Files & Photos"],
  ["tasks", "Tasks"],
] as const;
type Tab = (typeof TABS)[number][0];

const fileUrl = (id: string, dl = false) => `/api/office/job-file?id=${id}${dl ? "&dl=1" : ""}`;

export default async function JobPageView({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const ref = decodeURIComponent((await params).ref).trim();
  const { ok, err, log = "all", tab: tabParam, scope: scopeParam } = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === tabParam)?.[0] ?? (tabParam ? "summary" : "summary")) as Tab;
  if (!/^[A-Za-z0-9-]{1,30}$/.test(ref)) notFound();
  let job: JobPage | null;
  try {
    job = await loadJobPage(session, ref);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!job) notFound();
  let jobMoney: JobMoney | null = null;
  let quotes: JobQuotes | null = null;
  try {
    [jobMoney, quotes] = await Promise.all([
      loadJobMoney(session, job.job_id),
      tab === "quotes" && job.kind === "managed" ? loadJobQuotes(session, job.job_id) : Promise.resolve(null),
    ]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  // A phase number (PTSL-3000b) opens its job.
  if (job.job_ref.toLowerCase() !== ref.toLowerCase()) {
    redirect(`/dashboard/office/job/${encodeURIComponent(job.job_ref)}?tab=${tab}${ok ? `&ok=${encodeURIComponent(ok)}` : err ? `&err=${encodeURIComponent(err)}` : ""}`);
  }

  const base = `/dashboard/office/job/${encodeURIComponent(job.job_ref)}`;
  const path = `${base}?tab=${tab}`;          // forms come back to the same tab
  const scope: "job" | "project" = scopeParam === "job" ? "job" : "project";
  const managed = job.kind === "managed";
  const active = job.state === "active";
  const canEdit = job.can.edit;
  const canWork = job.can.work;
  const realPhases = job.phases.filter((p): p is Phase & { id: string } => p.id !== null);
  const Back = () => <input type="hidden" name="back" value={path} />;

  return (
    <div className="space-y-6" data-testid="job-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <Link href="/dashboard/office/all-jobs" className="text-sm text-slate hover:underline">← All jobs</Link>
        {job.parent && (
          <span className="text-sm text-slate">
            {" · "}Variation of{" "}
            <Link href={`/dashboard/office/job/${encodeURIComponent(job.parent.job_ref)}`} className="font-semibold underline">
              {job.parent.job_ref}
            </Link>
          </span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <CompanyBadge code={job.company.code} />
          <h1 className="text-2xl font-bold" data-testid="job-ref">{managed ? job.job_ref : `#${job.job_ref}`}</h1>
          <span className="text-xl">{job.title}</span>
          <StateBadge state={job.state} />
          {job.restricted && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">Office only</span>}
        </div>
        {job.state === "on_hold" && job.hold_reason && <p className="mt-1 text-sm text-amber-900">On hold: {job.hold_reason}</p>}
      </div>
      <Flash ok={ok} err={err} />

      {job.booking && (
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm" data-testid="booking-banner">
          <p>
            <strong>Plumbing 360 booking.</strong> Scheduling, the invoice and customer texts stay on the{" "}
            <Link href={`/dashboard/office/jobs/${job.booking.job_number}`} className="font-semibold underline">booking screen</Link>.
            Its stage here follows the booking. You can add notes, tasks and files.
          </p>
          <p className="mt-1 text-slate">
            {job.booking.service ?? "Custom job"} · {job.booking.tier}
            {job.booking.quoted_price !== null && ` · ${money(job.booking.quoted_price)} + GST`}
            {job.booking.work_date && ` · ${nzDate(job.booking.work_date)}`}
            {job.booking.plumber && ` with ${job.booking.plumber}`}
          </p>
          {job.booking.office_notes && <p className="mt-1">Office notes: {job.booking.office_notes}</p>}
        </section>
      )}

      <section className="grid gap-4 rounded-2xl bg-white p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6" data-testid="job-header">
        <div>
          <h2 className={label}>Customer</h2>
          <p className="mt-1 font-semibold">
            <Link href={`/dashboard/office/customers/${job.customer.id}`} className="hover:underline">{job.customer.name}</Link>
          </p>
          {job.customer.business_name && <p className="text-sm">{job.customer.full_name}</p>}
          <p className="text-sm text-slate">{[job.customer.phone, job.customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <h2 className={label}>Site</h2>
          <p className="mt-1 font-semibold">{job.site.text}</p>
          {job.site.access_notes && <p className="text-sm text-slate">Access: {job.site.access_notes}</p>}
          {job.site.notes && <p className="text-sm text-slate">{job.site.notes}</p>}
        </div>
        <div>
          <h2 className={label}>Site contact</h2>
          {job.site_contact ? (
            <>
              <p className="mt-1 font-semibold">{job.site_contact.name}</p>
              <p className="text-sm text-slate">
                {[job.site_contact.position, job.site_contact.mobile ?? job.site_contact.phone, job.site_contact.email].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate">None set</p>
          )}
        </div>
        <div>
          <h2 className={label}>Job</h2>
          <dl className="mt-1 space-y-0.5 text-sm">
            {managed && <Row k="Type" v={job.job_type === "charge_up" ? "Charge-up" : "Quoted"} />}
            <Row k="Order no." v={job.order_number ?? "—"} />
            <Row k="Pricing" v={`${job.pricing_tier.name} (${Number(job.pricing_tier.markup_pct)}%${job.pricing_tier.source === "job" ? ", this job" : job.pricing_tier.source === "customer" ? ", customer's" : ""})`} />
            {managed && <Row k="Manager" v={job.manager?.name ?? "—"} />}
            <Row k="Created" v={`${nzDateTime(job.created_at)}${job.created_by ? ` by ${job.created_by}` : ""}`} />
          </dl>
        </div>
        {job.description && <p className="whitespace-pre-line text-sm sm:col-span-2 lg:col-span-4">{job.description}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <JobMenu job={job} base={base} tab={tab} money={jobMoney} canEdit={canEdit} />
        <div className="min-w-0 space-y-6" data-testid={`tab-${tab}`}>
          {tab === "summary" && (
            <>
              {/* ── Job settings and state (office) ─────────────────────────────── */}
              {managed && canEdit && (
                <section className="flex flex-wrap gap-2" data-testid="job-actions">
                  <details className="w-full rounded-2xl bg-white p-4 open:pb-5">
                    <summary className="cursor-pointer font-semibold">Job settings</summary>
                    <form action={saveJobAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <input type="hidden" name="jobId" value={job.job_id} />
                      <Back />
                      <Field id="s-title" name="title" text="Job name" v={job.title} />
                      <div>
                        <label className={label} htmlFor="s-type">Type</label>
                        <select id="s-type" name="job_type" defaultValue={job.job_type ?? "quoted"} className={input}>
                          <option value="quoted">Quoted</option>
                          <option value="charge_up">Charge-up</option>
                        </select>
                      </div>
                      <Field id="s-order" name="order_number" text="Customer's order number" v={job.order_number} />
                      <div>
                        <label className={label} htmlFor="s-site">Site</label>
                        <select id="s-site" name="property_id" defaultValue={job.site.id} className={input}>
                          {job.options.sites.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label} htmlFor="s-contact">Site contact</label>
                        <select id="s-contact" name="site_contact_id" defaultValue={job.site_contact?.id ?? ""} className={input}>
                          <option value="">None</option>
                          {job.options.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` (${c.position})` : ""}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label} htmlFor="s-manager">Job manager</label>
                        <select id="s-manager" name="manager_staff_id" defaultValue={job.manager?.id ?? ""} className={input}>
                          <option value="">None</option>
                          {job.options.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label} htmlFor="s-tier">Pricing tier for this job</label>
                        <select id="s-tier" name="job_pricing_tier_id" defaultValue={job.pricing_tier.source === "job" ? job.pricing_tier.id ?? "" : ""} className={input}>
                          <option value="">Customer&apos;s own</option>
                          {job.options.tiers.map((t) => <option key={t.id} value={t.id}>{t.name} ({Number(t.markup_pct)}%)</option>)}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input type="hidden" name="restricted_present" value="1" />
                        <input type="checkbox" name="restricted" defaultChecked={job.restricted} /> Office only (supervisors can&apos;t see it)
                      </label>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className={label} htmlFor="s-desc">Job description</label>
                        <textarea id="s-desc" name="description" rows={3} defaultValue={job.description ?? ""} className={area} />
                      </div>
                      <div><button className={primaryBtn}>Save settings</button></div>
                    </form>
                  </details>

                  {job.state === "active" && (
                    <>
                      <StateForm job={job} path={path} action="hold" text="Put on hold" reason="Why is it on hold?" />
                      <StateForm job={job} path={path} action="close" text="Close job" />
                      <StateForm job={job} path={path} action="cancel" text="Cancel job" reason="Why is it cancelled?" danger />
                    </>
                  )}
                  {job.state === "on_hold" && (
                    <>
                      <StateForm job={job} path={path} action="resume" text="Take off hold" />
                      <StateForm job={job} path={path} action="cancel" text="Cancel job" reason="Why is it cancelled?" danger />
                    </>
                  )}
                  {(job.state === "closed" || job.state === "cancelled") && <StateForm job={job} path={path} action="reopen" text="Reopen job" />}
                </section>
              )}

              {/* ── The whole project: top job and variations, money rolled up ───── */}
              {managed && (
                <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="project">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold">Project: {job.family.length} job{job.family.length === 1 ? "" : "s"}</h2>
                    {canEdit && job.family.every((f) => f.is_top ? f.state !== "closed" && f.state !== "cancelled" : true) && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-semibold text-aqua-deep">+ Add a variation</summary>
                        <form action={addVariationAction} className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="variation-form">
                          <input type="hidden" name="jobId" value={job.job_id} />
                          <Back />
                          <Field id="v-title" name="title" text="Variation name" v={null} required />
                          <Field id="v-order" name="order_number" text="Order number (blank: same as the job)" v={null} />
                          <Field id="v-phase" name="phase_name" text="First phase name (blank: same as the variation)" v={null} />
                          <div className="self-end"><button className={primaryBtn}>Add variation</button></div>
                        </form>
                      </details>
                    )}
                  </div>
                  <ul className="mt-3 divide-y divide-black/5 text-sm">
                    {job.family.map((f) => (
                      <li key={f.job_id} className={`flex flex-wrap items-center gap-3 py-2 ${f.is_this ? "font-semibold" : ""}`}>
                        <Link href={`/dashboard/office/job/${encodeURIComponent(f.job_ref)}`} className="hover:underline">
                          {f.job_ref}
                        </Link>
                        <span>{f.title}</span>
                        <span className="text-xs text-slate">{f.is_top ? "main job" : "variation"}</span>
                        {f.state !== "active" && <StateBadge state={f.state} />}
                        <span className="flex flex-wrap gap-1">
                          {f.stages.map((p) => <StageChip key={p.ref} stage={p.stage} prefix={p.ref.slice(f.job_ref.length)} />)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <MoneyLine money={jobMoney} base={base} />
                </section>
              )}

              {/* ── Phases ───────────────────────────────────────────────────────── */}
              <section className="space-y-4" data-testid="phases">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold">{managed ? `Phases (${realPhases.length})` : "Pipeline"}</h2>
                  {managed && canEdit && job.state !== "closed" && job.state !== "cancelled" && (
                    <details id="add-phase" className="text-sm">
                      <summary className="cursor-pointer font-semibold text-aqua-deep">+ Add a phase</summary>
                      <form action={addPhaseAction} className="mt-2 flex flex-wrap items-end gap-2" data-testid="phase-form">
                        <input type="hidden" name="jobId" value={job.job_id} />
                        <Back />
                        <Field id="p-name" name="name" text="Phase name" v={null} required />
                        <Field id="p-desc" name="description" text="Description" v={null} />
                        <button className={primaryBtn}>Add phase</button>
                      </form>
                    </details>
                  )}
                </div>
                {job.phases.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-slate">This booking was cancelled.</p>}
                {job.phases.map((p) => (
                  <PhaseCard key={p.ref} job={job} phase={p} path={path} focus={p.id !== null && p.id === job.focus_phase_id} canMove={managed && canEdit && active} />
                ))}
              </section>

              {/* ── Checklists and forms (placeholder) ───────────────────────────── */}
              <section className="rounded-2xl border-2 border-dashed border-black/10 p-5 text-sm text-slate" data-testid="forms-placeholder">
                <h2 className="text-lg font-bold text-ink">Checklists and forms</h2>
                <p className="mt-1">
                  Site checklists, forms, hazards (SWMS/JSA) and certificates arrive with the safety and QA module. Gas certificates
                  for bookings stay on the booking screen.
                </p>
              </section>

            </>
          )}
          {tab === "quotes" && <QuotesTab job={job} quotes={quotes} money={jobMoney} realPhases={realPhases} base={base} />}
          {tab === "money" && jobMoney && <Money job={job} money={jobMoney} scope={scope} base={base} />}
          {tab === "log" && (
            <>
              {/* ── Notes and history ────────────────────────────────────────────── */}
              <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="log">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold">Notes and history</h2>
                  <nav className="flex gap-1 text-sm" aria-label="Show">
                    {[["all", "Everything"], ["notes", "Notes"], ["history", "History"]].map(([k, v]) => (
                      <Link key={k} href={`${base}?tab=log&log=${k}`} aria-current={log === k ? "page" : undefined}
                        className={`rounded-full px-3 py-1 ${log === k ? "bg-aqua-pale font-semibold text-aqua-deep" : "text-slate"}`}>{v}</Link>
                    ))}
                  </nav>
                </div>
                {canWork && <NoteForm job={job} path={path} phases={realPhases} />}
                <ol className="mt-4 space-y-3 text-sm">
                  {timeline(job, log).map((e) =>
                    e.type === "note" ? (
                      <li key={e.id} className="rounded-xl bg-amber-50/70 p-3">
                        <p className="text-xs text-slate">
                          <strong className="text-ink">{e.note.by}</strong> · {nzDateTime(e.at)}
                          {e.note.phase_ref && ` · ${e.note.phase_ref}`}
                          {" · "}{e.note.internal ? "office only" : "shows in the plumber app"}
                        </p>
                        <p className="mt-1 whitespace-pre-line">{e.note.body}</p>
                        {e.note.can_remove && (
                          <form action={removeNoteAction} className="mt-1">
                            <input type="hidden" name="noteId" value={e.note.id} />
                            <input type="hidden" name="back" value={path} />
                            <button className="text-xs text-red-700 underline">Remove</button>
                          </form>
                        )}
                      </li>
                    ) : (
                      <li key={e.id} className="flex flex-wrap gap-x-2 border-l-2 border-black/10 pl-3 text-slate">
                        <span className="text-ink">{e.line.summary}</span>
                        <span className="text-xs">{e.line.by} · {nzDateTime(e.at)}</span>
                      </li>
                    ),
                  )}
                  {timeline(job, log).length === 0 && <li className="text-slate">Nothing yet.</li>}
                </ol>
              </section>
            </>
          )}
          {tab === "files" && (
            <>
              {/* ── Files and photos ─────────────────────────────────────────────── */}
              <section className="space-y-3 rounded-2xl bg-white p-5 sm:p-6" data-testid="files">
                <h2 className="text-lg font-bold">Files and photos</h2>
                {job.files.some((f) => f.is_photo) && (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {job.files.filter((f) => f.is_photo).map((f) => (
                      <li key={f.id} className="text-xs">
                        <a href={fileUrl(f.id)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileUrl(f.id)} alt={f.caption ?? f.file_name} className="aspect-square w-full rounded-xl bg-mist object-cover" loading="lazy" />
                        </a>
                        <p className="mt-1 truncate">{f.phase_ref && <strong>{f.phase_ref.slice(job.job_ref.length)} </strong>}{f.caption ?? f.file_name}</p>
                        <p className="text-slate">{f.by} · {nzDateTime(f.at)}</p>
                        {f.can_remove && <RemoveFile id={f.id} path={path} />}
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="divide-y divide-black/5 text-sm">
                  {job.files.filter((f) => !f.is_photo).map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {f.phase_ref && <strong className="mr-1">{f.phase_ref.slice(job.job_ref.length)}</strong>}
                        <a href={fileUrl(f.id, true)} className="font-semibold underline">{f.file_name}</a>
                        <span className="text-xs text-slate"> · {fmtBytes(f.bytes)} · {f.by} · {nzDateTime(f.at)}{f.caption ? ` · ${f.caption}` : ""}</span>
                      </span>
                      {f.can_remove && <RemoveFile id={f.id} path={path} />}
                    </li>
                  ))}
                </ul>
                {job.app_photos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold">From the plumber app</h3>
                    <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {job.app_photos.map((p) => (
                        <li key={p.id}>
                          <a href={`/api/office/job-file?photo=${p.id}`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/office/job-file?photo=${p.id}`} alt={p.caption ?? p.stage} className="aspect-square w-full rounded-xl bg-mist object-cover" loading="lazy" />
                          </a>
                          <p className="text-xs text-slate">{p.stage}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {job.files.length === 0 && job.app_photos.length === 0 && <p className="text-sm text-slate">No files or photos yet.</p>}
                {canWork && <JobFileUpload jobId={job.job_id} phases={realPhases.map((p) => ({ id: p.id, ref: p.ref, name: p.name }))} />}
              </section>

            </>
          )}
          {tab === "tasks" && (
            <>
              {/* ── Tasks ────────────────────────────────────────────────────────── */}
              <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="tasks">
                <h2 className="text-lg font-bold">Tasks</h2>
                <ul className="mt-2 divide-y divide-black/5 text-sm">
                  {job.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className={t.done_at ? "text-slate line-through" : ""}>
                        {t.phase_ref && <span className="mr-1 font-semibold">{t.phase_ref.slice(job.job_ref.length)}</span>}
                        {t.title}
                        <span className="text-xs text-slate">
                          {t.assignee && ` · ${t.assignee}`}
                          {t.due_on && ` · due ${nzDate(t.due_on)}`}
                          {t.done_at && ` · done by ${t.done_by}`}
                        </span>
                      </span>
                      {canWork && (
                        <span className="flex gap-1">
                          <TaskButton id={t.id} path={path} action={t.done_at ? "undo" : "done"} text={t.done_at ? "Not done" : "Done"} />
                          <TaskButton id={t.id} path={path} action="remove" text="Remove" />
                        </span>
                      )}
                    </li>
                  ))}
                  {job.tasks.length === 0 && <li className="py-2 text-slate">No tasks.</li>}
                </ul>
                {canWork && (
                  <form action={addTaskAction} className="mt-3 flex flex-wrap items-end gap-2" data-testid="task-form">
                    <input type="hidden" name="jobId" value={job.job_id} />
                    <Back />
                    <div className="min-w-56 flex-1">
                      <label className={label} htmlFor="t-title">New task</label>
                      <input id="t-title" name="title" required maxLength={300} className={input} />
                    </div>
                    {realPhases.length > 0 && <PhaseSelect id="t-phase" phases={realPhases} />}
                    <div>
                      <label className={label} htmlFor="t-who">For</label>
                      <select id="t-who" name="assignee" className={input}>
                        <option value="">Anyone</option>
                        {job.options.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label} htmlFor="t-due">Due</label>
                      <input id="t-due" name="due_on" type="date" className={input} />
                    </div>
                    <button className={primaryBtn}>Add task</button>
                  </form>
                )}
              </section>

            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Field({ id, name, text, v, required = false }: { id: string; name: string; text: string; v: string | null; required?: boolean }) {
  return (
    <div>
      <label className={label} htmlFor={id}>{text}</label>
      <input id={id} name={name} defaultValue={v ?? ""} required={required} className={input} />
    </div>
  );
}

function PhaseSelect({ id, phases, value }: { id: string; phases: (Phase & { id: string })[]; value?: string }) {
  return (
    <div>
      <label className={label} htmlFor={id}>Phase</label>
      <select id={id} name="phaseId" defaultValue={value ?? ""} className={input}>
        <option value="">Whole job</option>
        {phases.map((p) => <option key={p.id} value={p.id}>{p.ref} {p.name}</option>)}
      </select>
    </div>
  );
}

function StateForm({ job, path, action, text, reason, danger = false }: {
  job: JobPage; path: string; action: string; text: string; reason?: string; danger?: boolean;
}) {
  const btn = danger ? "rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-800" : "rounded-full bg-white px-4 py-2 text-sm font-semibold";
  if (!reason) {
    return (
      <form action={jobStateAction}>
        <input type="hidden" name="jobId" value={job.job_id} />
        <input type="hidden" name="back" value={path} />
        <input type="hidden" name="action" value={action} />
        <button className={btn}>{text}</button>
      </form>
    );
  }
  return (
    <details className="rounded-full">
      <summary className={`cursor-pointer list-none ${btn}`}>{text}</summary>
      <form action={jobStateAction} className="mt-2 flex flex-wrap gap-2 rounded-2xl bg-white p-3">
        <input type="hidden" name="jobId" value={job.job_id} />
        <input type="hidden" name="back" value={path} />
        <input type="hidden" name="action" value={action} />
        <input name="reason" required placeholder={reason} aria-label={reason} className={`${input} min-w-64`} />
        <button className={primaryBtn}>{text}</button>
      </form>
    </details>
  );
}

function Money({ job, money: m, scope, base }: { job: JobPage; money: JobMoney; scope: "job" | "project"; base: string }) {
  const managed = job.kind === "managed";
  const project = managed && m.project.jobs > 1;
  const t: MoneyT = scope === "job" || !project ? m.job : m.project;
  const quoted = t.quoted_ex_gst;
  const rows: [string, string][] = [["Accepted quotes (ex GST)", quoted === null ? "—" : money(quoted)]];
  if (t.quoted_cost !== undefined && t.quoted_cost !== null) rows.push(["Quoted cost", money(t.quoted_cost)]);
  rows.push(["Quotes accepted", String(t.quotes_accepted)], ["Quotes still open", String(t.quotes_open)]);
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="money">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">
          Financial Summary
          {project && <span className="font-normal text-slate">{scope === "job" ? ` · ${job.job_ref} only` : ` · entire project (${m.project.jobs - 1} variation${m.project.jobs === 2 ? "" : "s"})`}</span>}
        </h2>
        {project && (
          <nav className="flex gap-1 text-sm" aria-label="Show money for">
            {([["project", `Entire project (${m.project.job_refs.join(", ")})`], ["job", `${job.job_ref} only`]] as const).map(([k, v]) => (
              <Link key={k} href={`${base}?tab=money&scope=${k}`} aria-current={scope === k ? "page" : undefined}
                className={`rounded-full px-3 py-1 ${scope === k ? "bg-aqua-pale font-semibold text-aqua-deep" : "text-slate"}`}>{v}</Link>
            ))}
          </nav>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Box title="Quoted (the budget)" rows={rows}
          note={managed ? (quoted === null ? "Nothing accepted yet. An accepted quote sets the budget." : undefined) : "The booking's quoted price"} />
        <Box title="Costs" rows={[
          ["Labour", money(t.costs.labour)],
          ["Supplier documents", money(t.costs.supplier_documents)],
          ["Purchase orders", money(t.costs.purchase_orders)],
          ["Stock / other", money(t.costs.stock_other)],
        ]} note="Filled in Phase 3 (timesheets, supplier invoices, POs)" />
        <Box title="Invoiced" rows={[
          ["Invoiced (ex GST)", money(t.invoiced_ex_gst)],
          ["Draft invoices", money(t.draft_invoices_ex_gst)],
          ["Paid", money(t.paid)],
        ]} />
        <Box title="Profit" rows={[["Left to invoice", quoted === null ? "—" : money(Math.max(0, quoted - t.invoiced_ex_gst))], ["Potential profit", "—"]]}
          note="Profit needs costs (Phase 3)" />
      </div>
    </section>
  );
}

function MoneyLine({ money: m, base }: { money: JobMoney | null; base: string }) {
  if (!m) return null;
  const t = m.project;
  return (
    <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-mist/60 px-3 py-2 text-sm" data-testid="money-line">
      <span>Quoted <strong className="tabular-nums">{t.quoted_ex_gst === null ? "—" : money(t.quoted_ex_gst)}</strong> + GST</span>
      <span>Invoiced <strong className="tabular-nums">{money(t.invoiced_ex_gst)}</strong></span>
      <span>Quotes open {t.quotes_open}</span>
      <Link href={`${base}?tab=money`} className="ml-auto font-semibold text-aqua-deep">Financial Summary →</Link>
    </p>
  );
}

/** The left-hand job menu (Fergus-style): the job's pages, then its phases with their quoted value. */
function JobMenu({ job, base, tab, money: m, canEdit }: { job: JobPage; base: string; tab: Tab; money: JobMoney | null; canEdit: boolean }) {
  const managed = job.kind === "managed";
  const counts: Partial<Record<Tab, number>> = {
    quotes: managed && m ? m.job.quotes_accepted + m.job.quotes_open : undefined,
    log: job.notes.length,
    files: job.files.length + job.app_photos.length,
    tasks: job.tasks.filter((t) => !t.done_at).length,
  };
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" data-testid="job-menu">
      <nav className="rounded-2xl bg-white p-2" aria-label="Job">
        <p className="px-3 pt-1 pb-2 text-xs font-bold tracking-wide text-slate">JOB OVERVIEW</p>
        <ul className="space-y-0.5 text-sm">
          {TABS.filter(([k]) => managed || k !== "quotes").map(([k, v]) => (
            <li key={k}>
              <Link href={`${base}?tab=${k}`} aria-current={tab === k ? "page" : undefined}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${tab === k ? "bg-ink font-semibold text-white" : "hover:bg-mist"}`}>
                <span>{v}</span>
                {counts[k] ? <span className={`text-xs ${tab === k ? "text-white/80" : "text-slate"}`}>{counts[k]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {managed && (
        <section className="rounded-2xl bg-white p-2" aria-label="Job phases">
          <p className="px-3 pt-1 pb-2 text-xs font-bold tracking-wide text-slate">JOB PHASES ({job.phases.length})</p>
          {canEdit && job.state !== "closed" && job.state !== "cancelled" && (
            <Link href={`${base}?tab=summary#add-phase`} className="mb-1 block rounded-xl bg-aqua-pale/60 px-3 py-2 text-center text-sm font-semibold text-aqua-deep">
              + Add job phase
            </Link>
          )}
          <ul className="space-y-0.5 text-sm">
            {job.phases.map((p) => {
              const letter = p.ref.slice(job.job_ref.length);
              const q = p.id ? m?.phases[p.id]?.quoted : null;
              return (
                <li key={p.ref}>
                  <Link href={`${base}?tab=summary#phase-${letter}`} className={`block rounded-xl px-3 py-2 hover:bg-mist ${p.id && p.id === job.focus_phase_id ? "ring-2 ring-aqua-deep" : ""}`}>
                    <span className="font-bold uppercase">{letter}</span> <span className="text-slate">|</span> {p.name}
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                      <StageChip stage={p.stage} />
                      <span className="tabular-nums text-slate">{q !== null && q !== undefined ? money(q) : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {m?.job_level_quoted ? <p className="px-3 pt-2 text-xs text-slate">Whole-job quote: {money(m.job_level_quoted)}</p> : null}
        </section>
      )}
    </aside>
  );
}

/** Quotes on this job: one row per option (A, B…), for the whole job or a phase, with its versions. */
function QuotesTab({ job, quotes, money: m, realPhases, base }: {
  job: JobPage; quotes: JobQuotes | null; money: JobMoney | null; realPhases: (Phase & { id: string })[]; base: string;
}) {
  if (job.kind !== "managed") {
    return <p className="rounded-2xl bg-white p-5 text-sm text-slate">Bookings are quoted on the booking screen.</p>;
  }
  if (!quotes) return null;
  const scopes = [{ id: null as string | null, label: "Whole job" }, ...realPhases.map((p) => ({ id: p.id as string | null, label: `${p.ref} ${p.name}` }))];
  const tone: Record<string, string> = {
    open: "bg-sky-100 text-sky-900", accepted: "bg-emerald-600 text-white", declined: "bg-red-100 text-red-800", closed: "bg-slate-200 text-slate-800",
  };
  const vtone: Record<string, string> = { draft: "bg-amber-100 text-amber-900", published: "bg-emerald-100 text-emerald-900", superseded: "bg-slate-100 text-slate-600" };
  const open = job.state !== "closed" && job.state !== "cancelled";
  return (
    <section className="space-y-4" data-testid="quotes">
      <div className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Quotes</h2>
          {m && (
            <p className="text-sm">
              Budget (accepted, this job): <strong className="tabular-nums">{m.job.quoted_ex_gst === null ? "—" : money(m.job.quoted_ex_gst)}</strong> + GST
            </p>
          )}
        </div>
        {quotes.can.edit && open && (
          <form action={newQuoteAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-mist/60 p-3" data-testid="new-quote">
            <input type="hidden" name="jobId" value={job.job_id} />
            <input type="hidden" name="jobRef" value={job.job_ref} />
            <div>
              <label className={label} htmlFor="nq-scope">Quote for</label>
              <select id="nq-scope" name="phaseId" className={input}>
                {scopes.map((sc) => <option key={sc.id ?? "job"} value={sc.id ?? ""}>{sc.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nq-name">Option name (optional)</label>
              <input id="nq-name" name="name" placeholder="e.g. Copper" className={input} />
            </div>
            <button className={primaryBtn}>+ New quote</button>
            <p className="w-full text-xs text-slate">
              A second quote for the same job or phase becomes option B (e.g. copper vs PEX). When the customer accepts one, the others close.
            </p>
          </form>
        )}
      </div>
      {quotes.quotes.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-slate">No quotes yet.</p>}
      {quotes.quotes.map((q) => (
        <article key={q.quote_id} className="rounded-2xl bg-white p-5 sm:p-6" data-testid="quote-row">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{q.phase_ref ? `${q.phase_ref} ${q.phase_name}` : "Whole job"} · Option {q.option_letter}{q.name ? ` (${q.name})` : ""}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[q.status]}`}>{STATUS_LABEL[q.status]}</span>
            {q.status === "accepted" && q.accepted_at && (
              <span className="text-xs text-slate">
                {q.accepted_via === "link" ? "online" : "by the office"}{q.accepted_by ? ` · ${q.accepted_by}` : ""} · {nzDate(q.accepted_at.slice(0, 10))}
              </span>
            )}
            {q.status_note && <span className="text-xs text-slate">{q.status_note}</span>}
          </div>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate">
                <th className="py-1 font-semibold">Version</th>
                <th className="py-1 font-semibold">Status</th>
                <th className="py-1 text-right font-semibold">Ex GST</th>
                <th className="py-1 text-right font-semibold">Incl GST</th>
                {quotes.can.costs && <th className="py-1 text-right font-semibold">Margin</th>}
                <th className="py-1 pl-4 font-semibold">Valid until / sent</th>
              </tr>
            </thead>
            <tbody>
              {q.versions.map((v) => (
                <tr key={v.version_id} className="border-t border-black/5">
                  <td className="py-1.5">
                    <Link href={`${base}/quote/${v.version_id}`} className="font-semibold underline">{v.number}</Link>
                    {v.accepted && <span className="ml-1 text-xs font-semibold text-emerald-800">✓ accepted</span>}
                  </td>
                  <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vtone[v.status]}`}>{STATUS_LABEL[v.status]}</span></td>
                  <td className="py-1.5 text-right tabular-nums">{money(v.net)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(v.total)}</td>
                  {quotes.can.costs && <td className="py-1.5 text-right tabular-nums">{v.margin_pct === null || v.margin_pct === undefined ? "—" : `${v.margin_pct}%`}</td>}
                  <td className="py-1.5 pl-4 text-xs text-slate">
                    {v.valid_until ? `${v.expired ? "expired" : "valid until"} ${nzDate(v.valid_until)}` : v.deadline ? `due out ${nzDate(v.deadline)}` : "draft"}
                    {v.sent_at ? ` · sent ${nzDateTime(v.sent_at)}` : v.status === "published" ? " · not sent" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  );
}

function Box({ title, rows, note }: { title: string; rows: [string, string][]; note?: string }) {
  return (
    <div className="rounded-xl bg-mist/60 p-3 text-sm">
      <p className="text-xs font-semibold text-slate">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2"><dt>{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
        ))}
      </dl>
      {note && <p className="mt-1 text-xs text-slate">{note}</p>}
    </div>
  );
}

function PhaseCard({ job, phase, path, focus, canMove }: { job: JobPage; phase: Phase; path: string; focus: boolean; canMove: boolean }) {
  const i = STAGES.findIndex((s) => s.id === phase.stage);
  const next = STAGES[i + 1];
  const prev = STAGES[i - 1];
  const notes = job.notes.filter((n) => phase.id && n.phase_id === phase.id);
  const managed = job.kind === "managed";
  const letter = phase.letter ? phase.ref.slice(job.job_ref.length) : null;
  return (
    <article id={letter ? `phase-${letter}` : "phase"} className={`rounded-2xl bg-white p-5 sm:p-6 ${focus ? "ring-2 ring-aqua-deep" : ""}`} data-testid="phase">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">{managed ? phase.ref : `#${phase.ref}`}</h3>
        <span className="font-semibold">{phase.name}</span>
        <StageChip stage={phase.stage} />
        <span className="text-xs text-slate">since {nzDateTime(phase.since)}</span>
      </div>
      <div className="mt-3"><PipelineBar stage={phase.stage} /></div>

      {canMove && phase.id && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="move-phase">
          {next && <MoveButton phaseId={phase.id} path={path} stage={next.id} text={`Move to ${next.label} →`} primary />}
          {prev && <MoveButton phaseId={phase.id} path={path} stage={prev.id} text={`← Back to ${prev.label}`} />}
          <form action={movePhaseAction} className="flex items-center gap-1">
            <input type="hidden" name="phaseId" value={phase.id} />
            <input type="hidden" name="back" value={path} />
            <label className="sr-only" htmlFor={`jump-${phase.id}`}>Jump to stage</label>
            <select id={`jump-${phase.id}`} name="stage" defaultValue="" className="rounded-full border border-black/10 bg-white px-2 py-1 text-xs">
              <option value="" disabled>Jump ahead to…</option>
              {STAGES.slice(i + 2).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className={quietBtn}>Go</button>
          </form>
        </div>
      )}
      {managed && !canMove && job.state !== "active" && <p className="mt-2 text-xs text-slate">The pipeline is paused while the job is {job.state.replace("_", " ")}.</p>}
      {!managed && <p className="mt-2 text-xs text-slate">Moves on its own as the booking goes along.</p>}

      {phase.description && <p className="mt-3 whitespace-pre-line text-sm">{phase.description}</p>}
      {managed && job.can.edit && phase.id && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-aqua-deep">Edit phase name and description</summary>
          <form action={savePhaseAction} className="mt-2 grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="phaseId" value={phase.id} />
            <input type="hidden" name="back" value={path} />
            <div>
              <label className={label} htmlFor={`pn-${phase.id}`}>Name</label>
              <input id={`pn-${phase.id}`} name="name" defaultValue={phase.name} required className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor={`pd-${phase.id}`}>Description</label>
              <textarea id={`pd-${phase.id}`} name="description" rows={2} defaultValue={phase.description ?? ""} className={area} />
            </div>
            <div><button className={primaryBtn}>Save phase</button></div>
          </form>
        </details>
      )}

      {managed && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="cost-buckets">
          {["Labour", "Supplier documents", "Purchase orders", "Stock on hand / other"].map((b) => (
            <div key={b} className="rounded-xl border border-dashed border-black/10 p-3 text-sm">
              <p className="font-semibold">{b}</p>
              <p className="text-xs text-slate">Nothing yet. Costs come in Phase 3.</p>
              <p className="mt-1 flex justify-between text-xs"><span>Cost $0.00</span><span>Sell $0.00</span></p>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-bold">Notes on this phase</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-amber-50/70 px-3 py-2">
                <span className="whitespace-pre-line">{n.body}</span>
                <span className="text-xs text-slate"> · {n.by}, {nzDateTime(n.at)}{n.internal ? "" : " · in the app"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.can.work && phase.id && (
        <form action={addNoteAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="jobId" value={job.job_id} />
          <input type="hidden" name="phaseId" value={phase.id} />
          <input type="hidden" name="back" value={path} />
          <div className="min-w-64 flex-1">
            <label className={label} htmlFor={`pnote-${phase.id}`}>Note on {phase.ref}</label>
            <input id={`pnote-${phase.id}`} name="body" required maxLength={5000} className={input} />
          </div>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="for_app" /> Show in the plumber app</label>
          <button className={quietBtn}>Add note</button>
        </form>
      )}
    </article>
  );
}

function MoveButton({ phaseId, path, stage, text, primary = false }: { phaseId: string; path: string; stage: string; text: string; primary?: boolean }) {
  return (
    <form action={movePhaseAction}>
      <input type="hidden" name="phaseId" value={phaseId} />
      <input type="hidden" name="back" value={path} />
      <input type="hidden" name="stage" value={stage} />
      <button className={primary ? primaryBtn : quietBtn}>{text}</button>
    </form>
  );
}

function TaskButton({ id, path, action, text }: { id: string; path: string; action: string; text: string }) {
  return (
    <form action={taskAction}>
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="back" value={path} />
      <input type="hidden" name="action" value={action} />
      <button className={quietBtn}>{text}</button>
    </form>
  );
}

function RemoveFile({ id, path }: { id: string; path: string }) {
  return (
    <form action={removeFileAction}>
      <input type="hidden" name="fileId" value={id} />
      <input type="hidden" name="back" value={path} />
      <button className="text-xs text-red-700 underline">Remove</button>
    </form>
  );
}

function NoteForm({ job, path, phases }: { job: JobPage; path: string; phases: (Phase & { id: string })[] }) {
  return (
    <form action={addNoteAction} className="mt-3 space-y-2" data-testid="note-form">
      <input type="hidden" name="jobId" value={job.job_id} />
      <input type="hidden" name="back" value={path} />
      <label className={label} htmlFor="n-body">Add a note</label>
      <textarea id="n-body" name="body" rows={2} required maxLength={5000} className={area} />
      <div className="flex flex-wrap items-end gap-2">
        {phases.length > 0 && <PhaseSelect id="n-phase" phases={phases} />}
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="for_app" /> Show in the plumber app</label>
        <button className={primaryBtn}>Add note</button>
      </div>
    </form>
  );
}

type Entry =
  | { type: "note"; id: string; at: string; note: JobPage["notes"][number] }
  | { type: "history"; id: string; at: string; line: JobPage["history"][number] };

function timeline(job: JobPage, log: string): Entry[] {
  const notes: Entry[] = log === "history" ? [] : job.notes.map((n) => ({ type: "note", id: `n-${n.id}`, at: n.at, note: n }));
  const hist: Entry[] = log === "notes" ? [] : job.history.map((h, i) => ({ type: "history", id: `h-${i}-${h.at}`, at: h.at, line: h }));
  return [...notes, ...hist].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
