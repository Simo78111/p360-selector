// Cost summary for a date range: labour and materials, cost and recommended charge (charge-out rate, and materials at
// the customer's tier markup), with totals. Used at the top of an invoice and on the job's Cost Report.
import Link from "next/link";
import { money } from "@/components/office/jm";
import type { JobCosts } from "@/lib/job-costs";

const hrs = (n: number) => `${Number(n).toFixed(2).replace(/\.?0+$/, "")} h`;

export function CostRangeForm({ action, from, to, keep, clearHref }: {
  action: string; from: string | null; to: string | null; keep: Record<string, string>; clearHref?: string;
}) {
  const field = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm";
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="cost-range">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-xs font-semibold text-slate">From<input type="date" name="cf" defaultValue={from ?? ""} className={`${field} mt-1 block`} /></label>
      <label className="text-xs font-semibold text-slate">To<input type="date" name="ct" defaultValue={to ?? ""} className={`${field} mt-1 block`} /></label>
      <button className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">Show</button>
      {clearHref && <Link href={clearHref} className="self-center text-sm text-slate underline">All dates</Link>}
    </form>
  );
}

export function CostSummaryTable({ costs }: { costs: JobCosts }) {
  const t = costs.totals;
  const matCost = Number(t.supplier_documents ?? 0) + Number(t.stock_other ?? 0);
  const rows: { label: string; sub?: string; cost?: number; charge: number }[] = [
    { label: "Labour", sub: hrs(t.labour_hours), cost: t.labour, charge: t.labour_charge },
    { label: "Materials", sub: "incl. hire, freight & stock on hand", cost: matCost, charge: t.materials_sell },
  ];
  const pending = Number(t.pending_labour ?? 0) + Number(t.pending_supplier ?? 0);
  return (
    <div data-testid="cost-summary">
      <table className="w-full max-w-xl text-sm">
        <thead className="text-xs text-slate">
          <tr>
            <th className="py-1 text-left font-semibold" />
            {costs.can_costs && <th className="py-1 text-right font-semibold">Cost</th>}
            <th className="py-1 text-right font-semibold">Recommended charge</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-mist">
              <td className="py-1.5">{r.label} <span className="text-xs text-slate">{r.sub}</span></td>
              {costs.can_costs && <td className="py-1.5 text-right tabular-nums">{money(Number(r.cost ?? 0))}</td>}
              <td className="py-1.5 text-right tabular-nums">{money(Number(r.charge))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 font-bold">
            <td className="py-1.5">Total</td>
            {costs.can_costs && <td className="py-1.5 text-right tabular-nums">{money(Number(t.total ?? 0))}</td>}
            <td className="py-1.5 text-right tabular-nums">{money(Number(t.charge_value))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-slate">
        Recommended charge = each person&apos;s charge-out rate, and materials at cost + {Number(costs.markup_pct)}% (the
        customer&apos;s pricing tier). Excl GST.
        {costs.can_costs && pending > 0 && <> {money(pending)} of the cost isn&apos;t approved yet (draft timesheets or supplier invoices still to reconcile).</>}
      </p>
    </div>
  );
}
