// Phase 3e: pieces shared by the report pages — the report tabs, the filter row, stat tiles and simple bar charts.
import Link from "next/link";
import { money } from "@/components/office/jm";
import { REPORTS } from "@/lib/office-menu";
import { RANGES, type RangeKey, type ReportCompany } from "@/lib/reports";

export const SERIES = ["#1a9fc4", "#8a5cd0"]; // validated pair (light surface): company 1, company 2

export function ReportShell({ path, title, intro, csvHref, children }: {
  path: string; title: string; intro: React.ReactNode; csvHref?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-6" data-testid="report-page">
      <nav className="flex flex-wrap gap-1" aria-label="Reports">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} aria-current={r.href === path ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${r.href === path ? "bg-ink text-white" : "bg-white text-slate hover:text-ink"}`}>
            {r.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">{intro}</p>
        </div>
        {csvHref && (
          <a href={csvHref} className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold hover:border-ink" data-testid="report-csv">
            Download CSV
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

/** One row of filters above the report: date range (presets + custom), company, and any extra fields. */
export function ReportFilters({ path, range, from, to, companies, company, withDates = true, extra }: {
  path: string; range?: RangeKey; from?: string; to?: string; companies: ReportCompany[]; company?: string;
  withDates?: boolean; extra?: React.ReactNode;
}) {
  const sel = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm";
  return (
    <form action={path} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4" data-testid="report-filters">
      {withDates && (
        <>
          <label className="text-xs font-semibold text-slate">
            Period
            <select name="range" defaultValue={range} className={`${sel} mt-1 block`}>
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              <option value="custom">Dates below</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate">
            From
            <input type="date" name="from" defaultValue={from} className={`${sel} mt-1 block`} />
          </label>
          <label className="text-xs font-semibold text-slate">
            To
            <input type="date" name="to" defaultValue={to} className={`${sel} mt-1 block`} />
          </label>
        </>
      )}
      {companies.length > 1 && (
        <label className="text-xs font-semibold text-slate">
          Company
          <select name="co" defaultValue={company ?? ""} className={`${sel} mt-1 block`}>
            <option value="">Both companies</option>
            {companies.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
          </select>
        </label>
      )}
      {extra}
      <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Show</button>
      {withDates && <p className="w-full text-xs text-slate">Changing the dates switches to &quot;Dates below&quot;. Financial year: 1 April – 31 March. All figures excl GST.</p>}
    </form>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold text-slate">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "bad" ? "text-red-700" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate">{sub}</p>}
    </div>
  );
}

/** "+12% on the previous period" — or nothing when there's nothing to compare with. */
export function Change({ now, then, label }: { now: number; then: number; label: string }) {
  if (!then) return <>No sales {label}</>;
  const pct = ((now - then) / Math.abs(then)) * 100;
  return <>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% on {label} ({money(then)})</>;
}

/** Horizontal bars for one series (e.g. sales by category). Values and labels in ink; the bar carries length only. */
export function HBars({ rows, testId }: { rows: { label: string; value: number; href?: string }[]; testId?: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="space-y-2.5" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${money(r.value)}`}>
          <span className="truncate">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</span>
          <span className="h-3 rounded-r bg-mist">
            <span className="block h-3 rounded-r" style={{ width: `${Math.max((Math.abs(r.value) / max) * 100, r.value ? 1 : 0)}%`, background: SERIES[0] }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{money(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columns per month, one bar per company (fixed colour per company, legend above). */
export function MonthBars({ months, series }: { months: string[]; series: { code: string; name: string; values: number[] }[] }) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const label = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-NZ", { month: "short", year: "2-digit", timeZone: "UTC" });
  return (
    <div data-testid="month-bars">
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate">
          {series.map((s, i) => (
            <li key={s.code} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="flex h-48 items-end gap-3 overflow-x-auto border-b border-grid pb-0">
        {months.map((m, mi) => (
          <div key={m} className="flex min-w-12 flex-1 flex-col items-center">
            <div className="flex h-44 w-full items-end justify-center gap-0.5">
              {series.map((s, i) => (
                <div key={s.code} className="group relative flex h-full max-w-8 flex-1 items-end">
                  <div className="w-full rounded-t" title={`${s.name}, ${label(m)}: ${money(s.values[mi])}`}
                    aria-label={`${s.name}, ${label(m)}: ${money(s.values[mi])}`} role="img"
                    style={{ height: `${(s.values[mi] / max) * 100}%`, minHeight: s.values[mi] ? 2 : 0, background: SERIES[i % SERIES.length] }} />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                    {s.code} {money(s.values[mi])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pt-1">
        {months.map((m) => <span key={m} className="min-w-12 flex-1 text-center text-xs text-slate">{label(m)}</span>)}
      </div>
    </div>
  );
}

export const th = "px-2 py-2 text-left text-xs font-semibold text-slate";
export const thR = "px-2 py-2 text-right text-xs font-semibold text-slate";
export const td = "px-2 py-2 align-top";
export const tdR = "px-2 py-2 text-right align-top tabular-nums";
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);

export function JobRef({ jobRef, title }: { jobRef: string; title?: string | null }) {
  return (
    <Link href={`/dashboard/office/job/${jobRef}`} className="font-semibold hover:underline">
      {jobRef}
      {title && <span className="block text-xs font-normal text-slate">{title}</span>}
    </Link>
  );
}
