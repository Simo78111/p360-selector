import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { isOwner, passwordConfigured } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Owner login", robots: { index: false } };
// Checked on every visit so a newly set DASHBOARD_PASSWORD takes effect.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isOwner()) redirect("/dashboard");

  return (
    <main id="main" className="flex flex-1 items-center justify-center bg-aqua-pale px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <Logo className="h-14" />
        <h1 className="mt-6 text-2xl font-bold">Owner dashboard</h1>
        {passwordConfigured() ? (
          <LoginForm />
        ) : (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            The dashboard is locked until a password is set. Add <code>DASHBOARD_PASSWORD</code> to the site&apos;s
            environment variables in Vercel, then redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
