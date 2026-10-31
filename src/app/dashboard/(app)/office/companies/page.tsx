import { saveCompanyAction } from "@/app/dashboard/jm-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn } from "@/components/office/jm";
import { loadCompanies, type Company } from "@/lib/jm";
import { quoteDefaultsAction } from "@/app/dashboard/quote-actions";
import { saveCompanyMoneyAction } from "@/app/dashboard/supplier-actions";
import { loadCompanyMoney, type CompanyMoney } from "@/lib/supplier-docs";
import { officeEnabled } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Companies" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function CompaniesPage({ searchParams }: Props) {
  await requireOffice("owner");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let companies: Company[];
  let money: Record<string, CompanyMoney>;
  try {
    [companies, money] = await Promise.all([loadCompanies(), loadCompanyMoney()]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Companies</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Plumbing 360 and Project 360 run in the same system. Each has its own name, contact details, GST number, job
          numbers and default markup; both send invoices to the one Xero organisation (Project Three Sixty Ltd), tagged
          with the company&apos;s tracking option.
        </p>
      </div>
      <Flash ok={ok} err={err} />
      <div className="grid gap-6 lg:grid-cols-2">
        {companies.map((c) => (
          <section key={c.id} className="rounded-2xl bg-white p-5 sm:p-6" style={{ borderTop: `6px solid ${c.brand_colour ?? "#0f766e"}` }}>
            <h2 className="text-lg font-bold">{c.name}</h2>
            <p className="text-sm text-slate">
              {c.legal_name} · {c.customers} customers · {c.jobs} jobs · {c.staff} staff · next job{" "}
              <strong>{c.job_prefix ? `${c.job_prefix}-${c.next_job_number}` : "plain numbers (#123)"}</strong>
            </p>
            <form action={saveCompanyAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="companyId" value={c.id} />
              <Field c={c} name="name" text="Name" />
              <Field c={c} name="phone" text="Phone" />
              <Field c={c} name="email" text="Email" type="email" />
              <Field c={c} name="website" text="Website" />
              <Field c={c} name="address_line" text="Address" />
              <Field c={c} name="suburb" text="Suburb" />
              <Field c={c} name="city" text="City" />
              <Field c={c} name="postcode" text="Postcode" />
              <Field c={c} name="gst_number" text="GST number" />
              <Field c={c} name="default_markup_pct" text="Default markup on materials (%)" />
              <Field c={c} name="job_prefix" text="Job number prefix (blank = plain numbers)" />
              {c.job_prefix && <Field c={c} name="next_job_number" text="Next job number" />}
              <Field c={c} name="brand_colour" text="Brand colour (#rrggbb)" />
              <Field c={c} name="logo_url" text="Logo web address" />
              <div className="sm:col-span-2">
                <button className={primaryBtn}>Save {c.name}</button>
              </div>
            </form>
            {money[c.id] && <XeroForm id={c.id} m={money[c.id]} />}
            <form action={quoteDefaultsAction} className="mt-6 grid gap-3 border-t border-black/5 pt-4" data-testid={`quote-defaults-${c.code}`}>
              <h3 className="text-sm font-bold">Quote defaults (new quotes start with these)</h3>
              <input type="hidden" name="companyId" value={c.id} />
              <div>
                <label className="block text-xs font-semibold text-slate" htmlFor={`qv-${c.id}`}>Quotes are valid for (days)</label>
                <input id={`qv-${c.id}`} name="quote_valid_days" type="number" min={1} max={365} defaultValue={c.quote_valid_days ?? 30}
                  className="w-32 rounded-full border border-black/10 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate" htmlFor={`qx-${c.id}`}>No allowance has been made for (one per line)</label>
                <textarea id={`qx-${c.id}`} name="quote_exclusions" rows={8} defaultValue={c.quote_exclusions ?? ""}
                  className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate" htmlFor={`qt-${c.id}`}>Terms (printed at the end of the quote)</label>
                <textarea id={`qt-${c.id}`} name="quote_terms" rows={6} defaultValue={c.quote_terms ?? ""}
                  className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm" />
              </div>
              <div><button className={primaryBtn}>Save quote defaults</button></div>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}

function Field({ c, name, text, type = "text" }: { c: Company; name: keyof Company; text: string; type?: string }) {
  const id = `${c.code}-${name}`;
  return (
    <div>
      <label className={label} htmlFor={id}>{text}</label>
      <input id={id} name={name} type={type} defaultValue={(c[name] ?? "") as string | number} className={input} />
    </div>
  );
}

const ACCOUNTS: [keyof CompanyMoney, string][] = [
  ["acct_labour", "Labour (invoices)"], ["acct_sales", "Materials & other sales"], ["acct_vehicle", "Vehicle charge"],
  ["acct_materials", "Materials (supplier bills)"], ["acct_hire", "Plant hire (bills)"], ["acct_subcontract", "Subcontractors (bills)"],
  ["acct_retentions", "Retentions held"],
];

/** Phase 3b: Xero tracking, Draft/Authorised, supplier bills on/off and account codes for this company. */
function XeroForm({ id, m }: { id: string; m: CompanyMoney }) {
  const f = (k: string) => `${m.code}-x-${k}`;
  return (
    <form action={saveCompanyMoneyAction} className="mt-6 grid gap-3 border-t border-black/5 pt-4 sm:grid-cols-2" data-testid={`xero-${m.code}`}>
      <input type="hidden" name="companyId" value={id} />
      <input type="hidden" name="back" value="/dashboard/office/companies" />
      <h3 className="font-bold sm:col-span-2">Xero</h3>
      <div>
        <label className={label} htmlFor={f("cat")}>Tracking category (blank until decided)</label>
        <input id={f("cat")} name="xero_tracking_category" defaultValue={m.xero_tracking_category ?? ""} placeholder="e.g. Company" className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("opt")}>Tracking option</label>
        <input id={f("opt")} name="xero_tracking_option" defaultValue={m.xero_tracking_option ?? ""} placeholder={`e.g. ${m.name}`} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("st")}>Send to Xero as</label>
        <select id={f("st")} name="xero_send_status" defaultValue={m.xero_send_status} className={input}>
          <option value="DRAFT">Draft (check in Xero first)</option>
          <option value="AUTHORISED">Authorised</option>
        </select>
      </div>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="xero_send_bills" defaultChecked={m.xero_send_bills} />
        Send approved supplier bills to Xero (leave off while Fergus still sends them)
      </label>
      {ACCOUNTS.map(([k, t]) => (
        <div key={k}>
          <label className={label} htmlFor={f(k)}>{t}</label>
          <input id={f(k)} name={k} defaultValue={String(m[k] ?? "")} className={input} />
        </div>
      ))}
      <div className="sm:col-span-2"><button className={primaryBtn}>Save Xero settings</button></div>
    </form>
  );
}
