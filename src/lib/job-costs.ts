import "server-only";
import { engine } from "./engine";
import type { OfficeSession } from "./auth";

// Phase 3c: the job's Cost Report (labour from timesheets, supplier invoice lines).
export type CostKind = "labour" | "materials" | "hire" | "freight" | "stock" | "tool_hire";
export type CostLine = {
  id: string; date: string; kind: CostKind; job_ref: string; phase_ref: string | null; phase_name: string | null;
  description: string; who: string | null; qty: number; unit: string | null;
  cost?: number; sell: number; status: "approved" | "confirmed" | "draft" | "to_approve" | "still_out"; ref: string; no_rate?: boolean;
};
export type CostTotals = {
  labour?: number; labour_hours: number; labour_charge: number; supplier_documents?: number; stock_other?: number; materials_sell: number;
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

const isoDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

/** A date range from the URL (either end can be blank); null when neither is set. */
export function costRange(from?: string | null, to?: string | null): { from: string | null; to: string | null } | null {
  const f = isoDate(from), t = isoDate(to);
  if (!f && !t) return null;
  return f && t && f > t ? { from: t, to: f } : { from: f, to: t };
}

/** The Cost Report narrowed to lines dated in a range (and optionally to some phases), totals worked out again. */
export function filterCosts(c: JobCosts, range: { from: string | null; to: string | null } | null, phaseRefs?: string[] | null): JobCosts {
  const lines = c.lines.filter((l) =>
    (!range?.from || l.date >= range.from) && (!range?.to || l.date <= range.to) &&
    (!phaseRefs?.length || (l.phase_ref !== null && phaseRefs.includes(l.phase_ref))));
  if (lines.length === c.lines.length) return c;
  const sum = (f: (l: CostLine) => number, keep: (l: CostLine) => boolean = () => true) =>
    Math.round(lines.filter(keep).reduce((a, l) => a + f(l), 0) * 100) / 100;
  const lab = (l: CostLine) => l.kind === "labour";
  const mat = (l: CostLine) => l.kind !== "labour";
  const sup = (l: CostLine) => l.kind !== "labour" && l.kind !== "stock";
  const pending = (l: CostLine) => l.status !== "approved";
  const totals: CostTotals = {
    labour_hours: sum((l) => Number(l.qty), lab),
    labour_charge: sum((l) => Number(l.sell), lab),
    materials_sell: sum((l) => Number(l.sell), mat),
    charge_value: sum((l) => Number(l.sell)),
    ...(c.can_costs ? {
      labour: sum((l) => Number(l.cost ?? 0), lab),
      supplier_documents: sum((l) => Number(l.cost ?? 0), sup),
      stock_other: sum((l) => Number(l.cost ?? 0), (l) => l.kind === "stock"),
      total: sum((l) => Number(l.cost ?? 0)),
      pending_labour: sum((l) => Number(l.cost ?? 0), (l) => lab(l) && pending(l)),
      pending_supplier: sum((l) => Number(l.cost ?? 0), (l) => sup(l) && pending(l)),
      lines_without_rate: lines.filter((l) => l.no_rate).length,
    } : {}),
  };
  return { ...c, lines, totals };
}

export const KIND_LABEL: Record<CostKind, string> = {
  labour: "Labour", materials: "Materials", hire: "Hire", freight: "Freight", stock: "Stock on hand", tool_hire: "Tool hire",
};
export const STATUS_LABEL: Record<CostLine["status"], string> = {
  approved: "Approved", confirmed: "Confirmed by plumber", draft: "Draft timesheet", to_approve: "Invoice to approve",
  still_out: "Tool still out",
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

// ── Stock on hand (untracked materials from the van or yard, entered against a phase) ─────────────────
export async function addStock(s: OfficeSession, phaseId: string, line: Record<string, unknown>) {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc("office_add_stock", { p_staff_id: s.staffId, p_phase_id: phaseId, p_line: line });
  if (error) throw new Error(error.message);
  return data as { id: string; message: string };
}
export async function removeStock(s: OfficeSession, stockLineId: string) {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc("office_remove_stock", { p_staff_id: s.staffId, p_stock_line_id: stockLineId });
  if (error) throw new Error(error.message);
  return data as { message: string };
}
