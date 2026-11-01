"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavLinkItem = { href: string; label: string; exact?: boolean; also?: string[] };
export type NavItem = NavLinkItem & { children?: NavLinkItem[]; badge?: number; badgeLabel?: string };

const isActive = (pathname: string, item: NavLinkItem) =>
  item.exact ? pathname === item.href : [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));

const pill = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`;

/** The office console's top bar: the layout passes only the items this person's role can open. */
export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Dashboard">
      {items.map((item) =>
        item.children?.length ? (
          <NavMenu key={item.href} item={item} pathname={pathname} />
        ) : (
          <Link key={item.href} href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined}
            className={`${pill(isActive(pathname, item))} inline-flex items-center gap-1.5`}>
            {item.label}
            {!!item.badge && (
              <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs leading-5 font-bold text-white"
                data-testid={`badge-${item.href.split("/").pop()}`}>
                {item.badge > 99 ? "99+" : item.badge}
                <span className="sr-only"> {item.badgeLabel}</span>
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  );
}

function NavMenu({ item, pathname }: { item: NavItem; pathname: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = isActive(pathname, item);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`${pill(active)} inline-flex items-center gap-1`}
      >
        {item.label}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="absolute left-0 z-30 mt-2 w-60 rounded-2xl border border-black/5 bg-white p-1.5 shadow-lg" data-testid={`menu-${item.label.toLowerCase()}`}>
          {item.children!.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                aria-current={isActive(pathname, c) ? "page" : undefined}
                className={`block rounded-xl px-3 py-2 text-sm ${isActive(pathname, c) ? "bg-aqua-pale font-semibold text-aqua-deep" : "hover:bg-mist"}`}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The gear on the right of the top bar: lit up on any page that lives under Settings. */
export function SettingsLink({ paths }: { paths: string[] }) {
  const pathname = usePathname();
  const active = paths.some((p) => (p === "/dashboard" ? pathname === p : pathname === p || pathname.startsWith(`${p}/`)));
  return (
    <Link
      href="/dashboard/settings"
      aria-current={active ? "page" : undefined}
      className={`${pill(active)} inline-flex items-center gap-1.5`}
      data-testid="settings-link"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      Settings
    </Link>
  );
}
