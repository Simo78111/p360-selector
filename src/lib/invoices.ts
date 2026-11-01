import "server-only";
// Job management Phase 3d: invoices for managed jobs (engine migration 20261101000400_jm_invoices). Every office call
// passes the signed-in staff member's id; the database checks the person is owner/admin or office manager of the
// invoice's company, needs "Can approve invoices" to approve, and leaves cost prices out for people without
// "see costs". The PDF is always built from the customer's copy (no costs).
import { engine } from "./engine";
import type { OfficeSession } from "./auth";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession) => s.staffId; // null = owner backup password

export type InvoiceKind = "charge_up" | "progress" | "claim" | "deposit" | "manual";
export type InvoiceStatus = "draft" | "approved" | "void" | "discarded";
export type XeroStatus = "not_yet" | "to_send" | "sent" | "failed" | "test";
export type LineKind = "labour" | "materials" | "vehicle" | "contract" | "variation" | "deposit" | "retention" | "other";

export const KIND_LABEL: Record<InvoiceKind, string> = {
  charge_up: "Charge-up", progress: "Progress claim", claim: "Payment claim", deposit: "Deposit", manual: "Invoice",
};
export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "To be approved", approved: "Invoiced", void: "Void", discarded: "Thrown away",
};
export const XERO_LABEL: Record<XeroStatus, string> = {
  not_yet: "", to_send: "Waiting to go to Xero", sent: "In Xero", failed: "Xero refused it", test: "Test site: not sent to Xero",
};

export type InvoiceLine = {
  id: string; position: number; heading: string | null; kind: LineKind;
  auto_role: "retention_withheld" | "retention_released" | "deposit_less" | null;
  description: string; note: string | null; quantity: number; unit: string | null; unit_price: number; total: number;
  account_code: string; quote_section_id: string | null; variation_job_id: string | null; approved_variation: boolean | null;
  contract_value: number | null; prev_to_date: number | null; to_date: number | null; certified_to_date: number | null;
  pct_to_date: number | null; pct_prev: number | null; deducts_number: string | null; sources: number;
  unit_cost?: number | null; cost_total?: number | null;
};
export type SummaryRow = { value: number; prev: number; to_date: number; cert: number };
export type Invoice = {
  id: string; kind: InvoiceKind; status: InvoiceStatus; is_final: boolean; number: string; invoice_number: string | null;
  claim_no: number | null; layout: "invoice" | "claim"; invoice_date: string; due_date: string | null;
  period_from: string | null; period_to: string | null; heading: string | null; reference: string | null; note: string | null;
  footer: string | null; attachments: { id: string; file_name: string; mime_type: string | null; path: string }[];
  with_breakdown: boolean; subtotal: number; gst: number; total: number; retention_withheld: number;
  retention_released: number; work_value: number; amount_paid: number; certified_total: number | null;
  certified_at: string | null; certified_ref: string | null; certified_note: string | null; certified_by_name: string | null;
  emailed_at: string | null; sent_to: string[] | null; sent_count: number; xero_status: XeroStatus; xero_error: string | null;
  void_reason: string | null; created_at: string; created_by_name: string | null; approved_at: string | null;
  approved_by_name: string | null; voided_at: string | null; voided_by_name: string | null;
  lines: InvoiceLine[];
  summary: { A: SummaryRow | null; B: SummaryRow | null; D: SummaryRow | null; retention_prev: number; retention_this: number;
             released_prev: number; released_this: number } | null;
  job_id: string; job_ref: string; job_title: string | null; top_job_id: string; top_job_ref: string;
  phase_id: string | null; phase_ref: string | null; phase_name: string | null;
  company: { id: string; code: string; name: string; legal_name: string; phone: string | null; email: string | null;
             address_line: string | null; suburb: string | null; city: string | null; postcode: string | null; gst_number: string | null };
  customer: { id: string; name: string; full_name: string; billing_address: string | null; email: string | null; phone: string | null };
  contact: { name: string; email: string | null; phone: string | null } | null;
  site: { site_name: string | null; address_line: string | null; suburb: string | null; city: string | null; postcode: string | null };
  project: { name: string; contract_ref: string | null; claim_mode: boolean; retention_bands: Band[] | null;
             retention_cap: number | null; practical_completion: string | null; retention_final_date: string | null };
  cost_total?: number; margin_pct?: number | null;
};
export type OfficeInvoice = Invoice & {
  can_costs: boolean; can_approve: boolean; message?: string;
  files: { id: string; file_name: string; mime_type: string | null; job_ref: string; on: boolean }[];
  phases: { id: string; ref: string; name: string; stage: string }[];
  uninvoiced: number | null;
};
export type Band = { upto: number | null; pct: number };

