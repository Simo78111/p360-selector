import type { Metadata } from "next";
import { StaffPortal } from "@/components/staff/StaffPortal";
import { publicEngine } from "@/lib/public-db";
import { isTestSite } from "@/lib/test-mode";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function StaffPage() {
  const db = publicEngine();
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">P360 staff</h1>
      <p className="mt-1 text-sm text-slate">
        Sign in with the email and password the office gave you. {isTestSite() && "This is the test system: fake data only."}
      </p>
      {db ? <StaffPortal url={db.url} anonKey={db.key} /> : <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">Staff sign-in isn&apos;t set up on this site yet.</p>}
    </main>
  );
}
