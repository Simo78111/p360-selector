"use client";
// Photos on a job: add them (shrunk in the browser to ~1600px first), look at them, remove them,
// and email the ones you tick to the customer.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  emailPhotosAction,
  finishPhotoUploadAction,
  removePhotoAction,
  startPhotoUploadAction,
} from "@/app/dashboard/photo-actions";
import type { JobPhoto } from "@/lib/office";

const STAGE_LABEL: Record<JobPhoto["stage"], string> = { before: "Before", during: "During", after: "After", other: "Other" };
const field = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm";

/** Shrinks a photo to a JPEG no bigger than 1600px (keeps the phone's rotation). */
async function shrink(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} isn't a photo this browser can read (try a JPEG).`);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo"))), "image/jpeg", 0.82),
  );
}

export function JobPhotos({
  jobId,
  jobNumber,
  photos,
  customerEmail,
  firstName,
  back,
}: {
  jobId: string;
  jobNumber: number;
  photos: JobPhoto[];
  customerEmail: string | null;
  firstName: string;
  back: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<JobPhoto["stage"]>("after");
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState(customerEmail ?? "");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        setProgress(`Adding photo ${done + 1} of ${files.length}…`);
        const blob = await shrink(file);
        const start = await startPhotoUploadAction(jobId);
        if (!start.ok) throw new Error(start.error);
        const put = await fetch(start.data.url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        const fin = await finishPhotoUploadAction(jobId, start.data.path, stage, caption, blob.size);
        if (!fin.ok) throw new Error(fin.error);
        done++;
      }
      setMsg({ ok: true, text: `${done} photo${done === 1 ? "" : "s"} added.` });
      setCaption("");
    } catch (e) {
      setMsg({ ok: false, text: `${done ? `${done} added, then: ` : ""}${e instanceof Error ? e.message : String(e)}` });
    }
    setProgress(null);
    router.refresh();
  }

  async function email() {
    setProgress("Sending…"); setMsg(null);
    const r = await emailPhotosAction(jobNumber, picked, to, note);
    setProgress(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Emailed ${r.data.sent} photo${r.data.sent === 1 ? "" : "s"} to ${r.data.to}.` });
    setPicked([]); setNote("");
    router.refresh();
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Stage</span>
          <select id="photo-stage" value={stage} onChange={(e) => setStage(e.target.value as JobPhoto["stage"])} className={field}>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block font-medium">Caption (optional)</span>
          <input id="photo-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} className={`${field} w-full`} />
        </label>
        <label className={`cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white ${progress ? "pointer-events-none opacity-50" : ""}`}>
          + Add photos
          <input id="photo-file" type="file" accept="image/*" multiple className="sr-only" disabled={!!progress}
                 onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-slate">No photos yet. Plumbers can add them from the app, or add them here.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Photos">
          {photos.map((p) => (
            <li key={p.id} className={`overflow-hidden rounded-xl border-2 ${picked.includes(p.id) ? "border-aqua-deep" : "border-transparent"} bg-mist`}>
              <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.url && <img src={p.url} alt={p.caption ?? `${STAGE_LABEL[p.stage]} photo`} loading="lazy" className="h-full w-full object-cover" />}
              </a>
              <div className="space-y-1 p-2 text-xs">
                <label className="flex items-center gap-1.5 font-semibold">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4"
                         aria-label={`Pick ${STAGE_LABEL[p.stage]} photo ${p.caption ?? ""}`} />
                  {STAGE_LABEL[p.stage]}
                </label>
                {p.caption && <p>{p.caption}</p>}
                <p className="text-slate">{p.by} · {p.at}</p>
                <form action={removePhotoAction}>
                  <input type="hidden" name="photoId" value={p.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="text-slate hover:text-red-700 hover:underline">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <div className="space-y-2 rounded-xl bg-mist/60 p-4">
          <p className="text-sm font-medium">
            Email {picked.length ? `${picked.length} ticked photo${picked.length === 1 ? "" : "s"}` : "photos (tick them above)"} to {firstName}
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="photo-to">Customer email</label>
            <input id="photo-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" className={`${field} min-w-0 flex-1`} />
            <button type="button" onClick={() => setPicked(picked.length === photos.length ? [] : photos.map((p) => p.id))}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:border-ink">
              {picked.length === photos.length ? "Untick all" : "Tick all"}
            </button>
          </div>
          <label className="sr-only" htmlFor="photo-note">Message</label>
          <textarea id="photo-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Message (optional)"
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
          <button type="button" onClick={email} disabled={!picked.length || !to || !!progress}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Email photos
          </button>
        </div>
      )}

      {progress && <p role="status" className="text-sm text-slate">{progress}</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-900"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
