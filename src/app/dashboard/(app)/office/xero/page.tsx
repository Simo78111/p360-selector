import {
  xeroChooseTenantAction,
  xeroDisconnectAction,
  xeroSendInvoiceAction,
  xeroSettingsAction,
  xeroSyncNowAction,
} from "@/app/dashboard/office-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadXeroStatus, officeEnabled, type XeroStatus } from "@/lib/office";
import { formatPrice } from "@/lib/site";
import { headers } from "next/headers";
import { callbackUrl, listTenants, salesAccounts, trackingCategories, xeroConfigured, type XeroTenant } from "@/lib/xero";

export const metadata = { title: "Xero" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const syncLabel: Record<XeroStatus["invoices"][number]["xero_status"], { text: string; tone: string }> = {
  not_configured: { text: "Not in Xero", tone: "bg-black/5 text-slate" },
  pending: { text: "Waiting to send", tone: "bg-amber-100 text-amber-900" },
  synced: { text: "In Xero", tone: "bg-emerald-100 text-emerald-900" },
  failed: { text: "Couldn't send", tone: "bg-red-100 text-red-800" },
};

export default async function XeroPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;

  let status: XeroStatus;
  try {
    status = await loadXeroStatus();
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

  // Things only Xero can tell us (accounts, tracking, organisations); the page still works without them
  let accounts: { code: string; name: string }[] = [];
  let tracking: { name: string; options: string[] }[] = [];
  let tenants: XeroTenant[] = [];
  let xeroProblem: string | null = null;
  if (xeroConfigured() && status.connected) {
    try {
      [accounts, tracking, tenants] = await Promise.all([salesAccounts(), trackingCategories(), listTenants()]);
    } catch (e) {
      xeroProblem = e instanceof Error ? e.message : String(e);
    }
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const redirectUri = callbackUrl(origin);
  const currentTracking = status.tracking_name && status.tracking_option ? `${status.tracking_name}|${status.tracking_option}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Xero</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Each finished job&apos;s invoice goes into Xero within a few minutes, and the customer is texted Xero&apos;s link
          to view and pay it. Payments made in Xero come back here every half hour and the customer is thanked.
        </p>
      </div>
      <Flash ok={ok} err={err ?? xeroProblem ?? undefined} />

      {!xeroConfigured() ? (
        <section className="rounded-2xl bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">Set up the Xero app first</h2>
          <p className="mt-2 text-sm text-slate">
            Add <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> in Vercel (website project), redeploy, then
            come back here to connect.
          </p>
        </section>
      ) : !status.connected ? (
        <section className="rounded-2xl bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">Not connected</h2>
          <p className="mt-2 text-sm text-slate">
            You&apos;ll sign in to Xero and choose which organisation to connect (for testing, the Demo Company).
          </p>
          <p className="mt-3 text-sm">
            In your Xero app (developer.xero.com → My Apps → Configuration), the <strong>Redirect URI</strong> must be
            exactly:
          </p>
          <code className="mt-1 block w-fit rounded-lg bg-mist px-3 py-2 text-sm break-all select-all">{redirectUri}</code>
          <a
            href="/api/xero/connect"
            className="mt-4 inline-block rounded-full bg-[#13B5EA] px-5 py-2.5 font-semibold text-white hover:bg-[#0e9fce]"
          >
            Connect Xero
          </a>
        </section>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate">Connected to</p>
                <h2 className="text-xl font-bold">{status.tenant_name}</h2>
                <p className="mt-1 text-xs text-slate">since {status.connected_at}</p>
              </div>
              <form action={xeroDisconnectAction}>
                <button type="submit" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink">
                  Disconnect
                </button>
              </form>
            </div>
            {tenants.length > 1 && (
              <form action={xeroChooseTenantAction} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="tenantId">Use a different organisation:</label>
                <select id="tenantId" name="tenantId" defaultValue={status.tenant_id ?? undefined} className="rounded-full border border-black/10 px-3 py-1.5">
                  {tenants.map((t) => (
                    <option key={t.tenantId} value={t.tenantId}>
                      {t.tenantName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded-full border border-black/15 px-3 py-1.5 font-medium hover:border-ink">
                  Switch
                </button>
              </form>
            )}
          </section>

          <form action={xeroSettingsAction} className="rounded-2xl bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold">How invoices go into Xero</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="account" className="block text-sm font-medium">Sales account</label>
                {accounts.length ? (
                  <select id="account" name="account" defaultValue={status.account_code} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2">
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id="account" name="account" defaultValue={status.account_code} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
                )}
              </div>
              <div>
                <label htmlFor="tracking" className="block text-sm font-medium">Tracking category (optional)</label>
                <select id="tracking" name="tracking" defaultValue={currentTracking} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2">
                  <option value="">None</option>
                  {tracking.flatMap((t) =>
                    t.options.map((o) => (
                      <option key={`${t.name}|${o}`} value={`${t.name}|${o}`}>
                        {t.name}: {o}
                      </option>
                    )),
                  )}
                  {currentTracking && !tracking.some((t) => t.options.some((o) => `${t.name}|${o}` === currentTracking)) && (
                    <option value={currentTracking}>
                      {status.tracking_name}: {status.tracking_option}
                    </option>
                  )}
                </select>
                <p className="mt-1 text-xs text-slate">
                  For the real business, choose the category that separates this business from Project Three Sixty.
                </p>
              </div>
            </div>
            <label className="mt-5 flex items-start gap-3">
              <input type="checkbox" name="enabled" defaultChecked={status.enabled} className="mt-1 h-5 w-5 accent-aqua-deep" />
              <span>
                <strong>Send invoices to Xero</strong>
                <span className="block text-sm text-slate">
                  Each finished job&apos;s invoice is sent and the customer gets the view-and-pay link by text.
                </span>
              </span>
            </label>
            <button type="submit" className="mt-5 rounded-full bg-ink px-5 py-2 font-semibold text-white">
              Save
            </button>
          </form>

          <section className="rounded-2xl bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="text-sm">
                <h2 className="text-lg font-bold">Sending</h2>
                <p className="mt-1 text-slate">
                  {status.synced} in Xero · {status.pending} waiting · {status.failed} couldn&apos;t be sent
                </p>
                <p className="text-slate">
                  Last sent {status.last_push ?? "never"} · last checked for payments {status.last_poll ?? "never"}
                </p>
                {status.last_error && (
                  <p className="mt-2 text-red-800">
                    Last problem ({status.last_error_at}): {status.last_error}
                  </p>
                )}
              </div>
              <form action={xeroSyncNowAction}>
                <button type="submit" className="rounded-full bg-aqua px-4 py-2 text-sm font-semibold hover:bg-[#35b9df]">
                  Send and check now
                </button>
              </form>
            </div>
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-2xl bg-white">
        <h2 className="px-5 pt-5 text-lg font-bold sm:px-6">Recent invoices</h2>
        {status.invoices.length === 0 ? (
          <p className="p-6 text-sm text-slate">No invoices yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Paid</th>
                  <th className="px-5 py-3 font-medium">Xero</th>
                </tr>
              </thead>
              <tbody>
                {status.invoices.map((i) => (
                  <tr key={i.invoice_id} className="border-t border-black/5 align-top">
                    <td className="px-5 py-3">
                      <a href={`/dashboard/office/jobs/${i.job_number}`} className="font-medium hover:text-aqua-deep hover:underline">
                        {i.number}
                      </a>
                      <span className="block text-xs text-slate">
                        Job #{i.job_number} · {i.issued}
                      </span>
                    </td>
                    <td className="px-3 py-3">{i.customer}</td>
                    <td className="px-3 py-3 text-right">{formatPrice(Number(i.total))}</td>
                    <td className="px-3 py-3 text-right">{formatPrice(Number(i.paid))}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${syncLabel[i.xero_status].tone}`}>
                        {syncLabel[i.xero_status].text}
                      </span>
                      {i.url && (
                        <a href={i.url} target="_blank" rel="noreferrer" className="ml-2 text-xs font-medium text-aqua-deep hover:underline">
                          Customer&apos;s link ↗
                        </a>
                      )}
                      {i.xero_error && <span className="mt-1 block text-xs text-red-800">{i.xero_error}</span>}
                      {status.active && (i.xero_status === "not_configured" || i.xero_status === "failed") && (
                        <form action={xeroSendInvoiceAction} className="mt-1">
                          <input type="hidden" name="invoiceId" value={i.invoice_id} />
                          <button type="submit" className="text-xs font-semibold text-aqua-deep hover:underline">
                            Send to Xero
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
