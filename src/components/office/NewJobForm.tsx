"use client";
// New job in one screen (17 Nov 2026): customer (existing or new), site (existing or new, found with Google),
// site contact (existing, new, or the customer themselves), then the job. Replaces "add the customer on
// Customers, add their site, come back, pick them".
import Link from "next/link";
import { useState } from "react";
import { createJobAction } from "@/app/dashboard/job-actions";
import { SiteFields } from "./AddressSearch";

const fieldCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-semibold text-slate";
const primary = "rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800";
const card = "space-y-4 rounded-2xl bg-white p-5 sm:p-6";

type Opt = { id: string; name: string };
export type NewJobFormProps =
  | {
    mode: "existing";
    customer: { id: string; name: string; company: string; tier: string | null };
    sites: { id: string; text: string }[];
    contacts: (Opt & { position: string | null; site_id: string | null })[];
    tiers: Opt[];
    managers: Opt[];
  }
  | {
    mode: "new";
    company: { id: string; name: string; code: string };
    kinds: Record<string, string>;
    customerTiers: Opt[];
    defaultTierId: string | null;
    companyMarkup: number;
  };

export function NewJobForm(p: NewJobFormProps) {
  const existing = p.mode === "existing";
  const [site, setSite] = useState<string>(existing ? (p.sites.length ? p.sites[0].id : "new") : "new");
  const [contact, setContact] = useState<string>(existing ? "" : "customer");

  return (
    <form action={createJobAction} className="space-y-5" data-testid="new-job-form">
      {existing ? <input type="hidden" name="customerId" value={p.customer.id} /> : (
        <>
          <input type="hidden" name="new_customer" value="1" />
          <input type="hidden" name="companyId" value={p.company.id} />
          <input type="hidden" name="co" value={p.company.code} />
        </>
      )}

      {/* ── 1. Customer ─────────────────────────────────────────────── */}
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">1. Customer</h2>
          <Link href="/dashboard/office/all-jobs/new" className="text-sm text-slate underline">Change customer</Link>
        </div>
        {existing ? (
          <p className="text-sm"><strong>{p.customer.name}</strong> <span className="text-slate">· {p.customer.company} · {p.customer.tier ?? "company default pricing"}</span></p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="new-customer-fields">
            <Box name="full_name" text="Person's name" autoFocus />
            <Box name="business_name" text="Business name (if any)" />
            <div>
              <label className={labelCls} htmlFor="nj-kind">Type</label>
              <select id="nj-kind" name="kind" className={fieldCls}>
                {Object.entries(p.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Box name="phone" text="Mobile (for texts)" type="tel" />
            <Box name="email" text="Email" type="email" />
            <div>
              <label className={labelCls} htmlFor="nj-tier">Pricing tier</label>
              <select id="nj-tier" name="pricing_tier_id" defaultValue={p.defaultTierId ?? ""} className={fieldCls}>
                <option value="">None (company default {p.companyMarkup}%)</option>
                {p.customerTiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Site and site contact ────────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-bold">2. Site</h2>
        {existing && p.sites.length > 0 && (
          <div className="max-w-xl">
            <label className={labelCls} htmlFor="siteId">Site</label>
            <select id="siteId" name="siteId" value={site} onChange={(e) => setSite(e.target.value)} className={fieldCls}>
              {p.sites.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
              <option value="new">+ New site (find it on Google)…</option>
            </select>
          </div>
        )}
        {site === "new" && (
          <>
            {existing && <input type="hidden" name="siteId" value="new" />}
            <SiteFields prefix="site_" idPrefix="nj-site-" required autoFocus={existing} />
          </>
        )}

        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="site_contact_id">Site contact</label>
            <select id="site_contact_id" name="site_contact_id" value={contact} onChange={(e) => setContact(e.target.value)} className={fieldCls}>
              <option value="">None</option>
              {!existing && <option value="customer">Same as the customer</option>}
              {existing && p.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` (${c.position})` : ""}</option>)}
              <option value="new">+ New contact…</option>
            </select>
          </div>
          {contact === "new" && (
            <>
              <Box name="contact_full_name" text="Contact name" required />
              <Box name="contact_position" text="Position (e.g. site manager)" />
              <Box name="contact_mobile" text="Contact mobile" type="tel" />
              <Box name="contact_email" text="Contact email" type="email" />
            </>
          )}
        </div>
      </section>

      {/* ── 3. The job ──────────────────────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-bold">3. Job</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2"><Box name="title" text="Job name" required placeholder="e.g. Lot 4 new house plumbing" /></div>
          <div>
            <label className={labelCls} htmlFor="nj-job_type">Type</label>
            <select id="nj-job_type" name="job_type" className={fieldCls} defaultValue="quoted">
              <option value="quoted">Quoted</option>
              <option value="charge_up">Charge-up</option>
            </select>
          </div>
          <Box name="order_number" text="Customer's order number" />
          {existing && (
            <>
              <div>
                <label className={labelCls} htmlFor="nj-manager">Job manager</label>
                <select id="nj-manager" name="manager_staff_id" className={fieldCls}>
                  <option value="">None</option>
                  {p.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="nj-tier-job">Pricing tier for this job</label>
                <select id="nj-tier-job" name="job_pricing_tier_id" className={fieldCls}>
                  <option value="">Customer&apos;s own ({p.customer.tier ?? "company default"})</option>
                  {p.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="restricted" /> Office only (supervisors can&apos;t see it)
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls} htmlFor="nj-description">Job description</label>
            <textarea id="nj-description" name="description" rows={3} className={fieldCls} />
          </div>
        </div>
        <details className="rounded-2xl bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">First phase (a): name and description <span className="font-normal text-slate">(optional: same as the job if left blank)</span></summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Box name="phase_name" text="Phase name" placeholder="Same as the job name" />
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="nj-phase_description">Phase description</label>
              <textarea id="nj-phase_description" name="phase_description" rows={2} className={fieldCls} />
            </div>
          </div>
        </details>
        {!existing && <p className="text-xs text-slate">Job manager and a job-only pricing tier can be set on the job page straight after.</p>}
        <button className={primary} data-testid="create-job">Create job</button>
      </section>
    </form>
  );
}

function Box({ name, text, type = "text", required, autoFocus, placeholder }: {
  name: string; text: string; type?: string; required?: boolean; autoFocus?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={`nj-${name}`}>{text}</label>
      <input id={`nj-${name}`} name={name} type={type} required={required} autoFocus={autoFocus} placeholder={placeholder} className={fieldCls} />
    </div>
  );
}
