import "server-only";
// Phase 3e: reports and the Today to-do counts (engine migration 20261101000600_jm_reports). Every call passes the
// signed-in staff member's id; the database only reports on companies where the person is owner/admin or office
// manager, needs "Can see costs and margins" for job profitability, and leaves costs out for people without it.
// All money is excl GST. Gross profit only: overheads live in Xero.
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

export type ReportCompany = { id: string; code: string; name: string };

// ── Today ────────────────────────────────────────────────────────────────────
export type TodayActions = {
  to_schedule: number; labour_complete: number; to_invoice: number;
  invoices_to_approve: number; invoices_draft: number; invoices_xero_failed: number;
  supplier_to_approve: number; supplier_no_job: number; supplier_xero_failed: number;
  timesheet_days: number; leave_waiting: number; leave_names: string[]; quotes_accepted_7d: number;
  can_approve_invoices: boolean; can_approve_timesheets: boolean;
};
export const loadTodayActions = (s: OfficeSession) => rpc<TodayActions>("office_today_actions", { p_staff_id: who(s) });

// ── Sales ────────────────────────────────────────────────────────────────────
export type SalesCategory = "labour" | "materials" | "vehicle" | "contract" | "deposit" | "other" | "bookings";
export const CATEGORY_LABEL: Record<SalesCategory, string> = {
  labour: "Labour", materials: "Materials", vehicle: "Vehicle charges", contract: "Contract works & variations",
  deposit: "Deposits (net of deposits taken off)", other: "Other", bookings: "Maintenance bookings",
};
export type SalesRow = {
  date: string; number: string | null; company: string; customer: string; job_ref: string; job_title: string | null;
  source: "job" | "booking"; kind: string; sales: number;
};
export type SalesReport = {
  from: string; to: string; companies: ReportCompany[];
  sales: number; invoices: number; previous: number; previous_from: string; previous_to: string; last_year: number;
  by_category: Partial<Record<SalesCategory, number>>;
  by_company: { code: string; sales: number; invoices: number }[];
  by_month: { month: string; code: string; sales: number }[];
  top_customers: { id: string; name: string; sales: number; invoices: number }[];
  rows: SalesRow[];
};
export const loadSales = (s: OfficeSession, from: string, to: string, companyId: string | null) =>
  rpc<SalesReport>("office_report_sales", { p_staff_id: who(s), p_from: from, p_to: to, p_company_id: companyId });

// ── Job profitability ────────────────────────────────────────────────────────
export type ProfitRow = {
  job_id: string; job_ref: string; title: string | null; company: string; customer: string;
  type: "booking" | "quoted" | "charge_up"; state: string | null; jobs: number;
  budget: number | null; invoiced_period: number; invoiced: number; cost: number; labour: number; materials: number;
  hours: number; pending: number; no_rate: number; profit: number; margin: number | null; finished: boolean; open_phases: number;
};
export type ProfitReport = {
  from: string; to: string; companies: ReportCompany[]; rows: ProfitRow[];
  totals: { jobs: number; invoiced_period: number; invoiced: number; cost: number; profit: number; losses: number;
            finished_jobs: number; finished_invoiced: number; finished_cost: number };
};
export const loadJobProfit = (s: OfficeSession, from: string, to: string, companyId: string | null) =>
  rpc<ProfitReport>("office_report_job_profit", { p_staff_id: who(s), p_from: from, p_to: to, p_company_id: companyId });

// ── Work on hand ─────────────────────────────────────────────────────────────
export type WorkRow = {
  job_id: string; job_ref: string; title: string | null; company: string; customer: string;
  type: "quoted" | "charge_up"; state: string; stage: string | null; stage_label: string | null;
  budget: number | null; invoiced: number; drafts: number; unbilled: number; left: number; quoted: boolean;
  cost?: number; potential_profit?: number | null;
};
export type WorkReport = {
  companies: ReportCompany[]; can_costs: boolean; rows: WorkRow[];
  totals: { jobs: number; left: number; left_quoted: number; left_charge_up: number; budget: number; invoiced: number;
            by_stage: Record<string, number> };
};
export const loadWorkOnHand = (s: OfficeSession, companyId: string | null) =>
  rpc<WorkReport>("office_report_work_on_hand", { p_staff_id: who(s), p_company_id: companyId });

// ── Unbilled work ────────────────────────────────────────────────────────────
export type UnbilledPhase = {
  phase_id: string; phase_ref: string; phase_name: string; job_id: string; job_ref: string; title: string | null;
  company: string; customer: string; stage: string; stage_label: string; days: number; since: string;
  quoted: boolean; unbilled: number | null; draft: number;
};
export type UnbilledJob = {
  job_id: string; job_ref: string; title: string | null; state: string; company: string; customer: string;
  lines: number; unbilled: number; pending: number; oldest: string; days: number; cost?: number;
};
export type UnbilledReport = {
  companies: ReportCompany[]; phases: UnbilledPhase[]; jobs: UnbilledJob[];
  totals: { phases: number; phase_unbilled: number; phase_drafts: number; jobs: number; unbilled: number; over_30_days: number };
};
export const loadUnbilled = (s: OfficeSession, companyId: string | null, minDays: number) =>
  rpc<UnbilledReport>("office_report_unbilled", { p_staff_id: who(s), p_company_id: companyId, p_min_days: minDays });

