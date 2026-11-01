// Phase 3d: Office → Invoices. The invoicing pipeline across both companies: phases waiting To Invoice, drafts
// To Be Approved, Invoiced, and Void. Owner/admin and office managers (their companies only).
import Link from "next/link";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { InvoiceTable } from "@/components/office/invoices-ui";
import { input, nzDate, quietBtn } from "@/components/office/jm";
import { CompanyBadge } from "@/components/office/jobs-ui";
import { requireOffice } from "@/lib/auth";
import { loadPipeline, type InvoiceRow, type PhaseWaiting, type Pipeline, type PipelineTab } from "@/lib/invoices";
import { officeEnabled } from "@/lib/office";
import { isTestSite } from "@/lib/test-mode";

export const metadata = { title: "Invoices" };
type Props = { searchParams: Promise<{ tab?: string; q?: string; ok?: string; err?: string }> };
const TABS: { key: PipelineTab; label: string }[] = [
  { key: "to_invoice", label: "To Invoice" },
  { key: "draft", label: "To Be Approved" },
  { key: "approved", label: "Invoiced" },
  { key: "void", label: "Void" },
];

export default async function InvoicesPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { tab: t, q, ok, err } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? (t as PipelineTab) : "draft";
  let p: Pipeline;
  try {
    p = await loadPipeline(session, tab, null, q?.trim() || null);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-6" data-testid="invoices-page">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Phases reach <strong>To Invoice</strong> when the work&apos;s done. Starting their final invoice (job → Invoices) moves them to{" "}
          <strong>To Be Approved</strong>; approving it gives it the next INV number, sends it to Xero as a draft
          {isTestSite() ? " (never from the test site)" : ""} and moves the phase to <strong>Invoiced</strong>.
          Progress and payment claims don&apos;t move the phase until the final one.
        </p>
      </div>
      <Flash ok={ok} err={err} />
      {p.counts.xero_failed > 0 && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
          {p.counts.xero_failed} invoice{p.counts.xero_failed === 1 ? "" : "s"} didn&apos;t go to Xero. Open {p.counts.xero_failed === 1 ? "it" : "them"} under Invoiced and press &quot;Send to Xero again&quot;.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Pipeline">
          {TABS.map((x) => (
            <Link key={x.key} href={`/dashboard/office/invoices?tab=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={tab === x.key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === x.key ? "bg-ink text-white" : "bg-white text-slate hover:text-ink"}`}>
              {x.label} <span className="opacity-70">({p.counts[x.key]})</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" action="/dashboard/office/invoices">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q ?? ""} placeholder="Invoice, job, customer, order no." className={`${input} w-64`} aria-label="Search invoices" />
          <button className={quietBtn}>Search</button>
        </form>
      </div>
      <section className="rounded-2xl bg-white p-5 sm:p-6">
        {tab === "to_invoice" ? <Waiting rows={p.rows as PhaseWaiting[]} /> : <InvoiceTable rows={p.rows as InvoiceRow[]} showJob />}
      </section>
    </div>
  );
}

function Waiting({ rows }: { rows: PhaseWaiting[] }) {
  if (!rows.length) return <p className="text-sm text-slate">No phases waiting to be invoiced.</p>;
  return (
    <ul className="divide-y divide-black/5" data-testid="to-invoice">
      {rows.map((r) => (
        <li key={r.phase_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <CompanyBadge code={r.company} />
            <strong>{r.phase_ref}</strong> {r.phase_name}
            <span className="text-slate">· {r.customer}{r.title ? ` · ${r.title}` : ""}{r.job_type === "charge_up" ? " · charge-up" : ""}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate">since {nzDate(r.since.slice(0, 10))}</span>
            <Link href={`/dashboard/office/job/${encodeURIComponent(r.job_ref)}?tab=invoices`} className="font-semibold text-aqua-deep">Invoice it →</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}
