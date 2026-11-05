"use client";
// Add a PDF plan set: the browser reads its pages (size and sheet number), uploads it straight to the job's files
// (up to 100 MB), and it becomes a plan set — Rev A, or the next revision when the name is already used.
import { useState } from "react";
import { takeoffAddPlanAction, takeoffUploadUrlAction } from "@/app/dashboard/takeoff-actions";
import { describePages, openPdf } from "./pdf";

const MAX = 100 * 1024 * 1024;

export function PlanUpload({ jobId, names, onDone }: {
  jobId: string; names: string[];
  /** previous: the older revision whose takeoff can be copied onto this one (4c). */
  onDone: (planId: string, message: string, previous?: { id: string; revision: string; marks: number }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setErr("Choose the PDF.");
    if (file.size > MAX) return setErr("That PDF is over 100 MB: split the set or print it smaller.");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setErr("Plans must be a PDF.");
    setErr(null);
    try {
      setStep("Reading the pages…");
      const bytes = await file.arrayBuffer();
      const { doc, close } = await openPdf(bytes);
      const pages = await describePages(doc, (n) => setStep(`Reading the pages… ${n} of ${doc.numPages}`));
      await close();
      setStep(`Uploading ${(file.size / 1048576).toFixed(1)} MB…`);
      const up = await takeoffUploadUrlAction(jobId, file.name);
      if (!up.ok) throw new Error(up.error);
      const put = await fetch(up.data.url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error(put.status === 413 ? "The file store won't take a file this big." : `Upload failed (${put.status}).`);
      setStep("Saving…");
      const r = await takeoffAddPlanAction(jobId, up.data.path, file.name, file.size, name.trim() || file.name.replace(/\.pdf$/i, ""), pages);
      if (!r.ok) throw new Error(r.error);
      onDone(r.data.id, r.data.message, r.data.previous);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setStep(null);
    }
  }

  return (
    <form onSubmit={go} className="space-y-3 text-sm" data-testid="plan-upload">
      <label className="block">
        <span className="text-xs font-semibold text-slate">PDF plan set (up to 100 MB)</span>
        <input type="file" accept="application/pdf,.pdf" className="mt-1 block w-full text-sm" data-testid="plan-file" onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          if (f && !name) setName(f.name.replace(/\.pdf$/i, "").replace(/_/g, " "));
        }} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate">Name</span>
        <input className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" value={name} maxLength={200} list="tk-plan-names"
          onChange={(e) => setName(e.target.value)} placeholder="e.g. Kiosk hydraulics" data-testid="plan-name" />
        <datalist id="tk-plan-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <span className="mt-1 block text-xs text-slate">Use an existing name for a new revision of the same set (Rev B, Rev C…). Older revisions stay readable.</span>
      </label>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{err}</p>}
      {step && <p className="text-xs text-slate" role="status">{step}</p>}
      <button type="submit" disabled={!!step || !file} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Add plans
      </button>
    </form>
  );
}
