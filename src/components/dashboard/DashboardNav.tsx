"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard/office", label: "Today", exact: true },
  { href: "/dashboard/office/attention", label: "Needs attention" },
  { href: "/dashboard/office/jobs", label: "Jobs" },
  { href: "/dashboard/office/plumbers", label: "Plumbers" },
  { href: "/dashboard", label: "Website", exact: true },
  { href: "/dashboard/bookings", label: "Web bookings" },
  { href: "/dashboard/status", label: "Status" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Dashboard">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
