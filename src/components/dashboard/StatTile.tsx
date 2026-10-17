import type { Kpi } from "@/lib/dashboard-data";

const compact = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });

export function formatKpi(kpi: Pick<Kpi, "id" | "value">) {
  return kpi.id === "deposits" ? `$${compact.format(kpi.value)}` : compact.format(kpi.value);
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 4 - (v / max) * (h - 8)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className="shrink-0">
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--color-chart-muted)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={4} fill="var(--color-chart)" stroke="white" strokeWidth={2} />
    </svg>
  );
}

export function StatTile({ kpi, periodLabel }: { kpi: Kpi; periodLabel: string }) {
  const change = kpi.previous === 0 ? null : (kpi.value - kpi.previous) / kpi.previous;
  const good = change !== null && (change >= 0) === kpi.upIsGood;
  return (
    <div className="h-full rounded-2xl bg-white p-5">
      <p className="text-sm text-slate">{kpi.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold">{formatKpi(kpi)}</p>
        <Sparkline values={kpi.spark} />
      </div>
      <p className="mt-2 text-xs text-slate">
        {change === null ? (
          <>No data for the {periodLabel} before</>
        ) : (
          <>
            <span className={`font-semibold ${Math.abs(change) < 0.005 ? "text-slate" : good ? "text-green-700" : "text-red-700"}`}>
              {change > 0 ? "▲" : change < 0 ? "▼" : ""} {change > 0 ? "+" : ""}
              {Math.round(change * 100)}%
            </span>{" "}
            vs the {periodLabel} before
          </>
        )}
      </p>
    </div>
  );
}
