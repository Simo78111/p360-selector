import "server-only";
// The automation pieces of the booking engine: settings, quotes, supplier orders and bills,
// timesheets, plumbers off, gas certificates. All through the engine's office_* functions.
import { engine } from "./engine";

function db() {
  const client = engine();
  if (!client) throw new Error("The booking engine isn't connected. Add the ENGINE_ keys in Vercel.");
  return client;
}
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- settings ----------
export type SupplierOrdering = {
  id: string; name: string; order_email: string | null; account_number: string | null; branch: string | null;
  lead_days: number; auto_order: boolean;
};
export type Settings = {
  business_name: string; company_name: string | null; owner_email: string | null; email_mode: "test" | "live";
  site_url: string | null; sms_mode: string;
  ai_replies: "auto" | "suggest" | "off"; cancel_notice_hours: number; reschedule_days_ahead: number; callback_warranty_days: number;
  quotes_mode: "auto" | "suggest" | "off"; quote_auto_send_max: number; quote_valid_days: number; default_supplier_id: string | null;
  google_review_url: string | null; review_requests: boolean; review_delay_hours: number;
  certifier_plumber_id: string | null; certifier_name: string | null; certifier_email: string | null; certifier_reg: string | null;
  timesheet_break_min: number; timesheet_break_after_min: number;
  daily_summary: boolean; daily_summary_time: string;
  suppliers: SupplierOrdering[];
  plumbers: { id: string; name: string; is_gasfitter: boolean; gas_reg_number: string | null; certifying: boolean }[];
};
export const loadSettings = () => rpc<Settings>("office_settings");
export const saveSettings = (p: Record<string, unknown>) => rpc<Settings>("office_save_settings", { p });
export const saveSupplierOrdering = (s: Omit<SupplierOrdering, "name">) =>
  rpc<null>("office_save_supplier_ordering", {
    p_supplier_id: s.id, p_order_email: s.order_email, p_account_number: s.account_number, p_branch: s.branch,
    p_lead_days: s.lead_days, p_auto_order: s.auto_order,
  });
export const savePlumberGas = (id: string, reg: string | null, certifying: boolean) =>
  rpc<null>("office_save_plumber_gas", { p_plumber_id: id, p_gas_reg_number: reg, p_certifying: certifying });

// ---------- Needs attention: what each item points at ----------
export type AttentionRefs = Record<string, { quote_id?: string; po_id?: string; cert_id?: string }>;
export const loadAttentionRefs = () => rpc<AttentionRefs>("office_attention_refs");

// ---------- quotes ----------
export type QuoteLine = {
  id: string; description: string; quantity: number; unit_price: number; kind: string;
  needs_price: boolean; price_book_item_id: string | null;
};
export type Quote = {
  id: string; status: string; summary: string | null; note: string | null; total: number; subtotal: number;
  job_number: number; valid_until: string | null; booked_job_number: number | null; lines: QuoteLine[];
};
export const loadJobQuotes = (jobId: string) => rpc<Quote[]>("office_job_quotes", { p_job_id: jobId });
export const loadQuote = (id: string) => rpc<Quote | null>("office_quote", { p_quote_id: id });
export const sendQuote = (id: string, summary: string | null, lines: unknown[] | null) =>
  rpc<{ sent: boolean; total: number }>("office_send_quote", { p_quote_id: id, p_summary: summary, p_lines: lines });

// ---------- orders and bills ----------
export type PurchaseOrder = {
  id: string; po_number: string; supplier: string; status: string; job_number: number | null; delivery: string;
  needed_by: string | null; note: string | null; by: string; created_at: string; sent_at: string | null;
  email_status: string | null; bill_total: number | null;
  lines: { code: string | null; description: string; quantity: number; cost: number | null }[];
};
export type UnmatchedBill = { id: string; supplier: string | null; number: string | null; reference: string | null; date: string | null; total: number | null };
export type JobCosts = {
  orders: { po_number: string; supplier: string; status: string; estimate: number | null }[];
  bills: { supplier: string | null; number: string | null; date: string | null; total: number | null; matched_by: string | null }[];
  bills_total: number; invoiced: number;
};
export const loadOrders = () => rpc<PurchaseOrder[]>("office_purchase_orders", { p_limit: 100 });
export const orderPlaced = (id: string) => rpc<null>("office_order_placed", { p_po_id: id });
export const loadUnmatchedBills = () => rpc<UnmatchedBill[]>("office_unmatched_bills", { p_limit: 50 });
export const matchBill = (billId: string, jobNumber: number | null) =>
  rpc<null>("office_match_bill", { p_bill_id: billId, p_job_number: jobNumber });
