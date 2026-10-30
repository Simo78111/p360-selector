"use server";
// Job photos from the office: the browser uploads each (already shrunk) photo straight to
// storage with a one-off address, then the photo is recorded on the job.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import { sendJobPhotos } from "@/lib/email";
import { addPhoto, downloadPhoto, loadJob, loadJobPhotos, notePhotosEmailed, photoUploadUrl, removePhoto } from "@/lib/office";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    await assertOffice("bookings");
    return { ok: true, data: await work() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const STAGES = ["before", "during", "after", "other"];

export async function startPhotoUploadAction(jobId: string) {
  return attempt(async () => {
    if (!isId(jobId)) throw new Error("Unknown job");
    const path = `${jobId}/office-${randomUUID()}.jpg`;
    return { path, url: await photoUploadUrl(path) };
  });
}

export async function finishPhotoUploadAction(jobId: string, path: string, stage: string, caption: string, bytes: number) {
  const r = await attempt(() =>
    addPhoto(jobId, path, STAGES.includes(stage) ? stage : "after", caption.trim().slice(0, 200) || null, Math.round(bytes) || null),
  );
  revalidatePath("/dashboard/office", "layout");
  return r;
}

export async function removePhotoAction(form: FormData) {
  await assertOffice("bookings");
  const back = String(form.get("back") ?? "/dashboard/office");
  let q: string;
  try {
    await removePhoto(String(form.get("photoId") ?? ""));
    q = `ok=${encodeURIComponent("Photo removed from the job.")}`;
  } catch (e) {
    q = `err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(`${back.startsWith("/dashboard/office") ? back : "/dashboard/office"}?${q}#photos`);
}

const MAX_EMAIL_PHOTOS = 20;

export async function emailPhotosAction(jobNumber: number, photoIds: string[], to: string, message: string) {
  const r = await attempt(async () => {
    const email = to.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter the customer's email address.");
    if (photoIds.length === 0) throw new Error("Tick the photos to send.");
    if (photoIds.length > MAX_EMAIL_PHOTOS) throw new Error(`Send up to ${MAX_EMAIL_PHOTOS} photos at a time.`);
    const job = await loadJob(jobNumber);
    if (!job) throw new Error("Job not found");
    const chosen = (await loadJobPhotos(job.job_id)).filter((p) => photoIds.includes(p.id));
    if (chosen.length === 0) throw new Error("Those photos aren't on this job any more.");
    const photos = await Promise.all(
      chosen.map(async (p, i) => ({ filename: `job-${job.job_number}-${p.stage}-${i + 1}.jpg`, data: await downloadPhoto(p.path) })),
    );
    await sendJobPhotos({ to: email, customerName: job.customer, jobNumber: job.job_number, service: job.service, message, photos });
    await notePhotosEmailed(job.job_id, email, photos.length);
    return { sent: photos.length, to: email };
  });
  revalidatePath("/dashboard/office", "layout");
  return r;
}
