import { STAGES, STATE_LABEL, stageLabel, type JobState, type Stage } from "@/lib/jobs";

// Colours along the pipeline: grey (not started) → blue (working) → amber (money to chase) → green (invoiced).
export const STAGE_TONE: Record<Stage, string> = {
  to_schedule: "bg-slate-100 text-slate-800",
  to_start: "bg-sky-100 text-sky-900",
  in_progress: "bg-blue-100 text-blue-900",
  labour_complete: "bg-indigo-100 text-indigo-900",
  to_invoice: "bg-amber-100 text-amber-900",
  to_be_approved: "bg-orange-100 text-orange-900",
  invoiced: "bg-emerald-100 text-emerald-900",
};

export function StageChip({ stage, prefix }: { stage: Stage | null; prefix?: string }) {
  if (!stage) return <span className="text-xs text-slate">—</span>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_TONE[stage]}`}>
      {prefix && <span className="mr-1 font-bold">{prefix}</span>}
      {stageLabel(stage)}
    </span>
  );
}

const STATE_TONE: Record<JobState, string> = {
  active: "bg-emerald-50 text-emerald-900",
  on_hold: "bg-amber-100 text-amber-900",
  cancelled: "bg-red-100 text-red-800",
  closed: "bg-slate-200 text-slate-800",
};

export function StateBadge({ state }: { state: JobState }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_TONE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

export function CompanyBadge({ code }: { code: string }) {
  const tone = code === "PTSL" ? "bg-blue-900 text-white" : "bg-teal-700 text-white";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tone}`}>{code}</span>;
}

/** The seven pipeline stages in a row, with the current one marked. */
export function PipelineBar({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex flex-wrap gap-1" aria-label={`Pipeline: ${stageLabel(stage)}`}>
      {STAGES.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === at ? "step" : undefined}
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            i === at ? `${STAGE_TONE[s.id]} ring-2 ring-ink/30` : i < at ? "bg-emerald-50 text-emerald-800" : "bg-mist text-slate"
          } ${compact ? "px-1.5" : ""}`}
        >
          {i < at ? "✓ " : ""}
          {s.label}
        </li>
      ))}
    </ol>
  );
}
