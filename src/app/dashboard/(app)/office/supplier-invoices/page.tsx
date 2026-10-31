import Link from "next/link";
import {
  approveDocAction, approveMatchedAction, notOursDocAction, overheadDocAction, reopenDocAction, retryXeroAction, setDocJobAction,
  setLineJobAction, uploadSupplierCsvAction,
} from "@/app/dashboard/supplier-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { primaryBtn, quietBtn } from "@/components/office/jm";
import { loadDocs, XERO_LABEL, type Doc, type DocList } from "@/lib/supplier-docs";
import { officeEnabled } from "@/lib/office";
import { requireOffice } from "@/lib/auth";
import { isTestSite } from "@/lib/test-mode";

export const metadata = { title: "Supplier invoices" };

type Props = { searchParams: Promise<{ tab?: string; q?: string; ok?: string; err?: string }> };
const TABS = [
  { key: "to_approve", label: "To approve" },
  { key: "approved", label: "Approved" },
  { key: "not_ours", label: "Not ours" },
] as const;
const field = "rounded-lg border border-black/10 bg-white px-2 py-1 text-sm";
const money = (n: number) => `$${Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => Number(n).toLocaleString("en-NZ", { maximumFractionDigits: 2 });
const KIND = { materials: "", hire: "Hire", freight: "Freight", other: "Other" } as const;

export default async function SupplierInvoicesPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { tab: t, q, ok, err } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? (t as (typeof TABS)[number]["key"]) : "to_approve";
  let list: DocList;
  try {
    list = await loadDocs(session, tab, q ?? null);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const self = `/dashboard/office/supplier-invoices?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const count = (k: string) => (list.counts as Record<string, number>)[k] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier invoices</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Every Reece and Chesters invoice comes here first. The job and phase come from the order number (initials + job number
          + phase letter, e.g. JH-3000A): the initials say who bought it. Open an invoice to see its lines, change the job if it&rsquo;s
          wrong (or put one line on another job), then <strong>Approve</strong>: the cost goes on the job and the bill goes to Xero
          {isTestSite() ? " (not on the test site)" : " when that's switched on for the company (Office → Companies)"}.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      <section className="grid gap-4 lg:grid-cols-3">
        <form action={uploadSupplierCsvAction} className="rounded-2xl bg-white p-4 lg:col-span-2">
          <input type="hidden" name="back" value={self} />
          <h2 className="font-bold">Bring in the day&rsquo;s files</h2>
          <p className="mt-1 text-xs text-slate">Reece (the file ending in D has the lines; the S file is totals only) and Chesters CSVs. Invoices already in are skipped.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="file" name="file" accept=".csv,text/csv" multiple required className="text-sm" aria-label="Supplier CSV files" />
            <button className={primaryBtn}>Bring in</button>
          </div>
          <p className="mt-2 text-xs text-slate">
            Coming by email: once the inbound address is set up, the suppliers&rsquo; emails are brought in by themselves (see the build log).
          </p>
        </form>
        <div className="rounded-2xl bg-white p-4 text-sm">
          <h2 className="font-bold">Last files</h2>
          <ul className="mt-1 space-y-1">
            {list.imports.slice(0, 5).map((i) => (
              <li key={i.id} className="text-xs">
                <span className="font-semibold">{i.supplier}</span> · {i.file_name ?? i.source} · {i.new} new{i.seen ? `, ${i.seen} already in` : ""}
                <span className="text-slate"> · {new Date(i.at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "2-digit" })} by {i.by}</span>
                {i.problems.map((p, k) => <span key={k} className="block text-amber-800">{p.number ? `${p.number}: ` : ""}{p.why}</span>)}
              </li>
            ))}
            {!list.imports.length && <li className="text-xs text-slate">Nothing brought in yet.</li>}
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((x) => (
          <Link key={x.key} href={`/dashboard/office/supplier-invoices?tab=${x.key}`}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === x.key ? "bg-ink text-white" : "bg-white"}`}>
            {x.label} ({count(x.key)})
          </Link>
        ))}
        {tab === "to_approve" && count("matched") > 0 && (
          <form action={approveMatchedAction}>
            <input type="hidden" name="back" value={self} />
            <button className={primaryBtn}>Approve all with a job ({count("matched")})</button>
          </form>
        )}
        {count("xero_failed") > 0 && (
          <form action={retryXeroAction}>
            <input type="hidden" name="back" value={self} />
            <button className="rounded-full bg-red-50 px-4 py-1.5 text-sm font-semibold text-red-800">{count("xero_failed")} Xero refused · Try again</button>
          </form>
        )}
        <form action="/dashboard/office/supplier-invoices" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q ?? ""} placeholder="Invoice, order, job, item…" aria-label="Search supplier invoices" className={`${field} w-56`} />
          <button className={quietBtn}>Search</button>
        </form>
      </div>

      {list.docs.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate">
          {tab === "to_approve" ? "Nothing to approve. Bring in the day's files above." : "Nothing here."}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.docs.map((d) => <DocCard key={d.id} d={d} self={self} />)}
        </ul>
      )}
      <p className="text-xs text-slate">Signed in as {session.name}.</p>
    </div>
  );
}

function DocCard({ d, self }: { d: Doc; self: string }) {
  const open = d.status === "to_approve";
  const needsJob = !d.job_id && !d.overhead;
  return (
    <li className={`rounded-2xl bg-white p-4 ${needsJob && open ? "ring-2 ring-amber-300" : ""}`} data-testid="supplier-doc" data-number={d.number}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {d.supplier} {d.type === "credit" ? "credit" : "invoice"} {d.number}
            <span className="ml-2 text-sm font-normal text-slate">{d.date_label}{d.branch ? ` · ${d.branch}` : ""}</span>
          </p>
          <p className="text-sm">
            Order no. <strong>{d.order_no ?? "—"}</strong>
            {" · "}Bought by{" "}
            {d.purchaser ? <strong>{d.purchaser}</strong> : <span className="text-amber-800">unknown{d.order?.initials ? ` (no staff with initials ${d.order.initials})` : " (no initials)"}</span>}
            {d.receiver && d.purchaser_by !== "receiver" ? <span className="text-slate"> · received by {d.receiver}</span> : null}
          </p>
          <p className="mt-1 text-sm">
            {d.job_label ? (
              <span className="rounded-full bg-aqua-pale px-2 py-0.5 font-semibold text-aqua-deep">{d.job_label}</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">No job found for this order number</span>
            )}
            {d.company && <span className="ml-1 text-xs text-slate">{d.company}</span>}
            {d.matched_by === "order_no" && open && <span className="ml-2 text-xs text-slate">from the order number</span>}
            {d.matched_by === "office" && <span className="ml-2 text-xs text-slate">set by the office</span>}
          </p>
          {d.note && <p className="mt-1 text-xs text-slate">“{d.note}”</p>}
          {!open && (
            <p className="mt-1 text-xs text-slate">
              {d.status === "approved" ? `Approved by ${d.approved_by}` : "Not ours"}
              {XERO_LABEL[d.xero_status] ? ` · ${XERO_LABEL[d.xero_status]}` : ""}
              {d.xero_error ? `: ${d.xero_error}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{money(d.subtotal)}</p>
          <p className="text-xs text-slate">+ GST {money(d.gst)} = {money(d.total)}</p>
          {open && (
            <form action={approveDocAction} className="mt-2">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="back" value={self} />
              <button className={primaryBtn} disabled={needsJob} title={needsJob ? "Pick the job first, or mark it overhead" : undefined}>Approve</button>
            </form>
          )}
          {!open && d.xero_status !== "sent" && (
            <form action={reopenDocAction} className="mt-2">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="back" value={self} />
              <button className={quietBtn}>Reopen</button>
            </form>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
          <form action={setDocJobAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="back" value={self} />
            <input name="job_ref" placeholder="Job or phase, e.g. PTSL-3000a" aria-label="Job or phase number" className={`${field} w-56`} />
            <button className={quietBtn}>{d.job_id ? "Change job" : "Set job"}</button>
          </form>
          {!d.overhead && (
            <form action={overheadDocAction}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="back" value={self} />
              <button className={quietBtn}>Overhead (no job)</button>
            </form>
          )}
          <form action={notOursDocAction} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="back" value={self} />
            <input name="note" placeholder="Why (optional)" aria-label="Why it's not ours" className={`${field} w-40`} />
            <button className="text-xs text-red-700 underline">Not ours</button>
          </form>
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold text-aqua-deep">
          {d.lines.length} line{d.lines.length === 1 ? "" : "s"}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-slate">
              <tr><th className="py-1">Code</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Each</th><th className="text-right">Total</th><th>Job</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1 pr-2 text-xs text-slate">{l.code}</td>
                  <td className="pr-2">{l.description}{KIND[l.kind] && <span className="ml-1 rounded bg-mist px-1 text-xs">{KIND[l.kind]}</span>}</td>
                  <td className="pr-2 text-right">{qty(l.quantity)} {l.unit ?? ""}</td>
                  <td className="pr-2 text-right">{money(l.unit_cost)}</td>
                  <td className="pr-2 text-right font-semibold">{money(l.total)}</td>
                  <td className="pl-2">
                    {open ? (
                      <form action={setLineJobAction} className="flex items-center gap-1">
                        <input type="hidden" name="line_id" value={l.id} />
                        <input type="hidden" name="back" value={self} />
                        <input name="job_ref" defaultValue={l.job_label ? l.job_label.split(" ")[0] : ""} placeholder={l.job_id ? "" : "Same as invoice"}
                               aria-label="Job for this line" className={`${field} w-36`} />
                        <button className="text-xs text-aqua-deep underline">Set</button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate">{l.job_label ?? "Same as invoice"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}
