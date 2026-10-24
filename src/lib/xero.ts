import "server-only";
// Xero: connect (OAuth), send invoices, and bring payments back.
// Needs XERO_CLIENT_ID and XERO_CLIENT_SECRET (a Xero "web app" from developer.xero.com)
// plus the engine keys. The engine keeps the connection and decides what to send
// (see the engine repo, migration xero_sync); this file does the talking to Xero.
import { engine } from "./engine";

const LOGIN = process.env.XERO_LOGIN_BASE ?? "https://login.xero.com";
const IDENTITY = process.env.XERO_IDENTITY_BASE ?? "https://identity.xero.com";
const API = process.env.XERO_API_BASE ?? "https://api.xero.com";

// Apps created since March 2026 use Xero's narrower permissions
export const XERO_SCOPES = [
  "offline_access",
  "accounting.invoices",
  "accounting.payments.read",
  "accounting.contacts",
  "accounting.settings.read",
].join(" ");

export const xeroConfigured = () => Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && engine());

export class XeroError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Won't fix itself by retrying (bad data, permissions) */
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

function db() {
  const client = engine();
  if (!client) throw new Error("The booking engine isn't connected.");
  return client;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Connecting ────────────────────────────────────────────────────────────

/** The address Xero sends people back to. Must match the Redirect URI in the Xero app exactly. */
export function callbackUrl(origin: string) {
  return `${(process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/+$/, "")}/api/xero/callback`;
}

export function authorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: XERO_SCOPES,
    state,
  });
  return `${LOGIN}/identity/connect/authorize?${q}`;
}

type TokenSet = { access_token: string; refresh_token: string; expires_in: number; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${IDENTITY}/connect/token`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new XeroError(`Xero sign-in failed (${res.status}): ${text.slice(0, 200)}`, res.status, res.status === 400);
  }
  return (await res.json()) as TokenSet;
}

const expiresAt = (t: TokenSet) => new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();

export type XeroTenant = { tenantId: string; tenantName: string; tenantType: string };

async function connections(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(`${API}/connections`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new XeroError(`Couldn't list Xero organisations (${res.status})`, res.status, false);
  return ((await res.json()) as XeroTenant[]).filter((t) => t.tenantType === "ORGANISATION");
}

/** After Xero sends the person back: swap the code for tokens and save the organisation. */
export async function completeConnection(code: string, redirectUri: string, siteUrl: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const tenants = await connections(t.access_token);
  if (tenants.length === 0) throw new Error("No Xero organisation was chosen. Try again and tick an organisation.");
  // The most recently connected; the Xero page can switch to another
  const tenant = tenants[tenants.length - 1];
  await rpc("xero_connect", {
    p_tenant_id: tenant.tenantId,
    p_tenant_name: tenant.tenantName,
    p_access_token: t.access_token,
    p_access_expires_at: expiresAt(t),
    p_refresh_token: t.refresh_token,
    p_scopes: t.scope ?? XERO_SCOPES,
    p_site_url: siteUrl,
  });
  return { tenant, others: tenants.filter((x) => x.tenantId !== tenant.tenantId) };
}

/** Every organisation this connection can see (to switch between, e.g. Demo Company and the real one). */
export async function listTenants() {
  const { token } = await accessToken();
  return connections(token);
}

export async function chooseTenant(tenantId: string) {
  const tenants = await listTenants();
  const t = tenants.find((x) => x.tenantId === tenantId);
  if (!t) throw new Error("That organisation isn't connected.");
  const tok = await rpc<Tokens>("xero_tokens");
  await rpc("xero_connect", {
    p_tenant_id: t.tenantId,
    p_tenant_name: t.tenantName,
    p_access_token: tok.access_token,
    p_access_expires_at: tok.access_expires_at,
    p_refresh_token: tok.refresh_token,
    p_scopes: null,
    p_site_url: null,
  });
  return t;
}

// ── Calling Xero ──────────────────────────────────────────────────────────

type Tokens = { tenant_id: string | null; access_token: string | null; access_expires_at: string | null; refresh_token: string | null };

async function accessToken(force = false): Promise<{ token: string; tenant: string }> {
  const t = await rpc<Tokens>("xero_tokens");
  if (!t.tenant_id || !t.refresh_token) throw new XeroError("Xero isn't connected.", 401, true);
  const fresh = t.access_token && t.access_expires_at && new Date(t.access_expires_at).getTime() > Date.now() + 60_000;
  if (fresh && !force) return { token: t.access_token!, tenant: t.tenant_id };
  // Xero gives a new refresh token every time: save it straight away
  const n = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  await rpc("xero_save_tokens", {
    p_access_token: n.access_token,
    p_access_expires_at: expiresAt(n),
    p_refresh_token: n.refresh_token,
    p_scopes: n.scope ?? null,
  });
  return { token: n.access_token, tenant: t.tenant_id };
}

