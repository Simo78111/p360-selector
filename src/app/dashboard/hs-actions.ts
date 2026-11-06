"use server";
// Health and safety (Phase 5a) office actions. Each checks the person is signed in to the office console; the database
// then checks they can see the job and, for approving and the settings, "Can approve H&S documents" (lib/hs.ts). Each
// returns a result rather than throwing, so the Health & Safety tab can show the message and carry on.
import { revalidatePath } from "next/cache";
import { assertOffice } from "@/lib/auth";
import { fileHsDocs } from "@/lib/hs-files";
import {
  answerHoldPoint,
  approveHs,
  confirmTasks,
  loadHs,
  markHsSent,
  redraftHs,
  saveHsContent,
  saveHsSettings,
  saveSite,
  startHs,
  type HsContent,
  type HsJob,
  type HsSettings,
  type HsTask,
  type SiteDetails,
} from "@/lib/hs";

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
const done = (r: HsJob) => {
  revalidatePath("/dashboard/office/job/[ref]", "page");
  return r;
};

export async function hsLoadAction(jobId: string): Promise<Result<HsJob>> {
  return run(async () => {
    need(jobId);
    return loadHs(await assertOffice("jobs"), jobId);
  });
}

export async function hsSiteAction(jobId: string, details: SiteDetails): Promise<Result<HsJob>> {
  return run(async () => {
    need(jobId);
    const clean: SiteDetails = {};
    for (const [k, v] of Object.entries(details ?? {})) {
      if (typeof v === "string") {
        if (v.trim()) clean[k as keyof SiteDetails] = v.trim().slice(0, 2000);
      } else if (v != null) clean[k as keyof SiteDetails] = v;
    }
    return done(await saveSite(await assertOffice("jobs"), jobId, clean));
  });
}

export async function hsStartAction(jobId: string): Promise<Result<HsJob>> {
  return run(async () => {
    need(jobId);
    return done(await startHs(await assertOffice("jobs"), jobId));
  });
}

export async function hsConfirmTasksAction(docId: string, tasks: HsTask[]): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    const list = (tasks ?? [])
      .map((t) => ({ ...t, title: String(t.title ?? "").trim().slice(0, 300) }))
      .filter((t) => t.title)
      .map((t, i) => ({ ...t, n: i + 1 }));
    return done(await confirmTasks(await assertOffice("jobs"), docId, list));
  });
}

export async function hsRedraftAction(docId: string, note: string): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    return done(await redraftHs(await assertOffice("jobs"), docId, String(note ?? "").slice(0, 4000)));
  });
}

export async function hsSaveAction(docId: string, content: HsContent, change: string | null): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    return done(await saveHsContent(await assertOffice("jobs"), docId, content, change ? change.slice(0, 2000) : null));
  });
}

export async function hsHoldPointAction(docId: string, id: string, status: "open" | "answered" | "confirm_on_site", answer: string | null): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    return done(await answerHoldPoint(await assertOffice("jobs"), docId, id, status, answer));
  });
}

export async function hsApproveAction(docId: string): Promise<Result<HsJob & { filing_error?: string }>> {
  return run(async () => {
    need(docId);
    const s = await assertOffice("jobs");
    const r = await approveHs(s, docId);
    // file the approved SWMS and JSA (PDF + Word) on the job; approval stands even if filing fails
    try {
      return done(await fileHsDocs(s, docId));
    } catch (e) {
      return done({ ...r, filing_error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** File the documents on the job again (e.g. after everyone has signed on). */
export async function hsFileAction(docId: string): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    return done(await fileHsDocs(await assertOffice("jobs"), docId));
  });
}

export async function hsMarkSentAction(docId: string, note: string | null): Promise<Result<HsJob>> {
  return run(async () => {
    need(docId);
    return done(await markHsSent(await assertOffice("jobs"), docId, note ? note.slice(0, 500) : null));
  });
}

export async function hsSettingsSaveAction(instructions: string | null, reference: Record<string, unknown> | null, note: string | null): Promise<Result<HsSettings>> {
  return run(async () => {
    const r = await saveHsSettings(await assertOffice("jobs"), instructions, reference, note);
    revalidatePath("/dashboard/office/health-safety/settings");
    return r;
  });
}
