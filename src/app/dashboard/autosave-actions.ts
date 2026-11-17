"use server";
// Auto-save actions (17 Nov 2026): the same saves as the old Save buttons (job settings, phases, customer
// details, sites, contacts), but they answer the page ("saved" / what went wrong) instead of reloading it.
// Plus the job page's site contact box: pick, edit or add the site contact without leaving the job.
import { revalidatePath } from "next/cache";
import { assertOffice, canEditCompany } from "@/lib/auth";
import { loadCustomer, saveContact, saveCustomer, saveSite } from "@/lib/jm";
import { saveJob, savePhase } from "@/lib/jobs";
import { siteChanges } from "@/lib/site-fields";
import type { AutoSaveResult } from "@/components/office/AutoSaveForm";

const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const id = (form: FormData, k: string) => {
  const v = text(form, k, 40);
  return isId(v) ? v : null;
};
const num = (form: FormData, k: string) => {
  const s = text(form, k, 20).replace(/[$,%\s]/g, "");
  if (s === "") return "";
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`"${text(form, k, 20)}" isn't a number.`);
  return s;
};

async function done(work: () => Promise<string | void>): Promise<AutoSaveResult> {
  try {
    const message = (await work()) || undefined;
    revalidatePath("/dashboard/office", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The customer, if this person may change that company's customers. */
async function editableCustomer(customerId: string | null) {
  const s = await assertOffice("customers");
  const c = customerId ? await loadCustomer(customerId) : null;
  if (!c) throw new Error("Customer not found.");
  if (!canEditCompany(s, c.company_id)) throw new Error("Your role can't change this company's records.");
  return c;
}

// ── Job page ───────────────────────────────────────────────────────────────
export async function autoSaveJobAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const s = await assertOffice("jobs");
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const changes: Record<string, unknown> = {};
    for (const k of ["title", "order_number", "job_type"]) if (form.has(k)) changes[k] = text(form, k, 200);
    if (form.has("description")) changes.description = text(form, "description", 5000);
    for (const k of ["job_pricing_tier_id", "manager_staff_id", "site_contact_id", "property_id"]) {
      if (form.has(k)) changes[k] = id(form, k);
    }
    if (form.has("restricted_present")) changes.restricted = form.get("restricted") === "on";
    if (changes.title === "") throw new Error("The job needs a name.");
    await saveJob(s, jobId, changes);
  });
}

export async function autoSavePhaseAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const s = await assertOffice("jobs");
    const phaseId = id(form, "phaseId");
    if (!phaseId) throw new Error("Unknown phase.");
    const name = text(form, "name");
    if (!name) throw new Error("The phase needs a name.");
    await savePhase(s, phaseId, name, text(form, "description", 5000) || null);
  });
}

/** Job page → Site contact: switch to another contact, edit the current one, or add a new one. */
export async function jobSiteContactAction(form: FormData): Promise<AutoSaveResult & { contactId?: string }> {
  try {
    const s = await assertOffice("jobs");
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const c = await editableCustomer(id(form, "customerId"));
    const mode = text(form, "mode", 10);
    const details = {
      full_name: text(form, "full_name", 120),
      position: text(form, "position", 80),
      mobile: text(form, "mobile", 30),
      phone: text(form, "phone", 30),
      email: text(form, "email"),
    };
    let contactId: string | null = null;
    if (mode === "pick") {
      contactId = id(form, "site_contact_id");
      if (contactId && !c.contacts.some((k) => k.id === contactId)) throw new Error("That contact belongs to another customer.");
      await saveJob(s, jobId, { site_contact_id: contactId });
    } else if (mode === "edit") {
      contactId = id(form, "contactId");
      if (!contactId || !c.contacts.some((k) => k.id === contactId)) throw new Error("Contact not found.");
      if (!details.full_name) throw new Error("The contact needs a name.");
      await saveContact(contactId, c.id, details);
    } else if (mode === "new") {
      if (!details.full_name) throw new Error("Add the contact's name.");
      const before = new Set(c.contacts.map((k) => k.id));
      const siteId = id(form, "siteId");
      const after = await saveContact(null, c.id, { ...details, ...(siteId ? { property_id: siteId } : {}) });
      contactId = after.contacts.find((k) => !before.has(k.id))?.id ?? null;
      if (!contactId) throw new Error("The contact was added but couldn't be put on the job. Pick it from the list.");
      await saveJob(s, jobId, { site_contact_id: contactId });
    } else throw new Error("Unknown change.");
    revalidatePath("/dashboard/office", "layout");
    return { ok: true, contactId: contactId ?? undefined, message: mode === "new" ? "Contact added to the job." : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Job page → Job settings → new site: adds the site to the customer and moves the job to it. */
export async function jobNewSiteAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const s = await assertOffice("jobs");
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const c = await editableCustomer(id(form, "customerId"));
    const changes = await siteChanges(form);
    if (!changes.address_line) throw new Error("Add the street address.");
    const before = new Set(c.sites.map((x) => x.id));
    const after = await saveSite(null, c.id, changes);
    const siteId = after.sites.find((x) => !before.has(x.id))?.id;
    if (!siteId) throw new Error("The site was added but couldn't be put on the job. Pick it from the list.");
    await saveJob(s, jobId, { property_id: siteId });
    return "New site added and put on this job.";
  });
}

// ── Customer page ──────────────────────────────────────────────────────────
export async function autoSaveCustomerAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const c = await editableCustomer(id(form, "customerId"));
    if (!text(form, "full_name", 120) && !text(form, "business_name")) throw new Error("Add a name.");
    await saveCustomer(c.id, null, {
      business_name: text(form, "business_name"),
      full_name: text(form, "full_name", 120),
      kind: text(form, "kind", 30),
      phone: text(form, "phone", 30),
      email: text(form, "email"),
      billing_email: text(form, "billing_email"),
      billing_address: text(form, "billing_address", 300),
      payment_terms_days: num(form, "payment_terms_days"),
      notes: text(form, "notes", 2000),
      pricing_tier_id: text(form, "pricing_tier_id", 40),
    });
  });
}

export async function autoSaveSiteAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const c = await editableCustomer(id(form, "customerId"));
    const siteId = id(form, "siteId");
    const was = c.sites.find((x) => x.id === siteId);
    if (!siteId || !was) throw new Error("Site not found.");
    const changes = await siteChanges(form, "", { was });
    if (!changes.address_line) throw new Error("A site needs a street address.");
    await saveSite(siteId, c.id, changes);
  });
}

export async function autoSaveContactAction(form: FormData): Promise<AutoSaveResult> {
  return done(async () => {
    const c = await editableCustomer(id(form, "customerId"));
    const contactId = id(form, "contactId");
    if (!contactId || !c.contacts.some((k) => k.id === contactId)) throw new Error("Contact not found.");
    if (!text(form, "full_name", 120)) throw new Error("The contact needs a name.");
    await saveContact(contactId, c.id, {
      full_name: text(form, "full_name", 120),
      position: text(form, "position", 80),
      phone: text(form, "phone", 30),
      mobile: text(form, "mobile", 30),
      email: text(form, "email"),
      property_id: text(form, "property_id", 40),
      is_primary: form.get("is_primary") === "on",
      gets_quotes: form.get("gets_quotes") === "on",
      gets_invoices: form.get("gets_invoices") === "on",
    });
  });
}
