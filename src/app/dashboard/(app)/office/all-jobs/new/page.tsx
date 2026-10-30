import Link from "next/link";
import { createJobAction } from "@/app/dashboard/job-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { area, CompanyTabs, input, label, primaryBtn } from "@/components/office/jm";
import { canEditCompany, requireOffice } from "@/lib/auth";
import { loadCompanies, loadCustomers, type Company, type CustomerRow } from "@/lib/jm";
import { loadNewJobOptions, type NewJobOptions } from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "New job" };

type Props = { searchParams: Promise<{ err?: string; customer?: string; co?: string; q?: string }> };

export default async function NewJobPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { err, customer, co, q = "" } = await searchParams;
  let companies: Company[];
  let opts: NewJobOptions = null;
  let rows: CustomerRow[] = [];
  try {
    companies = (await loadCompanies()).filter((c) => canEditCompany(session, c.id));
    if (customer && /^[0-9a-f-]{36}$/.test(customer)) opts = await loadNewJobOptions(session, customer);
    const company = companies.find((c) => c.code === co) ?? companies.find((c) => c.code === "PTSL") ?? companies[0];
    if (!opts && company) rows = await loadCustomers(company.id, q);
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

      {!opts ? (
        <section className="space-y-4 rounded-2xl bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">1. Pick the customer</h2>
            {companies.length > 1 && <CompanyTabs companies={companies} current={company.code} path="/dashboard/office/all-jobs/new" />}
          </div>
          <form className="flex flex-wrap gap-2" role="search">
            <input type="hidden" name="co" value={company.code} />
            <input name="q" defaultValue={q} placeholder="Customer name, phone, email or address" aria-label="Search customers" className={`${input} max-w-md flex-1`} />
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
          <p className="text-sm text-slate">
            New customer? <Link href={`/dashboard/office/customers?co=${company.code}`} className="underline">Add them on Customers</Link> first
            (with their site), then come back.
          </p>
        </section>
      ) : opts.sites.length === 0 ? (
        <section className="rounded-2xl bg-white p-6 text-sm">
          <p><strong>{opts.customer.name}</strong> has no sites yet.</p>
          <p className="mt-2"><Link href={`/dashboard/office/customers/${opts.customer.id}`} className="underline">Add a site</Link>, then come back.</p>
        </section>
      ) : (
        <form action={createJobAction} className="space-y-5 rounded-2xl bg-white p-5 sm:p-6" data-testid="new-job-form">
          <input type="hidden" name="customerId" value={opts.customer.id} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              {opts.customer.company} job for {opts.customer.name}
            </h2>
            <Link href="/dashboard/office/all-jobs/new" className="text-sm text-slate underline">Change customer</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="title">Job name</label>
              <input id="title" name="title" required placeholder="e.g. Lot 4 new house plumbing" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="job_type">Type</label>
              <select id="job_type" name="job_type" className={input} defaultValue="quoted">
                <option value="quoted">Quoted</option>
                <option value="charge_up">Charge-up</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="siteId">Site</label>
              <select id="siteId" name="siteId" required className={input}>
                {opts.sites.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="site_contact_id">Site contact</label>
              <select id="site_contact_id" name="site_contact_id" className={input}>
                <option value="">None</option>
                {opts.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` (${c.position})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="order_number">Customer&apos;s order number</label>
              <input id="order_number" name="order_number" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="manager_staff_id">Job manager</label>
              <select id="manager_staff_id" name="manager_staff_id" className={input}>
                <option value="">None</option>
                {opts.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="job_pricing_tier_id">Pricing tier for this job</label>
              <select id="job_pricing_tier_id" name="job_pricing_tier_id" className={input}>
                <option value="">Customer&apos;s own ({opts.customer.tier ?? "company default"})</option>
                {opts.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="restricted" /> Office only (supervisors can&apos;t see it)
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label} htmlFor="description">Job description</label>
              <textarea id="description" name="description" rows={3} className={area} />
            </div>
          </div>
          <fieldset className="grid gap-3 rounded-2xl bg-mist/50 p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-bold">First phase (a)</legend>
            <div>
              <label className={label} htmlFor="phase_name">Phase name</label>
              <input id="phase_name" name="phase_name" placeholder="Same as the job name" className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="phase_description">Phase description</label>
              <textarea id="phase_description" name="phase_description" rows={2} className={area} />
            </div>
          </fieldset>
          <button className={primaryBtn}>Create job</button>
        </form>
      )}
    </div>
  );
}
