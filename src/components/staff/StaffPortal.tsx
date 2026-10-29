"use client";
// Staff portal (Phase 1): sign in with Supabase Auth, see your companies, roles and licences.
// Owners/admins, office managers and supervisors also see their companies' customers — read
// straight from the database with their own login, so row-level security decides what shows.
import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Me = {
  staff_id: string; name: string; email: string | null; works_on_jobs: boolean;
  companies: { id: string; code: string; name: string; role: string; office: boolean }[];
  licences: { kind: string; number: string | null; expires_on: string | null; expired: boolean; expiring: boolean }[];
};
type Cust = { id: string; full_name: string; business_name: string | null; company_id: string; kind: string };

const ROLE: Record<string, string> = {
  owner_admin: "Owner / admin", office_manager: "Office / manager", supervisor: "Supervisor",
  tradesperson: "Tradesperson", apprentice: "Apprentice",
};
const field = "w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm";

export function StaffPortal({ url, anonKey }: { url: string; anonKey: string }) {
  const sb = useMemo(() => createClient(url, anonKey, { auth: { persistSession: true, storageKey: "p360-staff" } }), [url, anonKey]);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [customers, setCustomers] = useState<Cust[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) { setMe(null); setCustomers(null); return; }
    (async () => {
      const { data, error } = await sb.rpc("staff_sign_in");
      if (error) { setError(error.message); return; }
      setMe(data as Me);
      const { data: rows, error: e2 } = await sb.from("customers")
        .select("id, full_name, business_name, company_id, kind").order("full_name").limit(50);
      if (e2) setError(e2.message); else setCustomers(rows as Cust[]);
    })();
  }, [session, sb]);

  async function signIn(form: FormData) {
    setBusy(true); setError(null);
    const { error } = await sb.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
  }

  if (!session) {
    return (
      <form action={signIn} className="mt-6 max-w-sm space-y-3 rounded-2xl bg-white p-5">
        <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="username" className={field} /></label>
        <label className="block text-sm font-medium">Password<input name="password" type="password" required autoComplete="current-password" className={field} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    );
  }

  const office = me?.companies.filter((c) => c.office) ?? [];
  return (
    <div className="mt-6 space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {me && (
        <section className="rounded-2xl bg-white p-5" aria-label="You">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Kia ora {me.name.split(" ")[0]}</h2>
              <p className="text-sm text-slate">{me.email}</p>
            </div>
            <button onClick={() => sb.auth.signOut()} className="rounded-full bg-mist px-3 py-1.5 text-xs font-semibold">Sign out</button>
          </div>
          <ul className="mt-3 space-y-1 text-sm" aria-label="Your companies">
            {me.companies.map((c) => <li key={c.id}><strong>{c.name}</strong>: {ROLE[c.role] ?? c.role}</li>)}
            {me.companies.length === 0 && <li className="text-amber-800">You&apos;re not in either company yet. Ask the office.</li>}
          </ul>
          {me.licences.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-sm" aria-label="Your licences">
              {me.licences.map((l, i) => (
                <li key={i} className={l.expired ? "text-red-700" : l.expiring ? "text-amber-800" : "text-slate"}>
                  {l.kind.replace(/_/g, " ")} {l.number}{l.expires_on && ` · ${l.expired ? "expired" : "expires"} ${l.expires_on}`}
                </li>
              ))}
            </ul>
          )}
          {me.works_on_jobs && <p className="mt-3 text-sm">Your jobs are in the plumber app; it uses this same login.</p>}
        </section>
      )}
      {me && office.length > 0 && customers && (
        <section className="rounded-2xl bg-white p-5" aria-label="Customers you can see">
          <h2 className="text-lg font-bold">Customers ({customers.length})</h2>
          <p className="text-sm text-slate">Only {office.map((c) => c.name).join(" and ")} — the companies you manage.</p>
          <ul className="mt-2 divide-y divide-black/5 text-sm">
            {customers.map((c) => (
              <li key={c.id} className="py-1.5">
                {c.business_name ?? c.full_name}{" "}
                <span className="text-xs text-slate">· {me.companies.find((x) => x.id === c.company_id)?.name}</span>
              </li>
            ))}
            {customers.length === 0 && <li className="py-1.5 text-slate">No customers yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
