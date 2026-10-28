// Fergus-style status board for the Jobs page: one bar per stage, split red / amber / green,
// dollars underneath. Every bar and colour is a link that filters the job list below.
import Link from "next/link";
import type { BoardColumn, BoardHealth, BoardStage } from "@/lib/office";

const COLOURS: { id: BoardHealth; bg: string; label: string }[] = [
  { id: "red", bg: "bg-red-600 hover:bg-red-700", label: "need someone now" },
  { id: "amber", bg: "bg-amber-500 hover:bg-amber-600", label: "keep an eye on" },
  { id: "green", bg: "bg-emerald-600 hover:bg-emerald-700", label: "on track" },
];

const dollars = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: n >= 1000 ? 0 : 2 });

export function JobBoard({
  columns,
  selected,
  search,
}: {
  columns: BoardColumn[];
  selected: { stage: BoardStage; health: BoardHealth | null } | null;
  search: string;
}) {
  const q = search ? `&q=${encodeURIComponent(search)}` : "";
  const most = Math.max(1, ...columns.map((c) => c.red + c.amber + c.green));
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5" aria-labelledby="board-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="board-h" className="text-sm font-semibold tracking-wide text-slate uppercase">Status board</h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
          {COLOURS.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${c.bg}`} aria-hidden /> {c.label}
            </span>
          ))}
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {columns.map((col) => {
          const total = col.red + col.amber + col.green;
          const isStage = selected?.stage === col.id;
          return (
            <li key={col.id} className={`rounded-xl p-1.5 ${isStage ? "bg-aqua-pale ring-2 ring-aqua-deep" : ""}`}>
              <Link
                href={`/dashboard/office/jobs?f=board:${col.id}${q}`}
                className="block text-center text-[11px] font-semibold tracking-wide text-slate uppercase hover:text-ink sm:text-xs"
              >
                {col.label}
                <span className="sr-only">: {total} jobs</span>
              </Link>
              <div className="mt-2 flex h-40 flex-col justify-end overflow-hidden rounded-lg bg-black/[0.06]" aria-hidden={total === 0}>
                {COLOURS.map((c) => {
                  const n = col[c.id];
                  if (!n) return null;
                  const on = isStage && selected?.health === c.id;
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/office/jobs?f=board:${col.id}:${c.id}${q}`}
                      style={{ height: `${(n / most) * 100}%` }}
                      className={`flex min-h-7 items-center justify-center text-sm font-bold text-white ${c.bg} ${on ? "ring-4 ring-ink ring-inset" : ""}`}
                      aria-label={`${col.label}: ${n} ${c.label}`}
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
