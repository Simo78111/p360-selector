import Link from "next/link";
import { saveCustomerAction } from "@/app/dashboard/jm-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { CompanyTabs, input, label, primaryBtn } from "@/components/office/jm";
import { CUSTOMER_KINDS, loadCompanies, loadCustomers, loadPricing, pickCompany, type Company, type CustomerRow, type Pricing } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";
import { can, canEditCompany, requireOffice } from "@/lib/auth";

export const metadata = { title: "Customers" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; co?: string; q?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const session = await requireOffice("customers");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, co, q = "" } = await searchParams;
  let companies: Company[];
  let rows: CustomerRow[];
  let pricing: Pricing;
  try {
    companies = (await loadCompanies()).filter((x) => can(session, "customers", x.id));
    const c = pickCompany(companies, co);
    [rows, pricing] = await Promise.all([loadCustomers(c.id, q), loadPricing(c.id)]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const company = pickCompany(companies, co);
  const defaultTier = pricing.tiers.find((t) => t.is_default && t.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="mt-1 text-sm text-slate">Customers, their sites and contacts, and the pricing tier each is on.</p>
        </div>
        <CompanyTabs companies={companies} current={company.code} path="/dashboard/office/customers" />
      </div>
      <Flash ok={ok} err={err} />

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <form className="flex flex-wrap gap-2" role="search">
          <input type="hidden" name="co" value={company.code} />
          <input name="q" defaultValue={q} placeholder="Name, phone, email or address" aria-label="Search customers" className={`${input} max-w-md flex-1`} />
          <button className={primaryBtn}>Search</button>
        </form>

        {canEditCompany(session, company.id) && <details className="group mt-4 rounded-2xl border-2 border-dashed border-aqua/60 open:border-solid open:bg-aqua-pale/30">
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-aqua-deep">
            <span className="group-open:hidden">+ Add a {company.name} customer</span>
            <span className="hidden group-open:inline">New {company.name} customer</span>
          </summary>
          <form action={saveCustomerAction} className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="co" value={company.code} />
            <div>
              <label className={label} htmlFor="nc-business">Business name (if any)</label>
              <input id="nc-business" name="business_name" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="nc-name">Person&apos;s name</label>
              <input id="nc-name" name="full_name" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="nc-kind">Type</label>
              <select id="nc-kind" name="kind" className={input}>
                {Object.entries(CUSTOMER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nc-phone">Mobile</label>
              <input id="nc-phone" name="phone" type="tel" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="nc-email">Email</label>
              <input id="nc-email" name="email" type="email" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="nc-tier">Pricing tier</label>
              <select id="nc-tier" name="pricing_tier_id" defaultValue={defaultTier?.id ?? ""} className={input}>
                <option value="">None (company default {pricing.company_markup_pct}%)</option>
                {pricing.tiers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button className={primaryBtn}>Add customer</button>
            </div>
          </form>
        </details>}

        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs text-slate">
            <tr>
              <th className="py-2 font-semibold">Customer</th>
              <th className="hidden py-2 font-semibold sm:table-cell">Type</th>
              <th className="hidden py-2 font-semibold md:table-cell">Contact</th>
              <th className="py-2 font-semibold">Tier</th>
              <th className="py-2 text-right font-semibold">Sites</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td className="py-2">
                  <Link href={`/dashboard/office/customers/${r.id}`} className="font-semibold hover:text-aqua-deep hover:underline">{r.name}</Link>
                  {r.name !== r.contact_name && <span className="block text-xs text-slate">{r.contact_name}</span>}
                </td>
                <td className="hidden py-2 sm:table-cell">{CUSTOMER_KINDS[r.kind] ?? r.kind}</td>
                <td className="hidden py-2 text-slate md:table-cell">{[r.phone, r.email].filter(Boolean).join(" · ")}</td>
                <td className="py-2">{r.tier ?? <span className="text-slate">company default</span>}</td>
                <td className="py-2 text-right">{r.sites}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-slate">{q ? "No customers match." : `No ${company.name} customers yet.`}</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