export type InvoiceRow = {
  id: string; kind: InvoiceKind; status: InvoiceStatus; is_final: boolean; number: string; claim_no: number | null;
  invoice_date: string; due_date: string | null; heading: string | null; subtotal: number; total: number; work_value: number;
  amount_paid: number; retention_withheld: number; certified_total: number | null; xero_status: XeroStatus;
  emailed_at: string | null; job_id: string; job_ref: string; phase_ref: string | null; phase_name: string | null;
  company: string; customer: string; created_by_name: string | null; approved_at: string | null;
};
export type ClaimSettings = {
  top_job_id: string; top_job_ref: string; claim_mode: boolean; contract_ref: string | null; retention_bands: Band[] | null;
  claim_detail: "sections" | "lines"; claim_detail_locked: boolean;
  retention_cap: number | null; claim_day: number; pay_day: number | null; practical_completion: string | null;
  retention_final_date: string | null; next_claim_no: number; retention_held: number; retention_withheld: number;
};
export type JobInvoices = {
  invoices: InvoiceRow[];
  uninvoiced: { lines: number; charge_value: number; not_approved: number; by_phase: Record<string, number> };
  quotes: { version_id: string; number: string; phase_id: string | null; net: number; deposit: number | null;
            deposit_kind: string; deposit_value: number | null; deposit_invoice: string | null }[];
  claims: ClaimSettings; can_approve: boolean; can_costs: boolean;
};
export type PipelineTab = "to_invoice" | "draft" | "approved" | "void";
export type PhaseWaiting = {
  phase_id: string; phase_ref: string; phase_name: string; job_id: string; job_ref: string; title: string | null;
  company: string; customer: string; since: string; job_type: string | null;
};
export type Pipeline = {
  rows: (InvoiceRow | PhaseWaiting)[];
  counts: { to_invoice: number; draft: number; approved: number; void: number; xero_failed: number };
};
export type Breakdown = {
  lines: { id: string; date: string; kind: string; job_ref: string; phase_ref: string | null; phase_name: string | null;
           description: string; who: string | null; qty: number; unit: string | null; sell: number; status: string; ref: string }[];
  people: { who: string; hours: number; charge: number }[];
  labour_hours: number; labour_charge: number; materials_sell: number; period_from: string | null; period_to: string;
};
export type InvoiceSettings = { prefix: string; next_no: number; next_number: string; last_number: string | null };

export const loadJobInvoices = (s: OfficeSession, jobId: string) =>
  rpc<JobInvoices>("office_job_invoices", { p_staff_id: who(s), p_job_id: jobId });
export const loadInvoice = (s: OfficeSession, id: string) => rpc<OfficeInvoice>("office_invoice", { p_staff_id: who(s), p_invoice_id: id });
export const newInvoice = (s: OfficeSession, jobId: string, kind: InvoiceKind, opts: Record<string, unknown>) =>
  rpc<OfficeInvoice>("office_new_invoice", { p_staff_id: who(s), p_job_id: jobId, p_kind: kind, p_opts: opts });
export const saveInvoice = (s: OfficeSession, id: string, changes: Record<string, unknown>) =>
  rpc<OfficeInvoice>("office_save_invoice", { p_staff_id: who(s), p_invoice_id: id, p_changes: changes });
export const addInvoiceLine = (s: OfficeSession, id: string, line: Record<string, unknown>) =>
  rpc<OfficeInvoice>("office_add_invoice_line", { p_staff_id: who(s), p_invoice_id: id, p_line: line });
export const saveInvoiceLine = (s: OfficeSession, lineId: string, changes: Record<string, unknown>) =>
  rpc<OfficeInvoice>("office_save_invoice_line", { p_staff_id: who(s), p_line_id: lineId, p_changes: changes });
export const invoiceAction = (s: OfficeSession, id: string, action: "approve" | "discard" | "void" | "resend_xero", reason?: string | null) =>
  rpc<OfficeInvoice & { discarded?: boolean; job_id?: string }>("office_invoice_action",
    { p_staff_id: who(s), p_invoice_id: id, p_action: action, p_reason: reason ?? null });
export const certifyInvoice = (s: OfficeSession, id: string, lines: Record<string, number>, ref: string | null, note: string | null) =>
  rpc<OfficeInvoice>("office_certify_invoice", { p_staff_id: who(s), p_invoice_id: id, p_lines: lines, p_ref: ref, p_note: note });
export const invoiceSendInfo = (s: OfficeSession, id: string) =>
  rpc<{ recipients: { name: string; email: string }[]; sender: string; reply_to: string | null }>("office_invoice_send_info",
    { p_staff_id: who(s), p_invoice_id: id });
