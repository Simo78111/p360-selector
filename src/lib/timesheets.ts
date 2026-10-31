import "server-only";
// Job management Phase 3a: timesheets by job and phase, leave, pay rates and the Smartly export, through the
// engine's office_* functions (engine repo, migration 20261101000100_jm_timesheets). Every call passes the signed-in
// staff member's id; the database checks "Can approve timesheets" for the person's companies.
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

export type TsLine = {
  id: string; kind: "job" | "travel" | "other"; work_date: string; source: "diary" | "engine" | "plumber" | "office"; edited: boolean;
  job_id: string | null; phase_id: string | null; company: string | null; company_name: string | null;
  job_ref: string | null; phase_ref: string | null; phase_name: string | null; label: string; customer: string | null;
  start: string; finish: string | null; start_label: string; finish_label: string | null;
  break_min: number; minutes: number; hours: number;
  pay_rate: 1 | 2 | 3; pay_rule_id: string | null; pay_rate_set: boolean; pay_rule: string;
  note: string | null; needs_finish: boolean; signed_off_by: string | null; cost_rate: number | null; charge_rate: number | null;
};
export type TsDay = {
  id: string; work_date: string; status: "auto" | "confirmed" | "approved"; note: string | null; day_label: string;
  approved_by: string | null; approved_at: string | null; confirmed_at: string | null; exported_at: string | null;
  break_min: number; minutes: number; hours: number; needs_finish: boolean; travel_to_sign: boolean; lines: TsLine[];
};
export type Leave = {
  id: string; staff_id: string; staff: string; code: number; type: string; date_from: string; date_to: string;
  dates_label: string; days: number; hours_per_day: number; hours: number; note: string | null;
  status: "requested" | "approved" | "declined" | "cancelled"; asked_by: "plumber" | "office";
  decided_by: string | null; decided_at: string | null; decline_reason: string | null; created_at: string;
};
export type PayRule = { id: string; name: string; pay_rate: 1 | 2 | 3; applies: "weekend" | "night" | "manual";
  night_from: string | null; night_to: string | null; sort: number; active: boolean };
export type Allowance = { id: string; name: string; smartly_ref: number | null; per: "week" | "day" | "hour";
  is_tool_allowance: boolean; active: boolean };
export type LeaveType = { code: number; name: string; plumber_can_ask: boolean };
export type TsSettings = {
  pay_week_start_dow: number; round_min: number; gap_fill_min: number; break_min: number; break_after_min: number;
  rules: PayRule[]; allowances: Allowance[]; leave_types: LeaveType[];
};
export type TsPerson = {
  staff_id: string; plumber_id: string; name: string; smartly_code: string | null; pay_rate: number | null; cost_rate: number | null;
  companies: string[]; days: TsDay[]; leave: Leave[]; by_rate: Record<string, number>; hours: number; all_approved: boolean;
};
export type TsWeek = { from: string; to: string; label: string; people: TsPerson[]; leave_requests: Leave[]; settings: TsSettings };
export type SmartlyFile = {
  from: string; to: string; rows: string[]; people: number; file_name: string;
  left_out: { name: string; why: string }[]; warnings: { name: string; why: string }[];
};
export type TsJob = { job_id: string; phase_id: string | null; label: string; company: string };
export type StaffPay = {
  pay_rate: number | null; cost_rate: number | null; charge_out_rate: number | null; order_initials: string | null;
  tool_allowance: boolean; tool_allowance_set: boolean | null; smartly_employee_code: string | null; smartly_pay_rate: number;
};

export const loadWeek = (s: OfficeSession, week: string | null) =>
  rpc<TsWeek>("office_timesheet_week", { p_staff_id: who(s), p_week: week });
export const loadTsSettings = () => rpc<TsSettings>("office_timesheet_settings", {});
export const findTsJobs = (s: OfficeSession, q: string) => rpc<TsJob[]>("office_timesheet_jobs", { p_staff_id: who(s), p_q: q });
export const saveTsLine = (s: OfficeSession, plumberId: string, date: string, line: Record<string, unknown>) =>
  rpc<TsDay>("office_save_timesheet_line", { p_staff_id: who(s), p_plumber_id: plumberId, p_date: date, p_line: line });
export const removeTsLine = (s: OfficeSession, lineId: string) =>
  rpc<TsDay>("office_remove_timesheet_line", { p_staff_id: who(s), p_line_id: lineId });
export const approveDays = (s: OfficeSession, from: string, to: string, plumberId: string | null) =>
  rpc<{ approved: number; skipped: { name: string; date: string; why: string }[] }>("office_approve_timesheet_days", {
    p_staff_id: who(s), p_from: from, p_to: to, p_plumber_id: plumberId,
  });
export const reopenDay = (s: OfficeSession, timesheetId: string) =>
  rpc<TsDay>("office_reopen_timesheet_day", { p_staff_id: who(s), p_timesheet_id: timesheetId });
export const saveLeave = (s: OfficeSession, leave: Record<string, unknown>) =>
  rpc<Leave>("office_save_leave", { p_staff_id: who(s), p_leave: leave });
export const decideLeave = (s: OfficeSession, id: string, approve: boolean, reason: string | null) =>
  rpc<Leave>("office_decide_leave", { p_staff_id: who(s), p_id: id, p_approve: approve, p_reason: reason });
export const smartlyFile = (s: OfficeSession, week: string, mark: boolean) =>
  rpc<SmartlyFile>("office_smartly_export", { p_staff_id: who(s), p_week: week, p_mark: mark });
export const savePayRule = (s: OfficeSession, rule: Record<string, unknown>) =>
  rpc<TsSettings>("office_save_pay_rule", { p_staff_id: who(s), p_rule: rule });
export const saveAllowance = (s: OfficeSession, a: Record<string, unknown>) =>
  rpc<TsSettings>("office_save_allowance", { p_staff_id: who(s), p_allowance: a });
export const loadStaffPay = () => rpc<Record<string, StaffPay>>("office_staff_pay", {});
export const saveStaffPay = (staffId: string, changes: Record<string, unknown>) =>
  rpc<StaffPay>("office_save_staff_pay", { p_staff_id: staffId, p_changes: changes });

export const RATE_NAME: Record<number, string> = { 1: "Rate 1 · ordinary", 2: "Rate 2", 3: "Rate 3" };
export const APPLIES_NAME: Record<PayRule["applies"], string> = {
  weekend: "Weekends (suggested automatically)",
  night: "Night work (suggested automatically)",
  manual: "Picked by hand",
};
