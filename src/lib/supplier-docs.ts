import "server-only";
// Job management Phase 3b: supplier invoices (Reece / Chesters) reconciled to jobs, through the engine's office_*
// functions (engine repo, migration 20261101000200_jm_supplier_docs). The website reads the CSV (lib/supplier-csv.ts);
// the database matches order numbers to jobs and purchasers and keeps the invoices until someone approves them.
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
import type { SupplierDoc } from "./supplier-csv";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession | null) => s?.staffId ?? null; // null = owner backup password / the email importer

export type DocLine = {
  id: string; line_no: number; code: string | null; description: string; quantity: number; unit: string | null;
  unit_cost: number; total: number; kind: "materials" | "hire" | "freight" | "other";
  job_id: string | null; phase_id: string | null; job_label: string | null;
};
export type Doc = {
  id: string; supplier: string; type: "invoice" | "credit"; number: string; date: string; date_label: string; branch: string | null;
  order_no: string | null; receiver: string | null; job_name: string | null; subtotal: number; gst: number; total: number;
  job_id: string | null; job_ref: string | null; phase_id: string | null; phase_ref: string | null; phase_name: string | null;
  job_label: string | null; customer: string | null; company: string | null; overhead: boolean;
  purchaser_id: string | null; purchaser: string | null; purchaser_by: "initials" | "receiver" | "office" | null;
  matched_by: "order_no" | "office" | null; order: { initials?: string | null; number?: string; letter?: string | null } | null;
  status: "to_approve" | "approved" | "not_ours"; note: string | null; approved_by: string | null; approved_at: string | null;
  xero_status: "not_yet" | "off" | "to_send" | "sent" | "failed" | "test"; xero_error: string | null; lines: DocLine[];
};
export type DocList = {
  docs: Doc[];
  counts: { to_approve: number; matched: number; approved: number; not_ours: number; xero_failed: number };
  imports: { id: string; source: string; file_name: string | null; supplier: string; new: number; seen: number;
             problems: { number: string | null; why: string }[]; by: string; at: string }[];
};
export type ImportResult = { import_id: string; supplier: string; new: number; seen: number; problems: { number: string | null; why: string }[] };
export type CompanyMoney = {
  code: string; name: string; xero_tracking_category: string | null; xero_tracking_option: string | null;
  xero_send_status: "DRAFT" | "AUTHORISED"; xero_send_bills: boolean;
  acct_labour: string; acct_sales: string; acct_vehicle: string; acct_materials: string; acct_hire: string;
  acct_subcontract: string; acct_retentions: string;
};

export const loadDocs = (s: OfficeSession, status: string, search: string | null) =>
  rpc<DocList>("office_supplier_docs", { p_staff_id: who(s), p_status: status, p_search: search, p_limit: 200 });
export const importDocs = (s: OfficeSession | null, source: "upload" | "email", fileName: string, supplier: string, docs: SupplierDoc[]) =>
  rpc<ImportResult>("office_import_supplier_docs", {
    p_staff_id: who(s), p_source: source, p_file_name: fileName, p_supplier: supplier, p_docs: docs,
  });
export const setDoc = (s: OfficeSession, id: string, changes: Record<string, unknown>) =>
  rpc<Doc>("office_set_supplier_doc", { p_staff_id: who(s), p_doc_id: id, p_changes: changes });
export const setDocLine = (s: OfficeSession, lineId: string, jobId: string | null, phaseId: string | null) =>
  rpc<Doc>("office_set_supplier_line", { p_staff_id: who(s), p_line_id: lineId, p_job_id: jobId, p_phase_id: phaseId });
export const approveDoc = (s: OfficeSession, id: string) => rpc<Doc>("office_approve_supplier_doc", { p_staff_id: who(s), p_doc_id: id });
export const approveMatched = (s: OfficeSession) =>
  rpc<{ approved: number; failed: { number: string; why: string }[] }>("office_approve_matched_supplier_docs", { p_staff_id: who(s) });
export const docStatus = (s: OfficeSession, id: string, status: "to_approve" | "not_ours", note: string | null) =>
  rpc<Doc>("office_supplier_doc_status", { p_staff_id: who(s), p_doc_id: id, p_status: status, p_note: note });
export const loadCompanyMoney = () => rpc<Record<string, CompanyMoney>>("office_company_money", {});
export const saveCompanyMoney = (s: OfficeSession, companyId: string, changes: Record<string, unknown>) =>
  rpc<CompanyMoney>("office_save_company_money", { p_staff_id: who(s), p_company_id: companyId, p_changes: changes });

export const XERO_LABEL: Record<Doc["xero_status"], string> = {
  not_yet: "", off: "Not sent to Xero (switched off for this company)", to_send: "Waiting to go to Xero",
  sent: "In Xero", failed: "Xero refused it", test: "Test site: not sent to Xero",
};
