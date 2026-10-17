import type { Metadata } from "next";
import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Logo } from "@/components/Logo";
import { devBypass, requireOwner } from "@/lib/auth";
import { usingSampleData } from "@/lib/dashboard-data";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireOwner();

  return (
    <div className="flex min-h-screen flex-col bg-mist">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Logo />
            <DashboardNav />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="hidden text-slate hover:text-ink sm:inline">
              View site
            </Link>
            {!devBypass() && (
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
