// Phase 3d: one invoice or payment claim. A draft (To Be Approved) can be changed line by line; approving numbers it
// (INV-…), freezes it and sends it to Xero (never from the test site). Costs show here for people who can see costs,
// never on the PDF.
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addInvoiceLineAction, certifyInvoiceAction, emailInvoiceAction, invoiceStatusAction, removeInvoiceLineAction,
  saveInvoiceAction, saveInvoiceFilesAction, saveInvoiceLineAction,
} from "@/app/dashboard/invoice-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { InvoiceStatusChip, XeroNote } from "@/components/office/invoices-ui";
import { area, input, label, money, nzDate, primaryBtn, quietBtn } from "@/components/office/jm";
import { StageChip } from "@/components/office/jobs-ui";
import { requireOffice } from "@/lib/auth";
import { groupLines, invoiceSendInfo, invoiceTitle, KIND_LABEL, loadInvoice, type InvoiceLine, type OfficeInvoice } from "@/lib/invoices";
import type { Stage } from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";
import { CostRangeForm, CostSummaryTable } from "@/components/office/CostSummary";
import { costRange, filterCosts, loadJobCosts, type JobCosts } from "@/lib/job-costs";

export const metadata = { title: "Invoice" };
type Props = { params: Promise<{ ref: string; id: string }>; searchParams: Promise<{ ok?: string; err?: string; cf?: string; ct?: string }> };

