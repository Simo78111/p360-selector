"use server";
// Office actions for job management (staff, companies, customers, pricing, Fergus import).
// Each checks the owner login, calls the engine, then returns to the page with ?ok= or ?err=.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import {
  fergusImport,
  findItemByCode,
  loadPricing,
  linkStaffLogin,
  ROLES,
  saveCompany,
  saveContact,
  saveCustomer,
  saveLicence,
  saveSite,
  saveStaff,
  saveTier,
  saveTierItem,
  setStaffLogin,
  setStaffRole,
  type ImportResult,
  type Role,
} from "@/lib/jm";

const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

async function run(path: string, work: () => Promise<string>) {
  await requireOwner();
  let target: string;
  try {
    target = back(path, "ok", await work());
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

const safePath = (p: FormDataEntryValue | null, fallback: string) => {
  const s = String(p ?? "");
  return s.startsWith("/dashboard/office") ? s : fallback;
};
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const num = (form: FormData, k: string) => {
  const s = text(form, k, 20).replace(/[$,%\s]/g, "");
  if (s === "") return "";
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`"${text(form, k, 20)}" isn't a number.`);
  return s;
};
const checked = (form: FormData, k: string) => form.get(k) === "on";

// ── Staff ──────────────────────────────────────────────────────────────────
export async function saveStaffAction(form: FormData) {
  const id = text(form, "staffId", 40) || null;
  const path = "/dashboard/office/staff";
  await run(path, async () => {
    const name = text(form, "full_name", 120);
    const email = text(form, "email").toLowerCase();
    const password = String(form.get("password") ?? "");
    if (password && password.length < 8) throw new Error("The password needs at least 8 characters.");
    if (password && !email) throw new Error("Add an email address to make a login.");
    const saved = await saveStaff(id, {
      full_name: name,
      phone: text(form, "phone", 30),
      email,
      trade: text(form, "trade", 40),
      cost_rate: num(form, "cost_rate"),
      charge_out_rate: num(form, "charge_out_rate"),
      smartly_employee_code: text(form, "smartly_employee_code", 30),
      smartly_pay_rate: text(form, "smartly_pay_rate", 1),
      is_apprentice: checked(form, "is_apprentice"),
      works_on_jobs: checked(form, "works_on_jobs"),
      notes: text(form, "notes", 1000),
    });
    // roles: one select per company (role_<companyId>), blank = not in that company
    for (const [k, v] of form.entries()) {
      if (!k.startsWith("role_")) continue;
      const role = String(v);
      if (role && !(ROLES as readonly string[]).includes(role)) throw new Error("Unknown role");
      if (!id && !role) continue;
      await setStaffRole(saved.staff_id, k.slice(5), (role || null) as Role | null);
    }
    const done = [saved.created ? `${name} added.` : `${name} saved.`];
    if (password) {
      const login = await setStaffLogin(email, password);
      await linkStaffLogin(saved.staff_id, login.id);
      done.push(login.made ? `Login made: ${email} with the password you set.` : `Password changed for ${email}.`);
    }
    return done.join(" ");
  });
}

export async function staffActiveAction(form: FormData) {
  const id = text(form, "staffId", 40);
  const on = form.get("on") === "true";
  await run("/dashboard/office/staff", async () => {
    await saveStaff(id, { active: on });
    return `${text(form, "name", 120)} ${on ? "is active again" : "is deactivated"}.`;
  });
}

export async function saveLicenceAction(form: FormData) {
  await run("/dashboard/office/staff", async () => {
    const licenceId = text(form, "licenceId", 40) || null;
    const staffId = text(form, "staffId", 40);
    if (form.get("remove") === "true") {
      await saveLicence(licenceId, staffId, { remove: true });
      return "Licence removed.";
    }
    await saveLicence(licenceId, staffId, {
      kind: text(form, "kind", 40),
      number: text(form, "number", 60),
      expires_on: text(form, "expires_on", 10),
      notes: text(form, "notes", 300),
    });
    return "Licence saved.";
  });
}

// ── Companies ──────────────────────────────────────────────────────────────
export async function saveCompanyAction(form: FormData) {
  await run("/dashboard/office/companies", async () => {
    const id = text(form, "companyId", 40);
    const keys = ["name", "phone", "email", "website", "address_line", "suburb", "city", "postcode", "gst_number",
                  "job_prefix", "logo_url", "brand_colour", "xero_tracking_option"];
    const changes: Record<string, unknown> = {};
    for (const k of keys) if (form.has(k)) changes[k] = text(form, k, 200);
    if (form.has("next_job_number")) changes.next_job_number = num(form, "next_job_number");
    if (form.has("default_markup_pct")) changes.default_markup_pct = num(form, "default_markup_pct");
    const c = await saveCompany(id, changes);
    return `${c.name} saved.`;
  });
}

// ── Customers, sites, contacts ──────────────────────────────────────────────
export async function saveCustomerAction(form: FormData) {
  await requireOwner();
  const id = text(form, "customerId", 40) || null;
  const company = text(form, "companyId", 40) || null;
  let target: string;
  try {
    const c = await saveCustomer(id, company, {
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
    target = back(`/dashboard/office/customers/${c.id}`, "ok", id ? "Customer saved." : "Customer added.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    target = back(id ? `/dashboard/office/customers/${id}` : `/dashboard/office/customers?co=${text(form, "co", 8)}`, "err", msg);
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

export async function saveSiteAction(form: FormData) {
  const customerId = text(form, "customerId", 40);
  await run(`/dashboard/office/customers/${customerId}`, async () => {
    const siteId = text(form, "siteId", 40) || null;
    await saveSite(siteId, customerId, {
      site_name: text(form, "site_name", 120),
      address_line: text(form, "address_line"),
      suburb: text(form, "suburb", 80),
      city: text(form, "city", 80),
      postcode: text(form, "postcode", 10),
      access_notes: text(form, "access_notes", 1000),
      notes: text(form, "notes", 1000),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    });
    return siteId ? "Site saved." : "Site added.";
  });
}

export async function saveContactAction(form: FormData) {
  const customerId = text(form, "customerId", 40);
  await run(`/dashboard/office/customers/${customerId}`, async () => {
    const contactId = text(form, "contactId", 40) || null;
    if (form.get("remove") === "true") {
      await saveContact(contactId, customerId, { active: false });
      return "Contact removed.";
    }
    await saveContact(contactId, customerId, {
      full_name: text(form, "full_name", 120),
      position: text(form, "position", 80),
      phone: text(form, "phone", 30),
      mobile: text(form, "mobile", 30),
      email: text(form, "email"),
      property_id: text(form, "property_id", 40),
      is_primary: checked(form, "is_primary"),
      gets_quotes: checked(form, "gets_quotes"),
      gets_invoices: checked(form, "gets_invoices"),
    });
    return contactId ? "Contact saved." : "Contact added.";
  });
}

// ── Pricing tiers ──────────────────────────────────────────────────────────
export async function saveTierAction(form: FormData) {
  const code = text(form, "co", 8);
  await run(`/dashboard/office/pricing?co=${code}`, async () => {
    const id = text(form, "tierId", 40) || null;
    await saveTier(id, text(form, "companyId", 40), {
      name: text(form, "name", 80),
      markup_pct: num(form, "markup_pct"),
      ...(form.has("is_default") ? { is_default: checked(form, "is_default") } : {}),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    });
    return id ? "Tier saved." : "Tier added.";
  });
}

export async function saveTierItemAction(form: FormData) {
  const code = text(form, "co", 8);
  await run(safePath(form.get("back"), `/dashboard/office/pricing?co=${code}`), async () => {
    const sell = num(form, "sell_price");
    const markup = num(form, "markup_pct");
    let itemId = text(form, "itemId", 40);
    if (!itemId) {
      const code = text(form, "code", 60);
      const labour = (await loadPricing(text(form, "companyId", 40))).labour.find((l) => l.code.toLowerCase() === code.toLowerCase());
      const item = labour ?? (code ? await findItemByCode(code) : null);
      if (!item) throw new Error(`No price book item with the code "${code}".`);
      itemId = item.id;
    }
    await saveTierItem(text(form, "tierId", 40), itemId, sell === "" ? null : Number(sell), markup === "" ? null : Number(markup));
    return sell === "" && markup === "" ? "Override removed." : "Price saved.";
  });
}

// ── Fergus import (called from the upload screen, returns the result) ─────────
export async function fergusImportAction(
  companyId: string, kind: string, rows: Record<string, string>[], dryRun: boolean, fileName: string,
): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  await requireOwner();
  try {
    const result = await fergusImport(companyId, kind, rows, dryRun, fileName.slice(0, 200));
    if (!dryRun) revalidatePath("/dashboard/office", "layout");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
