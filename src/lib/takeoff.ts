import "server-only";
// Takeoff (Phase 4): plans, scale per page, items and marks, and sending the result to a quote — through the
// engine's office_takeoff_* functions (engine repo, migration 20261105000100_jm_takeoff). Every call passes the
// signed-in staff member's id; the database checks they can see the job, and "Can do takeoffs" for changes.
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
import type { MarkOp, Pt, Takeoff, TakeoffItem } from "./takeoff-shared";
export * from "./takeoff-shared";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession) => s.staffId; // null = owner backup password

export const loadTakeoff = (s: OfficeSession, jobId: string) => rpc<Takeoff>("office_takeoff", { p_staff_id: who(s), p_job_id: jobId });

export type PageInfo = { page_no: number; width: number; height: number; label: string | null };
/** "previous": the older revision of the same set whose takeoff can be copied onto this one (4c). */
export type AddedPlan = { id: string; revision: string; message: string; previous?: { id: string; revision: string; marks: number } };
export const addPlan = (s: OfficeSession, jobId: string, fileId: string, name: string, pages: PageInfo[]) =>
  rpc<AddedPlan>("office_takeoff_add_plan", {
    p_staff_id: who(s), p_job_id: jobId, p_file_id: fileId, p_name: name, p_pages: pages,
  });
export const removePlan = (s: OfficeSession, planId: string) =>
  rpc<{ message: string }>("office_takeoff_remove_plan", { p_staff_id: who(s), p_plan_id: planId });

export type ScaleChange =
  | { method: "calibrated"; a: Pt; b: Pt; mm: number }
  | { method: "ratio"; ratio: number; sheet: string; checked?: boolean }
  | { checked: boolean }
  | { label: string };
export const setScale = (s: OfficeSession, pageId: string, scale: ScaleChange) =>
  rpc<{ message: string }>("office_takeoff_set_scale", { p_staff_id: who(s), p_page_id: pageId, p_scale: scale });

export const saveItem = (s: OfficeSession, jobId: string, itemId: string | null, changes: Record<string, unknown>) =>
  rpc<{ id: string; message: string }>("office_takeoff_save_item", { p_staff_id: who(s), p_job_id: jobId, p_item_id: itemId, p_changes: changes });

export type ItemTotals = Pick<TakeoffItem, "id" | "marks" | "unscaled" | "measured" | "quantity" | "per_page">;
export const saveMarks = (s: OfficeSession, jobId: string, ops: MarkOp[]) =>
  rpc<{ saved: number; items: ItemTotals[] }>("office_takeoff_save_marks", { p_staff_id: who(s), p_job_id: jobId, p_ops: ops });

/** Turns a page a quarter turn clockwise (its marks and calibration turn with it). */
export const rotatePage = (s: OfficeSession, pageId: string) =>
  rpc<{ rotation: number; width: number; height: number; message: string }>("office_takeoff_rotate_page", { p_staff_id: who(s), p_page_id: pageId });

/** Copies a takeoff onto a newer revision (4c). "moved": marks on the older revision whose part of the drawing changed. */
export type CopyResult = { copied: number; to_check: number; left_behind: number; scales: number; pages: number; turned?: number; message: string };
export const copyRevision = (s: OfficeSession, fromPlan: string, toPlan: string, moved: string[]) =>
  rpc<CopyResult>("office_takeoff_copy_revision", { p_staff_id: who(s), p_from_plan: fromPlan, p_to_plan: toPlan, p_moved: moved });

export const sharedWithPlumbers = (s: OfficeSession, planId: string, fileId: string) =>
  rpc<{ message: string }>("office_takeoff_shared", { p_staff_id: who(s), p_plan_id: planId, p_file_id: fileId });

export const takeoffToQuote = (s: OfficeSession, jobId: string, versionId: string | null) =>
  rpc<{ version_id: string; number: string; items: number; lines: number; replaced: number; unpriced: number; to_check?: number; message: string }>(
    "office_takeoff_to_quote", { p_staff_id: who(s), p_job_id: jobId, p_version_id: versionId });
