import { saveCompanyAction } from "@/app/dashboard/jm-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn } from "@/components/office/jm";
import { loadCompanies, type Company } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Companies" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function CompaniesPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let companies: Company[];
  try {
    companies = await loadCompanies();
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
              <Field c={c} name="xero_tracking_option" text="Xero tracking option" />
              <div className="sm:col-span-2">
                <button className={primaryBtn}>Save {c.name}</button>
              </div>
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
