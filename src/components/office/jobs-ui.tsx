import { STAGES, STATE_LABEL, stageLabel, type JobState, type Stage } from "@/lib/jobs";

// Colours along the pipeline: grey (not started) → blue (working) → amber (money to chase) → green (invoiced).
export const STAGE_TONE: Record<Stage, string> = {
  // Solid colours (Simon, 8 Nov) so a stage reads at a glance on white.
  to_schedule: "bg-slate-300 text-slate-900",
  to_start: "bg-sky-600 text-white",
  in_progress: "bg-blue-600 text-white",
  labour_complete: "bg-indigo-600 text-white",
  to_invoice: "bg-amber-500 text-amber-950",
  to_be_approved: "bg-orange-600 text-white",
  invoiced: "bg-emerald-600 text-white",
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

/** The phase card's stepper on its dark header (Simon picked style B, 8 Nov): green ticks done, a glowing ring on the
 *  current stage, grey rings still to come, joined by a line. */
export function PhaseStepper({ stage }: { stage: Stage }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  const line = (done: boolean) => `h-[3px] flex-1 ${done ? "bg-green-500" : "bg-slate-600"}`;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <ol className="grid min-w-[36rem] grid-cols-7" aria-label={`Pipeline: ${stageLabel(stage)}`}>
        {STAGES.map((s, i) => (
          <li key={s.id} aria-current={i === at ? "step" : undefined} className="flex flex-col items-center gap-2">
            <span className="flex w-full items-center">
              <span className={i === 0 ? "flex-1" : line(i <= at)} />
              {i < at ? (
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-green-500 text-sm font-bold text-green-950" aria-hidden>✓</span>
              ) : i === at ? (
                <span className="h-[26px] w-[26px] rounded-full border-[6px] border-sky-400 bg-white shadow-[0_0_0_5px_rgba(56,189,248,.25)]" aria-hidden />
              ) : (
                <span className="h-[26px] w-[26px] rounded-full border-2 border-slate-500" aria-hidden />
              )}
              <span className={i === STAGES.length - 1 ? "flex-1" : line(i < at)} />
            </span>
            <span className={`text-center text-xs ${i === at ? "font-bold text-white" : "text-slate-300"}`}>
              {s.label}{i < at && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
