// The job page's Takeoff tab: the plan sets, what's been taken off (by group, the same as the quote sections), and
// the way into the full-screen takeoff. Prices show only for people who can see them.
import Link from "next/link";
import { fmtQty, unitOf, type Takeoff } from "@/lib/takeoff-shared";
import { TakeoffTabUpload } from "./TakeoffTabUpload";

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TakeoffTab({ takeoff: t, base }: { takeoff: Takeoff; base: string }) {
  const open = `${base}/takeoff`;
  const groups = t.groups.filter((g) => t.items.some((i) => i.group === g));
  const pages = t.plans.flatMap((p) => p.pages);
  const scaled = pages.filter((p) => p.mm_per_unit).length;
  return (
    <section className="space-y-4" data-testid="takeoff-tab">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold">Takeoff</h2>
          <p className="text-sm text-slate">
            Count fixtures and measure pipe runs on the PDF plans, then send the result to a quote.
            {t.plans.length ? ` ${scaled} of ${pages.length} pages have a scale.` : ""}
          </p>
        </div>
        {t.plans.length > 0 && (
          <Link href={open} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" data-testid="open-takeoff">
            {t.can.edit ? "Open the takeoff" : "View the takeoff"}
          </Link>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4">
        <h3 className="mb-2 font-semibold">Plans</h3>
        {t.plans.length === 0 ? <p className="text-sm text-slate">No plans yet.</p> : (
          <ul className="divide-y divide-black/5 text-sm">
            {t.plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{p.name}</strong> · Rev {p.revision}{p.superseded_at ? ` (replaced by Rev ${p.superseded_rev}: doesn't count)` : p.latest ? "" : " (older revision)"} · {p.page_count} pages ·
                  added by {p.created_by} {new Date(p.created_at).toLocaleDateString("en-NZ")}
                  {p.shared_at && <span className="text-green-700"> · shared with plumbers {new Date(p.shared_at).toLocaleDateString("en-NZ")}</span>}
                </span>
                <Link href={`${open}?plan=${p.id}`} className="text-sm font-semibold underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
        {t.can.edit && <TakeoffTabUpload jobId={t.job.id} names={[...new Set(t.plans.map((p) => p.name))]} open={open} />}
        {!t.can.edit && (
          <p className="mt-2 text-xs text-slate">To add plans and measure you need &quot;Can do takeoffs&quot; (Settings → Staff).</p>
        )}
      </div>

      {t.items.length > 0 && (
        <div className="rounded-2xl bg-white p-4">
          <h3 className="mb-2 font-semibold">What&apos;s been taken off</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate">
                <th className="py-1">Item</th><th className="py-1 text-right">Quantity</th>
                {t.can.costs && <th className="py-1 text-right">Rough sell (excl GST)</th>}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-slate">{g}</td></tr>
                {t.items.filter((i) => i.group === g).map((i) => (
                  <tr key={i.id} className="border-t border-black/5">
                    <td className="py-1.5">
                      <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: i.colour }} />
                      {i.name}{i.unscaled ? <span className="text-xs text-red-700"> · {i.unscaled} on pages with no scale</span> : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtQty(i.quantity, i.tool)} {unitOf(i.tool, i.unit)}</td>
                    {t.can.costs && <td className="py-1.5 text-right tabular-nums">{i.unit_sell != null ? money(i.unit_sell * i.quantity) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {t.quotes.some((q) => q.from_takeoff) && (
            <p className="mt-3 text-xs text-slate">
              Sent to {t.quotes.filter((q) => q.from_takeoff).map((q) => q.number).join(", ")}. Use &quot;Send to quote&quot; in the takeoff to update a draft.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
