import { saveTierAction, saveTierItemAction } from "@/app/dashboard/jm-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { CompanyTabs, input, label, money, primaryBtn, quietBtn } from "@/components/office/jm";
import { loadCompanies, loadPricing, pickCompany, type Company, type Pricing, type Tier } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";
import { can, requireOffice } from "@/lib/auth";

export const metadata = { title: "Pricing" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; co?: string }> };

export default async function PricingPage({ searchParams }: Props) {
  const session = await requireOffice("pricing");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, co } = await searchParams;
  let companies: Company[];
  let pricing: Pricing;
  try {
    companies = (await loadCompanies()).filter((x) => can(session, "pricing", x.id));
    pricing = await loadPricing(pickCompany(companies, co).id);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const company = pickCompany(companies, co);
  const back = `/dashboard/office/pricing?co=${company.code}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pricing</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            How an item is priced on a quote, first match wins: a price typed on the line → a favourite&apos;s fixed price →
            the customer&apos;s tier price for that item → a labour rate&apos;s standard charge → the customer&apos;s tier markup
            → {company.name}&apos;s default markup ({pricing.company_markup_pct}%, set on the Companies page).
          </p>
        </div>
        <CompanyTabs companies={companies} current={company.code} path="/dashboard/office/pricing" />
      </div>
      <Flash ok={ok} err={err} />

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Labour rates</h2>
        <p className="mt-1 text-sm text-slate">Price book items, so tiers can override them like anything else.</p>
        <table className="mt-3 w-full max-w-xl text-left text-sm">
          <thead className="text-xs text-slate"><tr><th className="py-1">Code</th><th>Rate</th><th className="text-right">Cost</th><th className="text-right">Sell</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {pricing.labour.map((l) => (
              <tr key={l.id}><td className="py-1.5 font-mono">{l.code}</td><td>{l.description}</td><td className="text-right">{money(l.cost)}</td><td className="text-right">{money(l.sell)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {pricing.tiers.map((t) => <TierCard key={t.id} tier={t} company={company} back={back} labour={pricing.labour} />)}

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Add a tier</h2>
        <form action={saveTierAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="co" value={company.code} />
          <div><label className={label} htmlFor="nt-name">Name</label><input id="nt-name" name="name" required className={input} /></div>
          <div><label className={label} htmlFor="nt-markup">Markup on cost (%)</label><input id="nt-markup" name="markup_pct" required inputMode="decimal" className={input} /></div>
          <button className={primaryBtn}>Add tier</button>
        </form>
      </section>
    </div>
  );
}

function TierCard({ tier: t, company, back, labour }: { tier: Tier; company: Company; back: string; labour: Pricing["labour"] }) {
  return (
    <section className={`rounded-2xl bg-white p-5 sm:p-6 ${t.active ? "" : "opacity-60"}`} data-testid="tier">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {t.name}
            {t.is_default && <span className="ml-2 rounded-full bg-aqua-pale px-2 py-0.5 text-xs text-aqua-deep">new customers start here</span>}
          </h2>
          <p className="text-sm text-slate">Cost + {Number(t.markup_pct)}% · {t.customers} customers · {t.overrides.length} item prices</p>
        </div>
        <form action={saveTierAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tierId" value={t.id} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="co" value={company.code} />
          <input name="name" aria-label="Tier name" defaultValue={t.name} className="rounded-full border border-black/10 px-3 py-1.5 text-sm" />
          <input name="markup_pct" aria-label="Markup %" defaultValue={Number(t.markup_pct)} inputMode="decimal" className="w-20 rounded-full border border-black/10 px-3 py-1.5 text-sm" />
          <button className={quietBtn}>Save</button>
          {!t.is_default && t.active && <button name="is_default" value="on" className={quietBtn}>Make default</button>}
        </form>
      </div>

      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-xs text-slate">
          <tr><th className="py-1">Item</th><th className="text-right">Cost</th><th className="text-right">Tier price</th><th className="sr-only">Change</th></tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {t.overrides.map((o) => (
            <tr key={o.item_id}>
              <td className="py-1.5"><span className="font-mono">{o.code}</span> {o.description}</td>
              <td className="text-right">{money(o.cost)}</td>
              <td className="text-right font-semibold">
                {o.sell_price !== null ? money(o.sell_price) : `+${Number(o.markup_pct)}% = ${money(o.cost * (1 + Number(o.markup_pct) / 100))}`}
              </td>
              <td className="text-right">
                <form action={saveTierItemAction}>
                  <input type="hidden" name="tierId" value={t.id} />
                  <input type="hidden" name="itemId" value={o.item_id} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="co" value={company.code} />
                  <input type="hidden" name="back" value={back} />
                  <button className="text-xs text-red-700 underline">Remove</button>
                </form>
              </td>
            </tr>
          ))}
          {t.overrides.length === 0 && <tr><td colSpan={4} className="py-2 text-slate">No item prices: everything is cost + {Number(t.markup_pct)}% (labour at its standard rate).</td></tr>}
        </tbody>
      </table>

      <form action={saveTierItemAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tierId" value={t.id} />
        <input type="hidden" name="companyId" value={company.id} />
        <input type="hidden" name="co" value={company.code} />
        <input type="hidden" name="back" value={back} />
        <div>
          <label className={label} htmlFor={`code-${t.id}`}>Item code</label>
          <input id={`code-${t.id}`} name="code" list={`labour-${t.id}`} required className="rounded-full border border-black/10 px-3 py-1.5" />
          <datalist id={`labour-${t.id}`}>{labour.map((l) => <option key={l.id} value={l.code}>{l.description}</option>)}</datalist>
        </div>
        <div>
          <label className={label} htmlFor={`sell-${t.id}`}>Fixed price ($ excl GST)</label>
          <input id={`sell-${t.id}`} name="sell_price" inputMode="decimal" className="w-28 rounded-full border border-black/10 px-3 py-1.5" />
        </div>
        <span className="pb-2 text-slate">or</span>
        <div>
          <label className={label} htmlFor={`mk-${t.id}`}>Markup (%)</label>
          <input id={`mk-${t.id}`} name="markup_pct" inputMode="decimal" className="w-20 rounded-full border border-black/10 px-3 py-1.5" />
        </div>
        <button className={quietBtn}>Set item price</button>
      </form>
    </section>
  );
}
