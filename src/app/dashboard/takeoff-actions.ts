"use server";
// Takeoff (Phase 4) office actions. Each checks the person is signed in to the office console; the database then checks
// they can see the job and, for changes, "Can do takeoffs" (lib/takeoff.ts). Each returns a result rather than throwing,
// so the takeoff screen can show the message and carry on.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertOffice } from "@/lib/auth";
import { addFile, fileUploadUrl } from "@/lib/jobs";
import {
  addPlan,
  compareGet,
  compareList,
  compareStart,
  copyRevision,
  loadTakeoff,
  rotatePage,
  removePlan,
  saveItem,
  saveMarks,
  setScale,
  sharedWithPlumbers,
  takeoffToQuote,
  type AddedPlan,
  type AiReport,
  type AiReportRow,
  type CopyResult,
  type ItemTotals,
  type MarkOp,
  type PageInfo,
  type ScaleChange,
  type Takeoff,
} from "@/lib/takeoff";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const need = (...ids: unknown[]) => {
  if (!ids.every(isId)) throw new Error("Something's missing: reload the page.");
};
const safeName = (f: string) => f.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80) || "plans.pdf";

export async function takeoffLoadAction(jobId: string): Promise<Result<Takeoff>> {
  return run(async () => {
    need(jobId);
    return loadTakeoff(await assertOffice("jobs"), jobId);
  });
}

/** A one-off address to upload a PDF straight to the job's files. */
export async function takeoffUploadUrlAction(jobId: string, fileName: string): Promise<Result<{ path: string; url: string }>> {
  return run(async () => {
    need(jobId);
    await assertOffice("jobs");
    const path = `${jobId}/${randomUUID()}-${safeName(fileName)}`;
    return { path, url: await fileUploadUrl(path) };
  });
}

/** The uploaded PDF becomes a job file and a plan set (Rev A, or the next revision under the same name). */
export async function takeoffAddPlanAction(jobId: string, path: string, fileName: string, bytes: number, name: string,
  pages: PageInfo[]): Promise<Result<AddedPlan>> {
  return run(async () => {
    need(jobId);
    if (!path.startsWith(`${jobId}/`)) throw new Error("Bad file path.");
    const s = await assertOffice("jobs");
    const clean = pages.slice(0, 500).map((p) => ({
      page_no: Math.round(Number(p.page_no)), width: Number(p.width), height: Number(p.height),
      label: p.label ? String(p.label).slice(0, 120) : null,
    }));
    const fileId = await addFile(s, jobId, null, path, fileName.slice(0, 200), "application/pdf", Math.max(0, Math.round(bytes)),
      `Takeoff plans: ${name.slice(0, 120)}`);
    const r = await addPlan(s, jobId, fileId, name.trim().slice(0, 200), clean);
    revalidatePath("/dashboard/office/job", "layout");
    return r;
  });
}

export async function takeoffRemovePlanAction(planId: string): Promise<Result<{ message: string }>> {
  return run(async () => {
    need(planId);
    const r = await removePlan(await assertOffice("jobs"), planId);
    revalidatePath("/dashboard/office/job", "layout");
    return r;
  });
}

export async function takeoffScaleAction(pageId: string, scale: ScaleChange): Promise<Result<{ message: string }>> {
  return run(async () => {
    need(pageId);
    return setScale(await assertOffice("jobs"), pageId, scale);
  });
}

export async function takeoffItemAction(jobId: string, itemId: string | null, changes: Record<string, unknown>): Promise<Result<Takeoff>> {
  return run(async () => {
    need(jobId);
    if (itemId !== null) need(itemId);
    const s = await assertOffice("jobs");
    await saveItem(s, jobId, itemId, changes);
    return loadTakeoff(s, jobId);
  });
}

export async function takeoffMarksAction(jobId: string, ops: MarkOp[]): Promise<Result<ItemTotals[]>> {
  return run(async () => {
    need(jobId);
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > 1000) throw new Error("Nothing to save.");
    return (await saveMarks(await assertOffice("jobs"), jobId, ops)).items;
  });
}

