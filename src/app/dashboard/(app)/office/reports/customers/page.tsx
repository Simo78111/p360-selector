// Reports → Customer profitability (Simon, 11 Nov): per customer, for the dates picked, what was invoiced against the
// cost of the work done in those dates, gross profit and margin; each customer opens to its jobs. Needs "Can see costs
// and margins" (same as Job profitability).
import Link from "next/link";
import { EngineError, NotConnected } from "@/components/office/bits";
import { money, nzDate } from "@/components/office/jm";
import { JobRef, pct, ReportFilters, ReportShell, StatTile } from "@/components/office/reports-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadCustomerProfit, resolveRange, TYPE_NAME, type CustomerProfitReport, type CustomerProfitRow } from "@/lib/reports";

export const metadata = { title: "Customer profitability" };
const PATH = "/dashboard/office/reports/customers";
type Sort = "profit" | "invoiced" | "margin" | "loss" | "name";
type Props = { searchParams: Promise<{ range?: string; from?: string; to?: string; co?: string; sort?: string; q?: string }> };

const SORTS: { id: Sort; label: string }[] = [
  { id: "profit", label: "Most profit" },
  { id: "invoiced", label: "Most invoiced" },
  { id: "margin", label: "Best margin" },
  { id: "loss", label: "Worst first" },
  { id: "name", label: "Name A–Z" },
];

function sorted(rows: CustomerProfitRow[], sort: Sort) {
  const r = [...rows];
  switch (sort) {
    case "invoiced": return r.sort((a, b) => b.invoiced - a.invoiced);
    case "margin": return r.sort((a, b) => (b.margin ?? -1e9) - (a.margin ?? -1e9));
    case "loss": return r.sort((a, b) => a.profit - b.profit);
    case "name": return r.sort((a, b) => a.customer.localeCompare(b.customer));
    default: return r.sort((a, b) => b.profit - a.profit);
  }
}

