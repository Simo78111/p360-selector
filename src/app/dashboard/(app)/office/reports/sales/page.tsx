// Phase 3e: Reports → Sales summary. Approved invoices dated in the period (job invoices at their work value, i.e.
// before retentions, plus the booking engine's own invoices), excl GST.
import { EngineError, NotConnected } from "@/components/office/bits";
import { money, nzDate } from "@/components/office/jm";
import { Change, HBars, JobRef, MonthBars, ReportFilters, ReportShell, StatTile, td, tdR, th, thR } from "@/components/office/reports-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { CATEGORY_LABEL, KIND_NAME, loadSales, resolveRange, type SalesCategory, type SalesReport } from "@/lib/reports";

export const metadata = { title: "Sales summary" };
const PATH = "/dashboard/office/reports/sales";
type Props = { searchParams: Promise<{ range?: string; from?: string; to?: string; co?: string }> };

export default async function SalesPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  const r = resolveRange(sp.range, sp.from, sp.to);
  let rep: SalesReport;
  try {
    // the company list comes back with the report; ask for both first if the code isn't one of theirs
    rep = await loadSales(session, r.from, r.to, null);
    const co = rep.companies.find((c) => c.code === sp.co);
    if (co) rep = await loadSales(session, r.from, r.to, co.id);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const co = rep.companies.find((c) => c.code === sp.co);
  const qs = new URLSearchParams({ r: "sales", from: r.from, to: r.to, ...(co ? { co: co.code } : {}) });

  const months = monthsBetween(r.from, r.to);
  const shown = co ? [co] : rep.companies;
  const series = shown.map((c) => ({
    code: c.code, name: c.name,
    values: months.map((m) => rep.by_month.filter((x) => x.month === m && x.code === c.code).reduce((n, x) => n + Number(x.sales), 0)),
  }));
  const categories = (Object.keys(CATEGORY_LABEL) as SalesCategory[])
    .filter((k) => rep.by_category[k])
    .map((k) => ({ label: CATEGORY_LABEL[k], value: Number(rep.by_category[k]) }))
    .sort((a, b) => b.value - a.value);
  const avg = rep.invoices ? rep.sales / rep.invoices : 0;

  return (
    <ReportShell path={PATH} title="Sales summary" csvHref={`/api/office/reports?${qs}`}
      intro={<>Approved invoices dated {nzDate(r.from)} – {nzDate(r.to)}, excl GST. Job invoices count at their work value
        (before retentions); voided invoices and drafts aren&apos;t sales. Maintenance bookings are the booking engine&apos;s invoices.</>}>
      <ReportFilters path={PATH} range={r.key} from={r.from} to={r.to} companies={rep.companies} company={co?.code} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="sales-tiles">
        <StatTile label="Sales (excl GST)" value={money(rep.sales)} sub={<Change now={rep.sales} then={Number(rep.previous)} label="the period before" />} />
        <StatTile label="Same period last year" value={money(rep.last_year)} sub={<Change now={rep.sales} then={Number(rep.last_year)} label="last year" />} />
        <StatTile label="Invoices" value={String(rep.invoices)} sub={rep.by_company.map((c) => `${c.code} ${c.invoices}`).join(" · ") || "—"} />
        <StatTile label="Average invoice" value={money(avg)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5">
          <h2 className="font-bold">By month</h2>
          {months.length > 36
            ? <p className="mt-2 text-sm text-slate">Pick a shorter period to see the months.</p>
            : <div className="mt-4"><MonthBars months={months} series={series} /></div>}
        </section>
        <section className="rounded-2xl bg-white p-5">
          <h2 className="font-bold">What was sold</h2>
          <p className="mb-4 text-xs text-slate">Labour (LAB), materials and contract works (200), vehicle charges (260).</p>
          {categories.length ? <HBars rows={categories} testId="sales-categories" /> : <p className="text-sm text-slate">No sales in this period.</p>}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="font-bold">Top customers</h2>
        {rep.top_customers.length ? (
          <div className="mt-4">
            <HBars testId="top-customers"
              rows={rep.top_customers.map((c) => ({ label: `${c.name} (${c.invoices})`, value: Number(c.sales), href: `/dashboard/office/customers/${c.id}` }))} />
          </div>
        ) : <p className="mt-2 text-sm text-slate">No sales in this period.</p>}
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5">
        <h2 className="font-bold">Invoices ({rep.rows.length})</h2>
        <table className="mt-3 w-full text-sm" data-testid="sales-table">
          <thead className="border-b border-black/10">
            <tr><th className={th}>Date</th><th className={th}>Invoice</th><th className={th}>Job</th><th className={th}>Customer</th>
              <th className={th}>Type</th><th className={th}>Co.</th><th className={thR}>Sales excl GST</th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rep.rows.map((x, i) => (
              <tr key={`${x.number}-${i}`}>
                <td className={`${td} whitespace-nowrap`}>{nzDate(x.date)}</td>
                <td className={`${td} whitespace-nowrap`}>{x.number ?? "—"}</td>
                <td className={td}><JobRef jobRef={x.job_ref} title={x.job_title} /></td>
                <td className={td}>{x.customer}</td>
                <td className={td}>{KIND_NAME[x.kind] ?? x.kind}</td>
                <td className={td}>{x.company}</td>
                <td className={tdR}>{money(x.sales)}</td>
              </tr>
            ))}
            {rep.rows.length === 0 && <tr><td colSpan={7} className={`${td} text-slate`}>No approved invoices in this period.</td></tr>}
          </tbody>
          {rep.rows.length > 0 && (
            <tfoot className="border-t border-black/10 font-semibold">
              <tr><td className={td} colSpan={6}>Total</td><td className={tdR}>{money(rep.sales)}</td></tr>
            </tfoot>
          )}
        </table>
      </section>
    </ReportShell>
  );
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 121) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