export const loadJobCosts = (jobId: string) => rpc<JobCosts>("office_job_costs", { p_job_id: jobId });

// ---------- timesheets ----------
export type TimesheetDay = {
  id: string; work_date: string; status: "auto" | "confirmed" | "approved"; note: string | null;
  start: string | null; finish: string | null; start_label: string | null; finish_label: string | null;
  break_min: number; job_min: number; jobs: number; paid_min: number; hours: number; travel_min: number;
};
export type TimesheetPlumber = { plumber_id: string; plumber: string; days: TimesheetDay[]; total_hours: number };
export const loadTimesheets = (from: string, to: string) => rpc<TimesheetPlumber[]>("office_timesheets", { p_from: from, p_to: to });
export const saveTimesheet = (id: string, start: string, finish: string, breakMin: number, note: string | null) =>
  rpc<TimesheetDay>("office_save_timesheet", { p_id: id, p_start: start, p_finish: finish, p_break_min: breakMin, p_note: note });
export const approveTimesheets = (from: string, to: string, plumberId: string | null) =>
  rpc<number>("office_approve_timesheets", { p_from: from, p_to: to, p_plumber_id: plumberId });
export type TimesheetRow = {
  plumber: string; email: string | null; date: string; start: string | null; finish: string | null;
  break_min: number; hours: number; jobs: number; status: string; note: string | null;
};
export const timesheetRows = (from: string, to: string) => rpc<TimesheetRow[]>("office_timesheet_rows", { p_from: from, p_to: to });

// ---------- plumbers off ----------
export type PlumberOff = { plumber_id: string; plumber: string; date: string; reason: string; note: string | null };
export const loadPlumbersOff = (from: string, to: string) => rpc<PlumberOff[]>("office_plumbers_off", { p_from: from, p_to: to });
export const markPlumberOff = (id: string, date: string, reason: string, note: string | null) =>
  rpc<{ moved_today: number; moved_later: number; office: number }>("office_plumber_off", {
    p_plumber_id: id, p_date: date, p_reason: reason, p_note: note,
  });
export const markPlumberBack = (id: string, date: string) => rpc<null>("office_plumber_back", { p_plumber_id: id, p_date: date });

// ---------- gas certificates ----------
export type GasCertRow = {
  id: string; cert_number: string; job_number: number; status: string; risk: string; issuer: string | null;
  signed_at: string | null; eghrd_due: string | null; eghrd_done: boolean; view_token: string | null; address: string | null;
};
export const loadGasCertificates = () => rpc<GasCertRow[]>("office_gas_certificates", { p_limit: 100 });
export const resendGasCertificate = (id: string) => rpc<{ sent: boolean; to?: string }>("office_resend_gas_certificate", { p_cert_id: id });
export const eghrdDone = (id: string) => rpc<null>("office_eghrd_done", { p_cert_id: id });

export type GasCertDetails = {
  location?: string; description?: string; work_dates?: string;
  workers?: { name: string | null; reg: string | null; did: string | null }[];
  complies_5601?: boolean | null; certified_design?: boolean | null; manufacturer_instructions?: boolean | null;
  manufacturer_reference?: string | null; other_standards?: string | null; gas_type?: string | null; pressure?: string | null;
  safe_to_connect?: string | null; test_results?: string | null; not_needed_reason?: string;
};
export type GasCert = {
  cert_number: string; status: string; risk: "low" | "general" | "high"; details: GasCertDetails;
  issuer_name: string | null; issuer_reg: string | null; auth_mark: string | null; signed_name: string | null; signed_at: string | null;
  job_number: number; customer: string; business: string; company: string; signing: boolean;
};
export const gasCertByToken = (token: string) => rpc<GasCert | null>("gas_certificate_by_token", { p_token: token });
export const signGasCert = (token: string, details: GasCertDetails, risk: string, issuerName: string, issuerReg: string,
                            authMark: string, signedName: string, declaration: boolean) =>
  rpc<{ signed: boolean; view_link: string }>("sign_gas_certificate", {
    p_token: token, p_details: details, p_risk: risk, p_issuer_name: issuerName, p_issuer_reg: issuerReg,
    p_auth_mark: authMark, p_signed_name: signedName, p_declaration: declaration,
  });
export const gasCertNotNeeded = (token: string, reason: string) =>
  rpc<null>("gas_certificate_not_needed", { p_token: token, p_reason: reason });

// ---------- trend ----------
export type TouchDay = { date: string; jobs_done: number; human_touches: number; touches_per_job: number | null };
export const loadTouchTrend = (days = 30) => rpc<TouchDay[]>("office_touch_trend", { p_days: days });