export default async function CustomerProfitPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  const r = resolveRange(sp.range, sp.from, sp.to);
  const sort = (SORTS.find((s) => s.id === sp.sort)?.id ?? "profit") as Sort;
  const q = (sp.q ?? "").trim();
  let rep: CustomerProfitReport;
  try {
    rep = await loadCustomerProfit(session, r.from, r.to, null);
    const c = rep.companies?.find((x) => x.code === sp.co);
    if (c) rep = await loadCustomerProfit(session, r.from, r.to, c.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("access to this report")) {
      return (
        <ReportShell path={PATH} title="Customer profitability" intro="Invoiced, cost and gross profit per customer.">
          <p className="rounded-2xl bg-white p-6 text-sm" data-testid="no-access">
            This report shows costs and margins, so it needs <strong>Can see costs and margins</strong> (Settings → Staff →
            Permissions). Ask the owner if you should have it.
          </p>
        </ReportShell>
      );
    }
    return <EngineError message={msg} />;
  }
  const co = rep.companies.find((c) => c.code === sp.co);
  const t = rep.totals;
  const margin = t.invoiced ? ((t.invoiced - t.cost) / t.invoiced) * 100 : null;
  const rows = sorted(rep.rows.filter((x) => !q || x.customer.toLowerCase().includes(q.toLowerCase())), sort);
  const best = [...rep.rows].filter((x) => x.invoiced > 0).sort((a, b) => b.profit - a.profit)[0];
  const qs = new URLSearchParams({ r: "customers", from: r.from, to: r.to, ...(co ? { co: co.code } : {}) });
  const tone = (n: number) => (n < 0 ? "text-red-700" : "");

  return (
    <ReportShell path={PATH} title="Customer profitability" csvHref={`/api/office/reports?${qs}`}
      intro={<>Each customer for <strong>{nzDate(r.from)} – {nzDate(r.to)}</strong>: what was invoiced in those dates (excl GST,
        before retentions) against the cost of the work done in those dates (labour at each person&apos;s cost rate incl. Rate 2/3,
        supplier invoice lines, stock on hand and tool hire). Work done but not invoiced yet is shown at sell, so a customer
        whose invoice falls after the period doesn&apos;t just look like a loss. Gross profit only: overheads are in Xero.</>}>
      <ReportFilters path={PATH} range={r.key} from={r.from} to={r.to} companies={rep.companies} company={co?.code}
        extra={
          <>
            <label className="text-xs font-semibold text-slate">
              Sort
              <select name="sort" defaultValue={sort} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate">
              Customer
              <input name="q" defaultValue={q} placeholder="Name contains…" className="mt-1 block w-48 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm" />
            </label>
          </>
        } />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="customer-profit-tiles">
        <StatTile label="Invoiced in the period" value={money(t.invoiced)} sub={`${t.customers} customer${t.customers === 1 ? "" : "s"} with work or invoices`} />
        <StatTile label="Gross profit" value={money(t.profit)} tone={t.profit < 0 ? "bad" : undefined}
          sub={`${pct(margin)} on ${money(t.cost)} cost · ${Number(t.hours).toFixed(0)} hours`} />
        <StatTile label="Work not invoiced yet" value={money(t.not_invoiced)} sub="Done in the period, at sell — still to come in" />
        <StatTile label="Most profitable" value={best ? money(best.profit) : "—"} sub={best ? `${best.customer} · ${pct(best.margin)}` : "No invoices in the period"} />
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm" data-testid="customer-profit-table">
          <thead className="bg-[#0F172A] text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-3 py-3 text-right">Jobs</th>
              <th className="px-3 py-3 text-right">Invoiced</th>
              <th className="px-3 py-3 text-right">Hours</th>
              <th className="px-3 py-3 text-right">Labour</th>
              <th className="px-3 py-3 text-right">Materials & other</th>
              <th className="px-3 py-3 text-right">Cost</th>
              <th className="px-3 py-3 text-right">Profit</th>
              <th className="px-3 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Not invoiced yet</th>
            </tr>
          </thead>
          {rows.map((c) => (
            <tbody key={c.customer_id} className="border-t border-slate-200">
              <tr className={c.profit < 0 ? "bg-red-50/70" : ""}>
                <td className="px-4 py-3 align-top">
                  <details className="group" data-testid="customer-row">
                    <summary className="cursor-pointer list-none font-semibold">
                      <span aria-hidden className="mr-1.5 inline-block text-slate-500 transition-transform group-open:rotate-90">▸</span>
                      {c.customer}
                      <span className="block pl-5 text-xs font-normal text-slate-600">
                        {[c.company, `${c.invoices} invoice${c.invoices === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                        {" · "}<Link href={`/dashboard/office/customers/${c.customer_id}`} className="underline">customer</Link>
                      </span>
                    </summary>
                    <table className="mt-3 w-full text-xs" data-testid="customer-jobs">
                      <thead className="text-left text-[10px] tracking-wider text-slate-500 uppercase">
                        <tr><th className="py-1 pr-2">Job</th><th className="py-1 pr-2 text-right">Invoiced</th><th className="py-1 pr-2 text-right">Cost</th>
                          <th className="py-1 pr-2 text-right">Profit</th><th className="py-1 pr-2 text-right">Margin</th><th className="py-1 text-right">Not invoiced</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {c.job_rows.map((j) => (
                          <tr key={j.job_id}>
                            <td className="py-1.5 pr-2"><JobRef jobRef={j.job_ref} title={j.title} /><span className="block text-slate-500">{TYPE_NAME[j.type]}</span></td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{money(j.invoiced)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{money(j.cost)}</td>
                            <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${tone(j.profit)}`}>{money(j.profit)}</td>
                            <td className={`py-1.5 pr-2 text-right tabular-nums ${tone(j.profit)}`}>{pct(j.margin)}</td>
                            <td className="py-1.5 text-right tabular-nums text-slate-600">{j.not_invoiced ? money(j.not_invoiced) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums">{c.jobs}</td>
                <td className="px-3 py-3 text-right align-top tabular-nums">{money(c.invoiced)}</td>
                <td className="px-3 py-3 text-right align-top tabular-nums">{Number(c.hours).toFixed(1)}</td>
                <td className="px-3 py-3 text-right align-top tabular-nums">{money(c.labour)}</td>
                <td className="px-3 py-3 text-right align-top tabular-nums">{money(c.materials)}</td>
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  {money(c.cost)}
                  {c.pending > 0 && <span className="block text-xs text-amber-800">{money(c.pending)} not approved</span>}
                  {c.no_rate > 0 && <span className="block text-xs text-red-700">{c.no_rate} line{c.no_rate === 1 ? "" : "s"} with no cost rate</span>}
                </td>
                <td className={`px-3 py-3 text-right align-top font-bold tabular-nums ${tone(c.profit)}`}>{money(c.profit)}</td>
                <td className={`px-3 py-3 text-right align-top tabular-nums ${tone(c.profit)}`}>{pct(c.margin)}</td>
                <td className="px-4 py-3 text-right align-top tabular-nums text-slate-700">{c.not_invoiced ? money(c.not_invoiced) : "—"}</td>
              </tr>
            </tbody>
          ))}
          {rows.length === 0 && (
            <tbody><tr><td colSpan={10} className="px-4 py-6 text-slate-600">No customers with work or invoices in this period{q ? ` matching “${q}”` : ""}.</td></tr></tbody>
          )}
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <tr>
                <td className="px-4 py-3">Total ({rows.length})</td>
                <td className="px-3 py-3 text-right tabular-nums">{rows.reduce((a, c) => a + c.jobs, 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(rows.reduce((a, c) => a + c.invoiced, 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{rows.reduce((a, c) => a + Number(c.hours), 0).toFixed(1)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(rows.reduce((a, c) => a + c.labour, 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(rows.reduce((a, c) => a + c.materials, 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(rows.reduce((a, c) => a + c.cost, 0))}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${tone(rows.reduce((a, c) => a + c.profit, 0))}`}>{money(rows.reduce((a, c) => a + c.profit, 0))}</td>
                <td className="px-3 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{money(rows.reduce((a, c) => a + c.not_invoiced, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </ReportShell>
  );
}
