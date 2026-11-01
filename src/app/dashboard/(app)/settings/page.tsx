// Phase 3e: the Settings page. Everything that isn't day-to-day (Today, Jobs, Calendar, Reports) lives here, in
// groups. Only what this person's role can open is shown.
import Link from "next/link";
import { can, requireOffice } from "@/lib/auth";
import { SETTINGS } from "@/lib/office-menu";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireOffice();
  const groups = SETTINGS.map((g) => ({ ...g, items: g.items.filter((i) => can(session, i.area)) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Everything that isn&apos;t day-to-day. What&apos;s waiting to be done (invoices, supplier invoices, timesheets,
          leave) also shows on <Link href="/dashboard/office" className="font-semibold text-ink underline">Today</Link>.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="rounded-2xl bg-white p-5" aria-labelledby={`grp-${g.title}`}>
            <h2 id={`grp-${g.title}`} className="text-sm font-bold tracking-wide text-slate uppercase">{g.title}</h2>
            <ul className="mt-3 divide-y divide-black/5">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="group flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-semibold group-hover:underline">{i.label}</span>
                      {i.note && <span className="block text-sm text-slate">{i.note}</span>}
                    </span>
                    <span aria-hidden="true" className="pt-0.5 text-slate group-hover:text-ink">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-sm text-slate">
        <Link href="/" className="font-medium hover:text-ink hover:underline">View the website →</Link>
      </p>
    </div>
  );
}
