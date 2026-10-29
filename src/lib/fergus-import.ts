// Reading Fergus CSV exports (customers, sites, contacts, tier prices) in the browser.
// Fergus's column names vary a little between exports and versions, so each field accepts a few
// names. The rows are sent to the engine's fergus_import, which matches, saves and reports problems.
import { parseCsv } from "./csv";

export type ImportKind = "customers" | "sites" | "contacts" | "tier_prices";

export const KIND_LABEL: Record<ImportKind, string> = {
  customers: "Customers",
  sites: "Sites",
  contacts: "Contacts",
  tier_prices: "Tier prices",
};

/** Our field → the column names it might have in a Fergus export (lower case, any punctuation). */
const FIELDS: Record<ImportKind, Record<string, string[]>> = {
  customers: {
    fergus_id: ["customer id", "id", "customer number", "customer no"],
    name: ["customer name", "customer", "name", "company name", "company", "business name"],
    first_name: ["first name", "main contact first name", "contact first name", "firstname"],
    last_name: ["last name", "main contact last name", "contact last name", "surname", "lastname"],
    kind: ["customer type", "type", "category"],
    phone: ["phone", "phone number", "main contact phone", "landline", "work phone"],
    mobile: ["mobile", "mobile number", "main contact mobile", "cell"],
    email: ["email", "email address", "main contact email"],
    billing_email: ["billing email", "accounts email", "invoice email"],
    billing_address: ["postal address", "billing address", "postal"],
    payment_terms_days: ["payment terms", "payment terms days", "terms"],
    tier: ["pricing tier", "price tier", "tier", "pricing level"],
    notes: ["notes", "customer notes"],
  },
  sites: {
    fergus_id: ["site id", "id", "site number"],
    customer_fergus_id: ["customer id", "customer number"],
    customer_name: ["customer name", "customer", "company name"],
    site_name: ["site name", "site", "name"],
    address_line: ["address", "address line 1", "street address", "physical address", "site address", "address 1", "street"],
    suburb: ["suburb", "address line 2", "address 2"],
    city: ["city", "town", "town city"],
    postcode: ["postcode", "post code", "postal code", "zip"],
    access_notes: ["access notes", "site notes", "notes", "access"],
  },
  contacts: {
    fergus_id: ["contact id", "id"],
    customer_fergus_id: ["customer id", "customer number"],
    customer_name: ["customer name", "customer", "company name"],
    first_name: ["first name", "firstname", "given name"],
    last_name: ["last name", "surname", "lastname", "family name"],
    position: ["position", "role", "title", "job title"],
    phone: ["phone", "phone number", "work phone", "landline"],
    mobile: ["mobile", "mobile number", "cell"],
    email: ["email", "email address"],
    is_primary: ["primary", "main contact", "is primary", "primary contact"],
    gets_quotes: ["receives quotes", "quotes", "send quotes", "quote contact"],
    gets_invoices: ["receives invoices", "invoices", "send invoices", "billing contact", "accounts contact"],
    site_address: ["site", "site address"],
  },
  tier_prices: {
    tier: ["tier", "pricing tier", "price tier", "tier name"],
    code: ["item code", "code", "product code", "sku", "part number"],
    supplier: ["supplier", "supplier name", "pricebook", "price book"],
    sell_price: ["sell price", "price", "sell", "tier price", "unit price"],
    markup_pct: ["markup", "markup %", "markup percent", "mark up"],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** Which of the file's columns each field comes from (first matching name wins). */
export function matchColumns(kind: ImportKind, headers: string[]): Record<string, number> {
  const cols = headers.map(norm);
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const [field, names] of Object.entries(FIELDS[kind])) {
    for (const name of names) {
      const i = cols.findIndex((c, idx) => c === name && !used.has(idx));
      if (i !== -1) { map[field] = i; used.add(i); break; }
    }
  }
  return map;
}

export const REQUIRED: Record<ImportKind, string[][]> = {
  customers: [["name", "first_name", "last_name"]],
  sites: [["customer_fergus_id", "customer_name"], ["address_line"]],
  contacts: [["customer_fergus_id", "customer_name"], ["first_name", "last_name"]],
  tier_prices: [["tier"], ["code"], ["sell_price", "markup_pct"]],
};

/** Fields that must be found (one of each group) before importing. */
export function missingFields(kind: ImportKind, map: Record<string, number>): string[] {
  return REQUIRED[kind].filter((group) => !group.some((f) => f in map)).map((g) => g.join(" or "));
}

export type Parsed = { kind: ImportKind; headers: string[]; map: Record<string, number>; rows: Record<string, string>[]; missing: string[] };

/** A whole CSV export → the rows the engine expects (empty cells left out). */
export function readFergusCsv(kind: ImportKind, text: string): Parsed {
  const all = parseCsv(text);
  const headers = all[0] ?? [];
  const map = matchColumns(kind, headers);
  const rows = all.slice(1).map((cells) => {
    const r: Record<string, string> = {};
    for (const [field, i] of Object.entries(map)) {
      const v = (cells[i] ?? "").trim();
      if (v) r[field] = v;
    }
    return r;
  }).filter((r) => Object.keys(r).length > 0);
  return { kind, headers, map, rows, missing: missingFields(kind, map) };
}

/** Guess the kind of export from its columns (the office can change it). */
export function guessKind(headers: string[]): ImportKind {
  const cols = headers.map(norm);
  const has = (...names: string[]) => names.some((n) => cols.includes(n));
  if (has("tier", "pricing tier", "price tier", "tier name") && has("item code", "code", "product code", "sku")) return "tier_prices";
  if (has("site id", "site name", "site address")) return "sites";
  if (has("contact id", "position", "job title") || (has("first name") && has("customer id", "customer name") && !has("pricing tier", "customer type"))) return "contacts";
  return "customers";
}
