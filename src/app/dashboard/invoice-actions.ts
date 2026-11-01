"use server";
// Job management Phase 3d: invoices. One server action per form (Phase 3a rule: a second action on a button runs the
// wrong one). Each checks the person is signed in as owner/admin or office manager; the database checks the company,
// "Can approve invoices" for approving, and what can still be changed.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice, type OfficeSession } from "@/lib/auth";
import { emailEnabled, sendInvoiceEmail } from "@/lib/email";
import { buildInvoicePdf } from "@/lib/invoice-files";
import {
  addInvoiceLine, certifyInvoice, invoiceAction, invoiceSendInfo, invoiceSent, invoiceTitle, loadInvoice, newInvoice,
  saveClaimSettings, saveInvoice, saveInvoiceLine, saveInvoiceSettings, type InvoiceKind,
} from "@/lib/invoices";
import { saveCompanyMoney } from "@/lib/supplier-docs";
import { nzDay } from "@/lib/quote-pdf";
import { sendJobInvoices } from "@/lib/xero";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const num = (form: FormData, k: string) => {
  const v = text(form, k, 30).replace(/[$,\s]/g, "");
  if (v === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new Error("Enter numbers only (e.g. 1250.50).");
  return v;
};
const withMsg = (path: string, kind: "ok" | "err", msg: string) => {
  const u = new URL(path, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("err");
  u.searchParams.set(kind, msg);
  return `${u.pathname}?${u.searchParams.toString()}${u.hash}`;
};
const nzMoney = (n: number) => `$${Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const invoicePage = async (jobRef: string, id: string) => `/dashboard/office/job/${encodeURIComponent(jobRef)}/invoice/${id}`;

/** Runs fn and goes back to `back` (or where fn says) with its message, or with the error. */
async function run(form: FormData, fn: (s: OfficeSession) => Promise<string | { go: string; message: string }>) {
  const back = text(form, "back", 400);
  let target = back.startsWith("/dashboard/office") ? back : "/dashboard/office/invoices";
  try {
    const s = await assertOffice("staff");
    const r = await fn(s);
    if (typeof r === "string") target = withMsg(target, "ok", r);
    else target = withMsg(r.go, "ok", r.message);
  } catch (e) {
    target = withMsg(target, "err", e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/dashboard/office/invoices");
  redirect(target);
}

/** After approving: Xero now (on the test site it's marked "not sent"). */
async function pushToXero() {
  try {
    const r = await sendJobInvoices();
    if (r.failed.length) return ` Xero refused ${r.failed.map((f) => `${f.number} (${f.error})`).join(", ")}.`;
    if (r.sent) return ` Sent to Xero.`;
    if (r.test) return ` Test site: not sent to Xero.`;
    return "";
  } catch (e) {
    return ` Not sent to Xero yet: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── Starting an invoice ─────────────────────────────────────────────────────────────────────────────────
export async function newInvoiceAction(form: FormData) {
  await run(form, async (s) => {
    const jobId = text(form, "job_id", 40);
    const kind = text(form, "kind", 20) as InvoiceKind;
    if (!isId(jobId)) throw new Error("Which job?");
    const opts: Record<string, unknown> = {};
    const phase = text(form, "phase_id", 40);
    if (isId(phase)) opts.phase_id = phase;
    if (kind === "charge_up") opts.pending = form.get("pending") !== "approved";
    if (kind === "deposit") {
      const v = text(form, "quote_version_id", 40);
      if (isId(v)) opts.quote_version_id = v;
      const amt = num(form, "amount");
      if (amt !== null) opts.amount = amt;
    }
    const i = await newInvoice(s, jobId, kind, opts);
    return { go: await invoicePage(i.job_ref, i.id), message: `${i.kind === "claim" ? `Payment claim #${i.claim_no}` : "Draft invoice"} started.` };
  });
}

// ── Editing a draft ─────────────────────────────────────────────────────────────────────────────────────
export async function saveInvoiceAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Which invoice?");
    const changes: Record<string, unknown> = {};
    for (const k of ["invoice_date", "due_date", "period_from", "period_to"]) if (form.has(k)) changes[k] = text(form, k, 10);
    for (const k of ["heading", "reference"]) if (form.has(k)) changes[k] = text(form, k, 200);
    for (const k of ["note", "footer"]) if (form.has(k)) changes[k] = text(form, k, 5000);
    if (form.has("is_final_shown")) changes.is_final = form.get("is_final") === "on";
    await saveInvoice(s, id, changes);
    return "Saved.";
  });
}

