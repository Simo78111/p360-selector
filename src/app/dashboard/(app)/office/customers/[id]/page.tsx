import Link from "next/link";
import { notFound } from "next/navigation";
import { saveContactAction, saveCustomerAction, saveSiteAction } from "@/app/dashboard/jm-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { area, input, label, primaryBtn, quietBtn } from "@/components/office/jm";
import { CUSTOMER_KINDS, loadCustomer, type Contact, type Customer, type Site } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";
import { can, canEditCompany, requireOffice } from "@/lib/auth";

export const metadata = { title: "Customer" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function CustomerPage({ params, searchParams }: Props) {
  const session = await requireOffice("customers");
  if (!officeEnabled()) return <NotConnected />;
  const { id } = await params;
  const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let c: Customer | null;
  try {
    c = await loadCustomer(id);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!c || !can(session, "customers", c.company_id)) notFound();
  const editable = canEditCompany(session, c.company_id);
  const name = c.business_name ?? c.full_name;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/office/customers?co=${c.company_code}`} className="text-sm text-slate hover:underline">← {c.company} customers</Link>
        <h1 className="mt-1 text-2xl font-bold">{name}</h1>
        <p className="text-sm text-slate">
          {c.company} · {CUSTOMER_KINDS[c.kind] ?? c.kind} · {c.tier ?? "company default pricing"}
          {c.fergus_customer_id && ` · Fergus ${c.fergus_customer_id}`}
        </p>
      </div>
      <Flash ok={ok} err={err} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {can(session, "jobs", c.company_id) && (
          <Link href={`/dashboard/office/all-jobs?view=all&q=${encodeURIComponent(c.phone ?? c.email ?? name)}`} className={quietBtn}>
            This customer&apos;s jobs
          </Link>
        )}
        {editable && (
          <Link href={`/dashboard/office/all-jobs/new?customer=${c.id}`} className={primaryBtn}>+ New job</Link>
        )}
        {!editable && <span className="text-slate">View only: your role can&apos;t change customers.</span>}
      </div>
      <fieldset disabled={!editable} className="contents">

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Details</h2>
        <form action={saveCustomerAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="customerId" value={c.id} />
          <F id="business_name" text="Business name" v={c.business_name} />
          <F id="full_name" text="Person's name" v={c.full_name} />
          <div>
            <label className={label} htmlFor="kind">Type</label>
            <select id="kind" name="kind" defaultValue={c.kind} className={input}>
              {Object.entries(CUSTOMER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <F id="phone" text="Mobile (for texts)" v={c.phone} />
          <F id="email" text="Email" v={c.email} />
          <F id="billing_email" text="Invoices to (email)" v={c.billing_email} />
          <F id="billing_address" text="Postal / billing address" v={c.billing_address} />
          <F id="payment_terms_days" text="Payment terms (days)" v={c.payment_terms_days?.toString() ?? ""} />
          <div>
            <label className={label} htmlFor="pricing_tier_id">Pricing tier</label>
            <select id="pricing_tier_id" name="pricing_tier_id" defaultValue={c.pricing_tier_id ?? ""} className={input}>
              <option value="">None (company default)</option>
              {c.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={c.notes ?? ""} className={area} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3"><button className={primaryBtn}>Save details</button></div>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Sites ({c.sites.length})</h2>
        <ul className="mt-3 divide-y divide-black/5">
          {c.sites.map((s) => (
            <li key={s.id} className={`py-3 ${s.active ? "" : "opacity-60"}`}>
              <p className="font-semibold">{s.site_name ? `${s.site_name} — ` : ""}{s.address_line}{s.suburb && `, ${s.suburb}`}</p>
              {s.access_notes && <p className="text-sm text-slate">Access: {s.access_notes}</p>}
              <details className="mt-1">
                <summary className="cursor-pointer text-sm font-semibold text-aqua-deep">Edit site</summary>
                <SiteForm customerId={c.id} site={s} />
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-3 rounded-2xl border-2 border-dashed border-aqua/60 p-3 open:border-solid">
          <summary className="cursor-pointer font-semibold text-aqua-deep">+ Add a site</summary>
          <SiteForm customerId={c.id} />
        </details>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Contacts ({c.contacts.length})</h2>
        <ul className="mt-3 divide-y divide-black/5">
          {c.contacts.map((k) => (
            <li key={k.id} className="py-3">
              <p className="font-semibold">
                {k.full_name}
                {k.is_primary && <span className="ml-2 rounded-full bg-aqua-pale px-2 py-0.5 text-xs text-aqua-deep">primary</span>}
              </p>
              <p className="text-sm text-slate">
                {[k.position, k.mobile, k.phone, k.email].filter(Boolean).join(" · ")}
                {k.gets_quotes && " · gets quotes"}
                {k.gets_invoices && " · gets invoices"}
                {k.property_id && ` · site: ${c.sites.find((s) => s.id === k.property_id)?.address_line ?? ""}`}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-sm font-semibold text-aqua-deep">Edit contact</summary>
                <ContactForm customerId={c.id} sites={c.sites} contact={k} />
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-3 rounded-2xl border-2 border-dashed border-aqua/60 p-3 open:border-solid">
          <summary className="cursor-pointer font-semibold text-aqua-deep">+ Add a contact</summary>
          <ContactForm customerId={c.id} sites={c.sites} />
        </details>
      </section>
      </fieldset>
    </div>
  );
}

function F({ id, text, v, prefix = "" }: { id: string; text: string; v: string | null | undefined; prefix?: string }) {
  return (
    <div>
      <label className={label} htmlFor={`${prefix}${id}`}>{text}</label>
      <input id={`${prefix}${id}`} name={id} defaultValue={v ?? ""} className={input} />
    </div>
  );
}

function SiteForm({ customerId, site }: { customerId: string; site?: Site }) {
  const p = `site-${site?.id ?? "new"}-`;
  return (
    <form action={saveSiteAction} className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="customerId" value={customerId} />
      {site && <input type="hidden" name="siteId" value={site.id} />}
      <F prefix={p} id="site_name" text="Site name (optional)" v={site?.site_name} />
      <F prefix={p} id="address_line" text="Street address" v={site?.address_line} />
      <F prefix={p} id="suburb" text="Suburb" v={site?.suburb} />
      <F prefix={p} id="city" text="City" v={site?.city ?? "Auckland"} />
      <F prefix={p} id="postcode" text="Postcode" v={site?.postcode} />
      <F prefix={p} id="access_notes" text="Access notes" v={site?.access_notes} />
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
        <button className={primaryBtn}>{site ? "Save site" : "Add site"}</button>
        {site && (
          <button name="active" value={site.active ? "false" : "true"} className={quietBtn}>
            {site.active ? "Mark not in use" : "Mark in use"}
          </button>
        )}
      </div>
    </form>
  );
}

function ContactForm({ customerId, sites, contact }: { customerId: string; sites: Site[]; contact?: Contact }) {
  const k = contact;
  const p = `contact-${k?.id ?? "new"}-`;
  return (
    <div className="mt-2 space-y-2">
      <form action={saveContactAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="customerId" value={customerId} />
        {k && <input type="hidden" name="contactId" value={k.id} />}
        <F prefix={p} id="full_name" text="Name" v={k?.full_name} />
        <F prefix={p} id="position" text="Position" v={k?.position} />
        <F prefix={p} id="mobile" text="Mobile" v={k?.mobile} />
        <F prefix={p} id="phone" text="Phone" v={k?.phone} />
        <F prefix={p} id="email" text="Email" v={k?.email} />
        <div>
          <label className={label} htmlFor={`${p}site`}>Only for site</label>
          <select id={`${p}site`} name="property_id" defaultValue={k?.property_id ?? ""} className={input}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.site_name ?? s.address_line}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-4 text-sm sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2"><input type="checkbox" name="is_primary" defaultChecked={k?.is_primary} /> Primary contact</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="gets_quotes" defaultChecked={k?.gets_quotes} /> Gets quotes</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="gets_invoices" defaultChecked={k?.gets_invoices} /> Gets invoices</label>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><button className={primaryBtn}>{k ? "Save contact" : "Add contact"}</button></div>
      </form>
      {k && (
        <form action={saveContactAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="contactId" value={k.id} />
          <input type="hidden" name="remove" value="true" />
          <button className="text-xs text-red-700 underline">Remove contact</button>
        </form>
      )}
    </div>
  );
}
