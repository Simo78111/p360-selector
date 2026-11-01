// Phase 3e: Reports → Job profitability. Every project (a job and its variations) or maintenance booking with an
// invoice approved in the period: budget, invoiced to date, cost to date (labour at cost rate incl. Rate 2/3, supplier
// invoice lines), gross profit and margin. Needs "Can see costs and margins". This is the monthly job cost vs invoice
// reconciliation, live.
import { EngineError, NotConnected } from "@/components/office/bits";
import { money, nzDate } from "@/components/office/jm";
import { JobRef, pct, ReportFilters, ReportShell, StatTile, td, tdR, th, thR } from "@/components/office/reports-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadJobProfit, resolveRange, TYPE_NAME, type ProfitReport } from "@/lib/reports";

export const metadata = { title: "Job profitability" };
const PATH = "/dashboard/office/reports/profit";
type Props = { searchParams: Promise<{ range?: string; from?: string; to?: string; co?: string; show?: string }> };

export default async function ProfitPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  const r = resolveRange(sp.range, sp.from, sp.to);
  const show = sp.show === "finished" || sp.show === "losses" ? sp.show : "all";
  let rep: ProfitReport;
  try {
    rep = await loadJobProfit(session, r.from, r.to, null);
    const c = rep.companies?.find((x) => x.code === sp.co);
    if (c) rep = await loadJobProfit(session, r.from, r.to, c.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("access to this report")) {
      return (
        <ReportShell path={PATH} title="Job profitability" intro="Budget, invoiced, cost and gross profit per job.">
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
  const finMargin = t.finished_invoiced ? ((t.finished_invoiced - t.finished_cost) / t.finished_invoiced) * 100 : null;
  const rows = rep.rows.filter((x) => show === "all" || (show === "finished" ? x.finished : x.profit < 0));
  const qs = new URLSearchParams({ r: "profit", from: r.from, to: r.to, ...(co ? { co: co.code } : {}) });

  return (
    <ReportShell path={PATH} title="Job profitability" csvHref={`/api/office/reports?${qs}`}
      intro={<>Jobs with an invoice approved {nzDate(r.from)} – {nzDate(r.to)}. Figures are <strong>to date</strong> for the
        whole project (the job and its variations): invoiced excl GST before retentions, cost = labour at each person&apos;s cost
        rate (×1.5 Rate 2, ×2 Rate 3) plus supplier invoice lines. A job that isn&apos;t fully invoiced yet can look worse than it
        will end up — use <em>Fully invoiced only</em> for the true margin. Gross profit only: overheads are in Xero.</>}>
      <ReportFilters path={PATH} range={r.key} from={r.from} to={r.to} companies={rep.companies} company={co?.code}
        extra={
          <label className="text-xs font-semibold text-slate">
            Show
            <select name="show" defaultValue={show} className="mt-1 block rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">
              <option value="all">All jobs</option>
              <option value="finished">Fully invoiced only</option>
              <option value="losses">Losses only</option>
            </select>
          </label>
        } />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="profit-tiles">
        <StatTile label="Invoiced in the period" value={money(t.invoiced_period)} sub={`${t.jobs} job${t.jobs === 1 ? "" : "s"}`} />
        <StatTile label="Gross profit (to date)" value={money(t.profit)} tone={t.profit < 0 ? "bad" : undefined}
          sub={`${pct(margin)} on ${money(t.invoiced)} invoiced, ${money(t.cost)} cost`} />
        <StatTile label="Fully invoiced jobs" value={pct(finMargin)}
          sub={`${t.finished_jobs} job${t.finished_jobs === 1 ? "" : "s"}: ${money(t.finished_invoiced - t.finished_cost)} profit`} />
        <StatTile label="Jobs at a loss" value={String(t.losses)} tone={t.losses ? "bad" : undefined} sub="Cost to date more than invoiced" />
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white p-5">
        <table className="w-full text-sm" data-testid="profit-table">
          <thead className="border-b border-black/10">
            <tr>
              <th className={th}>Job</th><th className={th}>Customer</th><th className={th}>Type</th>
              <th className={thR}>Budget</th><th className={thR}>In period</th><th className={thR}>Invoiced</th>
              <th className={thR}>Hours</th><th className={thR}>Labour</th><th className={thR}>Materials</th>
              <th className={thR}>Cost</th><th className={thR}>Profit</th><th className={thR}>Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((x) => (
              <tr key={x.job_id} className={x.profit < 0 ? "bg-red-50" : ""}>
                <td className={td}>
                  <JobRef jobRef={x.job_ref} title={x.title} />
                  {x.jobs > 1 && <span className="block text-xs text-slate">+ {x.jobs - 1} variation{x.jobs === 2 ? "" : "s"}</span>}
                </td>
                <td className={td}>{x.customer}<span className="block text-xs text-slate">{x.company}</span></td>
                <td className={td}>
                  {TYPE_NAME[x.type]}
                  <span className="block text-xs text-slate">{x.finished ? "Fully invoiced" : `${x.open_phases} phase${x.open_phases === 1 ? "" : "s"} open`}</span>
                </td>
                <td className={tdR}>{money(x.budget)}</td>
                <td className={tdR}>{money(x.invoiced_period)}</td>
                <td className={tdR}>{money(x.invoiced)}</td>
                <td className={tdR}>{Number(x.hours).toFixed(1)}</td>
                <td className={tdR}>{money(x.labour)}</td>
                <td className={tdR}>{money(x.materials)}</td>
                <td className={tdR}>
                  {money(x.cost)}
                  {x.pending > 0 && <span className="block text-xs text-amber-800">{money(x.pending)} not approved</span>}
                  {x.no_rate > 0 && <span className="block text-xs text-red-700">{x.no_rate} line{x.no_rate === 1 ? "" : "s"} with no cost rate</span>}
                </td>
                <td className={`${tdR} font-semibold ${x.profit < 0 ? "text-red-700" : ""}`}>{money(x.profit)}</td>
                <td className={`${tdR} ${x.profit < 0 ? "text-red-700" : ""}`}>{pct(x.margin)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} className={`${td} text-slate`}>No jobs invoiced in this period{show !== "all" ? " that match" : ""}.</td></tr>}
          </tbody>
        </table>
      </section>
    </ReportShell>
  );
}
