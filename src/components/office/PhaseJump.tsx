"use client";
// "Jump to" on the phase card: picking a stage moves the phase straight away (no separate Go button).
import { movePhaseAction } from "@/app/dashboard/job-actions";

export function PhaseJump({ phaseId, back, stages }: { phaseId: string; back: string; stages: { id: string; label: string }[] }) {
  if (!stages.length) return null;
  return (
    <form action={movePhaseAction} className="flex items-center gap-2 text-sm text-slate-600">
      <input type="hidden" name="phaseId" value={phaseId} />
      <input type="hidden" name="back" value={back} />
      <label htmlFor={`jump-${phaseId}`}>Jump to</label>
      <select id={`jump-${phaseId}`} name="stage" defaultValue="" onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
        <option value="" disabled>Choose stage…</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </form>
  );
}
