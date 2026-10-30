"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean };

/** The office console menu: the layout passes only the items this person's role can open. */
export function DashboardNav({ items }: { items: NavItem[] }) {
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
