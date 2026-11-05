"use client";
// Add a PDF plan set: the browser reads its pages (size and sheet number), uploads it straight to the job's files
// (up to 100 MB), and it becomes a plan set — Rev A, or the next revision of an existing set.
// When the job already has plans, the form asks "a new revision of [set]" or "a new plan set", and picks the likely one
// from the sheet numbers: a PDF whose sheets (H-000, H-110…) match an existing set is a new revision of it.
import { useMemo, useState } from "react";
import { takeoffAddPlanAction, takeoffUploadUrlAction } from "@/app/dashboard/takeoff-actions";
import { likelySet, type TakeoffPlan } from "@/lib/takeoff-shared";
import { describePages, openPdf } from "./pdf";

const MAX = 100 * 1024 * 1024;
type PageInfo = Awaited<ReturnType<typeof describePages>>[number];

export function PlanUpload({ jobId, plans, onDone }: {
  jobId: string; plans: TakeoffPlan[];
  /** previous: the older revision whose takeoff can be copied onto this one (4c). */
  onDone: (planId: string, message: string, previous?: { id: string; revision: string; marks: number }) => void;
}) {
  // the existing sets, each with its newest revision's sheet numbers
  const sets = useMemo(() => {
    const out = new Map<string, { name: string; latest: TakeoffPlan }>();
    for (const p of plans) {
      const k = p.name.toLowerCase();
      const cur = out.get(k);
      if (!cur || p.revision > cur.latest.revision) out.set(k, { name: p.name, latest: p });
    }
    return [...out.values()].map((s) => ({ name: s.name, rev: s.latest.revision, pages: s.latest.page_count,
      labels: s.latest.pages.map((p) => p.label) }));
  }, [plans]);
  const nextRev = (name: string) => {
    const n = plans.filter((p) => p.name.toLowerCase() === name.toLowerCase()).length;
    return n < 26 ? String.fromCharCode(65 + n) : `${String.fromCharCode(64 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`;
  };

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [kind, setKind] = useState<"revision" | "new">(sets.length ? "revision" : "new");
  const [target, setTarget] = useState(sets[0]?.name ?? "");
  const [name, setName] = useState("");
  const [guess, setGuess] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(f: File | null) {
    setFile(f);
    setPages(null);
    setGuess(null);
    setErr(null);
    if (!f) return;
    if (!name) setName(f.name.replace(/\.pdf$/i, "").replace(/_/g, " "));
    if (f.size > MAX) return setErr("That PDF is over 100 MB: split the set or print it smaller.");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setErr("Plans must be a PDF.");
    try {
      setStep("Reading the pages…");
      const { doc, close } = await openPdf(await f.arrayBuffer());
      const ps = await describePages(doc, (n) => setStep(`Reading the pages… ${n} of ${doc.numPages}`));
      await close();
      setPages(ps);
      setStep(null);
      if (!sets.length) return;
      const g = likelySet(sets, ps);
      if (g) {
        setKind("revision");
        setTarget(g.name);
        setGuess(`Looks like a new revision of ${g.name}: ${g.why}.`);
      } else {
        setKind("new");
        setGuess("Its sheet numbers don't match the plans already on this job, so it looks like a new plan set.");
      }
    } catch (e) {
      setStep(null);
      setErr(e instanceof Error ? `Couldn't read that PDF: ${e.message}` : "Couldn't read that PDF.");
    }
  }

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !pages) return setErr("Choose the PDF.");
    const finalName = kind === "revision" ? target : name.trim() || file.name.replace(/\.pdf$/i, "");
    if (kind === "new" && sets.some((s) => s.name.toLowerCase() === finalName.toLowerCase())) {
      return setErr(`There's already a plan set called ${finalName}: choose "New revision" or give it another name.`);
    }
    setErr(null);
    try {
      setStep(`Uploading ${(file.size / 1048576).toFixed(1)} MB…`);
      const up = await takeoffUploadUrlAction(jobId, file.name);
      if (!up.ok) throw new Error(up.error);
      const put = await fetch(up.data.url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error(put.status === 413 ? "The file store won't take a file this big." : `Upload failed (${put.status}).`);
      setStep("Saving…");
      const r = await takeoffAddPlanAction(jobId, up.data.path, file.name, file.size, finalName, pages);
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
        <input type="file" accept="application/pdf,.pdf" className="mt-1 block w-full text-sm" data-testid="plan-file"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
      </label>

      {sets.length > 0 && (
        <fieldset className="space-y-2" data-testid="plan-kind">
          <legend className="text-xs font-semibold text-slate">What is it?</legend>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="tk-kind" checked={kind === "revision"} onChange={() => setKind("revision")} data-testid="kind-revision" />
            <span>A new revision of</span>
            <select value={target} onChange={(e) => { setTarget(e.target.value); setKind("revision"); }}
              className="rounded-lg border border-black/15 px-2 py-1" data-testid="revision-of">
              {sets.map((s) => <option key={s.name} value={s.name}>{s.name} (now Rev {s.rev})</option>)}
            </select>
            {kind === "revision" && <span className="text-xs text-slate">→ becomes Rev {nextRev(target)}</span>}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tk-kind" checked={kind === "new"} onChange={() => setKind("new")} data-testid="kind-new" />
            <span>A new plan set (another discipline or building)</span>
          </label>
          {guess && <p className="rounded-lg bg-aqua-pale/60 px-3 py-2 text-xs" data-testid="plan-guess">{guess}</p>}
        </fieldset>
      )}

      {(kind === "new" || sets.length === 0) && (
        <label className="block">
          <span className="text-xs font-semibold text-slate">Name</span>
          <input className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" value={name} maxLength={200}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Hydraulics" data-testid="plan-name" />
          <span className="mt-1 block text-xs text-slate">A short name for the set, e.g. Hydraulics or Drainage. It becomes Rev A; later revisions are added to it.</span>
        </label>
      )}

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{err}</p>}
      {step && <p className="text-xs text-slate" role="status">{step}</p>}
      <button type="submit" disabled={!!step || !file || !pages} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        data-testid="add-plans-submit">
        {kind === "revision" && sets.length ? `Add as ${target} Rev ${nextRev(target)}` : "Add plans"}
      </button>
    </form>
  );
}
