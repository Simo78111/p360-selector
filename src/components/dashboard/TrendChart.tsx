"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Point = { date: string; value: number };

const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => (s * pow * 4) >= v)! * pow;
  return step * 4;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });

/** Single-series area chart with a crosshair tooltip and a table view. */
export function TrendChart({ data, label }: { data: Point[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const xLabels = data.length > 1 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [0];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => Math.min(data.length - 1, Math.max(0, (a ?? data.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const point = active !== null ? data[active] : null;
  const last = data[data.length - 1];

  return (
    <div>
      <div ref={box} className="relative overflow-hidden">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${label} per day. Use left and right arrow keys to read each day.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-aqua-deep"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate text-[11px] tabular-nums">
                {t.toLocaleString("en-NZ")}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              className="fill-slate text-[11px]"
            >
              {shortDate(data[i].date)}
            </text>
          ))}
          <path d={area} fill="var(--color-chart)" fillOpacity={0.1} />
          <path d={line} fill="none" stroke="var(--color-chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {point && active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--color-slate)" strokeWidth={1} />
              <circle cx={x(active)} cy={y(point.value)} r={5} fill="var(--color-chart)" stroke="white" strokeWidth={2} />
            </>
          )}
          {!point && last && (
            <circle cx={x(data.length - 1)} cy={y(last.value)} r={4} fill="var(--color-chart)" stroke="white" strokeWidth={2} />
          )}
        </svg>
        {point && active !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: Math.min(Math.max(x(active) - 60, 0), width - 130) }}
            role="status"
          >
            <p className="text-base font-semibold">{point.value.toLocaleString("en-NZ")}</p>
            <p className="flex items-center gap-1.5 text-white/70">
              <span className="inline-block h-0.5 w-3 bg-chart" aria-hidden />
              {label} · {shortDate(point.date)}
            </p>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate hover:text-ink">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-black/5">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-mist text-slate">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-black/5">
                  <td className="px-3 py-1.5">{shortDate(d.date)}</td>
                  <td className="px-3 py-1.5 text-right">{d.value.toLocaleString("en-NZ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