export async function saveInvoiceFilesAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Which invoice?");
    const files = form.getAll("file").map(String).filter(isId);
    await saveInvoice(s, id, { attachments: files, with_breakdown: form.get("with_breakdown") === "on" });
    return `Saved: ${files.length} file${files.length === 1 ? "" : "s"} attached${form.get("with_breakdown") === "on" ? " and the hours breakdown" : ""}.`;
  });
}

export async function addInvoiceLineAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Which invoice?");
    const kind = text(form, "kind", 20);
    if (kind === "costs") {
      await addInvoiceLine(s, id, { kind: "costs", pending: form.get("pending") !== "approved" });
      return "Costs not yet invoiced added.";
    }
    await addInvoiceLine(s, id, {
      kind, heading: text(form, "heading"), description: text(form, "description", 500), note: text(form, "note", 2000),
      quantity: num(form, "quantity") ?? "1", unit: text(form, "unit", 20), unit_price: num(form, "unit_price") ?? "0",
      unit_cost: num(form, "unit_cost"),
    });
    return "Line added.";
  });
}

export async function saveInvoiceLineAction(form: FormData) {
  await run(form, async (s) => {
    const line = text(form, "line_id", 40);
    if (!isId(line)) throw new Error("Which line?");
    const changes: Record<string, unknown> = {};
    if (form.get("progress") === "1") {
      const by = text(form, "by", 20);
      const v = num(form, "amount");
      if (v !== null && ["pct", "this_claim", "to_date"].includes(by)) changes[by] = v;
      const cv = num(form, "contract_value");
      if (cv !== null) changes.contract_value = cv;
      if (form.has("note")) changes.note = text(form, "note", 2000);
    } else {
      for (const k of ["description"]) if (form.has(k)) changes[k] = text(form, k, 500);
      if (form.has("note")) changes.note = text(form, "note", 2000);
      for (const k of ["quantity", "unit_price"]) {
        const v = num(form, k);
        if (v !== null) changes[k] = v;
      }
      if (form.has("unit_cost")) changes.unit_cost = num(form, "unit_cost") ?? "";
      if (form.has("account_code") && text(form, "account_code", 10)) changes.account_code = text(form, "account_code", 10);
    }
    await saveInvoiceLine(s, line, changes);
    return "Line saved.";
  });
}

export async function removeInvoiceLineAction(form: FormData) {
  await run(form, async (s) => {
    const line = text(form, "line_id", 40);
    if (!isId(line)) throw new Error("Which line?");
    await saveInvoiceLine(s, line, { remove: true });
    return "Line removed. Its costs are free to invoice again.";
  });
}

// ── Approve, throw away, void, Xero again ──────────────────────────────────────────────────────────────
export async function invoiceStatusAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    const action = text(form, "action", 20) as "approve" | "discard" | "void" | "resend_xero";
    if (!isId(id) || !["approve", "discard", "void", "resend_xero"].includes(action)) throw new Error("Which invoice?");
    const r = await invoiceAction(s, id, action, text(form, "reason", 500) || null);
    if (action === "discard") {
      const ref = text(form, "job_ref", 40);
      return { go: `/dashboard/office/job/${encodeURIComponent(ref)}?tab=invoices`, message: "Draft thrown away." };
    }
    if (action === "approve" || action === "resend_xero") return `${(r.message ?? "Done").replace(/\.?$/, ".")}${await pushToXero()}`;
    return r.message ?? "Done.";
  });
}

