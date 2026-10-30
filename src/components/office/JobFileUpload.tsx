"use client";
// Add files and photos to a job: each goes straight from the browser to storage with a one-off address,
// then is recorded on the job (and in its history).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishFileUploadAction, startFileUploadAction } from "@/app/dashboard/job-actions";

const MAX = 25 * 1024 * 1024;

export function JobFileUpload({ jobId, phases }: { jobId: string; phases: { id: string; ref: string; name: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const files = Array.from(input.current?.files ?? []);
    if (files.length === 0) return;
    setError(null);
    for (const [i, file] of files.entries()) {
      if (file.size > MAX) {
        setError(`${file.name} is over 25 MB.`);
        continue;
      }
      setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
      const start = await startFileUploadAction(jobId, file.name);
      if (!start.ok) {
        setError(start.error);
        break;
      }
      const put = await fetch(start.data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) {
        setError(`Couldn't upload ${file.name} (${put.status}).`);
        break;
      }
      const fin = await finishFileUploadAction(jobId, phase || null, start.data.path, file.name, file.type, file.size, caption);
      if (!fin.ok) {
        setError(fin.error);
        break;
      }
    }
    setBusy(null);
    setCaption("");
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-2xl border-2 border-dashed border-aqua/60 p-3" data-testid="file-upload">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate">
          Files or photos
          <input ref={input} type="file" multiple className="mt-1 block text-sm" aria-label="Choose files or photos" />
        </label>
        {phases.length > 0 && (
          <label className="text-xs font-semibold text-slate">
            Phase
            <select value={phase} onChange={(e) => setPhase(e.target.value)} className="mt-1 block rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">
              <option value="">Whole job</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.ref} {p.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-slate">
          Caption (optional)
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} className="mt-1 block rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm" />
        </label>
        <button type="button" onClick={upload} disabled={busy !== null} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {busy && <p className="text-xs text-slate" role="status">{busy}</p>}
      {error && <p className="text-xs font-medium text-red-700" role="alert">{error}</p>}
    </div>
  );
}
