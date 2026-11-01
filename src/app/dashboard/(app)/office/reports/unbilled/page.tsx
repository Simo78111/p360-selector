// Phase 3e: Reports → Unbilled work. Where money is sitting: phases waiting at Labour Complete / To Invoice /
// To Be Approved, and charge-up costs (timesheets, supplier invoices) on jobs that aren't on any invoice yet —
// closed jobs included, because that's where it gets left behind.
import Link from "next/link";
import { EngineError, NotConnected } from "@/components/office/bits";
import { money, nzDate } from "@/components/office/jm";
import { JobRef, ReportFilters, ReportShell, StatTile, td, tdR, th, thR } from "@/components/office/reports-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadUnbilled, STATE_NAME, type UnbilledReport } from "@/lib/reports";

export const metadata = { title: "Unbilled work" };
const PATH = "/dashboard/office/reports/unbilled";
type Props = { searchParams: Promise<{ co?: string; days?: string }> };

export default async function UnbilledPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  const days = [0, 7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 0;
  let rep: UnbilledReport;
  try {
    rep = await loadUnbilled(session, null, days);
    const c = rep.companies.find((x) => x.code === sp.co);
    if (c) rep = await loadUnbilled(session, c.id, days);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const co = rep.companies.find((c) => c.code === sp.co);
  const t = rep.totals;
  const canCosts = rep.jobs.some((j) => j.cost !== undefined);
  const qs = new URLSearchParams({ r: "unbilled", days: String(days), ...(co ? { co: co.code } : {}) });

  return (
    <ReportShell path={PATH} title="Unbilled work" csvHref={`/api/office/reports?${qs}`}
      intro={<>Work that&apos;s done but not invoiced, as of now, excl GST at charge-out and sell. Quoted jobs are claimed against
        the quote, so only their waiting phases show; charge-up costs show until they&apos;re on an approved or draft invoice.</>}>
      <ReportFilters path={PATH} companies={rep.companies} company={co?.code} withDates={false}
        extra={
          <label className="text-xs font-semibold text-slate">
            Waiting
            <select name="days" defaultValue={String(days)} className="mt-1 block rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">
              <option value="0">Any time</option>
              <option value="7">7 days or more</option>
              <option value="14">14 days or more</option>
              <option value="30">30 days or more</option>
            </select>
          </label>
        } />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="unbilled-tiles">
        <StatTile label="Phases waiting to invoice" value={String(t.phases)} sub={t.phase_drafts ? `${money(t.phase_drafts)} already in draft invoices` : undefined} />
        <StatTile label="Charge-up costs not invoiced" value={money(t.unbilled)} sub={`on ${t.jobs} job${t.jobs === 1 ? "" : "s"}`} />
        <StatTile label="Older than 30 days" value={money(t.over_30_days)} tone={t.over_30_days > 0 ? "bad" : undefined} />
        <StatTile label="Longest wait" value={rep.phases.length ? `${Math.max(...rep.phases.map((p) => p.days))} days` : "—"}
          sub={<Link href="/dashboard/office/invoices?tab=to_invoice" className="underline">Invoice them: Invoices → To Invoice</Link>} />
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white p-5">
        <h2 className="font-bold">Phases waiting ({rep.phases.length})</h2>
        <table className="mt-3 w-full text-sm" data-testid="unbilled-phases">
          <thead className="border-b border-black/10">
            <tr><th className={th}>Phase</th><th className={th}>Customer</th><th className={th}>Stage</th><th className={thR}>Days</th>
              <th className={thR}>Not charged up</th><th className={thR}>Draft invoices</th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rep.phases.map((x) => (
              <tr key={x.phase_id}>
                <td className={td}>
                  <Link href={`/dashboard/office/job/${x.job_ref}?tab=invoices`} className="font-semibold hover:underline">{x.phase_ref}</Link>
                  <span className="block text-xs text-slate">{x.phase_name}{x.title ? ` · ${x.title}` : ""}</span>
                </td>
                <td className={td}>{x.customer}<span className="block text-xs text-slate">{x.company}</span></td>
                <td className={td}>{x.stage_label}<span className="block text-xs text-slate">since {nzDate(x.since.slice(0, 10))}</span></td>
                <td className={`${tdR} ${x.days > 14 ? "font-semibold text-red-700" : ""}`}>{x.days}</td>
                <td className={tdR}>{x.quoted ? <span className="text-xs text-slate">Quoted: claim it</span> : money(x.unbilled)}</td>
                <td className={tdR}>{x.draft ? money(x.draft) : "—"}</td>
              </tr>
            ))}
            {rep.phases.length === 0 && <tr><td colSpan={6} className={`${td} text-slate`}>Nothing waiting.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5">
        <h2 className="font-bold">Charge-up costs not on an invoice ({rep.jobs.length} job{rep.jobs.length === 1 ? "" : "s"})</h2>
        <table className="mt-3 w-full text-sm" data-testid="unbilled-jobs">
          <thead className="border-b border-black/10">
            <tr><th className={th}>Job</th><th className={th}>Customer</th><th className={th}>Job status</th><th className={th}>Oldest cost</th>
              <th className={thR}>Lines</th><th className={thR}>Charge value</th>{canCosts && <th className={thR}>Cost</th>}</tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rep.jobs.map((x) => (
              <tr key={x.job_id} className={x.state === "closed" ? "bg-amber-50" : ""}>
                <td className={td}><JobRef jobRef={x.job_ref} title={x.title} /></td>
                <td className={td}>{x.customer}<span className="block text-xs text-slate">{x.company}</span></td>
                <td className={td}>{STATE_NAME[x.state] ?? x.state}{x.state === "closed" && <span className="block text-xs font-semibold text-amber-800">Closed with costs not invoiced</span>}</td>
                <td className={td}>{nzDate(x.oldest)}<span className={`block text-xs ${x.days > 30 ? "font-semibold text-red-700" : "text-slate"}`}>{x.days} days</span></td>
                <td className={tdR}>{x.lines}</td>
                <td className={`${tdR} font-semibold`}>
                  {money(x.unbilled)}
                  {x.pending > 0 && <span className="block text-xs font-normal text-amber-800">{money(x.pending)} not approved yet</span>}
                </td>
                {canCosts && <td className={tdR}>{money(x.cost)}</td>}
              </tr>
            ))}
            {rep.jobs.length === 0 && <tr><td colSpan={7} className={`${td} text-slate`}>Every charge-up cost is on an invoice.</td></tr>}
          </tbody>
        </table>
      </section>
    </ReportShell>
  );
}
