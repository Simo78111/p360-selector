/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// A small stand-in for Xero's API, for testing the Xero link locally.
//   node tests/mocks/fake-xero.cjs   (port 3950)
// Point the site at it: XERO_LOGIN_BASE/XERO_IDENTITY_BASE/XERO_API_BASE=http://localhost:3950
// Test helpers: POST /_pay {"number":"AMP-00001","amount":50}, GET /_state
const http = require("http");
const crypto = require("crypto");

const TENANT = { tenantId: "demo-tenant-1", tenantName: "Demo Company (NZ)", tenantType: "ORGANISATION" };
let access = null;
let refresh = null;
let refreshes = 0;
const contacts = [];
const invoices = [];
const requests = [];

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const validation = (res, message) =>
  json(res, 400, { Type: "ValidationException", Message: "A validation exception occurred", Elements: [{ ValidationErrors: [{ Message: message }] }] });
const id = () => crypto.randomUUID();
const tokens = () => {
  access = "acc-" + id();
  refresh = "ref-" + id();
  return { access_token: access, refresh_token: refresh, expires_in: 1800, token_type: "Bearer", scope: "offline_access accounting.invoices" };
};
const round2 = (n) => Math.round(n * 100) / 100;

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const p = url.pathname;
      requests.push(`${req.method} ${p}${url.search}`);

      // ── sign-in ──
      if (p === "/identity/connect/authorize") {
        const back = new URL(url.searchParams.get("redirect_uri"));
        back.searchParams.set("code", "code-123");
        back.searchParams.set("state", url.searchParams.get("state"));
        res.writeHead(302, { Location: back.toString() });
        return res.end();
      }
      if (p === "/connect/token" && req.method === "POST") {
        const f = new URLSearchParams(raw);
        if (!/^Basic /.test(req.headers.authorization || "")) return json(res, 401, { error: "invalid_client" });
        if (f.get("grant_type") === "authorization_code" && f.get("code") === "code-123") return json(res, 200, tokens());
        if (f.get("grant_type") === "refresh_token" && f.get("refresh_token") === refresh) {
          refreshes++;
          return json(res, 200, tokens());
        }
        return json(res, 400, { error: "invalid_grant" });
      }
      if (p === "/connections") {
        if (req.headers.authorization !== `Bearer ${access}`) return json(res, 401, {});
        return json(res, 200, [TENANT]);
      }

      // ── test helpers ──
      if (p === "/_state") return json(res, 200, { contacts, invoices, refreshes, requests: requests.slice(-40) });
      if (p === "/_pay") {
        const b = JSON.parse(raw);
        const inv = invoices.find((i) => i.InvoiceNumber === b.number);
        inv.AmountPaid = round2(inv.AmountPaid + b.amount);
        inv.AmountDue = round2(inv.Total - inv.AmountPaid);
        if (inv.AmountDue <= 0) inv.Status = "PAID";
        return json(res, 200, inv);
      }
      if (p === "/_expire") { access = "expired"; return json(res, 200, {}); }

      // ── Accounting API ──
      if (!p.startsWith("/api.xro/2.0/")) return json(res, 404, {});
      if (req.headers.authorization !== `Bearer ${access}`) return json(res, 401, { Title: "Unauthorized" });
      if (req.headers["xero-tenant-id"] !== TENANT.tenantId) return json(res, 403, { Title: "Forbidden" });
      const path = p.slice("/api.xro/2.0".length);
      const body = raw ? JSON.parse(raw) : null;

      if (path === "/Accounts")
        return json(res, 200, { Accounts: [{ Code: "200", Name: "Sales", Type: "REVENUE", Status: "ACTIVE" }, { Code: "260", Name: "Other Revenue", Type: "REVENUE", Status: "ACTIVE" }] });
      if (path === "/TrackingCategories")
        return json(res, 200, { TrackingCategories: [{ Name: "Region", Status: "ACTIVE", Options: [{ Name: "North", Status: "ACTIVE" }, { Name: "South", Status: "ACTIVE" }] }] });

      if (path === "/Contacts" && req.method === "GET") {
        const m = /ContactNumber=="([^"]+)"/.exec(url.searchParams.get("where") || "");
        return json(res, 200, { Contacts: contacts.filter((c) => m && c.ContactNumber === m[1]) });
      }
      if (path === "/Contacts" && req.method === "POST") {
        const c = body.Contacts[0];
        if (contacts.some((x) => x.Name === c.Name)) return validation(res, `The contact name ${c.Name} is already assigned to another contact. The contact name must be unique across all active contacts.`);
        const made = { ...c, ContactID: id() };
        contacts.push(made);
        return json(res, 200, { Contacts: [made] });
      }

      if (path === "/Invoices" && req.method === "GET") {
        const nums = (url.searchParams.get("InvoiceNumbers") || "").split(",").filter(Boolean);
        const ids = (url.searchParams.get("IDs") || "").split(",").filter(Boolean);
        return json(res, 200, { Invoices: invoices.filter((i) => nums.includes(i.InvoiceNumber) || ids.includes(i.InvoiceID)) });
      }
      if (path === "/Invoices" && req.method === "POST") {
        const inv = body.Invoices[0];
        if (!contacts.some((c) => c.ContactID === inv.Contact.ContactID)) return validation(res, "Contact not found");
        for (const l of inv.LineItems) {
          if (!["200", "260"].includes(l.AccountCode)) return validation(res, `Account code '${l.AccountCode}' is not a valid code for this document.`);
          for (const t of l.Tracking || []) if (t.Name !== "Region" || !["North", "South"].includes(t.Option)) return validation(res, `Tracking option ${t.Option} is not valid`);
        }
        // GST 15% per line, rounded per line, like Xero
        const sub = round2(inv.LineItems.reduce((s, l) => s + round2(l.Quantity * l.UnitAmount), 0));
        const tax = round2(inv.LineItems.reduce((s, l) => s + round2(round2(l.Quantity * l.UnitAmount) * 0.15), 0));
        const made = { ...inv, InvoiceID: id(), SubTotal: sub, TotalTax: tax, Total: round2(sub + tax), AmountPaid: 0, AmountDue: round2(sub + tax) };
        invoices.push(made);
        return json(res, 200, { Invoices: [made] });
      }
      const online = /^\/Invoices\/([^/]+)\/OnlineInvoice$/.exec(path);
      if (online) return json(res, 200, { OnlineInvoices: [{ OnlineInvoiceUrl: `https://in.xero.com/fake/${online[1].slice(0, 8)}` }] });
      return json(res, 404, { Message: `No fake for ${req.method} ${path}` });
    });
  })
  .listen(3950, () => console.log("fake Xero on :3950"));
