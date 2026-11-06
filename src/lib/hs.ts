import "server-only";
// Health and safety (Phase 5a): the job's SWMS and JSA pack, site details, hold points, approval — through the engine's
// office_hs_* functions (engine repo, migration 20261106000300_jm_hs). Every call passes the signed-in staff member's
// id; the database checks they can see the job, and "Can approve H&S documents" for approving and the settings.
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
export * from "./hs-shared";
import type { HsJob, HsSettings, HsRegisterRow, HsContent, HsTask, HsToday, SiteDetails, HsLibraryTask } from "./hs-shared";
import type { HsPrint } from "./hs-layout";

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

// ── Phase 5b ──
/** Everything a SWMS / JSA document is drawn from (any version of a pack, as long as it has a finished draft). */
export type HsPrintRaw = Omit<HsPrint, "job" | "company"> & {
  job: HsPrint["job"] & { id: string }; company: HsPrint["company"] & { code: string };
  files: NonNullable<HsJob["document"]>["files"];
};
export const loadHsPrint = (s: OfficeSession, docId: string) => rpc<HsPrintRaw>("office_hs_print", { p_staff_id: who(s), p_document_id: docId });
export const saveHsFiles = (s: OfficeSession, docId: string, files: { file_id: string; kind: string; format: string; name: string }[]) =>
  rpc<HsJob>("office_hs_files_saved", { p_staff_id: who(s), p_document_id: docId, p_files: files });
export const loadHsToday = (s: OfficeSession) => rpc<HsToday>("office_hs_today", { p_staff_id: who(s) });

// ── Phase 5c ──
/** "No change needed" for the scope changes on the live pack (logged in the amendment log). */
export const dismissScopeChange = (s: OfficeSession, docId: string, reason: string | null) =>
  rpc<HsJob>("office_hs_scope_dismiss", { p_staff_id: who(s), p_document_id: docId, p_reason: reason });
/** The next version, drafted from this one plus what changed; workers sign it again. */
export const updateForScope = (s: OfficeSession, docId: string, note: string | null) =>
  rpc<HsJob>("office_hs_update_scope", { p_staff_id: who(s), p_document_id: docId, p_note: note });
/** Save a task (all rows, or the chosen 1-based rows) from an approved pack to the hazard and controls library. */
export const saveToLibrary = (s: OfficeSession, docId: string, taskN: number, rows: number[] | null, name: string,
                              appliesWhen: string | null, mode: "new" | "replace" | "add") =>
  rpc<HsLibraryTask>("office_hs_library_save", {
    p_staff_id: who(s), p_document_id: docId, p_task_n: taskN, p_rows: rows, p_name: name, p_applies_when: appliesWhen, p_mode: mode,
  });
export const updateLibrary = (s: OfficeSession, id: string, changes: { name?: string; applies_when?: string; active?: boolean; remove_row?: number }) =>
  rpc<HsLibraryTask>("office_hs_library_update", { p_staff_id: who(s), p_id: id, p_changes: changes });
