import Link from "next/link";
import {
  matchBillAction, orderPlacedAction, partsCancelAction, partsReadyOfficeAction, saveBranchAction,
} from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import {
  type Branch, loadBranches, loadOrders, loadPartDeliveries, loadUnmatchedBills, type PartDelivery, type PurchaseOrder, type UnmatchedBill,
} from "@/lib/automation";
import { officeEnabled } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Orders" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const statusText: Record<string, { label: string; tone: string }> = {
  sent: { label: "Emailed", tone: "bg-aqua-pale text-aqua-deep" },
  needs_office: { label: "Needs placing", tone: "bg-amber-100 text-amber-900" },
  received: { label: "Billed", tone: "bg-emerald-100 text-emerald-900" },
  draft: { label: "Draft", tone: "bg-mist text-slate" },
  cancelled: { label: "Cancelled", tone: "bg-mist text-slate" },
};
const deliveryText: Record<string, string> = { pickup: "Pick up", site: "To site", van: "To plumber", courier: "Courier today" };
const courierText: Record<string, { label: string; tone: string }> = {
  ordered: { label: "Waiting for branch", tone: "bg-mist text-slate" },
  ready: { label: "Booking courier", tone: "bg-aqua-pale text-aqua-deep" },
  booked: { label: "Courier booked", tone: "bg-aqua-pale text-aqua-deep" },
  to_pickup: { label: "Going to branch", tone: "bg-aqua-pale text-aqua-deep" },
  picked_up: { label: "On the way to job", tone: "bg-aqua-pale text-aqua-deep" },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-900" },
  needs_office: { label: "Needs you", tone: "bg-amber-100 text-amber-900" },
  cancelled: { label: "Cancelled", tone: "bg-mist text-slate" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-900" },
};
const nzTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }) : null;
const triValue = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");
const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

export default async function OrdersPage({ searchParams }: Props) {
  await requireOffice("bookings");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let orders: PurchaseOrder[];
  let bills: UnmatchedBill[];
  let couriers: PartDelivery[] = [];
  let branches: Branch[] = [];
  try {
    [orders, bills, couriers, branches] = await Promise.all([
      loadOrders(), loadUnmatchedBills(), loadPartDeliveries().catch(() => []), loadBranches().catch(() => []),
    ]);
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
        <h2 className="text-lg font-bold">Same-day couriers</h2>
        <p className="mt-1 text-sm text-slate">
          Extra work approved with &ldquo;courier the parts&rdquo; ticked: the nearest open branch gets an urgent order with a Ready link,
          and pressing it books Uber Direct to the job.
        </p>
        {couriers.length === 0 ? (
          <p className="mt-3 text-sm text-slate">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {couriers.map((c) => {
              const st = courierText[c.status] ?? { label: c.status, tone: "bg-mist" };
              const canReady = ["ordered", "needs_office"].includes(c.status) && c.branch;
              const canCancel = !["picked_up", "delivered", "cancelled", "failed"].includes(c.status);
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      <Link href={`/dashboard/office/jobs/${c.job_number}`} className="text-aqua-deep hover:underline">Job #{c.job_number}</Link>
                      {" "}· {c.branch ?? "no branch"}{c.km != null && ` (${c.km} km)`}{c.po_number && ` · ${c.po_number}`}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                      {c.sim && <span className="ml-1 text-xs text-slate">(test run)</span>}
                    </p>
                    <p className="text-slate">
                      For {c.plumber ?? "—"}
                      {c.courier && ` · ${c.courier}`}
                      {c.dropoff_eta && c.status !== "delivered" && ` · arriving ${nzTime(c.dropoff_eta)}`}
                      {c.delivered_at && ` · delivered ${nzTime(c.delivered_at)}`}
                      {c.fee != null && ` · $${Number(c.fee).toFixed(2)}`}
                      {c.tracking_url && <> · <a href={c.tracking_url} target="_blank" rel="noopener" className="text-aqua-deep hover:underline">track</a></>}
                    </p>
                    {c.last_error && <p className="text-amber-800">{c.last_error}</p>}
                    {c.status === "ordered" && c.branch_phone && <p className="text-slate">Branch: {c.branch_phone}</p>}
                  </div>
                  <div className="flex gap-2">
                    {canReady && (
                      <form action={partsReadyOfficeAction}>
                        <input type="hidden" name="deliveryId" value={c.id} />
                        <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                          {c.status === "needs_office" && c.ready_at ? "Book courier anyway" : "Branch has it ready"}
                        </button>
                      </form>
                    )}
                    {canCancel && (
                      <form action={partsCancelAction}>
                        <input type="hidden" name="deliveryId" value={c.id} />
                        <button className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold">Cancel</button>
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

      {branches.length > 0 && (
        <section className="rounded-2xl bg-white p-5 sm:p-6" id="branches">
          <h2 className="text-lg font-bold">Supplier branches</h2>
          <p className="mt-1 text-sm text-slate">
            Urgent courier orders go to the nearest open branch here. Fill in each branch&apos;s order email (otherwise the order
            comes to you to phone through), and set what each branch has told you.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase text-slate">
                <tr><th className="py-2">Branch</th><th>Hours (trade)</th><th>Order email</th><th>Urgent orders</th><th>Hands to courier</th><th>Pick (min)</th><th>On</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {branches.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="py-2 pr-3">
                      <strong>{b.name}</strong>
                      <div className="text-xs text-slate">{b.address}, {b.suburb} · {b.phone}{!b.location_checked && " · map pin approximate"}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs">Mon–Fri {b.weekday}<br />Sat {b.saturday || "closed"}</td>
                    <td colSpan={6} className="py-2">
                      <form action={saveBranchAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="branchId" value={b.id} />
                        <input type="hidden" name="name" value={b.name} />
                        <input name="order_email" type="email" defaultValue={b.order_email ?? ""} placeholder="orders@…" aria-label="Order email"
                          className="w-64 rounded-full border border-black/10 px-3 py-1.5" />
                        {(["urgent_ok", "courier_ok"] as const).map((k) => (
                          <select key={k} name={k} defaultValue={triValue(b[k])} aria-label={k === "urgent_ok" ? "Urgent orders" : "Hands to courier"}
                            className="rounded-full border border-black/10 px-2 py-1.5">
                            <option value="">Not asked</option><option value="yes">Yes</option><option value="no">No</option>
                          </select>
                        ))}
                        <input name="pick_minutes" type="number" min={0} max={240} defaultValue={b.pick_minutes} aria-label="Pick minutes"
                          className="w-16 rounded-full border border-black/10 px-2 py-1.5" />
                        <input name="active" type="checkbox" defaultChecked={b.active} aria-label="Use this branch" />
                        <button className="rounded-full bg-ink px-3 py-1.5 font-semibold text-white">Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
