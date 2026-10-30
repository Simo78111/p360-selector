"use server";
// Job management (Phase 2a) office actions: create jobs and variations, phases and the pipeline, job settings,
// hold/cancel/close, notes, tasks and files. Each checks the person is signed in to the office console; the
// database then checks their role on that job's company (see lib/jobs.ts).
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice, type OfficeSession } from "@/lib/auth";
import {
  addFile,
  addNote,
  addPhase,
  addTask,
  addVariation,
  createJob,
  fileAction,
  fileUploadUrl,
  isStage,
  movePhase,
  removeNote,
  saveJob,
  savePhase,
  setJobState,
  taskAction as setTask,
} from "@/lib/jobs";

const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const id = (form: FormData, k: string) => {
  const v = text(form, k, 40);
  return isId(v) ? v : null;
};
const jobPage = (ref: string) => `/dashboard/office/job/${encodeURIComponent(ref)}`;
/** Where to go back to: a job page or a jobs list (never off-site). */
const backTo = (form: FormData) => {
  const b = text(form, "back", 300);
  return b.startsWith("/dashboard/office/job/") || b.startsWith("/dashboard/office/all-jobs") ? b : "/dashboard/office/all-jobs";
};

async function run(path: string, work: (s: OfficeSession) => Promise<string | { go: string; message: string }>) {
  let target: string;
  try {
    const s = await assertOffice("jobs");
    const r = await work(s);
    target = typeof r === "string" ? back(path, "ok", r) : back(r.go, "ok", r.message);
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

// ── New jobs and variations ────────────────────────────────────────────────
export async function createJobAction(form: FormData) {
  const customerId = id(form, "customerId");
  await run(`/dashboard/office/all-jobs/new?customer=${customerId ?? ""}`, async (s) => {
    const siteId = id(form, "siteId");
    if (!customerId) throw new Error("Pick a customer.");
    if (!siteId) throw new Error("Pick the site.");
    const r = await createJob(s, customerId, siteId, {
      title: text(form, "title"),
      description: text(form, "description", 5000),
      job_type: text(form, "job_type", 20) || "quoted",
      order_number: text(form, "order_number", 60),
      site_contact_id: id(form, "site_contact_id"),
      manager_staff_id: id(form, "manager_staff_id"),
      job_pricing_tier_id: id(form, "job_pricing_tier_id"),
      restricted: form.get("restricted") === "on",
      phase_name: text(form, "phase_name"),
      phase_description: text(form, "phase_description", 5000),
    });
    return { go: jobPage(r.job_ref), message: `Job ${r.job_ref} created with phase ${r.phase_ref}.` };
  });
}

export async function addVariationAction(form: FormData) {
  const path = backTo(form);
  await run(path, async (s) => {
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const r = await addVariation(s, jobId, {
      title: text(form, "title"),
      description: text(form, "description", 5000),
      order_number: text(form, "order_number", 60),
      phase_name: text(form, "phase_name"),
    });
    return { go: jobPage(r.job_ref), message: `Variation ${r.job_ref} added.` };
  });
}

// ── Phases and the pipeline ────────────────────────────────────────────────
export async function addPhaseAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const r = await addPhase(s, jobId, text(form, "name"), text(form, "description", 5000) || null);
    return `Phase ${r.phase_ref} added.`;
  });
}

export async function savePhaseAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const phaseId = id(form, "phaseId");
    if (!phaseId) throw new Error("Unknown phase.");
    await savePhase(s, phaseId, text(form, "name"), text(form, "description", 5000) || null);
    return "Phase saved.";
  });
}

export async function movePhaseAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const phaseId = id(form, "phaseId");
    const stage = text(form, "stage", 30);
    if (!phaseId || !isStage(stage)) throw new Error("Pick a stage.");
    const r = await movePhase(s, phaseId, stage);
    return `${r.phase_ref} moved.`;
  });
}

// ── Job settings and state ─────────────────────────────────────────────────
export async function saveJobAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const changes: Record<string, unknown> = {};
    for (const k of ["title", "order_number", "job_type"]) if (form.has(k)) changes[k] = text(form, k, 200);
    if (form.has("description")) changes.description = text(form, "description", 5000);
    for (const k of ["job_pricing_tier_id", "manager_staff_id", "site_contact_id", "property_id"]) {
      if (form.has(k)) changes[k] = id(form, k);
    }
    if (form.has("restricted_present")) changes.restricted = form.get("restricted") === "on";
    await saveJob(s, jobId, changes);
    return "Job saved.";
  });
}

const STATE_ACTIONS = ["hold", "resume", "cancel", "close", "reopen"] as const;
export async function jobStateAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const jobId = id(form, "jobId");
    const action = text(form, "action", 10) as (typeof STATE_ACTIONS)[number];
    if (!jobId || !STATE_ACTIONS.includes(action)) throw new Error("Unknown action.");
    await setJobState(s, jobId, action, text(form, "reason", 500) || null);
    return { hold: "Put on hold.", resume: "Taken off hold.", cancel: "Job cancelled.", close: "Job closed.", reopen: "Job reopened." }[action];
  });
}

// ── Notes and tasks ────────────────────────────────────────────────────────
export async function addNoteAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    await addNote(s, jobId, id(form, "phaseId"), text(form, "body", 5000), form.get("for_app") !== "on");
    return "Note added.";
  });
}

export async function removeNoteAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const noteId = id(form, "noteId");
    if (!noteId) throw new Error("Unknown note.");
    await removeNote(s, noteId);
    return "Note removed.";
  });
}

export async function addTaskAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const jobId = id(form, "jobId");
    if (!jobId) throw new Error("Unknown job.");
    const due = text(form, "due_on", 10);
    await addTask(s, jobId, id(form, "phaseId"), text(form, "title", 300), id(form, "assignee"), /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null);
    return "Task added.";
  });
}

export async function taskAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const taskId = id(form, "taskId");
    const action = text(form, "action", 10);
    if (!taskId || !["done", "undo", "remove"].includes(action)) throw new Error("Unknown task.");
    await setTask(s, taskId, action as "done" | "undo" | "remove");
    return action === "done" ? "Task done." : action === "undo" ? "Task reopened." : "Task removed.";
  });
}

// ── Files and photos (the browser uploads straight to storage, then the file is recorded) ──
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function startFileUploadAction(jobId: string, fileName: string): Promise<Result<{ path: string; url: string }>> {
  try {
    await assertOffice("jobs");
    if (!isId(jobId)) throw new Error("Unknown job.");
    const safe = fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80) || "file";
    const path = `${jobId}/${randomUUID()}-${safe}`;
    return { ok: true, data: { path, url: await fileUploadUrl(path) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function finishFileUploadAction(
  jobId: string, phaseId: string | null, path: string, fileName: string, mime: string, bytes: number, caption: string,
): Promise<Result<null>> {
  try {
    const s = await assertOffice("jobs");
    await addFile(s, jobId, phaseId && isId(phaseId) ? phaseId : null, path, fileName.slice(0, 200), mime.slice(0, 100) || "application/octet-stream",
      Math.max(0, Math.round(bytes)), caption.trim().slice(0, 300) || null);
    revalidatePath("/dashboard/office", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeFileAction(form: FormData) {
  await run(backTo(form), async (s) => {
    const fileId = id(form, "fileId");
    if (!fileId) throw new Error("Unknown file.");
    const f = await fileAction(s, fileId, "remove");
    return `Removed ${f.file_name}.`;
  });
}
