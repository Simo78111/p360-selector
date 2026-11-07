import Link from "next/link";
import type { Company } from "@/lib/jm";

export const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
export const area = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
export const label = "block text-xs font-semibold text-slate";
export const primaryBtn = "rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800";
export const quietBtn = "rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-slate-400";

/** Plumbing 360 / Project 360 switch for pages that show one company at a time. */
export function CompanyTabs({ companies, current, path }: { companies: Company[]; current: string; path: string }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Company">
      {companies.map((c) => (
        <Link
          key={c.id}
          href={`${path}?co=${c.code}`}
          aria-current={c.code === current ? "page" : undefined}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${c.code === current ? "bg-[#0F172A] text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:text-ink"}`}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—"
    : `${Number(n) < 0 ? "−" : ""}$${Math.abs(Number(n)).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const nzDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
