import Link from "next/link";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, primaryBtn } from "@/components/office/jm";
import { requireOffice } from "@/lib/auth";
import { AssetStatusChip, nzDay } from "@/components/office/assets-ui";
import { loadAssets, type AssetFilter, type AssetList } from "@/lib/assets";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Tools" };

type Props = { searchParams: Promise<{ q?: string; f?: string; ok?: string; err?: string }> };

const FILTERS: { id: AssetFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "out", label: "Out" },
  { id: "needs_repair", label: "Needs repair" },
  { id: "due", label: "Test & tag / service due" },
  { id: "retired", label: "Retired" },
];

export default async function ToolsPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { q = "", f, ok, err } = await searchParams;
  const filter = (FILTERS.find((x) => x.id === f)?.id ?? "all") as AssetFilter;
  let data: AssetList;
  try {
    data = await loadAssets(session, q.trim(), filter);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const canAdd = data.companies.length > 0;
  const link = (id: AssetFilter) => `/dashboard/office/tools?f=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-5" data-testid="tools-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tools</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Every tool and piece of equipment, who has it and which job it&apos;s on. Plumbers take, hand on and bring back
            tools in the app; a tool that comes back needing repair can&apos;t be taken until it&apos;s marked fixed here.
          </p>
        </div>
        {canAdd && <Link href="/dashboard/office/tools/new" className={primaryBtn} data-testid="add-tool">+ Add a tool</Link>}
      </div>
      <Flash ok={ok} err={err} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(["available", "out", "needs_repair", "due"] as const).map((k) => (
          <Link key={k} href={link(k)} className={`flex flex-col gap-1 rounded-2xl border-t-[5px] bg-white p-4 shadow-sm hover:shadow-md ${
            k === "needs_repair" ? "border-red-600" : k === "due" ? "border-amber-500" : k === "out" ? "border-blue-600" : "border-emerald-600"}`}>
            <span className={`text-3xl leading-none font-bold tabular-nums ${
              k === "needs_repair" && data.counts[k] ? "text-red-700" : k === "due" && data.counts[k] ? "text-amber-700" : ""}`}>{data.counts[k]}</span>
            <span className="text-sm font-semibold">{FILTERS.find((x) => x.id === k)!.label}</span>
          </Link>
        ))}
        <Link href={link("all")} className="flex flex-col gap-1 rounded-2xl bg-[#0F172A] p-4 text-white shadow-sm hover:bg-slate-800">
          <span className="text-3xl leading-none font-bold tabular-nums text-sky-300">{data.counts.all}</span>
          <span className="text-sm font-semibold">On the register</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Show">
          {FILTERS.map((x) => (
            <Link key={x.id} href={link(x.id)} aria-current={filter === x.id ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === x.id ? "bg-[#0F172A] font-semibold text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:text-ink"}`}>
              {x.label}{data.counts[x.id] && x.id !== "all" ? <span className="ml-1 text-xs opacity-80">{data.counts[x.id]}</span> : null}
            </Link>
          ))}
        </nav>
        <form className="flex min-w-72 flex-1 gap-2" role="search">
          <input type="hidden" name="f" value={filter} />
          <input name="q" defaultValue={q} placeholder="Tool, number, serial or who has it…" aria-label="Search tools" className={`${input} max-w-xl`} />
          <button className={primaryBtn}>Search</button>
        </form>
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        {data.assets.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">
            {q ? `Nothing matching “${q}”.` : filter === "all" ? "No tools yet. Add the first one with + Add a tool." : "Nothing here."}
          </p>
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm" data-testid="tools-table">
            <thead className="bg-[#0F172A] text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
              <tr>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Who has it</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Test & tag / service</th>
                <th className="px-4 py-3 text-right">Hire / day</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((a) => {
                const due = [a.test_tag_due, a.service_due].filter(Boolean).sort()[0] ?? null;
                return (
                  <tr key={a.id} className="border-t border-slate-100 align-top odd:bg-white even:bg-slate-50/70 hover:bg-sky-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/office/tools/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                      <p className="text-xs text-slate-600">{[a.asset_no, a.category, a.company].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <AssetStatusChip status={a.status} />
                      {a.status === "needs_repair" && a.repair_note && <p className="mt-1 text-xs text-red-800">{a.repair_note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {a.holder ? <>{a.holder.name}{a.holder.phone && <p className="text-xs text-slate-600">{a.holder.phone}</p>}</> : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.holder?.job_ref ? (
                        <Link href={`/dashboard/office/job/${encodeURIComponent(a.holder.job_ref)}`} className="hover:underline">{a.holder.job_label}</Link>
                      ) : <span className="text-slate-500">{a.holder ? "No job" : "—"}</span>}
                    </td>
                    <td className={`px-4 py-3 ${a.overdue ? "font-semibold text-red-700" : a.due_soon ? "font-semibold text-amber-700" : "text-slate-600"}`}>
                      {due ? `${a.overdue ? "Overdue " : ""}${nzDay(due)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.hire_rate_day ? `$${Number(a.hire_rate_day).toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
