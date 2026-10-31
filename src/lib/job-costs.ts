import "server-only";
import { engine } from "./engine";
import type { OfficeSession } from "./auth";

// Phase 3c: the job's Cost Report (labour from timesheets, supplier invoice lines).
export type CostKind = "labour" | "materials" | "hire" | "freight";
export type CostLine = {
  id: string; date: string; kind: CostKind; job_ref: string; phase_ref: string | null; phase_name: string | null;
  description: string; who: string | null; qty: number; unit: string | null;
  cost?: number; sell: number; status: "approved" | "confirmed" | "draft" | "to_approve"; ref: string; no_rate?: boolean;
};
export type CostTotals = {
  labour?: number; labour_hours: number; labour_charge: number; supplier_documents?: number; materials_sell: number;
  total?: number; charge_value: number; pending_labour?: number; pending_supplier?: number; lines_without_rate?: number;
};
export type JobCosts = { lines: CostLine[]; totals: CostTotals; can_costs: boolean; markup_pct: number };

export async function loadJobCosts(s: OfficeSession, jobId: string, scope: "job" | "project"): Promise<JobCosts> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc("office_job_costs", { p_staff_id: s.staffId, p_job_id: jobId, p_scope: scope });
  if (error) throw new Error(error.message);
  return data as JobCosts;
}

export const KIND_LABEL: Record<CostKind, string> = { labour: "Labour", materials: "Materials", hire: "Hire", freight: "Freight" };
export const STATUS_LABEL: Record<CostLine["status"], string> = {
  approved: "Approved", confirmed: "Confirmed by plumber", draft: "Draft timesheet", to_approve: "Invoice to approve",
};

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The Cost Report as a CSV (costs only if the person can see them). */
export function costsCsv(c: JobCosts): string {
  const head = ["Date", "Type", "Job", "Phase", "Description", "Who / supplier", "Qty", "Unit", ...(c.can_costs ? ["Cost"] : []), "Charge / sell", "Status", "Reference"];
  const rows = c.lines.map((l) => [
    l.date, KIND_LABEL[l.kind], l.job_ref, l.phase_ref ?? "", l.description, l.who ?? "", l.qty, l.unit ?? "",
    ...(c.can_costs ? [l.cost ?? ""] : []), l.sell, STATUS_LABEL[l.status], l.ref,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
