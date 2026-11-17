import Link from "next/link";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { CompanyTabs, input, primaryBtn } from "@/components/office/jm";
import { NewJobForm } from "@/components/office/NewJobForm";
import { canEditCompany, requireOffice } from "@/lib/auth";
import { CUSTOMER_KINDS, loadCompanies, loadCustomers, loadPricing, type Company, type CustomerRow, type Pricing } from "@/lib/jm";
import { loadNewJobOptions, type NewJobOptions } from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "New job" };

type Props = { searchParams: Promise<{ err?: string; customer?: string; co?: string; q?: string; new?: string }> };

export default async function NewJobPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { err, customer, co, q = "", new: isNew } = await searchParams;
  let companies: Company[];
  let opts: NewJobOptions = null;
  let rows: CustomerRow[] = [];
  let pricing: Pricing | null = null;
  try {
    companies = (await loadCompanies()).filter((c) => canEditCompany(session, c.id));
    if (customer && /^[0-9a-f-]{36}$/.test(customer)) opts = await loadNewJobOptions(session, customer);
    const company = companies.find((c) => c.code === co) ?? companies.find((c) => c.code === "PTSL") ?? companies[0];
    if (!opts && company && isNew === "1") pricing = await loadPricing(company.id);
    else if (!opts && company) rows = await loadCustomers(company.id, q);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (companies.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-sm">Your role can&apos;t create jobs. Ask the office.</p>;
  }
  const company = companies.find((c) => c.code === co) ?? companies.find((c) => c.code === "PTSL") ?? companies[0];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/office/all-jobs" className="text-sm text-slate hover:underline">← All jobs</Link>
        <h1 className="mt-1 text-2xl font-bold">New job</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          A job gets the next number in its company&apos;s series (Project 360: PTSL-3000, PTSL-3001, …) and starts with
          phase <strong>a</strong>. The phase number (e.g. PTSL-3000a) is the order number to give suppliers. Website and
          phone bookings still come in through the booking engine as before.
        </p>
      </div>
      <Flash err={err} />

      {opts ? (
        <NewJobForm mode="existing" customer={opts.customer} sites={opts.sites} contacts={opts.contacts} tiers={opts.tiers} managers={opts.managers} />
      ) : isNew === "1" && pricing && company ? (
        <>
          {companies.length > 1 && <CompanyTabs companies={companies} current={company.code} path="/dashboard/office/all-jobs/new?new=1" />}
          <NewJobForm
            mode="new"
            company={{ id: company.id, name: company.name, code: company.code }}
            kinds={CUSTOMER_KINDS}
            customerTiers={pricing.tiers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
            defaultTierId={pricing.tiers.find((t) => t.is_default && t.active)?.id ?? null}
            companyMarkup={pricing.company_markup_pct}
          />
        </>
      ) : (
        <section className="space-y-4 rounded-2xl bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">1. Who&apos;s it for?</h2>
            {companies.length > 1 && <CompanyTabs companies={companies} current={company.code} path="/dashboard/office/all-jobs/new" />}
          </div>
          <Link href={`/dashboard/office/all-jobs/new?new=1&co=${company.code}`} className={`${primaryBtn} inline-block`} data-testid="new-customer-job">
            + New {company.name} customer
          </Link>
          <p className="text-sm text-slate">Or find an existing customer:</p>
          <form className="flex flex-wrap gap-2" role="search">
            <input type="hidden" name="co" value={company.code} />
            <input name="q" defaultValue={q} placeholder="Customer name, phone, email or address" aria-label="Search customers" className={`${input} max-w-md flex-1`} autoFocus />
            <button className={primaryBtn}>Search</button>
          </form>
          <ul className="divide-y divide-black/5" data-testid="customer-picker">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <strong>{r.name}</strong>
                  {r.name !== r.contact_name && <span className="text-slate"> · {r.contact_name}</span>}
                  <span className="text-slate"> · {r.sites} site{r.sites === 1 ? "" : "s"}</span>
                </span>
                <Link href={`/dashboard/office/all-jobs/new?customer=${r.id}`} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold">
                  Choose
                </Link>
              </li>
            ))}
            {rows.length === 0 && <li className="py-2 text-sm text-slate">No customers found.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