// ── Date ranges (NZ financial year: 1 April – 31 March) ──────────────────────
export type RangeKey = "this_month" | "last_month" | "last_3_months" | "this_fy" | "last_fy" | "custom";
export const RANGES: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "this_fy", label: "This financial year" },
  { key: "last_fy", label: "Last financial year" },
];
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const validIso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

/** Auckland's today as yyyy-mm-dd. */
export function nzToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function resolveRange(range?: string, from?: string, to?: string): { key: RangeKey; from: string; to: string } {
  const f = validIso(from), t = validIso(to);
  if (range === "custom" || (!range && f && t)) {
    if (f && t && f <= t) return { key: "custom", from: f, to: t };
  }
  const preset = presetRange(range);
  // dates typed in that differ from the chosen period win (the form sends both)
  if (f && t && f <= t && (f !== preset.from || t !== preset.to)) return { key: "custom", from: f, to: t };
  return preset;
}

function presetRange(range?: string): { key: RangeKey; from: string; to: string } {
  const today = nzToday();
  const [y, m] = today.split("-").map(Number); // m is 1–12
  const fyStart = m >= 4 ? y : y - 1;
  switch (range) {
    case "last_month": return { key: "last_month", from: iso(y, m - 2, 1), to: iso(y, m - 1, 0) };
    case "last_3_months": return { key: "last_3_months", from: iso(y, m - 4, 1), to: iso(y, m - 1, 0) };
    case "this_fy": return { key: "this_fy", from: iso(fyStart, 3, 1), to: today };
    case "last_fy": return { key: "last_fy", from: iso(fyStart - 1, 3, 1), to: iso(fyStart, 2, 31) };
    default: return { key: "this_month", from: iso(y, m - 1, 1), to: today };
  }
}

/** The company filter: a code from the URL, matched against the companies the person can report on. */
export const companyFromCode = (companies: ReportCompany[], code?: string) =>
  companies.find((c) => c.code === code)?.id ?? null;

// ── CSV ──────────────────────────────────────────────────────────────────────
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const salesCsv = (r: SalesReport) =>
  csv([["Date", "Invoice", "Company", "Customer", "Job", "Job name", "Type", "Sales excl GST"],
       ...r.rows.map((x) => [x.date, x.number ?? "", x.company, x.customer, x.job_ref, x.job_title ?? "",
                              x.source === "booking" ? "Maintenance booking" : KIND_NAME[x.kind] ?? x.kind, x.sales])]);

export const profitCsv = (r: ProfitReport) =>
  csv([["Job", "Job name", "Company", "Customer", "Type", "Jobs incl variations", "Budget", "Invoiced in period",
        "Invoiced to date", "Labour hours", "Labour cost", "Materials cost", "Total cost", "Cost not approved yet",
        "Gross profit", "Margin %", "Fully invoiced"],
       ...r.rows.map((x) => [x.job_ref, x.title ?? "", x.company, x.customer, TYPE_NAME[x.type], x.jobs, x.budget ?? "",
                              x.invoiced_period, x.invoiced, x.hours, x.labour, x.materials, x.cost, x.pending, x.profit,
                              x.margin ?? "", x.finished ? "Yes" : "No"])]);

export const workCsv = (r: WorkReport) =>
  csv([["Job", "Job name", "Company", "Customer", "Type", "Status", "Stage", "Budget (accepted quotes)", "Invoiced",
        "Draft invoices", "Costs not charged up", "Left to invoice", ...(r.can_costs ? ["Cost to date", "Potential profit"] : [])],
       ...r.rows.map((x) => [x.job_ref, x.title ?? "", x.company, x.customer, TYPE_NAME[x.type], x.state === "on_hold" ? "On hold" : "Active",
                              x.stage_label ?? "Invoiced", x.budget ?? "", x.invoiced, x.drafts, x.unbilled, x.left,
                              ...(r.can_costs ? [x.cost ?? "", x.potential_profit ?? ""] : [])])]);

export const unbilledCsv = (r: UnbilledReport) =>
  csv([["Section", "Job / phase", "Name", "Company", "Customer", "Stage or job status", "Days waiting", "Costs not invoiced (charge value)",
        "Draft invoices"],
       ...r.phases.map((x) => ["Phase waiting", x.phase_ref, x.phase_name, x.company, x.customer, x.stage_label, x.days,
                                x.unbilled ?? "", x.draft]),
       ...r.jobs.map((x) => ["Costs not charged up", x.job_ref, x.title ?? "", x.company, x.customer, STATE_NAME[x.state] ?? x.state,
                              x.days, x.unbilled, ""])]);

export const KIND_NAME: Record<string, string> = {
  charge_up: "Charge-up", progress: "Progress claim", claim: "Payment claim", deposit: "Deposit", manual: "Invoice", booking: "Maintenance booking",
};
export const TYPE_NAME: Record<string, string> = { booking: "Maintenance booking", quoted: "Quoted", charge_up: "Charge-up" };
export const STATE_NAME: Record<string, string> = { active: "Active", on_hold: "On hold", closed: "Closed", cancelled: "Cancelled" };
