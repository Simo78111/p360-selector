import type { Metadata } from "next";
import Link from "next/link";
import { DashboardNav, SettingsLink, type NavItem } from "@/components/dashboard/DashboardNav";
import { Logo } from "@/components/Logo";
import { can, devBypass, requireOffice, ROLE_NAMES } from "@/lib/auth";
import { usingSampleData } from "@/lib/dashboard-data";
import { REPORTS, SETTINGS_PATHS, TOP_MENU } from "@/lib/office-menu";
import { loadSupplierToApprove } from "@/lib/reports";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireOffice();
  // Top bar: Today · Jobs · Calendar · Reports ▾ — everything else is on the Settings page.
  const items: NavItem[] = TOP_MENU.filter((m) => can(session, m.area)).map(({ href, label, exact, also }) => ({ href, label, exact, also }));
  const supplier = items.find((i) => i.href.endsWith("/supplier-invoices"));
  if (supplier) {
    supplier.badge = await loadSupplierToApprove(session);
    supplier.badgeLabel = "waiting to be reconciled";
  }
  const reports = REPORTS.filter((r) => can(session, r.area)).map(({ href, label }) => ({ href, label }));
  if (reports.length) items.push({ href: "/dashboard/office/reports", label: "Reports", children: reports });
  const canCreateJob = can(session, "staff"); // owner/admin and office managers
  const who =
    session.kind === "staff"
      ? `${session.name} · ${session.companies.map((c) => `${c.code} ${ROLE_NAMES[c.role].toLowerCase()}`).join(", ")}`
      : session.name;

  return (
    <div className="flex min-h-screen flex-col bg-mist">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Logo className="h-9" />
            <DashboardNav items={items} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {canCreateJob && (
              <Link
                href="/dashboard/office/all-jobs/new"
                className="inline-flex items-center gap-1 rounded-full bg-aqua px-4 py-1.5 text-sm font-semibold text-ink hover:bg-[#35b9df]"
                data-testid="new-job-button"
              >
                <span aria-hidden="true" className="text-base leading-none">+</span> Create new job
              </Link>
            )}
            <form action="/dashboard/office/all-jobs" role="search" className="flex">
              <input type="hidden" name="view" value="all" />
              <label htmlFor="global-search" className="sr-only">Find a job</label>
              <input
                id="global-search"
                name="q"
                placeholder="Find a job…"
                className="w-36 rounded-full border border-black/10 bg-mist px-3 py-1.5 text-sm focus:w-52 focus:bg-white"
              />
            </form>
            <SettingsLink paths={SETTINGS_PATHS} />
            {session.kind !== "dev" && (
              <form action={logout}>
                <button type="submit" className="font-medium text-slate hover:text-ink" title={`Signed in as ${who}`}>
                  Log out
                </button>
              </form>
            )}
            <span className="sr-only" data-testid="signed-in-as">{who}</span>
          </div>
        </div>
      </header>

      {(usingSampleData() || devBypass()) && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-3 text-sm text-amber-900 sm:px-6">
            {usingSampleData() && (
              <p>
                <strong>Sample data.</strong> Connect Supabase (see the README) to see your real visitors and bookings.
              </p>
            )}
            {devBypass() && (
              <p>
                <strong>No password set.</strong> You&apos;re in without logging in because this is running locally. Set
                DASHBOARD_PASSWORD before going live.
              </p>
            )}
          </div>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
