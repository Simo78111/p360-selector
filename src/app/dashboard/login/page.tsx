import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getOfficeSession, homeFor, passwordConfigured, staffLoginAvailable } from "@/lib/auth";
import { isTestSite } from "@/lib/test-mode";
import { LoginForm, StaffLoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Office login", robots: { index: false } };
// Checked on every visit so a newly set DASHBOARD_PASSWORD takes effect.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getOfficeSession();
  if (session) redirect(homeFor(session));
  const staff = staffLoginAvailable();

  return (
    <main id="main" className="flex flex-1 items-center justify-center bg-aqua-pale px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <Logo className="h-14" />
        <h1 className="mt-6 text-2xl font-bold">Office console</h1>
        {isTestSite() && <p className="mt-1 text-sm text-slate">Test system: fake data only.</p>}
        {staff && <StaffLoginForm />}
        {passwordConfigured() &&
          (staff ? (
            <details className="mt-6 border-t border-black/5 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate">Owner backup password</summary>
              <LoginForm />
            </details>
          ) : (
            <LoginForm />
          ))}
        {!staff && !passwordConfigured() && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            The office console is locked until it&apos;s set up. Add <code>DASHBOARD_PASSWORD</code> (and the engine
            connection) to the site&apos;s environment variables in Vercel, then redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
