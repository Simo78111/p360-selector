import "server-only";
// Job management (Phase 1): companies, staff, customers/sites/contacts, pricing tiers and the
// Fergus import, through the engine's office_* functions (engine repo, migrations jm_*).
import { engine } from "./engine";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Companies ──────────────────────────────────────────────────────────────
export type Company = {
  id: string; code: string; name: string; legal_name: string; phone: string | null; email: string | null;
  website: string | null; address_line: string | null; suburb: string | null; city: string | null; postcode: string | null;
  gst_number: string | null; job_prefix: string | null; next_job_number: number | null; default_markup_pct: number;
  logo_url: string | null; brand_colour: string | null; xero_tracking_option: string | null; active: boolean;
  customers: number; jobs: number; staff: number;
  quote_valid_days: number; quote_exclusions: string | null; quote_terms: string | null;   // Phase 2b
};
export const loadCompanies = () => rpc<Company[]>("office_companies", {});
export const saveCompany = (id: string, changes: Record<string, unknown>) =>
  rpc<Company>("office_save_company", { p_company_id: id, p_changes: changes });

// ── Staff ──────────────────────────────────────────────────────────────────
export const ROLES = ["owner_admin", "office_manager", "supervisor", "tradesperson", "apprentice"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  owner_admin: "Owner / admin",
  office_manager: "Office / manager",
  supervisor: "Supervisor",
  tradesperson: "Tradesperson",
  apprentice: "Apprentice",
};
export const TRADES: Record<string, string> = {
  plumber: "Plumber",
  gasfitter: "Gas fitter",
  drainlayer: "Drainlayer",
  plumber_gasfitter: "Plumber + gas fitter",
  plumber_gasfitter_drainlayer: "Plumber, gas fitter + drainlayer",
  office: "Office",
  other: "Other",
};
export const LICENCE_KINDS: Record<string, string> = {
  plumber: "Plumber (PGDB)",
  gasfitter: "Gas fitter (PGDB)",
  drainlayer: "Drainlayer (PGDB)",
  certifying_plumber: "Certifying plumber",
  certifying_gasfitter: "Certifying gas fitter",
  certifying_drainlayer: "Certifying drainlayer",
  site_safe: "Site Safe",
  drivers: "Driver licence",
  first_aid: "First aid",
  other: "Other",
};
export type Licence = { id: string; kind: string; number: string | null; expires_on: string | null; notes: string | null; expired: boolean; expiring: boolean };
export type Staff = {
  id: string; full_name: string; phone: string | null; email: string | null; trade: string | null;
  cost_rate: number | null; charge_out_rate: number | null; smartly_employee_code: string | null; smartly_pay_rate: number | null;
  is_apprentice: boolean; works_on_jobs: boolean; active: boolean; notes: string | null; login: boolean; plumber_id: string | null;
  roles: Record<string, Role>; licences: Licence[]; licence_warning: boolean;
};
export const loadStaff = () => rpc<Staff[]>("office_staff", {});
export const saveStaff = (id: string | null, changes: Record<string, unknown>) =>
  rpc<{ staff_id: string; created: boolean; plumber_id: string | null }>("office_save_staff", { p_staff_id: id, p_changes: changes });
export const setStaffRole = (staffId: string, companyId: string, role: Role | null) =>
  rpc<Staff>("office_set_staff_role", { p_staff_id: staffId, p_company_id: companyId, p_role: role });
export const saveLicence = (licenceId: string | null, staffId: string, changes: Record<string, unknown>) =>
  rpc<Staff>("office_save_licence", { p_licence_id: licenceId, p_staff_id: staffId, p_changes: changes });
export const linkStaffLogin = (staffId: string, authUserId: string) =>
  rpc<Staff>("office_link_staff_login", { p_staff_id: staffId, p_auth_user_id: authUserId });

/** Makes (or resets) a Supabase Auth login: email + password, already confirmed. Returns the user id. */
export async function setStaffLogin(email: string, password: string): Promise<{ id: string; made: boolean }> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const auth = db.auth.admin;
  const made = await auth.createUser({ email, password, email_confirm: true });
  if (!made.error && made.data.user) return { id: made.data.user.id, made: true };
  if (made.error && !/already|registered|exists/i.test(made.error.message)) throw new Error(`Login: ${made.error.message}`);
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Login: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      const upd = await auth.updateUserById(user.id, { password, email_confirm: true });
      if (upd.error) throw new Error(`Login: ${upd.error.message}`);
      return { id: user.id, made: false };
    }
    if (data.users.length < 200) break;
  }
  throw new Error("Login: couldn't create it or find it");
}

