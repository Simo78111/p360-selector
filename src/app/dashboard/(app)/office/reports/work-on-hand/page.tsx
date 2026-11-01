// Phase 3e: Reports → Work on hand. Open projects (active or on hold) and what's left to invoice on them: accepted
// quotes less what's been invoiced, or for charge-up work the costs not charged up yet. As of now, excl GST.
import { EngineError, NotConnected } from "@/components/office/bits";
import { money } from "@/components/office/jm";
import { HBars, JobRef, ReportFilters, ReportShell, StatTile, td, tdR, th, thR } from "@/components/office/reports-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadWorkOnHand, TYPE_NAME, type WorkReport } from "@/lib/reports";

export const metadata = { title: "Work on hand" };
const PATH = "/dashboard/office/reports/work-on-hand";
type Props = { searchParams: Promise<{ co?: string }> };
const STAGES: [string, string][] = [
  ["to_schedule", "To Schedule"], ["to_start", "To Start"], ["in_progress", "In Progress"], ["labour_complete", "Labour Complete"],
  ["to_invoice", "To Invoice"], ["to_be_approved", "To Be Approved"], ["invoiced", "All phases invoiced"],
];

export default async function WorkOnHandPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  let rep: WorkReport;
  try {
    rep = await loadWorkOnHand(session, null);
    const c = rep.companies.find((x) => x.code === sp.co);
    if (c) rep = await loadWorkOnHand(session, c.id);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const co = rep.companies.find((c) => c.code === sp.co);
  const t = rep.totals;
  const qs = new URLSearchParams({ r: "work-on-hand", ...(co ? { co: co.code } : {}) });
  const potential = rep.rows.reduce((n, x) => n + (x.potential_profit ?? 0), 0);
  const stageRows = STAGES.filter(([k]) => Number(t.by_stage[k] ?? 0) !== 0).map(([k, label]) => ({ label, value: Number(t.by_stage[k]) }));

  return (
    <ReportShell path={PATH} title="Work on hand" csvHref={`/api/office/reports?${qs}`}
      intro={<>Open jobs (active or on hold) and what&apos;s still to invoice, as of now, excl GST. <strong>Quoted</strong> work:
        accepted quotes less invoiced so far. <strong>Charge-up</strong> work: costs on the job not on an invoice yet, at
        charge-out and sell. Draft invoices count as not invoiced yet.</>}>
      <ReportFilters path={PATH} companies={rep.companies} company={co?.code} withDates={false} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="work-tiles">
        <StatTile label="Left to invoice" value={money(t.left)} sub={`${t.jobs} open job${t.jobs === 1 ? "" : "s"}`} />
        <StatTile label="On accepted quotes" value={money(t.left_quoted)} sub={`of ${money(t.budget)} quoted, ${money(t.invoiced)} invoiced`} />
        <StatTile label="Charge-up work not invoiced" value={money(t.left_charge_up)} />
        {rep.can_costs && <StatTile label="Potential profit on quotes" value={money(potential)} tone={potential < 0 ? "bad" : undefined}
          sub="Accepted quotes less cost to date" />}
      </div>

      {stageRows.length > 0 && (
        <section className="rounded-2xl bg-white p-5">
          <h2 className="font-bold">Left to invoice, by where the job is up to</h2>
          <p className="mb-4 text-xs text-slate">The earliest stage of the job&apos;s open phases.</p>
          <HBars rows={stageRows} testId="work-stages" />
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl bg-white p-5">
        <table className="w-full text-sm" data-testid="work-table">
          <thead className="border-b border-black/10">
            <tr>
              <th className={th}>Job</th><th className={th}>Customer</th><th className={th}>Type</th><th className={th}>Up to</th>
              <th className={thR}>Quoted</th><th className={thR}>Invoiced</th><th className={thR}>Drafts</th>
              <th className={thR}>Not charged up</th><th className={thR}>Left to invoice</th>
              {rep.can_costs && <><th className={thR}>Cost to date</th><th className={thR}>Potential profit</th></>}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rep.rows.map((x) => (
              <tr key={x.job_id}>
                <td className={td}><JobRef jobRef={x.job_ref} title={x.title} /></td>
                <td className={td}>{x.customer}<span className="block text-xs text-slate">{x.company}</span></td>
                <td className={td}>{TYPE_NAME[x.type]}{x.state === "on_hold" && <span className="block text-xs font-semibold text-amber-800">On hold</span>}</td>
                <td className={td}>{x.stage_label ?? "All invoiced"}</td>
                <td className={tdR}>{x.quoted ? money(x.budget) : "—"}</td>
                <td className={tdR}>{money(x.invoiced)}</td>
                <td className={tdR}>{x.drafts ? money(x.drafts) : "—"}</td>
                <td className={tdR}>{x.quoted ? "—" : money(x.unbilled)}</td>
                <td className={`${tdR} font-semibold`}>{money(x.left)}</td>
                {rep.can_costs && <>
                  <td className={tdR}>{money(x.cost)}</td>
                  <td className={`${tdR} ${(x.potential_profit ?? 0) < 0 ? "font-semibold text-red-700" : ""}`}>{money(x.potential_profit)}</td>
                </>}
              </tr>
            ))}
            {rep.rows.length === 0 && <tr><td colSpan={11} className={`${td} text-slate`}>No open jobs.</td></tr>}
          </tbody>
        </table>
        {rep.rows.some((x) => x.quoted && x.cost !== undefined && x.cost > (x.budget ?? 0)) && (
          <p className="mt-3 text-sm text-red-700">Red: cost to date is already more than the accepted quotes.</p>
        )}
      </section>
    </ReportShell>
  );
}
