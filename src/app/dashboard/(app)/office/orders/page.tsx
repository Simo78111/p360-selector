import Link from "next/link";
import { matchBillAction, orderPlacedAction } from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadOrders, loadUnmatchedBills, type PurchaseOrder, type UnmatchedBill } from "@/lib/automation";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Orders" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const statusText: Record<string, { label: string; tone: string }> = {
  sent: { label: "Emailed", tone: "bg-aqua-pale text-aqua-deep" },
  needs_office: { label: "Needs placing", tone: "bg-amber-100 text-amber-900" },
  received: { label: "Billed", tone: "bg-emerald-100 text-emerald-900" },
  draft: { label: "Draft", tone: "bg-mist text-slate" },
  cancelled: { label: "Cancelled", tone: "bg-mist text-slate" },
};
const deliveryText: Record<string, string> = { pickup: "Pick up", site: "To site", van: "To plumber" };
const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

export default async function OrdersPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let orders: PurchaseOrder[];
  let bills: UnmatchedBill[];
  try {
    [orders, bills] = await Promise.all([loadOrders(), loadUnmatchedBills()]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier orders and bills</h1>
        <p className="mt-1 text-sm text-slate">
          Parts plumbers order from the app are emailed to the supplier with the PO number. Supplier bills come in from Xero and
          are matched to the job by that PO number (or a job number like #123), so each job shows what it really cost.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Orders</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-slate">No orders yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {orders.map((o) => {
              const st = statusText[o.status] ?? { label: o.status, tone: "bg-mist" };
              return (
                <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {o.po_number} · {o.supplier}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                      {o.status === "sent" && o.email_status === "test_logged" && <span className="ml-1 text-xs text-slate">(test mode: not emailed)</span>}
                    </p>
                    <p className="text-sm text-slate">
                      {o.job_number && <Link href={`/dashboard/office/jobs/${o.job_number}`} className="text-aqua-deep hover:underline">Job #{o.job_number}</Link>}
                      {o.job_number && " · "}{deliveryText[o.delivery] ?? o.delivery}{o.needed_by && ` · ready ${o.needed_by}`} · by {o.by}
                    </p>
                    <p className="mt-1 text-sm">
                      {o.lines.map((l) => `${Number(l.quantity)} x ${l.code ? `${l.code} ` : ""}${l.description}`).join(", ")}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {o.bill_total != null && <p>Billed {money(o.bill_total)}</p>}
                    {o.status === "needs_office" && (
                      <form action={orderPlacedAction}>
                        <input type="hidden" name="poId" value={o.id} />
                        <button className="mt-1 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">I&apos;ve placed it</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Supplier bills not matched to a job</h2>
        <p className="mt-1 text-sm text-slate">Van stock and general purchases can stay unmatched. Type a job number to put a bill on a job.</p>
        {bills.length === 0 ? (
          <p className="mt-3 text-sm text-slate">None. (Bills arrive with the Xero sync.)</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {bills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <strong>{b.supplier ?? "Supplier"}</strong> {b.number} {b.reference && <span className="text-slate">· {b.reference}</span>}{" "}
                  · {b.date} · {money(b.total)}
                </span>
                <form action={matchBillAction} className="flex gap-2">
                  <input type="hidden" name="billId" value={b.id} />
                  <label className="sr-only" htmlFor={`jn-${b.id}`}>Job number</label>
                  <input id={`jn-${b.id}`} name="jobNumber" inputMode="numeric" placeholder="Job #" className="w-24 rounded-full border border-black/10 px-3 py-1.5" />
                  <button className="rounded-full bg-ink px-3 py-1.5 font-semibold text-white">Match</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