type XeroValidation = { Elements?: { ValidationErrors?: { Message: string }[] }[]; Message?: string; Detail?: string };

async function xero<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token, tenant } = await accessToken(attempt > 0);
    const res = await fetch(`${API}/api.xro/2.0${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "xero-tenant-id": tenant,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) continue; // token went stale: refresh once
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as XeroValidation;
      const errors = j.Elements?.flatMap((e) => e.ValidationErrors ?? []).map((e) => e.Message) ?? [];
      message = errors.length ? errors.join("; ") : (j.Detail ?? j.Message ?? message);
    } catch {}
    // 400 = Xero didn't accept the data; 403 = no permission. Retrying won't help.
    throw new XeroError(`Xero ${res.status}: ${message}`, res.status, res.status === 400 || res.status === 403);
  }
  throw new XeroError("Xero rejected the sign-in twice. Reconnect Xero.", 401, true);
}

// ── Contacts ──────────────────────────────────────────────────────────────

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  xero_contact_id: string | null;
  address: string;
  suburb: string | null;
  postcode: string | null;
};
type Contact = { ContactID: string; Name: string; ContactNumber?: string };

/** "+64211234567" → "021 123 4567" for Xero and names */
const localPhone = (p: string) => p.replace(/^\+64/, "0");

async function contactFor(c: Customer): Promise<string> {
  if (c.xero_contact_id) return c.xero_contact_id;
  // Found before? We put our customer id in Xero's ContactNumber
  const found = await xero<{ Contacts: Contact[] }>(
    "GET",
    `/Contacts?where=${encodeURIComponent(`ContactNumber=="${c.id}"`)}`,
  );
  if (found.Contacts?.[0]) return found.Contacts[0].ContactID;

  const [first, ...rest] = c.name.trim().split(/\s+/);
  const contact = (name: string) => ({
    Name: name,
    ContactNumber: c.id,
    FirstName: first,
    LastName: rest.join(" ") || undefined,
    EmailAddress: c.email || undefined,
    Phones: [{ PhoneType: "MOBILE", PhoneNumber: localPhone(c.phone) }],
    Addresses: [
      {
        AddressType: "STREET",
        AddressLine1: c.address,
        City: c.suburb ?? undefined,
        PostalCode: c.postcode ?? undefined,
        Country: "New Zealand",
      },
    ],
  });
  try {
    const made = await xero<{ Contacts: Contact[] }>("POST", "/Contacts", { Contacts: [contact(c.name)] });
    return made.Contacts[0].ContactID;
  } catch (err) {
    // Xero names must be unique: two "John Smith"s get the phone number added
    if (err instanceof XeroError && /already (been )?assigned|already exists/i.test(err.message)) {
      const made = await xero<{ Contacts: Contact[] }>("POST", "/Contacts", {
        Contacts: [contact(`${c.name} (${localPhone(c.phone)})`)],
      });
      return made.Contacts[0].ContactID;
    }
    throw err;
  }
}

// ── Invoices ──────────────────────────────────────────────────────────────

export type PendingInvoice = {
  invoice_id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  reference: string;
  total: number;
  customer: Customer;
  lines: { description: string; quantity: number; unit_price: number }[];
  account_code: string;
  tracking_name: string | null;
  tracking_option: string | null;
};
type XeroInvoice = { InvoiceID: string; InvoiceNumber: string; Total: number; AmountPaid: number; Status: string };

async function sendInvoice(inv: PendingInvoice) {
  const contactId = await contactFor(inv.customer);

  // Sent before (e.g. we crashed before saving the answer)? Use that one.
  const existing = await xero<{ Invoices: XeroInvoice[] }>(
    "GET",
    `/Invoices?InvoiceNumbers=${encodeURIComponent(inv.invoice_number)}&Statuses=AUTHORISED,PAID,SUBMITTED,DRAFT`,
  );
  let xi = existing.Invoices?.[0];
  if (!xi) {
    const tracking =
      inv.tracking_name && inv.tracking_option ? [{ Name: inv.tracking_name, Option: inv.tracking_option }] : undefined;
    const made = await xero<{ Invoices: XeroInvoice[] }>(
      "POST",
      "/Invoices",
      {
        Invoices: [
          {
            Type: "ACCREC",
            Contact: { ContactID: contactId },
            InvoiceNumber: inv.invoice_number,
            Reference: inv.reference,
            Date: inv.date,
            DueDate: inv.due_date,
            LineAmountTypes: "Exclusive", // our prices are excl GST; Xero adds GST from the account's tax rate
            Status: "AUTHORISED",
            LineItems: inv.lines.map((l) => ({
              Description: l.description,
              Quantity: Number(l.quantity),
              UnitAmount: Number(l.unit_price),
              AccountCode: inv.account_code,
              Tracking: tracking,
            })),
          },
        ],
      },
      { "Idempotency-Key": `invoice-${inv.invoice_id}` },
    );
    xi = made.Invoices[0];
  }

  const online = await xero<{ OnlineInvoices: { OnlineInvoiceUrl: string }[] }>(
    "GET",
    `/Invoices/${xi.InvoiceID}/OnlineInvoice`,
  ).catch(() => null); // no link is fine: the text goes without one

  return {
    xeroInvoiceId: xi.InvoiceID,
    contactId,
    url: online?.OnlineInvoices?.[0]?.OnlineInvoiceUrl ?? null,
    total: Number(xi.Total),
  };
}

// ── The sync run ──────────────────────────────────────────────────────────

export type SyncResult = { sent: string[]; failed: { invoice: string; error: string }[]; paid: number; checked: number };

/** Sends waiting invoices, then (when due) checks Xero for payments. */
export async function runXeroSync(opts: { push?: boolean; poll?: boolean } = {}): Promise<SyncResult> {
  const due = await rpc<{ push: boolean; poll: boolean }>("xero_work_due");
  const result: SyncResult = { sent: [], failed: [], paid: 0, checked: 0 };

  if (opts.push ?? due.push) {
    const pending = await rpc<PendingInvoice[]>("xero_pending_invoices", { p_limit: 20 });
    for (const inv of pending) {
      try {
        const r = await sendInvoice(inv);
        await rpc("xero_mark_pushed", {
          p_invoice_id: inv.invoice_id,
          p_xero_invoice_id: r.xeroInvoiceId,
          p_xero_contact_id: r.contactId,
          p_online_url: r.url,
          p_xero_total: r.total,
        });
        result.sent.push(inv.invoice_number);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const permanent = err instanceof XeroError && err.permanent;
        await rpc("xero_mark_failed", { p_invoice_id: inv.invoice_id, p_error: message, p_permanent: permanent });
        result.failed.push({ invoice: inv.invoice_number, error: message });
        // Signed out or no permission: no point trying the rest
        if (err instanceof XeroError && (err.status === 401 || err.status === 403)) break;
        // Rate limited: stop for now, the next nudge carries on
        if (err instanceof XeroError && err.status === 429) break;
      }
    }
  }

  if (opts.poll ?? due.poll) {
    const unpaid = await rpc<{ invoice_id: string; xero_invoice_id: string; amount_paid: number }[]>("xero_unpaid_invoices");
    for (let i = 0; i < unpaid.length; i += 50) {
      const batch = unpaid.slice(i, i + 50);
      const r = await xero<{ Invoices: XeroInvoice[] }>(
        "GET",
        `/Invoices?IDs=${batch.map((b) => b.xero_invoice_id).join(",")}`,
      );
      for (const xi of r.Invoices ?? []) {
        const ours = batch.find((b) => b.xero_invoice_id === xi.InvoiceID);
        if (!ours) continue;
        result.checked++;
        if (Number(xi.AmountPaid) > Number(ours.amount_paid)) {
          await rpc("xero_apply_paid", { p_invoice_id: ours.invoice_id, p_xero_amount_paid: Number(xi.AmountPaid) });
          result.paid++;
        }
      }
    }
    await rpc("xero_mark_polled");
  }
  return result;
}

// ── For the settings page ─────────────────────────────────────────────────

export async function salesAccounts() {
  const r = await xero<{ Accounts: { Code: string; Name: string; Type: string; Status: string }[] }>(
    "GET",
    `/Accounts?where=${encodeURIComponent('Status=="ACTIVE"&&(Type=="REVENUE"||Type=="SALES")')}`,
  );
  return (r.Accounts ?? []).filter((a) => a.Code).map((a) => ({ code: a.Code, name: a.Name }));
}

export async function trackingCategories() {
  const r = await xero<{
    TrackingCategories: { Name: string; Status: string; Options: { Name: string; Status: string }[] }[];
  }>("GET", "/TrackingCategories");
  return (r.TrackingCategories ?? [])
    .filter((t) => t.Status === "ACTIVE")
    .map((t) => ({ name: t.Name, options: t.Options.filter((o) => o.Status === "ACTIVE").map((o) => o.Name) }));
}