// ── The head contractor's payment certificate ──────────────────────────────────────────────────────────
export async function certifyInvoiceAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Which claim?");
    const lines: Record<string, number> = {};
    for (const [k] of form.entries()) {
      if (!k.startsWith("cert_")) continue;
      const v = num(form, k);
      if (v !== null && isId(k.slice(5))) lines[k.slice(5)] = Number(v);
    }
    const r = await certifyInvoice(s, id, lines, text(form, "ref", 100) || null, text(form, "note", 2000) || null);
    return `Certificate recorded: ${nzMoney(r.certified_total ?? 0)} certified this period.`;
  });
}

// ── Email ───────────────────────────────────────────────────────────────────────────────────────────────
export async function emailInvoiceAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Which invoice?");
    if (!emailEnabled()) throw new Error("Email isn't set up yet: add RESEND_API_KEY (and EMAIL_FROM) in Vercel.");
    const info = await invoiceSendInfo(s, id);
    const picked = form.getAll("to").map(String);
    const to = info.recipients.filter((r) => picked.includes(r.email));
    const extra = text(form, "extra", 200);
    if (extra) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extra)) throw new Error("That extra email address doesn't look right.");
      to.push({ name: extra, email: extra });
    }
    if (!to.length) throw new Error("Tick at least one person to send it to.");
    const i = await loadInvoice(s, id);
    if (i.status !== "approved") throw new Error("Approve the invoice before sending it.");
    const { pdf, name, skipped } = await buildInvoicePdf(s, id);
    for (const r of to) {
      await sendInvoiceEmail({
        to: r.email, toName: r.name, companyName: i.company.name, title: invoiceTitle(i), heading: i.heading,
        total: nzMoney(i.total), dueDate: nzDay(i.due_date), message: text(form, "message", 2000), sender: info.sender,
        replyTo: info.reply_to, pdf: { filename: name, data: pdf },
      });
    }
    await invoiceSent(s, id, to.map((r) => r.email));
    return `Emailed to ${to.map((r) => r.email).join(", ")}.${skipped.length ? ` Not added to the PDF: ${skipped.join(", ")}.` : ""}`;
  });
}

// ── Payment claim settings on the job ──────────────────────────────────────────────────────────────────
export async function saveClaimSettingsAction(form: FormData) {
  await run(form, async (s) => {
    const jobId = text(form, "job_id", 40);
    if (!isId(jobId)) throw new Error("Which job?");
    const bands: { upto: number | null; pct: number }[] = [];
    for (let n = 0; n < 6; n++) {
      const p = num(form, `band_pct_${n}`);
      if (p === null) continue;
      const up = num(form, `band_upto_${n}`);
      bands.push({ upto: up === null ? null : Number(up), pct: Number(p) });
    }
    await saveClaimSettings(s, jobId, {
      claim_mode: form.get("claim_mode") === "on",
      contract_ref: text(form, "contract_ref", 100),
      retention_bands: bands,
      retention_cap: num(form, "retention_cap") ?? "",
      claim_day: text(form, "claim_day", 2) || "20",
      pay_day: text(form, "pay_day", 2),
      practical_completion: text(form, "practical_completion", 10),
      retention_final_date: text(form, "retention_final_date", 10),
    });
    return "Payment claim settings saved.";
  });
}

// ── Companies: numbering, footer, due dates (owner/admin) ──────────────────────────────────────────────
export async function saveInvoiceNumberingAction(form: FormData) {
  await run(form, async (s) => {
    const changes: Record<string, unknown> = { prefix: text(form, "prefix", 10) };
    const n = text(form, "next_no", 9);
    if (n) changes.next_no = n;
    const r = await saveInvoiceSettings(s, changes);
    return `Saved. The next invoice will be ${r.next_number}.`;
  });
}

export async function saveCompanyInvoiceAction(form: FormData) {
  await run(form, async (s) => {
    const id = text(form, "company_id", 40);
    if (!isId(id)) throw new Error("Which company?");
    await saveCompanyMoney(s, id, {
      invoice_footer: text(form, "invoice_footer", 5000),
      invoice_due_kind: text(form, "invoice_due_kind", 20) === "next_month_20th" ? "next_month_20th" : "days",
      invoice_due_days: text(form, "invoice_due_days", 3) || "7",
    });
    return "Invoice settings saved.";
  });
}
