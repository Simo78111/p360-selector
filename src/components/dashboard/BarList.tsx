"use client";

import { useState } from "react";

export type Bar = { label: string; value: number; detail?: string };

/**
 * Horizontal bars for comparing amounts (one colour, longest = largest).
 * Each row shows its value at the bar's tip and an optional detail line; the
 * hovered or focused row is highlighted.
 */
export function BarList({ bars, valueLabel, empty = "No data yet" }: { bars: Bar[]; valueLabel: string; empty?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);

  if (!bars.length) return <p className="py-6 text-sm text-slate">{empty}</p>;

  return (
    <ul className="space-y-1" aria-label={valueLabel}>
      {bars.map((bar, i) => (
        <li
          key={bar.label}
          tabIndex={0}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          className={`relative rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-aqua-deep ${active === i ? "bg-aqua-pale" : ""}`}
          aria-label={`${bar.label}: ${bar.value.toLocaleString("en-NZ")} ${valueLabel}${bar.detail ? `. ${bar.detail}` : ""}`}
        >
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">{bar.label}</span>
            {bar.detail && <span className="shrink-0 text-xs text-slate">{bar.detail}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-3 rounded-r-[4px] bg-chart transition-[width] duration-500"
              style={{ width: `${Math.max((bar.value / max) * 85, bar.value ? 1 : 0)}%` }}
              aria-hidden
            />
            <span className="text-sm font-semibold tabular-nums">{bar.value.toLocaleString("en-NZ")}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