const pct = (n: number | null) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(1).replace(/\.0$/, "")}%`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)));

export default async function InvoicePage({ params, searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { ref, id } = await params;
  const { ok, err, cf, ct } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let i: OfficeInvoice;
  let send: Awaited<ReturnType<typeof invoiceSendInfo>> | null = null;
  try {
    i = await loadInvoice(session, id);
    if (i.status === "approved") send = await invoiceSendInfo(session, id);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(m)) notFound();
    return <EngineError message={m} />;
  }
  const jobRef = decodeURIComponent(ref);
  const path = `/dashboard/office/job/${encodeURIComponent(i.job_ref)}/invoice/${i.id}`;
  const jobPath = `/dashboard/office/job/${encodeURIComponent(i.job_ref)}`;
  const draft = i.status === "draft";
  const claimLike = i.kind === "claim" || i.kind === "progress";
  const Back = () => <input type="hidden" name="back" value={path} />;
  const Id = () => (<><input type="hidden" name="id" value={i.id} /><Back /></>);
  const groups = groupLines(i.lines);
  void jobRef;

  // Cost summary at the top: costs on what this invoice covers, dated in the range (default: the invoice date's month).
  // A payment claim covers the whole project; a phase invoice just that phase.
  const [iy, im] = i.invoice_date.split("-").map(Number);
  const monthStart = `${i.invoice_date.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(iy, im, 0)).toISOString().slice(0, 10);
  const range = costRange(cf, ct) ?? { from: monthStart, to: monthEnd };
  let costs: JobCosts | null = null;
  try {
    const all = i.kind === "claim" ? await loadJobCosts(session, i.top_job_id, "project") : await loadJobCosts(session, i.job_id, "job");
    costs = filterCosts(all, range, i.phase_ref ? [i.phase_ref] : null);
  } catch {
    costs = null;
  }

  return (
    <div className="space-y-6" data-testid="invoice-page">
      <div>
        <Link href={`${jobPath}?tab=invoices`} className="text-sm text-slate hover:underline">← {i.job_ref} invoices</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="invoice-title">{invoiceTitle(i)}</h1>
          <InvoiceStatusChip status={i.status} />
          <XeroNote status={i.xero_status} />
        </div>
        <p className="mt-1 text-sm text-slate">
          {KIND_LABEL[i.kind]} · {i.company.name} · {i.customer.name} · {i.phase_ref ? `${i.phase_ref} ${i.phase_name}` : `${i.job_ref} ${i.job_title ?? ""}`}
          {i.phases.length > 0 && i.is_final && <> · final invoice for {i.phases.map((p) => <StageChip key={p.id} stage={p.stage as Stage} prefix={p.ref} />)}</>}
        </p>
      </div>
      <Flash ok={ok} err={err} />
      {i.xero_status === "failed" && i.xero_error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">Xero refused it: {i.xero_error}</p>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4" data-testid="invoice-actions">
        <a href={`/api/office/invoice-pdf?id=${i.id}`} target="_blank" className={quietBtn}>{draft ? "Preview PDF" : "Open PDF"}</a>
        {(claimLike || i.with_breakdown) && <a href={`/api/office/invoice-breakdown?id=${i.id}`} className={quietBtn}>Hours breakdown CSV</a>}
        {draft && i.can_approve && (
          <form action={invoiceStatusAction}><Id /><input type="hidden" name="action" value="approve" />
            <button className={primaryBtn} data-testid="approve">Approve (gives it the next invoice number)</button></form>
        )}
        {draft && !i.can_approve && <span className="text-sm text-slate">Waiting for someone who can approve invoices.</span>}
        {draft && (
          <form action={invoiceStatusAction}><Id /><input type="hidden" name="action" value="discard" /><input type="hidden" name="job_ref" value={i.job_ref} />
            <button className={`${quietBtn} text-red-800`}>Throw away this draft</button></form>
        )}
        {i.status === "approved" && (i.xero_status === "failed" || i.xero_status === "test") && (
          <form action={invoiceStatusAction}><Id /><input type="hidden" name="action" value="resend_xero" />
            <button className={quietBtn}>Send to Xero again</button></form>
        )}
        {i.status === "approved" && (
          <form action={invoiceStatusAction} className="flex flex-wrap items-center gap-2"><Id /><input type="hidden" name="action" value="void" />
            <input name="reason" placeholder="Why void it?" className={`${input} w-56`} aria-label="Why void it" />
            <button className={`${quietBtn} text-red-800`}>Void</button></form>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {/* ── Cost summary ────────────────────────────────────────────── */}
          {costs && (
            <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="invoice-cost-summary">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-bold">Cost report</h2>
                  <p className="text-sm text-slate">
                    Costs on {i.kind === "claim" ? `${i.top_job_ref} and its variations` : i.phase_ref ?? i.job_ref} dated{" "}
                    {range.from ? nzDate(range.from) : "the start"} – {range.to ? nzDate(range.to) : "now"}.{" "}
                    <Link href={`${jobPath}?tab=costs${range.from ? `&cf=${range.from}` : ""}${range.to ? `&ct=${range.to}` : ""}${i.kind === "claim" ? "" : "&scope=job"}`}
                      className="font-semibold text-aqua-deep">Lines →</Link>
                  </p>
                </div>
                <CostRangeForm action={path} from={range.from} to={range.to} keep={{}} />
              </div>
              <div className="mt-3"><CostSummaryTable costs={costs} /></div>
            </section>
          )}

          {/* ── Details ─────────────────────────────────────────────────── */}
          <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="invoice-details">
            <h2 className="font-bold">Details</h2>
            {draft ? (
              <form action={saveInvoiceAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Id />
                <label className="text-sm"><span className={label}>Invoice date</span><input type="date" name="invoice_date" defaultValue={i.invoice_date} className={input} /></label>
                <label className="text-sm"><span className={label}>Due date</span><input type="date" name="due_date" defaultValue={i.due_date ?? ""} className={input} /></label>
                <label className="text-sm"><span className={label}>Heading</span><input name="heading" defaultValue={i.heading ?? ""} className={input} /></label>
                <label className="text-sm"><span className={label}>Order number</span><input name="reference" defaultValue={i.reference ?? ""} className={input} /></label>
                {i.kind === "claim" && (<>
                  <label className="text-sm"><span className={label}>Claim period from</span><input type="date" name="period_from" defaultValue={i.period_from ?? ""} className={input} /></label>
                  <label className="text-sm"><span className={label}>Claim period to</span><input type="date" name="period_to" defaultValue={i.period_to ?? ""} className={input} /></label>
                </>)}
                {i.phases.length > 0 && i.kind !== "deposit" && i.kind !== "claim" && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="hidden" name="is_final_shown" value="1" />
                    <input type="checkbox" name="is_final" defaultChecked={i.is_final} />
                    Final invoice for {i.phases.map((p) => p.ref).join(", ")} (moves {i.phases.length === 1 ? "it" : "them"} to To Be Approved, then Invoiced)
                  </label>
                )}
                <label className="text-sm sm:col-span-2 lg:col-span-4"><span className={label}>Note on the invoice (optional)</span>
                  <textarea name="note" defaultValue={i.note ?? ""} rows={2} className={area} /></label>
                <details className="text-sm sm:col-span-2 lg:col-span-4">
                  <summary className="cursor-pointer font-semibold text-aqua-deep">Footer (payment terms, bank account, licence line)</summary>
                  <textarea name="footer" defaultValue={i.footer ?? ""} rows={7} className={`${area} mt-2`} />
                  <p className="mt-1 text-xs text-slate">Starts from the company&apos;s footer (Office → Companies). Changes here are for this invoice only.</p>
                </details>
                <div className="sm:col-span-2 lg:col-span-4"><button className={primaryBtn}>Save details</button></div>
              </form>
            ) : (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Row k="Invoice date" v={nzDate(i.invoice_date)} />
                <Row k="Due date" v={nzDate(i.due_date)} />
                {i.kind === "claim" && <Row k="Claim period" v={`${nzDate(i.period_from)} to ${nzDate(i.period_to)}`} />}
                <Row k="Order number" v={i.reference ?? "—"} />
                <Row k="Approved" v={i.approved_at ? `${new Date(i.approved_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} by ${i.approved_by_name}` : "—"} />
                <Row k="Emailed" v={i.emailed_at ? `${new Date(i.emailed_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} to ${(i.sent_to ?? []).join(", ")}` : "Not yet"} />
                {i.status === "void" && <Row k="Voided" v={`${i.voided_by_name ?? ""}: ${i.void_reason ?? ""}`} />}
                {i.note && <Row k="Note" v={i.note} />}
              </dl>
            )}
          </section>

          {/* ── Lines ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="invoice-lines">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">Lines</h2>
              <span className="text-xs text-slate">Excl GST. {i.can_costs ? "Cost is shown here only, never on the PDF." : ""}</span>
            </div>
            {groups.length === 0 && <p className="mt-2 text-sm text-slate">No lines yet. Add costs or a line below.</p>}
            {groups.map((g) => (
              <div key={g.heading} className="mt-4">
                {g.heading && <h3 className="text-sm font-bold">{g.heading}</h3>}
                {g.parts.map((part) => (
                  <div key={part.kind} className="mt-2 space-y-2">
                    {part.label && <p className="text-xs font-bold tracking-wide text-slate">{part.label.toUpperCase()}</p>}
                    {part.lines.map((l) => (
                      <LineRow key={l.id} l={l} draft={draft} canCosts={i.can_costs} path={path} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </section>

          {draft && (
            <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="add-line">
              <h2 className="font-bold">Add a line</h2>
              <form action={addInvoiceLineAction} className="mt-3 grid gap-2 sm:grid-cols-6">
                <Id />
                <label className="text-sm sm:col-span-1"><span className={label}>Kind</span>
                  <select name="kind" className={input} defaultValue="vehicle">
                    <option value="vehicle">Vehicle charge (260)</option>
                    <option value="labour">Labour (LAB)</option>
                    <option value="materials">Materials (200)</option>
                    <option value="other">Other (200)</option>
                  </select></label>
                <label className="text-sm sm:col-span-3"><span className={label}>Description</span>
                  <input name="description" defaultValue="Vehicle charge" className={input} required /></label>
                <label className="text-sm"><span className={label}>Qty</span><input name="quantity" defaultValue="1" className={input} inputMode="decimal" /></label>
                <label className="text-sm"><span className={label}>Price (excl GST)</span><input name="unit_price" className={input} inputMode="decimal" required /></label>
                <label className="text-sm sm:col-span-2"><span className={label}>Group under (optional)</span>
                  <input name="heading" placeholder={i.phase_ref ? `${i.phase_ref} ${i.phase_name}` : "e.g. PTSL-3000a Drainage"} className={input} /></label>
                <label className="text-sm"><span className={label}>Unit</span><input name="unit" placeholder="h, EA" className={input} /></label>
                {i.can_costs && <label className="text-sm"><span className={label}>Cost each</span><input name="unit_cost" className={input} inputMode="decimal" /></label>}
                <label className="text-sm sm:col-span-2"><span className={label}>Note under the line</span><input name="note" className={input} /></label>
                <div className="sm:col-span-6"><button className={primaryBtn}>Add line</button></div>
              </form>
              {(i.kind === "charge_up" || i.kind === "manual") && (
                <form action={addInvoiceLineAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
                  <Id /><input type="hidden" name="kind" value="costs" />
                  <span className="text-sm">{i.uninvoiced ? `${i.uninvoiced} cost line${i.uninvoiced === 1 ? "" : "s"} on ${i.phase_ref ?? i.job_ref} not invoiced yet.` : "Every cost is already on an invoice."}</span>
                  <select name="pending" className={`${input} w-auto`} aria-label="Which costs">
                    <option value="all">Everything</option>
                    <option value="approved">Approved only</option>
                  </select>
                  <button className={quietBtn} disabled={!i.uninvoiced}>Add costs not invoiced yet</button>
                </form>
              )}
            </section>
          )}

          {i.kind !== "deposit" && (
            <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="invoice-files">
              <h2 className="font-bold">Extra pages</h2>
              <p className="mt-1 text-sm text-slate">Pick files from the job to add to the PDF (PDFs page by page, photos one per page), and
                the hours and labour breakdown{i.kind === "claim" ? " for the claim period" : ""} (charge-out rates and sell prices only).</p>
              {draft ? (
                <form action={saveInvoiceFilesAction} className="mt-3 space-y-2">
                  <Id />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="with_breakdown" defaultChecked={i.with_breakdown} /> Hours and labour breakdown</label>
                  {i.files.length === 0 && <p className="text-sm text-slate">No files on the job yet (job → Files &amp; Photos).</p>}
                  {i.files.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="file" value={f.id} defaultChecked={f.on} /> {f.file_name} <span className="text-xs text-slate">{f.job_ref}</span>
                    </label>
                  ))}
                  <button className={quietBtn}>Save extra pages</button>
                </form>
              ) : (
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {i.with_breakdown && <li>Hours and labour breakdown</li>}
                  {i.attachments.map((a) => <li key={a.id}>{a.file_name}</li>)}
                  {!i.with_breakdown && !i.attachments.length && <li className="list-none text-slate">None</li>}
                </ul>
              )}
            </section>
          )}

          {i.status === "approved" && claimLike && (
            <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="certificate">
              <h2 className="font-bold">Payment certificate</h2>
              <p className="mt-1 text-sm text-slate">When the head contractor certifies less than we claimed, enter what they certified to date on each
                line. That becomes &quot;previously approved&quot; on the next claim. {i.certified_at && <>Recorded {nzDate(i.certified_at.slice(0, 10))} by {i.certified_by_name}: {money(i.certified_total)} certified this period of {money(i.lines.filter((l) => l.kind === "contract" || l.kind === "variation").reduce((a, l) => a + Number(l.to_date) - Number(l.prev_to_date), 0))} claimed.</>}</p>
              <form action={certifyInvoiceAction} className="mt-3 space-y-2">
                <Id />
                {i.lines.filter((l) => l.kind === "contract" || l.kind === "variation").map((l) => (
                  <label key={l.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_9rem_9rem]">
                    <span>{l.description}<span className="block text-xs text-slate">claimed to date {money(l.to_date)} of {money(l.contract_value)}</span></span>
                    <span className="text-xs text-slate">Certified to date</span>
                    <input name={`cert_${l.id}`} defaultValue={num(l.certified_to_date ?? l.to_date)} className={input} inputMode="decimal" />
                  </label>
                ))}
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="ref" defaultValue={i.certified_ref ?? ""} placeholder="Certificate number / reference" className={input} />
                  <input name="note" defaultValue={i.certified_note ?? ""} placeholder="Note (why it was cut)" className={input} />
                </div>
                <button className={primaryBtn}>Record the certificate</button>
              </form>
            </section>
          )}
        </div>

        {/* ── Side: totals, summary, email ─────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl bg-white p-4" data-testid="invoice-totals">
            <dl className="space-y-1 text-sm">
              <Row k="Subtotal" v={money(i.subtotal)} />
              {Number(i.retention_withheld) > 0 && <Row k="incl. retention withheld" v={money(-i.retention_withheld)} />}
              {Number(i.retention_released) > 0 && <Row k="incl. retention released" v={money(i.retention_released)} />}
              <Row k="GST" v={money(i.gst)} />
              <Row k="Total" v={money(i.total)} strong />
              {Number(i.amount_paid) > 0 && <Row k="Paid (Xero)" v={money(i.amount_paid)} />}
            </dl>
            {i.can_costs && i.cost_total !== undefined && Number(i.cost_total) > 0 && (
              <p className="mt-3 rounded-xl bg-mist/70 p-2 text-xs">Cost of these lines {money(i.cost_total)} · margin {i.margin_pct ?? "—"}%{" "}
                <span className="text-slate">(office only)</span></p>
            )}
          </section>

          {i.summary && (
            <section className="rounded-2xl bg-white p-4 text-sm" data-testid="claim-summary">
              <h2 className="font-bold">Claim summary</h2>
              <SummaryLine k="A Contract works" r={i.summary.A} />
              <SummaryLine k="B Approved variations" r={i.summary.B} />
              <SummaryLine k="D Unapproved variations" r={i.summary.D} />
              <p className="mt-2 text-xs text-slate">Retention held before this claim {money(i.summary.retention_prev - i.summary.released_prev)};
                this claim withholds {money(i.summary.retention_this)}{i.summary.released_this ? ` and releases ${money(i.summary.released_this)}` : ""}.</p>
            </section>
          )}

          {i.status === "approved" && send && (
            <section className="rounded-2xl bg-white p-4" data-testid="email-invoice">
              <h2 className="font-bold">Email the {i.kind === "claim" ? "claim" : "invoice"}</h2>
              <form action={emailInvoiceAction} className="mt-2 space-y-2 text-sm">
                <Id />
                {send.recipients.map((r) => (
                  <label key={r.email} className="flex items-center gap-2"><input type="checkbox" name="to" value={r.email} defaultChecked /> {r.name} <span className="text-xs text-slate">{r.email}</span></label>
                ))}
                {!send.recipients.length && <p className="text-xs text-slate">No contact gets invoices: tick &quot;gets invoices&quot; on the customer, or add an address.</p>}
                <input name="extra" placeholder="Another address (optional)" className={input} />
                <textarea name="message" rows={3} placeholder="Message (optional)" className={area} />
                <button className={primaryBtn}>Email with the PDF</button>
                <p className="text-xs text-slate">Replies go to {send.reply_to ?? "the office"}. On the test site it goes to the test inbox.</p>
              </form>
            </section>
          )}
          <p className="px-1 text-xs text-slate">Started {nzDate(i.created_at.slice(0, 10))} by {i.created_by_name}.</p>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate">{k}</dt>
      <dd className={`text-right tabular-nums ${strong ? "text-base font-bold" : ""}`}>{v}</dd>
    </div>
  );
}

function SummaryLine({ k, r }: { k: string; r: { value: number; prev: number; to_date: number } | null }) {
  if (!r) return null;
  return (
    <div className="mt-2">
      <p className="font-semibold">{k}</p>
      <p className="text-xs text-slate">value {money(r.value)} · before {money(r.prev)} · to date {money(r.to_date)} · this claim {money(Number(r.to_date) - Number(r.prev))}</p>
    </div>
  );
}

/** One line: editable on a draft (each its own form: Save, Remove), read-only once approved. */
function LineRow({ l, draft, canCosts, path }: { l: InvoiceLine; draft: boolean; canCosts: boolean; path: string }) {
  const progress = l.kind === "contract" || l.kind === "variation";
  const auto = l.auto_role === "retention_withheld" || l.auto_role === "retention_released";
  const total = Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100;
  const Hidden = () => (<><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="back" value={path} /></>);
  if (progress) {
    return (
      <div className="rounded-xl border border-black/10 p-3 text-sm" data-testid="progress-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold">{l.description}
            {l.kind === "variation" && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${l.approved_variation ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
              {l.approved_variation ? "approved variation" : "unapproved: substantiate with the breakdown"}</span>}</span>
          <span className="font-bold tabular-nums">{money(total)} this claim</span>
        </div>
        <p className="mt-1 text-xs text-slate">Value when complete {money(l.contract_value)} · previously approved {pct(l.pct_prev)} {money(l.prev_to_date)} ·
          claimed to date {pct(l.pct_to_date)} {money(l.to_date)}{l.certified_to_date !== null ? ` · certified ${money(l.certified_to_date)}` : ""}</p>
        {draft && (
          <form action={saveInvoiceLineAction} className="mt-2 flex flex-wrap items-center gap-2">
            <Hidden /><input type="hidden" name="progress" value="1" />
            <select name="by" className={`${input} w-auto`} aria-label="Claim by">
              <option value="pct">% complete to date</option>
              <option value="this_claim">$ this claim</option>
              <option value="to_date">$ claimed to date</option>
            </select>
            <input name="amount" defaultValue={num(l.pct_to_date)} className={`${input} w-28`} inputMode="decimal" aria-label="Amount" />
            {l.kind === "variation" && (
              <label className="flex items-center gap-1 text-xs text-slate">value
                <input name="contract_value" defaultValue={num(l.contract_value)} className={`${input} w-28`} inputMode="decimal" /></label>
            )}
            <button className={quietBtn}>Save</button>
          </form>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-black/10 p-3 text-sm" data-testid="invoice-line">
      {draft && !auto ? (
        <div className="space-y-2">
          <form action={saveInvoiceLineAction} className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_auto]">
            <Hidden />
            <input name="description" defaultValue={l.description} className={input} aria-label="Description" />
            <input name="quantity" defaultValue={num(l.quantity)} className={input} inputMode="decimal" aria-label="Quantity" />
            <input name="unit_price" defaultValue={num(l.unit_price)} className={input} inputMode="decimal" aria-label="Price excl GST" />
            <button className={quietBtn}>Save</button>
            <input name="note" defaultValue={l.note ?? ""} placeholder="Note under the line (e.g. the day's work)" className={`${input} sm:col-span-2`} aria-label="Note" />
            <span className="flex items-center gap-2 sm:col-span-2">
              {canCosts && <input name="unit_cost" defaultValue={num(l.unit_cost)} placeholder="Cost each" className={`${input} w-28`} inputMode="decimal" aria-label="Cost each" />}
              <input name="account_code" defaultValue={l.account_code} className={`${input} w-20`} aria-label="Xero account code" />
              <span className="ml-auto font-bold tabular-nums">{money(total)}</span>
            </span>
          </form>
          <form action={removeInvoiceLineAction} className="flex items-center justify-between gap-2 text-xs text-slate">
            <Hidden />
            <span>{l.sources ? `${l.sources} cost${l.sources === 1 ? "" : "s"} from the Cost Report` : l.deducts_number ? `Takes off deposit ${l.deducts_number}` : "Added by hand"}
              {canCosts && l.cost_total !== null && l.cost_total !== undefined && <> · cost {money(l.cost_total)}</>}</span>
            <button className="font-semibold text-red-800 hover:underline">Remove</button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>{l.description}{l.note && <span className="block text-xs italic text-slate">{l.note}</span>}</span>
          <span className="tabular-nums">{Number(l.quantity) !== 1 && <>{num(l.quantity)}{l.unit ? ` ${l.unit}` : ""} × {money(l.unit_price)} = </>}
            <strong>{money(total)}</strong>
            <span className="ml-2 text-xs text-slate">{l.account_code}{canCosts && l.cost_total ? ` · cost ${money(l.cost_total)}` : ""}</span></span>
        </div>
      )}
    </div>
  );
}
