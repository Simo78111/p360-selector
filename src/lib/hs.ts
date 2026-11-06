import "server-only";
// Health and safety (Phase 5a): the job's SWMS and JSA pack, site details, hold points, approval — through the engine's
// office_hs_* functions (engine repo, migration 20261106000300_jm_hs). Every call passes the signed-in staff member's
// id; the database checks they can see the job, and "Can approve H&S documents" for approving and the settings.
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
export * from "./hs-shared";
import type { HsJob, HsSettings, HsRegisterRow, HsContent, HsTask, SiteDetails } from "./hs-shared";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession) => s.staffId; // null = owner backup password

export const loadHs = (s: OfficeSession, jobId: string) => rpc<HsJob>("office_hs_get", { p_staff_id: who(s), p_job_id: jobId });
export const saveSite = (s: OfficeSession, jobId: string, details: SiteDetails) =>
  rpc<HsJob>("office_hs_site_save", { p_staff_id: who(s), p_job_id: jobId, p_details: details });
export const startHs = (s: OfficeSession, jobId: string) => rpc<HsJob>("office_hs_start", { p_staff_id: who(s), p_job_id: jobId });
export const confirmTasks = (s: OfficeSession, docId: string, tasks: HsTask[]) =>
  rpc<HsJob>("office_hs_confirm_tasks", { p_staff_id: who(s), p_document_id: docId, p_tasks: tasks });
export const redraftHs = (s: OfficeSession, docId: string, note: string) =>
  rpc<HsJob>("office_hs_redraft", { p_staff_id: who(s), p_document_id: docId, p_note: note });
export const saveHsContent = (s: OfficeSession, docId: string, content: HsContent, change: string | null) =>
  rpc<HsJob>("office_hs_save", { p_staff_id: who(s), p_document_id: docId, p_content: content, p_change: change });
export const answerHoldPoint = (s: OfficeSession, docId: string, id: string, status: string, answer: string | null) =>
  rpc<HsJob>("office_hs_hold_point", { p_staff_id: who(s), p_document_id: docId, p_id: id, p_status: status, p_answer: answer });
export const approveHs = (s: OfficeSession, docId: string) => rpc<HsJob>("office_hs_approve", { p_staff_id: who(s), p_document_id: docId });
export const markHsSent = (s: OfficeSession, docId: string, note: string | null) =>
  rpc<HsJob>("office_hs_mark_sent", { p_staff_id: who(s), p_document_id: docId, p_note: note });
export const loadHsSettings = (s: OfficeSession) => rpc<HsSettings>("office_hs_settings_get", { p_staff_id: who(s) });
export const saveHsSettings = (s: OfficeSession, instructions: string | null, reference: Record<string, unknown> | null, note: string | null) =>
  rpc<HsSettings>("office_hs_settings_save", { p_staff_id: who(s), p_instructions: instructions, p_reference: reference, p_note: note });
export const loadHsRegister = (s: OfficeSession) => rpc<HsRegisterRow[]>("office_hs_register", { p_staff_id: who(s) });
