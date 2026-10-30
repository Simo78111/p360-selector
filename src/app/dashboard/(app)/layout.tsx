import type { Metadata } from "next";
import Link from "next/link";
import { DashboardNav, type NavItem } from "@/components/dashboard/DashboardNav";
import { Logo } from "@/components/Logo";
import { can, devBypass, requireOffice, ROLE_NAMES, type Area } from "@/lib/auth";
import { usingSampleData } from "@/lib/dashboard-data";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

// The menu, and which part of the console each item belongs to (see lib/auth.ts for who can open what).
const MENU: (NavItem & { area: Area })[] = [
  { href: "/dashboard/office", label: "Today", exact: true, area: "bookings" },
  { href: "/dashboard/office/attention", label: "Needs attention", area: "bookings" },
  { href: "/dashboard/office/all-jobs", label: "All jobs", area: "jobs" },
  { href: "/dashboard/office/jobs", label: "Bookings", area: "bookings" },
  { href: "/dashboard/office/customers", label: "Customers", area: "customers" },
  { href: "/dashboard/office/plumbers", label: "Plumbers", area: "bookings" },
  { href: "/dashboard/office/staff", label: "Staff", area: "staff" },
  { href: "/dashboard/office/timesheets", label: "Timesheets", area: "bookings" },
  { href: "/dashboard/office/orders", label: "Orders", area: "bookings" },
  { href: "/dashboard/office/certificates", label: "Gas certs", area: "bookings" },
  { href: "/dashboard/office/price-books", label: "Price books", area: "pricing" },
  { href: "/dashboard/office/pricing", label: "Pricing tiers", area: "pricing" },
  { href: "/dashboard/office/marketing", label: "Marketing", area: "bookings" },
  { href: "/dashboard/office/settings", label: "Settings", area: "owner" },
  { href: "/dashboard/office/companies", label: "Companies", area: "owner" },
  { href: "/dashboard/office/import", label: "Fergus import", area: "owner" },
  { href: "/dashboard/office/xero", label: "Xero", area: "owner" },
  { href: "/dashboard", label: "Website", exact: true, area: "bookings" },
  { href: "/dashboard/bookings", label: "Web bookings", area: "bookings" },
  { href: "/dashboard/status", label: "Status", area: "owner" },
];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireOffice();
  const items = MENU.filter((m) => can(session, m.area)).map(({ href, label, exact }) => ({ href, label, exact }));
  const who =
    session.kind === "staff"
      ? `${session.name} · ${session.companies.map((c) => `${c.code} ${ROLE_NAMES[c.role].toLowerCase()}`).join(", ")}`
      : session.name;

  return (
    <div className="flex min-h-screen flex-col bg-mist">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Logo className="h-9" />
            <DashboardNav items={items} />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <form action="/dashboard/office/all-jobs" role="search" className="flex">
              <input type="hidden" name="view" value="all" />
              <label htmlFor="global-search" className="sr-only">Find a job</label>
              <input
                id="global-search"
                name="q"
                placeholder="Find a job…"
                className="w-36 rounded-full border border-black/10 bg-mist px-3 py-1.5 text-sm focus:w-56 focus:bg-white sm:w-44"
              />
            </form>
            <span className="hidden max-w-xs truncate text-xs text-slate lg:inline" data-testid="signed-in-as" title={who}>
              {who}
            </span>
            <Link href="/" className="hidden text-slate hover:text-ink sm:inline">
              View site
            </Link>
            {session.kind !== "dev" && (
              <form action={logout}>
                <button type="submit" className="font-medium text-slate hover:text-ink">
                  Log out
                </button>
              </form>
            )}
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
