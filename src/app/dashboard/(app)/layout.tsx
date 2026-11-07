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
    <div className="flex min-h-screen flex-col bg-[#EEF1F5]">
      <header className="bg-[#0F172A] text-white">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Logo inverted className="h-9" />
            <DashboardNav items={items} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {canCreateJob && (
              <Link
                href="/dashboard/office/all-jobs/new"
                className="inline-flex items-center gap-1 rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-300"
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
                className="w-40 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:w-56 focus:border-sky-400 focus:outline-none"
              />
            </form>
            <SettingsLink paths={SETTINGS_PATHS} />
            {session.kind !== "dev" && (
              <form action={logout}>
                <button type="submit" className="font-medium text-slate-300 hover:text-white" title={`Signed in as ${who}`}>
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
          <div className="mx-auto max-w-[1680px] space-y-1 px-4 py-3 text-sm text-amber-900 sm:px-6 lg:px-10">
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

      <main id="main" className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-7 sm:px-6 lg:px-10">
        {children}
      </main>
    </div>
  );
}
