// Phase 5b: the H&S register. Every live SWMS / JSA pack across the jobs this person can see: version and status,
// open hold points, who's booked and who still has to sign, and the next booking. Packs needing a person first.
import Link from "next/link";
import { EngineError, NotConnected } from "@/components/office/bits";
import { requireOffice } from "@/lib/auth";
import { loadHsRegister, STATUS_LABEL, type HsRegisterRow } from "@/lib/hs";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "H&S register" };
type Props = { searchParams: Promise<{ show?: string }> };

const ORDER: Record<string, number> = { to_approve: 0, tasks_to_confirm: 1, failed: 2, queued: 3, drafting: 3, approved: 4, sent: 5 };
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "Pacific/Auckland" }) : "–";

export default async function HsRegisterPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { show } = await searchParams;
  let rows: HsRegisterRow[];
  try {
    rows = await loadHsRegister(session);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const soon = (r: HsRegisterRow) => !!r.next_start && new Date(r.next_start).getTime() < Date.now() + 3 * 86_400_000;
  const needs = (r: HsRegisterRow) =>
    !["approved", "sent"].includes(r.document.status) || (r.unsigned.length > 0 && soon(r))
    || (r.document.scope_changes?.length ?? 0) > 0 || ((r.ticket_warnings ?? 0) > 0 && soon(r));
  const list = rows
    .filter((r) => show !== "action" || needs(r))
    .sort((a, b) => (ORDER[a.document.status] ?? 9) - (ORDER[b.document.status] ?? 9)
      || (a.next_start ?? "9").localeCompare(b.next_start ?? "9"));
  const tab = (key: string | undefined, label: string) => (
    <Link href={key ? `?show=${key}` : "?"} aria-current={show === key ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${show === key ? "bg-ink text-white" : "bg-white"}`}>{label}</Link>
  );

  return (
    <div className="space-y-4" data-testid="hs-register">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate"><Link href="/dashboard/settings" className="hover:underline">Settings</Link> · Health &amp; safety</p>
          <h1 className="text-2xl font-bold">H&amp;S register</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            Every SWMS and JSA. Open a job&apos;s Health &amp; Safety tab to check, approve or download it. Workers sign on in the plumber app.
          </p>
        </div>
        <Link href="/dashboard/office/health-safety/settings" className="text-sm font-semibold text-aqua-deep">Drafting settings →</Link>
      </div>
      <div className="flex gap-2">{tab(undefined, `All (${rows.length})`)}{tab("action", `Needs action (${rows.filter(needs).length})`)}</div>
      {list.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate">{rows.length ? "Nothing needs action." : "No SWMS or JSA yet. They start when a Project 360 quote is accepted, or from a job's Health & Safety tab."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-mist text-left text-xs text-slate">
              <th className="px-3 py-2">Job</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Hold points</th><th className="px-3 py-2">Signed on</th>
              <th className="px-3 py-2">Next booking</th><th className="px-3 py-2">Documents</th>
            </tr></thead>
            <tbody>
              {list.map((r) => {
                const d = r.document;
                const ready = d.status === "approved" || d.status === "sent";
                return (
                  <tr key={d.id} className="border-t border-mist align-top">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/office/job/${encodeURIComponent(r.job_ref)}?tab=hs`} className="font-semibold hover:underline">{r.job_ref}</Link>
                      <span className="block text-xs text-slate">{r.title}</span>
                    </td>
                    <td className="px-3 py-2">{r.customer}<span className="block text-xs text-slate">{r.company}</span></td>
                    <td className="px-3 py-2">v{d.version_no}{d.quote_number && <span className="block text-xs text-slate">{d.quote_number}</span>}</td>
                    <td className={`px-3 py-2 ${ready ? "text-emerald-800" : d.status === "failed" ? "text-red-800" : "font-semibold text-amber-800"}`}>
                      {STATUS_LABEL[d.status]}
                      {d.approved_by && <span className="block text-xs font-normal text-slate">by {d.approved_by}</span>}
                      {(d.scope_changes?.length ?? 0) > 0 && <span className="block text-xs font-semibold text-amber-800">Scope changed — update?</span>}
                    </td>
                    <td className="px-3 py-2">{d.open_hold_points ? <span className="font-semibold text-amber-800">{d.open_hold_points} open</span> : d.hold_points.length ? `${d.hold_points.length}, dealt with` : "–"}</td>
                    <td className="px-3 py-2">
                      {r.booked ? `${r.signed} of ${r.booked}` : r.signed ? `${r.signed}` : "–"}
                      {ready && r.unsigned.length > 0 && <span className={`block text-xs ${soon(r) ? "font-semibold text-red-800" : "text-slate"}`}>To sign: {r.unsigned.join(", ")}</span>}
                      {(r.ticket_warnings ?? 0) > 0 && <span className={`block text-xs ${soon(r) ? "font-semibold text-red-800" : "text-amber-800"}`}>⚠ {r.ticket_warnings} ticket{r.ticket_warnings === 1 ? "" : "s"} missing or expired</span>}
                    </td>
                    <td className={`px-3 py-2 ${soon(r) && !ready ? "font-semibold text-red-800" : ""}`}>{day(r.next_start)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.status === "to_approve" || ready ? (
                        <>
                          <a className="text-aqua-deep underline" href={`/api/office/hs-doc?id=${d.id}&kind=swms&fmt=pdf`} target="_blank" rel="noopener">SWMS</a>{" · "}
                          <a className="text-aqua-deep underline" href={`/api/office/hs-doc?id=${d.id}&kind=jsa&fmt=pdf`} target="_blank" rel="noopener">JSA</a>
                        </>
                      ) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
