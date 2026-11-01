// Phase 3d: invoice pieces for the office console (server components; every form posts to one server action).
import Link from "next/link";
import { newInvoiceAction, saveClaimSettingsAction } from "@/app/dashboard/invoice-actions";
import { input, label, money, nzDate, primaryBtn, quietBtn } from "@/components/office/jm";
import { KIND_LABEL, STATUS_LABEL, XERO_LABEL, type InvoiceRow, type InvoiceStatus, type JobInvoices, type XeroStatus } from "@/lib/invoices";
import type { JobPage, Phase } from "@/lib/jobs";

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-orange-100 text-orange-900", approved: "bg-emerald-100 text-emerald-900",
  void: "bg-red-100 text-red-800", discarded: "bg-slate-200 text-slate-700",
};
export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
export function XeroNote({ status }: { status: XeroStatus }) {
  if (!XERO_LABEL[status]) return null;
  return <span className={`text-xs ${status === "failed" ? "font-semibold text-red-700" : "text-slate"}`}>{XERO_LABEL[status]}</span>;
}

export const invoiceHref = (r: Pick<InvoiceRow, "job_ref" | "id">) => `/dashboard/office/job/${encodeURIComponent(r.job_ref)}/invoice/${r.id}`;

/** A table of invoices (job page and Office → Invoices). */
export function InvoiceTable({ rows, showJob = false }: { rows: InvoiceRow[]; showJob?: boolean }) {
  if (!rows.length) return <p className="text-sm text-slate">No invoices yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm" data-testid="invoice-table">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs text-slate">
            <th className="py-2 pr-3">Number</th>
            <th className="py-2 pr-3">Type</th>
            {showJob && <th className="py-2 pr-3">Customer</th>}
            <th className="py-2 pr-3">Job / phase</th>
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Due</th>
            <th className="py-2 pr-3 text-right">Excl GST</th>
            <th className="py-2 pr-3 text-right">Incl GST</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-black/5 align-top">
              <td className="py-2 pr-3 font-semibold">
                <Link href={invoiceHref(r)} className="text-aqua-deep hover:underline">{r.number}</Link>
                {r.kind === "claim" && <span className="block text-xs font-normal text-slate">Claim #{r.claim_no}</span>}
              </td>
              <td className="py-2 pr-3">{KIND_LABEL[r.kind]}{r.is_final && r.kind !== "deposit" ? <span className="block text-xs text-slate">final</span> : null}</td>
              {showJob && <td className="py-2 pr-3">{r.customer}<span className="block text-xs text-slate">{r.company}</span></td>}
              <td className="py-2 pr-3">{r.phase_ref ?? r.job_ref}{r.heading && <span className="block text-xs text-slate">{r.heading}</span>}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{nzDate(r.invoice_date)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{nzDate(r.due_date)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(r.subtotal)}
                {Number(r.retention_withheld) > 0 && <span className="block text-xs text-slate">ret. {money(r.retention_withheld)}</span>}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(r.total)}
                {Number(r.amount_paid) > 0 && <span className="block text-xs text-emerald-800">paid {money(r.amount_paid)}</span>}
              </td>
              <td className="py-2 pr-3">
                <InvoiceStatusChip status={r.status} />
                <span className="block"><XeroNote status={r.xero_status} /></span>
                {r.certified_total !== null && <span className="block text-xs text-slate">certified {money(r.certified_total)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PhasePick({ phases, name = "phase_id", withWhole = true, values }: {
  phases: (Phase & { id: string })[]; name?: string; withWhole?: boolean; values?: Record<string, number>;
}) {
  return (
    <select name={name} className={input} aria-label="Which phase">
      {withWhole && <option value="">Whole job{values ? ` · ${money(Object.values(values).reduce((a, v) => a + Number(v), 0))} to charge` : ""}</option>}
      {phases.map((p) => (
        <option key={p.id} value={p.id}>{p.ref} {p.name}{values?.[p.id] ? ` · ${money(values[p.id])} to charge` : ""}</option>
      ))}
    </select>
  );
}

/** The job page's Invoices tab. */
export function InvoicesTab({ job, inv, phases, base }: { job: JobPage; inv: JobInvoices; phases: (Phase & { id: string })[]; base: string }) {
  const back = `${base}?tab=invoices`;
  const u = inv.uninvoiced;
  const c = inv.claims;
  const isTop = c.top_job_id === job.job_id;
  const depositQuotes = inv.quotes.filter((q) => q.deposit && !q.deposit_invoice);
  const Hidden = () => (<><input type="hidden" name="job_id" value={job.job_id} /><input type="hidden" name="back" value={back} /></>);
  const bands = c.retention_bands ?? [];
  return (
    <div className="space-y-6" data-testid="invoices-tab">
      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Invoices</h2>
          <Link href="/dashboard/office/invoices" className="text-sm font-semibold text-aqua-deep">All invoices →</Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-mist/60 p-3">
            <p className={label}>Not invoiced yet (charge value)</p>
            <p className="text-xl font-bold tabular-nums">{money(u.charge_value)}</p>
            <p className="text-xs text-slate">{u.lines} cost line{u.lines === 1 ? "" : "s"} on {job.job_ref}
              {u.not_approved > 0 && <> · {money(u.not_approved)} not approved yet</>}</p>
          </div>
          <div className="rounded-xl bg-mist/60 p-3">
            <p className={label}>Accepted quotes</p>
            <p className="text-xl font-bold tabular-nums">{money(inv.quotes.reduce((a, q) => a + Number(q.net), 0))}</p>
            <p className="text-xs text-slate">{inv.quotes.length ? inv.quotes.map((q) => q.number).join(", ") : "None accepted yet"}</p>
          </div>
          <div className="rounded-xl bg-mist/60 p-3">
            <p className={label}>Retentions held by the customer</p>
            <p className="text-xl font-bold tabular-nums">{money(c.retention_held)}</p>
            <p className="text-xs text-slate">{c.claim_mode ? `Construction contract · next claim #${c.next_claim_no}` : "Standard invoices"}</p>
          </div>
        </div>

        <h3 className="mt-6 font-bold">Start an invoice</h3>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <form action={newInvoiceAction} className="space-y-2 rounded-xl border border-black/10 p-3" data-testid="new-charge-up">
            <Hidden /><input type="hidden" name="kind" value="charge_up" />
            <p className="font-semibold">Charge up the costs</p>
            <p className="text-xs text-slate">Labour at each person&apos;s charge-out rate (one line per person per day, with their notes) and
              supplier lines at sell. Costs already on an invoice are left out. Marked as the final invoice for the phase.</p>
            <PhasePick phases={phases} values={u.by_phase} />
            <select name="pending" className={input} aria-label="Which costs">
              <option value="all">Everything, including timesheets and supplier invoices not approved yet</option>
              <option value="approved">Only approved timesheets and supplier invoices</option>
            </select>
            <button className={primaryBtn} disabled={u.lines === 0}>Start charge-up invoice</button>
          </form>

          <form action={newInvoiceAction} className="space-y-2 rounded-xl border border-black/10 p-3" data-testid="new-progress">
            <Hidden /><input type="hidden" name="kind" value="progress" />
            <p className="font-semibold">Progress claim against the quote</p>
            <p className="text-xs text-slate">Built from the accepted quote; claim a % or $ of each line. Previously claimed (or
              certified) amounts are carried forward{bands.length ? ", retentions are worked out" : ""} and any deposit is taken off.</p>
            <PhasePick phases={phases} />
            <DetailPick c={c} />
            <button className={primaryBtn} disabled={!inv.quotes.length}>Start progress claim</button>
          </form>

          {isTop || c.claim_mode ? (
            <form action={newInvoiceAction} className="space-y-2 rounded-xl border border-black/10 p-3" data-testid="new-claim">
              <Hidden /><input type="hidden" name="kind" value="claim" />
              <p className="font-semibold">Payment claim #{c.next_claim_no} (Construction Contracts Act)</p>
              <p className="text-xs text-slate">The whole project ({c.top_job_ref} and its variations): the quote, approved and
                unapproved variations, retentions, the claim summary, an hours breakdown and any files you attach. Laid out like PayApps.</p>
              <DetailPick c={c} />
              <button className={primaryBtn}>Start payment claim #{c.next_claim_no}</button>
            </form>
          ) : null}

          <div className="space-y-2 rounded-xl border border-black/10 p-3" data-testid="new-deposit">
            <p className="font-semibold">Deposit invoice</p>
            {depositQuotes.map((q) => (
              <form key={q.version_id} action={newInvoiceAction} className="flex flex-wrap items-center gap-2">
                <Hidden /><input type="hidden" name="kind" value="deposit" /><input type="hidden" name="quote_version_id" value={q.version_id} />
                <button className={quietBtn}>Deposit for {q.number}: {money(q.deposit)} incl GST</button>
              </form>
            ))}
            {inv.quotes.filter((q) => q.deposit_invoice).map((q) => (
              <p key={q.version_id} className="text-xs text-slate">{q.number}: deposit invoice {q.deposit_invoice} (made when it was accepted)</p>
            ))}
            <form action={newInvoiceAction} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <Hidden /><input type="hidden" name="kind" value="deposit" />
              <PhasePick phases={phases} />
              <input name="amount" className={input} placeholder="$ excl GST" inputMode="decimal" aria-label="Deposit excl GST" />
              <button className={quietBtn}>Deposit by hand</button>
            </form>
          </div>

          <form action={newInvoiceAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 p-3">
            <Hidden /><input type="hidden" name="kind" value="manual" />
            <span className="font-semibold">Blank invoice</span>
            <div className="min-w-48 flex-1"><PhasePick phases={phases} /></div>
            <button className={quietBtn}>Start</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h3 className="font-bold">Invoices on {c.top_job_ref === job.job_ref ? "this project" : `the project (${c.top_job_ref})`}</h3>
        <div className="mt-2"><InvoiceTable rows={inv.invoices} /></div>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6" data-testid="claim-settings">
        <h3 className="font-bold">Payment claims and retentions {isTop ? "" : <span className="font-normal text-slate">(set on {c.top_job_ref})</span>}</h3>
        <p className="mt-1 text-sm text-slate">For construction contracts. Retentions are worked out on progress and payment claims from the bands
          below (e.g. 10% on the first $250,000, then 5%), on the total claimed to date. Half comes back on the first claim after
          practical completion, the rest after the final release date (a year later unless you change it).</p>
        <form action={saveClaimSettingsAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hidden />
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="claim_mode" defaultChecked={c.claim_mode} /> Construction contract: invoice with payment claims
          </label>
          <label className="text-sm sm:col-span-2"><span className={label}>Claims bring across the quote&apos;s</span>
            <select name="claim_detail" defaultValue={c.claim_detail} className={input} disabled={c.claim_detail_locked}>
              <option value="sections">Sections (one claim line per quote section)</option>
              <option value="lines">Line items (one claim line per quote line)</option>
            </select>
            {c.claim_detail_locked && <input type="hidden" name="claim_detail" value={c.claim_detail} />}
            {c.claim_detail_locked && <span className="mt-1 block text-xs text-slate">Fixed: a claim on this project is already approved this way.</span>}
          </label>
          <label className="text-sm"><span className={label}>Contract reference</span>
            <input name="contract_ref" defaultValue={c.contract_ref ?? ""} className={input} /></label>
          <label className="text-sm"><span className={label}>Claims due by (day of month)</span>
            <input name="claim_day" defaultValue={c.claim_day} className={input} inputMode="numeric" /></label>
          <label className="text-sm"><span className={label}>Paid on (day; blank = last day)</span>
            <input name="pay_day" defaultValue={c.pay_day ?? ""} className={input} inputMode="numeric" /></label>
          <label className="text-sm"><span className={label}>Retention cap ($, optional)</span>
            <input name="retention_cap" defaultValue={c.retention_cap ?? ""} className={input} inputMode="decimal" /></label>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className={label}>Retention bands (leave the last &quot;up to&quot; blank for &quot;and above&quot;)</legend>
            {[0, 1, 2].map((n) => (
              <div key={n} className="grid grid-cols-[5rem_1fr] items-center gap-2 text-sm">
                <input name={`band_pct_${n}`} defaultValue={bands[n]?.pct ?? ""} placeholder="%" className={input} inputMode="decimal" aria-label={`Band ${n + 1} %`} />
                <input name={`band_upto_${n}`} defaultValue={bands[n] ? (bands[n].upto ?? "") : ""} placeholder={n === 0 ? "on the first $… (e.g. 250000)" : "up to $… (blank = and above)"}
                  className={input} inputMode="decimal" aria-label={`Band ${n + 1} up to`} />
              </div>
            ))}
          </fieldset>
          <label className="text-sm"><span className={label}>Practical completion</span>
            <input type="date" name="practical_completion" defaultValue={c.practical_completion ?? ""} className={input} /></label>
          <label className="text-sm"><span className={label}>Final retention release</span>
            <input type="date" name="retention_final_date" defaultValue={c.retention_final_date ?? ""} className={input} /></label>
          <div className="sm:col-span-2 lg:col-span-4"><button className={primaryBtn}>Save payment claim settings</button></div>
        </form>
        <p className="mt-2 text-xs text-slate">Held so far: {money(c.retention_withheld)} withheld, {money(c.retention_withheld - c.retention_held)} released.</p>
      </section>
    </div>
  );
}

/** What a claim brings across from the quote: its sections or its line items. Chosen on the first claim; once a claim is
 *  approved, later claims follow it (so "previously claimed" lines up), and the box just says which. */
function DetailPick({ c }: { c: JobInvoices["claims"] }) {
  if (c.claim_detail_locked) {
    return (
      <p className="text-xs text-slate">
        <input type="hidden" name="detail" value={c.claim_detail} />
        Brings across the quote&apos;s <strong>{c.claim_detail === "lines" ? "line items" : "sections"}</strong>, like the claims already approved.
      </p>
    );
  }
  return (
    <label className="block text-sm"><span className={label}>What would you like to bring across from the quote?</span>
      <select name="detail" defaultValue={c.claim_detail} className={input}>
        <option value="sections">Sections (one line per quote section)</option>
        <option value="lines">Line items (one line per quote line; fixed-price sections stay one line)</option>
      </select>
    </label>
  );
}
