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
  // Big-number tiles (Simon, 8 Nov): the count, a red/amber/green bar you can click into, and the dollar value.
  return (
    <section aria-labelledby="pipeline-board-h" data-testid="pipeline-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-board-h" className="text-xs font-semibold tracking-wider text-slate-600 uppercase">Status board</h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {COLOURS.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${c.bg}`} aria-hidden /> {c.label}
            </span>
          ))}
          <span>· $ excl GST · Invoiced = last 30 days</span>
        </p>
      </div>
      <ol className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {columns.map((col) => {
          const total = col.red + col.amber + col.green;
          const isStage = selected?.stage === col.id;
          const tone = col.red ? "text-red-700" : col.amber ? "text-amber-700" : total ? "text-emerald-700" : "text-slate-400";
          return (
            <li key={col.id} data-testid={`board-${col.id}`}
              className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${isStage ? "ring-2 ring-sky-500" : col.red ? "ring-2 ring-red-500/70" : ""}`}>
              <Link href={href(`stage:${col.id}`)} aria-current={isStage && !selected?.health ? "page" : undefined}
                className="flex flex-col gap-1 hover:opacity-80">
                <span className="text-[11px] leading-tight font-semibold tracking-wider text-slate-600 uppercase">{col.label}</span>
                <span className={`text-3xl leading-none font-bold tabular-nums ${tone}`}>
                  {total}<span className="sr-only"> job{total === 1 ? "" : "s"}</span>
                </span>
              </Link>
              <div className="flex h-6 overflow-hidden rounded-md bg-slate-200">
                {COLOURS.map((c) => {
                  const n = col[c.id];
                  if (!n) return null;
                  const on = isStage && selected?.health === c.id;
                  return (
                    <Link key={c.id} href={href(`stage:${col.id}:${c.id}`)} style={{ flexGrow: n }}
                      className={`flex min-w-6 items-center justify-center text-xs font-bold text-white ${c.bg} ${on ? "ring-2 ring-[#0F172A] ring-inset" : ""}`}
                      aria-label={`${col.label}: ${n} ${c.label}`} aria-current={on ? "page" : undefined} title={`${n} ${c.label}`}>
                      {n}
                    </Link>
                  );
                })}
              </div>
              <p className={`text-sm font-semibold tabular-nums ${total ? "" : "text-slate-500"}`}>{dollars(col.value)}</p>
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
