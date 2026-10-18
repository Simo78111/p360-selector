"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nav, site } from "@/lib/site";
import { Logo } from "./Logo";
import { ButtonLink, Container } from "./ui";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // No need for the button while someone is already in the finder or booking.
  const showFinderButton = !isActive("/get-started") && !isActive("/book");

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium hover:text-aqua-deep ${isActive(item.href) ? "text-aqua-deep" : "text-slate"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <a href={site.phoneHref} className="text-sm font-semibold text-ink hover:text-aqua-deep">
            {site.phone}
          </a>
        </div>

        <button
          type="button"
          className="-mr-2 rounded-md p-2 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </Container>

      {showFinderButton && (
        <Container className="flex justify-center pb-3">
          <ButtonLink href="/get-started" className="w-2/3 py-2.5">
            Find my fix
          </ButtonLink>
        </Container>
      )}

      {open && (
        <nav id="mobile-menu" className="border-t border-black/5 bg-white md:hidden" aria-label="Mobile">
          <Container className="flex flex-col gap-1 py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-3 text-base font-medium ${isActive(item.href) ? "bg-aqua-pale text-aqua-deep" : "text-ink"}`}
              >
                {item.label}
              </Link>
            ))}
            <a href={site.phoneHref} className="px-3 py-3 text-base font-semibold">
              Call {site.phone}
            </a>
            <ButtonLink href="/get-started" className="mt-2">
              Find my fix
            </ButtonLink>
          </Container>
        </nav>
      )}
    </header>
  );
}
