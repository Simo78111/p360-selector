// The Fergus-style status board for All jobs: one bar per pipeline stage, split red / amber / green, the dollar value
// (excl GST) underneath. The stage name or a bar opens that stage's list; a colour opens just those.
import Link from "next/link";
import type { BoardColumn, Health } from "@/lib/jobs";

const COLOURS: { id: Health; bg: string; label: string }[] = [
  { id: "red", bg: "bg-red-600 hover:bg-red-700", label: "need someone now" },
  { id: "amber", bg: "bg-amber-500 hover:bg-amber-600", label: "keep an eye on" },
  { id: "green", bg: "bg-emerald-600 hover:bg-emerald-700", label: "on track" },
];

const dollars = (n: number) =>
  Number(n).toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: n >= 1000 ? 0 : 2 });

export function PipelineBoard({ columns, selected, href }: {
  columns: BoardColumn[];
  selected: { stage: string; health: Health | null } | null;
  href: (view: string) => string;
}) {
  const most = Math.max(1, ...columns.map((c) => c.red + c.amber + c.green));
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5" aria-labelledby="pipeline-board-h" data-testid="pipeline-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-board-h" className="text-sm font-semibold tracking-wide text-slate uppercase">Status board</h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
          {COLOURS.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${c.bg}`} aria-hidden /> {c.label}
            </span>
          ))}
          <span>· $ excl GST · Invoiced = last 30 days</span>
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
        {columns.map((col) => {
          const total = col.red + col.amber + col.green;
          const isStage = selected?.stage === col.id;
          return (
            <li key={col.id} className={`rounded-xl p-1.5 ${isStage ? "bg-aqua-pale ring-2 ring-aqua-deep" : ""}`} data-testid={`board-${col.id}`}>
              <Link
                href={href(`stage:${col.id}`)}
                aria-current={isStage && !selected?.health ? "page" : undefined}
                className="block min-h-8 text-center text-[11px] leading-tight font-semibold tracking-wide text-slate uppercase hover:text-ink sm:text-xs"
              >
                {col.label}
                <span className="sr-only">: {total}</span>
              </Link>
              <div className="mt-2 flex h-36 flex-col justify-end overflow-hidden rounded-lg bg-black/[0.06]">
                {COLOURS.map((c) => {
                  const n = col[c.id];
                  if (!n) return null;
                  const on = isStage && selected?.health === c.id;
                  return (
                    <Link
                      key={c.id}
                      href={href(`stage:${col.id}:${c.id}`)}
                      style={{ height: `${(n / most) * 100}%` }}
                      className={`flex min-h-7 items-center justify-center text-sm font-bold text-white ${c.bg} ${on ? "ring-4 ring-ink ring-inset" : ""}`}
                      aria-label={`${col.label}: ${n} ${c.label}`}
                      aria-current={on ? "page" : undefined}
                      title={`${n} ${c.label}`}
                    >
                      {n}
                    </Link>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-sm font-bold tabular-nums">{dollars(col.value)}</p>
              <p className="text-center text-xs text-slate">{total} job{total === 1 ? "" : "s"}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function HealthDot({ health, why }: { health?: Health; why?: string | null }) {
  if (!health) return null;
  const bg = health === "red" ? "bg-red-600" : health === "amber" ? "bg-amber-500" : "bg-emerald-600";
  const label = COLOURS.find((c) => c.id === health)!.label;
  return (
    <span className="inline-flex items-center gap-1.5" title={why ?? label}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${bg}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