export const invoiceSent = (s: OfficeSession, id: string, to: string[]) =>
  rpc<{ ok: boolean }>("office_invoice_sent", { p_staff_id: who(s), p_invoice_id: id, p_to: to });
export const saveClaimSettings = (s: OfficeSession, jobId: string, changes: Record<string, unknown>) =>
  rpc<ClaimSettings>("office_save_claim_settings", { p_staff_id: who(s), p_job_id: jobId, p_changes: changes });
export const loadPipeline = (s: OfficeSession, tab: PipelineTab, companyId: string | null, search: string | null) =>
  rpc<Pipeline>("office_invoice_pipeline", { p_staff_id: who(s), p_tab: tab, p_company_id: companyId, p_search: search });
export const loadBreakdown = (s: OfficeSession, id: string) => rpc<Breakdown>("office_invoice_breakdown", { p_staff_id: who(s), p_invoice_id: id });
export const loadInvoiceSettings = () => rpc<InvoiceSettings>("office_invoice_settings", {});
export const saveInvoiceSettings = (s: OfficeSession, changes: Record<string, unknown>) =>
  rpc<InvoiceSettings>("office_save_invoice_settings", { p_staff_id: who(s), p_changes: changes });

// Backend only (no person): deposit invoices made on acceptance, waiting to be emailed.
export const invoicesToEmail = () => rpc<{ id: string; recipients: { name: string; email: string }[] }[]>("jm_invoices_to_email", {});
export const invoiceAutoSent = (id: string, to: string[], error: string | null) =>
  rpc<null>("jm_invoice_auto_sent", { p_invoice_id: id, p_to: to, p_error: error });
/** The customer's copy (no costs) for the PDF and email, without a person (automatic deposit emails). */
export const invoiceDoc = (id: string) => rpc<Invoice>("jm_invoice_doc", { p_invoice_id: id, p_with_costs: false });

/** Drop cost fields: the PDF is built from this even when the office person can see costs. */
export function customerCopy(i: Invoice): Invoice {
  const { cost_total: _c, margin_pct: _m, ...rest } = i;
  void _c; void _m;
  return { ...rest, lines: i.lines.map(({ unit_cost: _u, cost_total: _t, ...l }) => { void _u; void _t; return l; }) };
}

export const invoiceTitle = (i: Pick<Invoice, "kind" | "claim_no" | "number" | "status">) =>
  i.kind === "claim" ? `Payment Claim #${i.claim_no ?? ""}${i.status === "approved" ? ` (${i.number})` : ""}`
    : `${i.kind === "deposit" ? "Deposit invoice" : i.kind === "progress" ? "Progress claim" : "Tax Invoice"} ${i.status === "draft" ? "(draft)" : i.number}`;

export const invoiceFileName = (i: Pick<Invoice, "kind" | "claim_no" | "number" | "job_ref">) =>
  (i.kind === "claim" ? `Payment Claim ${i.claim_no} ${i.job_ref}${i.number !== "Draft" ? ` ${i.number}` : ""}.pdf`
    : `${i.number === "Draft" ? `Draft invoice ${i.job_ref}` : i.number}.pdf`).replace(/[^\w .#-]/g, "");

/** Lines grouped the way the PDF and the editor print them: by heading, then Labour / Materials / Other inside it. */
export function groupLines<L extends Pick<InvoiceLine, "heading" | "kind" | "position">>(lines: L[]) {
  const groups: { heading: string; parts: { kind: string; label: string; lines: L[] }[] }[] = [];
  for (const l of lines) {
    const h = l.heading ?? "";
    let g = groups.find((x) => x.heading === h);
    if (!g) groups.push((g = { heading: h, parts: [] }));
    const k = l.kind === "labour" ? "labour" : l.kind === "materials" ? "materials" : "other";
    let p = g.parts.find((x) => x.kind === k);
    if (!p) g.parts.push((p = { kind: k, label: k === "labour" ? "Labour" : k === "materials" ? "Materials" : "", lines: [] }));
    p.lines.push(l);
  }
  for (const g of groups) g.parts.sort((a, b) => ["labour", "materials", "other"].indexOf(a.kind) - ["labour", "materials", "other"].indexOf(b.kind));
  return groups;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** The hours/labour breakdown behind a claim as a CSV: charge-out and sell only, never cost. */
export function breakdownCsv(b: Breakdown): string {
  const head = ["Date", "Type", "Job", "Phase", "Description", "Who / supplier", "Qty", "Unit", "Charge / sell (excl GST)", "Reference"];
  const rows = b.lines.map((l) => [l.date, l.kind, l.job_ref, l.phase_ref ?? "", l.description, l.who ?? "", l.qty, l.unit ?? "", l.sell, l.ref]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