/** Upload addresses for the AI comparison's pictures (in the job's files, under takeoff-compare/). */
export async function takeoffCompareUploadsAction(jobId: string, names: string[]): Promise<Result<{ path: string; url: string }[]>> {
  return run(async () => {
    need(jobId);
    if (!Array.isArray(names) || names.length === 0 || names.length > 300) throw new Error("Too many pictures.");
    await assertOffice("jobs");
    const batch = randomUUID();
    return Promise.all(names.map(async (n) => {
      const path = `${jobId}/takeoff-compare/${batch}/${safeName(String(n)).slice(0, 80)}`;
      return { path, url: await fileUploadUrl(path) };
    }));
  });
}

/** Asks the AI what changed between two revisions (the browser has already found the changed areas). */
export async function takeoffCompareStartAction(fromPlan: string, toPlan: string, input: unknown): Promise<Result<{ id: string }>> {
  return run(async () => {
    need(fromPlan, toPlan);
    if (JSON.stringify(input ?? null).length > 500_000) throw new Error("Too much to compare at once.");
    return compareStart(await assertOffice("jobs"), fromPlan, toPlan, input);
  });
}

export async function takeoffCompareGetAction(id: string): Promise<Result<AiReport>> {
  return run(async () => {
    need(id);
    return compareGet(await assertOffice("jobs"), id);
  });
}

export async function takeoffCompareListAction(jobId: string): Promise<Result<AiReportRow[]>> {
  return run(async () => {
    need(jobId);
    return compareList(await assertOffice("jobs"), jobId);
  });
}

/** Turns a plan page a quarter turn clockwise. */
export async function takeoffRotatePageAction(pageId: string): Promise<Result<{ rotation: number; message: string }>> {
  return run(async () => {
    need(pageId);
    const r = await rotatePage(await assertOffice("jobs"), pageId);
    revalidatePath("/dashboard/office/job", "layout");
    return { rotation: r.rotation, message: r.message };
  });
}

/** Copies the takeoff from an older revision onto a newer one; "moved" are the marks where the drawing changed (4c). */
export async function takeoffCopyRevisionAction(fromPlan: string, toPlan: string, moved: string[]): Promise<Result<CopyResult>> {
  return run(async () => {
    need(fromPlan, toPlan);
    if (!Array.isArray(moved) || moved.length > 5000) throw new Error("Too many marks.");
    need(...moved);
    const r = await copyRevision(await assertOffice("jobs"), fromPlan, toPlan, moved);
    revalidatePath("/dashboard/office/job", "layout");
    return r;
  });
}

/** Sends the takeoff to a draft quote (or a new one); returns the quote's address. */
export async function takeoffToQuoteAction(jobId: string, versionId: string | null):
  Promise<Result<{ message: string; href: string; number: string }>> {
  return run(async () => {
    need(jobId);
    if (versionId !== null) need(versionId);
    const s = await assertOffice("jobs");
    const r = await takeoffToQuote(s, jobId, versionId);
    const t = await loadTakeoff(s, jobId);
    revalidatePath("/dashboard/office/job", "layout");
    return { message: r.message, number: r.number, href: `/dashboard/office/job/${encodeURIComponent(t.job.ref)}/quote/${r.version_id}` };
  });
}

/** The marked-up PDF (made in the browser and uploaded) goes in the job's files for plumbers on the job to open. */
export async function takeoffShareAction(jobId: string, planId: string, path: string, fileName: string, bytes: number):
  Promise<Result<{ message: string }>> {
  return run(async () => {
    need(jobId, planId);
    if (!path.startsWith(`${jobId}/`)) throw new Error("Bad file path.");
    const s = await assertOffice("jobs");
    const fileId = await addFile(s, jobId, null, path, fileName.slice(0, 200), "application/pdf", Math.max(0, Math.round(bytes)),
      "Marked-up takeoff plans (read only)");
    const r = await sharedWithPlumbers(s, planId, fileId);
    revalidatePath("/dashboard/office/job", "layout");
    return r;
  });
}
