// Settings → Staff → Compliance schedule (Simon, 6 Nov): choose the people, the letterhead and who it's for, and download
// one PDF (or Word) of their licences, tickets and training with expiry dates, with copies of the cards at the back.
// The job's Health & Safety tab links here with that job's crew and customer filled in.
import Link from "next/link";
import { EngineError, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn } from "@/components/office/jm";
import { requireOffice } from "@/lib/auth";
import { COMPLIANCE_KINDS } from "@/lib/compliance-files";
import { LICENCE_KINDS, loadCompanies, loadStaff, TRADES, type Company, type Staff } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Staff compliance schedule" };

type Props = { searchParams: Promise<{ staff?: string; for?: string; job?: string; co?: string }> };

export default async function CompliancePage({ searchParams }: Props) {
  await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const sp = await searchParams;
  let staff: Staff[];
  let companies: Company[];
  try {
    [staff, companies] = await Promise.all([loadStaff(), loadCompanies()]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const people = staff.filter((s) => s.active);
  const given = (sp.staff ?? "").split(",").filter(Boolean);
  const ticked = (s: Staff) => (given.length ? given.includes(s.id) : s.works_on_jobs);
  const coId = companies.find((c) => c.id === sp.co)?.id ?? companies.find((c) => c.code === "PTSL")?.id ?? companies[0]?.id;
  const held = new Set(people.flatMap((s) => s.licences.map((l) => l.kind)));

  return (
    <div className="space-y-4" data-testid="compliance">
      <div>
        <p className="text-sm text-slate">
          <Link href="/dashboard/settings" className="hover:underline">Settings</Link> ·{" "}
          <Link href="/dashboard/office/staff" className="hover:underline">Staff</Link>
        </p>
        <h1 className="text-2xl font-bold">Staff compliance schedule</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          One document for a customer or principal contractor: everyone you choose, their licences, tickets and training with numbers,
          expiry dates and whether each is current, an at-a-glance grid, a &ldquo;verified by&rdquo; block to sign, and copies of the
          cards at the back of the PDF. It uses what&apos;s on Settings → Staff, so update tickets there first. Driver licences are
          never included.
        </p>
      </div>

      <form action="/api/office/compliance" method="get" className="space-y-5 rounded-2xl bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="c-for">Prepared for (customer, site or project)</label>
            <input id="c-for" name="for" defaultValue={sp.for ?? ""} maxLength={160} placeholder="e.g. Trust Projects – NEEDO AIAL" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-job">Job number (optional)</label>
            <input id="c-job" name="job" defaultValue={sp.job ?? ""} maxLength={40} placeholder="e.g. PTSL-19764" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-co">Letterhead</label>
            <select id="c-co" name="co" defaultValue={coId} className={input}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-bold">People</legend>
          <p className="text-xs text-slate">{given.length ? "The crew booked on the job is ticked." : "Everyone who works on jobs is ticked."}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((s) => {
              const expired = s.licences.filter((l) => l.expired).length;
              return (
                <label key={s.id} className="flex items-start gap-2 rounded-xl bg-mist/40 px-3 py-2 text-sm">
                  <input type="checkbox" name="staff" value={s.id} defaultChecked={ticked(s)} className="mt-1" />
                  <span>
                    <span className="font-medium">{s.full_name}</span>
                    <span className="block text-xs text-slate">
                      {[s.trade && TRADES[s.trade], `${s.licences.filter((l) => l.kind !== "drivers").length} licences/tickets`,
                        s.licences.some((l) => l.card) ? "cards on file" : null].filter(Boolean).join(" · ")}
                      {expired > 0 && <span className="font-semibold text-red-700"> · {expired} expired</span>}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold">Licences and tickets to include</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {COMPLIANCE_KINDS.filter((k) => held.has(k)).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" name="kinds" value={k} defaultChecked /> {LICENCE_KINDS[k]}
              </label>
            ))}
            {held.size === 0 && <span className="text-slate">Nobody has licences or tickets recorded yet.</span>}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="cards" value="1" defaultChecked /> Attach copies of the cards (PDF)
          </label>
          <div>
            <span className={label}>Format</span>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="fmt" value="pdf" defaultChecked /> PDF</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="fmt" value="docx" /> Word</label>
            </div>
          </div>
          <button className={primaryBtn} data-testid="compliance-download">Download schedule</button>
        </div>
      </form>
    </div>
  );
}
