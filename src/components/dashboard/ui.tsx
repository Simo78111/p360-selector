import Link from "next/link";
import type { ReactNode } from "react";
import type { BookingStatus } from "@/lib/dashboard-data";

export function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 sm:p-6 ${className}`}>
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const ranges = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export function parseDays(value?: string) {
  const n = Number(value);
  return ranges.some((r) => r.days === n) ? n : 30;
}

export function RangeTabs({ days, basePath, extra = "" }: { days: number; basePath: string; extra?: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Date range">
      {ranges.map((r) => (
        <Link
          key={r.days}
          href={`${basePath}?days=${r.days}${extra}`}
          aria-current={r.days === days ? "true" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
            r.days === days ? "border-ink bg-ink text-white" : "border-black/10 bg-white text-slate hover:text-ink"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

const statusStyles: Record<BookingStatus, { label: string; className: string; icon: string }> = {
  new: { label: "New", className: "bg-aqua-light text-ink", icon: "●" },
  pending_payment: { label: "Awaiting deposit", className: "bg-amber-100 text-amber-900", icon: "◐" },
  paid: { label: "Deposit paid", className: "bg-green-100 text-green-900", icon: "✓" },
  completed: { label: "Completed", className: "bg-mist text-slate", icon: "✓" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-800", icon: "✕" },
};

export const statusList = Object.entries(statusStyles).map(([id, s]) => ({ id: id as BookingStatus, label: s.label }));

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = statusStyles[status] ?? statusStyles.new;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
