import "server-only";
// Job management (Phase 2a): jobs, lettered phases, variations, the job pipeline and the job page, through
// the engine's office_* functions (engine repo, migrations 20261030000500–700). Every call passes the
// signed-in staff member's id; the database checks what that person may see and change.
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

export const JOB_FILES_BUCKET = "job-files";
export const APP_PHOTOS_BUCKET = "job-photos";

// ── The pipeline ───────────────────────────────────────────────────────────
export const STAGES = [
  { id: "to_schedule", label: "To Schedule", list: "To schedule" },
  { id: "to_start", label: "To Start", list: "To start" },
  { id: "in_progress", label: "In Progress", list: "In progress" },
  { id: "labour_complete", label: "Labour Complete", list: "Labour complete" },
  { id: "to_invoice", label: "To Invoice", list: "Waiting to invoice" },
  { id: "to_be_approved", label: "To Be Approved", list: "Invoices to approve" },
  { id: "invoiced", label: "Invoiced", list: "Invoiced" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];
export const stageLabel = (s: string | null | undefined) => STAGES.find((x) => x.id === s)?.label ?? "—";
export const isStage = (s: string): s is Stage => STAGES.some((x) => x.id === s);

export type JobState = "active" | "on_hold" | "cancelled" | "closed";
export const STATE_LABEL: Record<JobState, string> = {
  active: "Active",
  on_hold: "On hold",
  cancelled: "Cancelled",
  closed: "Closed",
};

// ── Lists ──────────────────────────────────────────────────────────────────
export type ListView = "open" | "all" | "on_hold" | "cancelled" | "closed" | `stage:${Stage}`;
export type JobRow = {
  kind: "managed" | "booking";
  job_id: string; job_ref: string; ref: string; company: string; title: string; customer: string; site: string;
  state: JobState; status: string; stage: Stage | null; stages: { ref: string; stage: Stage; name: string }[] | null;
  parent_ref: string | null; variations: number; order_number: string | null; manager: string | null;
  created_at: string; updated_at: string;
};
export type PhaseRow = {
  kind: "phase" | "booking";
  job_id: string; job_ref: string; ref: string; phase_name: string | null; company: string; title: string;
  customer: string; site: string; stage: Stage; status?: string; since: string; is_variation: boolean;
  order_number: string | null; manager: string | null;
};
export type PipelineCounts = { stages: { id: Stage; label: string; count: number }[]; on_hold: number };

export const loadJobList = (s: OfficeSession, view: ListView, search: string, companyId: string | null) =>
  rpc<(JobRow | PhaseRow)[]>("office_job_list", {
    p_staff_id: who(s), p_search: search || null, p_company_id: companyId, p_view: view, p_limit: 300,
  });
export const loadPipelineCounts = (s: OfficeSession, companyId: string | null) =>
  rpc<PipelineCounts>("office_pipeline_counts", { p_staff_id: who(s), p_company_id: companyId });

// ── The job page ───────────────────────────────────────────────────────────
export type Phase = {
  id: string | null; letter: string | null; ref: string; name: string; description: string | null;
  stage: Stage; stage_label: string; since: string;
};
export type Note = { id: string; phase_id: string | null; phase_ref: string | null; body: string; internal: boolean; by: string; at: string; can_remove: boolean };
export type HistoryLine = { kind: string; summary: string; by: string; at: string; phase_ref: string | null };
export type JobFile = {
  id: string; phase_id: string | null; phase_ref: string | null; file_name: string; mime_type: string | null;
  bytes: number | null; is_photo: boolean; caption: string | null; path: string; by: string; at: string; can_remove: boolean;
};
export type AppPhoto = { id: string; path: string; stage: string; caption: string | null; at: string };
export type Task = {
  id: string; phase_id: string | null; phase_ref: string | null; title: string; assignee_id: string | null;
  assignee: string | null; due_on: string | null; done_at: string | null; done_by: string | null; by: string; at: string;
};
export type FamilyJob = { job_id: string; job_ref: string; title: string | null; state: JobState; is_top: boolean; is_this: boolean; stages: { ref: string; stage: Stage; name: string }[] };
export type Totals = {
  jobs: number; job_refs: string[]; phases: number; by_stage: Partial<Record<Stage, number>>;
  quoted_ex_gst: number | null; invoiced_ex_gst: number; draft_invoices_ex_gst: number; paid: number;
  costs: { labour: number; supplier_documents: number; purchase_orders: number; stock_other: number }; costs_ready: boolean;
};
export type Option = { id: string; name: string };
export type JobPage = {
  kind: "managed" | "booking";
  job_id: string; job_ref: string; focus_phase_id: string | null;
  company: { id: string; code: string; name: string };
  title: string; description: string | null; state: JobState; hold_reason: string | null;
  job_type: "quoted" | "charge_up" | null; order_number: string | null; restricted: boolean;
  created_at: string; created_by: string | null;
  customer: { id: string; name: string; full_name: string; business_name: string | null; phone: string | null; email: string | null; kind: string; notes: string | null };
  site: { id: string; site_name: string | null; address_line: string; suburb: string | null; city: string | null; postcode: string | null; access_notes: string | null; notes: string | null; text: string };
  site_contact: { id: string; name: string; position: string | null; phone: string | null; mobile: string | null; email: string | null } | null;
  manager: Option | null;
  pricing_tier: { id: string | null; name: string; markup_pct: number; source: "job" | "customer" | "company" };
  parent: { job_id: string; job_ref: string; title: string | null } | null;
  family: FamilyJob[];
  phases: Phase[];
  booking: { job_number: number; status: string; tier: string; service: string | null; quoted_price: number | null; office_notes: string | null; work_date: string | null; plumber: string | null } | null;
  notes: Note[]; history: HistoryLine[]; files: JobFile[]; app_photos: AppPhoto[]; tasks: Task[];
  totals: Totals;
  can: { edit: boolean; work: boolean };
  options: {
    stages: { id: Stage; label: string }[]; contacts: (Option & { position: string | null })[]; sites: { id: string; text: string }[];
    tiers: (Option & { markup_pct: number })[]; managers: Option[]; assignees: Option[];
  };
};

export const loadJobPage = (s: OfficeSession, ref: string) =>
  rpc<JobPage | null>("office_job_page", { p_staff_id: who(s), p_ref: ref });
export const jobRefForNumber = (s: OfficeSession, jobNumber: number) =>
  rpc<{ job_ref: string; managed: boolean } | null>("office_job_ref_for_number", { p_staff_id: who(s), p_job_number: jobNumber });

// ── Creating and changing jobs ─────────────────────────────────────────────
export type NewJobOptions = {
  customer: { id: string; name: string; company_id: string; company: string; tier: string | null };
  sites: { id: string; text: string }[];
  contacts: (Option & { position: string | null; site_id: string | null })[];
  tiers: Option[]; managers: Option[];
} | null;
export const loadNewJobOptions = (s: OfficeSession, customerId: string) =>
  rpc<NewJobOptions>("office_new_job_options", { p_staff_id: who(s), p_customer_id: customerId });

type Created = { job_id: string; job_ref: string; phase_ref: string };
export const createJob = (s: OfficeSession, customerId: string, siteId: string, details: Record<string, unknown>) =>
  rpc<Created>("office_create_job", { p_staff_id: who(s), p_customer_id: customerId, p_property_id: siteId, p_details: details });
export const addVariation = (s: OfficeSession, jobId: string, details: Record<string, unknown>) =>
  rpc<Created>("office_add_variation", { p_staff_id: who(s), p_job_id: jobId, p_details: details });
export const addPhase = (s: OfficeSession, jobId: string, name: string, description: string | null) =>
  rpc<{ phase_id: string; phase_ref: string }>("office_add_phase", { p_staff_id: who(s), p_job_id: jobId, p_name: name, p_description: description });
export const savePhase = (s: OfficeSession, phaseId: string, name: string, description: string | null) =>
  rpc<null>("office_save_phase", { p_staff_id: who(s), p_phase_id: phaseId, p_name: name, p_description: description });
export const movePhase = (s: OfficeSession, phaseId: string, stage: Stage) =>
  rpc<{ phase_ref: string; stage: Stage }>("office_move_phase", { p_staff_id: who(s), p_phase_id: phaseId, p_stage: stage });
export const saveJob = (s: OfficeSession, jobId: string, changes: Record<string, unknown>) =>
  rpc<null>("office_save_job", { p_staff_id: who(s), p_job_id: jobId, p_changes: changes });
export const setJobState = (s: OfficeSession, jobId: string, action: "hold" | "resume" | "cancel" | "close" | "reopen", reason: string | null) =>
  rpc<{ state: JobState }>("office_set_job_state", { p_staff_id: who(s), p_job_id: jobId, p_action: action, p_reason: reason });

// ── Notes, tasks, files ────────────────────────────────────────────────────
export const addNote = (s: OfficeSession, jobId: string, phaseId: string | null, body: string, internal: boolean) =>
  rpc<string>("office_add_job_note", { p_staff_id: who(s), p_job_id: jobId, p_phase_id: phaseId, p_body: body, p_internal: internal });
export const removeNote = (s: OfficeSession, noteId: string) =>
  rpc<null>("office_remove_job_note", { p_staff_id: who(s), p_note_id: noteId });
export const addTask = (s: OfficeSession, jobId: string, phaseId: string | null, title: string, assignee: string | null, due: string | null) =>
  rpc<string>("office_add_job_task", { p_staff_id: who(s), p_job_id: jobId, p_phase_id: phaseId, p_title: title, p_assignee: assignee, p_due: due });
export const taskAction = (s: OfficeSession, taskId: string, action: "done" | "undo" | "remove") =>
  rpc<null>("office_job_task", { p_staff_id: who(s), p_task_id: taskId, p_action: action });
export const addFile = (s: OfficeSession, jobId: string, phaseId: string | null, path: string, fileName: string, mime: string, bytes: number, caption: string | null) =>
  rpc<string>("office_add_job_file", {
    p_staff_id: who(s), p_job_id: jobId, p_phase_id: phaseId, p_path: path, p_file_name: fileName, p_mime_type: mime,
    p_bytes: bytes, p_caption: caption,
  });
export const fileAction = (s: OfficeSession, fileId: string, action: "get" | "remove") =>
  rpc<{ path: string; file_name: string; mime_type: string | null }>("office_job_file", { p_staff_id: who(s), p_file_id: fileId, p_action: action });
export const appPhotoPath = (s: OfficeSession, photoId: string) =>
  rpc<string>("office_job_app_photo", { p_staff_id: who(s), p_photo_id: photoId });

/** A one-off address to upload a file straight to storage from the browser. */
export async function fileUploadUrl(path: string) {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.storage.from(JOB_FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Files: ${error?.message ?? "couldn't get an upload address"}`);
  return data.signedUrl;
}

export const fmtBytes = (n: number | null) =>
  n === null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const nzDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