// ── Customers, sites, contacts ──────────────────────────────────────────────
export const CUSTOMER_KINDS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  property_manager: "Property manager",
  builder: "Builder",
  other: "Other",
};
export type CustomerRow = {
  id: string; name: string; contact_name: string; kind: string; phone: string | null; email: string | null;
  tier: string | null; active: boolean; fergus_customer_id: string | null; sites: number; jobs: number;
};
export type Site = {
  id: string; site_name: string | null; address_line: string; suburb: string | null; city: string | null;
  postcode: string | null; access_notes: string | null; notes: string | null; active: boolean; fergus_site_id: string | null;
};
export type Contact = {
  id: string; full_name: string; position: string | null; phone: string | null; mobile: string | null; email: string | null;
  property_id: string | null; is_primary: boolean; gets_quotes: boolean; gets_invoices: boolean; notes: string | null;
};
export type Customer = {
  id: string; company_id: string; company: string; company_code: string; full_name: string; business_name: string | null;
  kind: string; phone: string | null; email: string | null; billing_email: string | null; billing_address: string | null;
  payment_terms_days: number | null; notes: string | null; pricing_tier_id: string | null; tier: string | null;
  active: boolean; fergus_customer_id: string | null; sites: Site[]; contacts: Contact[]; tiers: { id: string; name: string }[];
};
export const loadCustomers = (companyId: string, search: string) =>
  rpc<CustomerRow[]>("office_customers", { p_company_id: companyId, p_search: search || null, p_limit: 200 });
export const loadCustomer = (id: string) => rpc<Customer | null>("office_customer", { p_customer_id: id });
export const saveCustomer = (id: string | null, companyId: string | null, changes: Record<string, unknown>) =>
  rpc<Customer>("office_save_customer", { p_customer_id: id, p_company_id: companyId, p_changes: changes });
export const saveSite = (id: string | null, customerId: string | null, changes: Record<string, unknown>) =>
  rpc<Customer>("office_save_site", { p_site_id: id, p_customer_id: customerId, p_changes: changes });
export const saveContact = (id: string | null, customerId: string | null, changes: Record<string, unknown>) =>
  rpc<Customer>("office_save_contact", { p_contact_id: id, p_customer_id: customerId, p_changes: changes });

// ── Pricing ────────────────────────────────────────────────────────────────
export type TierOverride = { item_id: string; code: string; description: string; cost: number; sell_price: number | null; markup_pct: number | null; kind: string };
export type Tier = { id: string; name: string; markup_pct: number; is_default: boolean; active: boolean; customers: number; overrides: TierOverride[] };
export type Pricing = { company_markup_pct: number; tiers: Tier[]; labour: { id: string; code: string; description: string; cost: number; sell: number }[] };
export const loadPricing = (companyId: string) => rpc<Pricing>("office_pricing_tiers", { p_company_id: companyId });
export const saveTier = (id: string | null, companyId: string, changes: Record<string, unknown>) =>
  rpc<Pricing>("office_save_tier", { p_tier_id: id, p_company_id: companyId, p_changes: changes });
export const saveTierItem = (tierId: string, itemId: string, sell: number | null, markup: number | null) =>
  rpc<Pricing>("office_save_tier_item", { p_tier_id: tierId, p_item_id: itemId, p_sell_price: sell, p_markup_pct: markup });
export type PriceCheck = { sell: number; cost: number; source: string; tier: string | null; markup_pct?: number; favourite?: string };
export const priceItem = (companyId: string, customerId: string | null, itemId: string) =>
  rpc<PriceCheck>("price_item", { p_company_id: companyId, p_customer_id: customerId, p_item_id: itemId });

// ── Fergus import ──────────────────────────────────────────────────────────
export type ImportResult = {
  kind: string; rows: number; added: number; updated: number; skipped: number; dry_run: boolean;
  problems: { row?: number; name?: string; problem: string }[];
};
export const fergusImport = (companyId: string, kind: string, rows: Record<string, string>[], dryRun: boolean, fileName: string) =>
  rpc<ImportResult>("fergus_import", { p_company_id: companyId, p_kind: kind, p_rows: rows, p_dry_run: dryRun, p_file_name: fileName });
export type ImportRun = { id: string; kind: string; file_name: string | null; rows_in: number; added: number; updated: number; skipped: number; problem_count: number; created_at: string };
export const loadImports = (companyId: string) => rpc<ImportRun[]>("office_fergus_imports", { p_company_id: companyId });

/** The company picked on a page (?co=PTSL), defaulting to Plumbing 360. */
export function pickCompany(companies: Company[], code: string | undefined) {
  return companies.find((c) => c.code === code) ?? companies[0];
}

/** A price book item by its exact code (materials search; labour rates come from loadPricing). */
export async function findItemByCode(code: string): Promise<{ id: string; code: string; description: string } | null> {
  const found = await rpc<{ id: string; code: string; description: string }[]>("materials_search", { p_query: code, p_limit: 20 });
  return found.find((i) => i.code.toLowerCase() === code.toLowerCase()) ?? null;
}
