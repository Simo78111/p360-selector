import Link from "next/link";
import { notFound } from "next/navigation";
import { assetActionAction, saveAssetAction } from "@/app/dashboard/asset-actions";
import { AssetPhotoUpload } from "@/components/office/AssetPhotoUpload";
import { AssetStatusChip, nzDay, nzWhen } from "@/components/office/assets-ui";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { area, input, label, primaryBtn } from "@/components/office/jm";
import { requireOffice } from "@/lib/auth";
import { loadAsset, loadAssetPeople, loadAssets, type AssetDetail } from "@/lib/assets";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Tool" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const outline = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-500";
const bright = "rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-300";

export default async function ToolPage({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { id } = await params;
  const { ok, err } = await searchParams;
  const isNew = id === "new";
  if (!isNew && !isId(id)) notFound();
  let a: AssetDetail | null = null;
  let people: { id: string; name: string }[] = [];
  let companies: { id: string; code: string; name: string }[] = [];
  try {
    [a, people, companies] = await Promise.all([
      isNew ? Promise.resolve(null) : loadAsset(session, id),
      loadAssetPeople(session),
      loadAssets(session, "", "retired").then((l) => l.companies),
    ]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!isNew && !a) notFound();
  const canEdit = isNew ? companies.length > 0 : !!a?.can_edit;
  const path = `/dashboard/office/tools/${id}`;

  return (
    <div className="space-y-6" data-testid="tool-page">
      <p className="text-sm"><Link href="/dashboard/office/tools" className="text-slate-600 hover:underline">← All tools</Link></p>
      <Flash ok={ok} err={err} />

      {a && (
        <section className="overflow-hidden rounded-2xl bg-[#0F172A] text-white shadow-[0_8px_24px_rgba(15,23,42,.12)]" data-testid="tool-header">
          <div className="flex flex-wrap items-start gap-6 px-5 py-5 sm:px-7">
            {a.has_photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/office/asset-photo?id=${a.id}`} alt={a.name} className="h-28 w-28 rounded-xl bg-slate-800 object-cover" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold tracking-wide text-sky-200">{a.asset_no} · {a.company}{a.category ? ` · ${a.category}` : ""}</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold sm:text-3xl">{a.name}</h1>
                <AssetStatusChip status={a.status} />
              </div>
              <p className="text-sm text-slate-300">{[a.make, a.model, a.serial_no && `Serial ${a.serial_no}`].filter(Boolean).join(" · ") || "No make, model or serial yet"}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Fig k="Who has it" v={a.holder ? a.holder.name : "Nobody"} sub={a.holder?.phone ?? undefined} />
              <Fig k="Job" v={a.holder?.job_label ?? (a.holder ? "No job" : "—")} />
              <Fig k="Test & tag" v={nzDay(a.test_tag_due)} warn={!!a.test_tag_due && a.overdue === true} />
              <Fig k="Hire / day" v={a.hire_rate_day ? `$${Number(a.hire_rate_day).toFixed(2)}` : "No charge"} />
            </div>
          </div>
          {a.status === "needs_repair" && (
            <p className="border-t border-red-400/40 bg-red-600 px-5 py-3 text-sm font-semibold sm:px-7" role="status">
              Out of service: {a.repair_note ?? "needs repair"}. Nobody can take it until it&apos;s marked repaired.
            </p>
          )}
        </section>
      )}
      {isNew && <h1 className="text-3xl font-bold">Add a tool</h1>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {a && (
          <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm sm:p-6" data-testid="tool-moves">
            <h2 className="text-lg font-bold">
              {a.status === "out" ? `With ${a.holder?.name}` : a.status === "available" ? "Available" : a.status === "retired" ? "Retired" : "Needs repair"}
            </h2>
            {a.holder && <p className="text-sm text-slate-600">Since {nzWhen(a.holder.since)}{a.holder.given_by ? `, from ${a.holder.given_by}` : ""}.</p>}

            {(a.status === "available" || a.status === "out") && (
              <form action={assetActionAction} className="space-y-3 rounded-xl bg-slate-50 p-4">
                <Hidden id={a.id} action="give" back={path} />
                <h3 className="font-semibold">{a.status === "out" ? "Hand it to someone" : "Give it to someone"}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="to">Who</label>
                    <select id="to" name="to_staff_id" required className={input} defaultValue="">
                      <option value="" disabled>Pick a person</option>
                      {people.filter((p) => p.id !== a.holder?.staff_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="give-job">Job or phase number {a.holder?.job_ref ? "(blank: keep it)" : "(optional)"}</label>
                    <input id="give-job" name="job" placeholder="e.g. PTSL-3027a" className={input} />
                  </div>
                </div>
                {a.holder?.job_ref && <input type="hidden" name="keep_job" value="on" />}
                <p className="text-xs text-slate-600">They get a message in the plumber app.</p>
                <button className={bright}>{a.status === "out" ? "Hand over" : "Give it to them"}</button>
              </form>
            )}
            {a.status === "available" && (
              <form action={assetActionAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4">
                <Hidden id={a.id} action="take" back={path} />
                <div className="min-w-56 flex-1">
                  <label className={label} htmlFor="take-job">I&apos;m taking it — job or phase number (optional)</label>
                  <input id="take-job" name="job" placeholder="e.g. PTSL-3027a" className={input} />
                </div>
                <button className={outline}>Take it</button>
              </form>
            )}
            {a.status === "out" && (
              <form action={assetActionAction} className="space-y-3 rounded-xl bg-slate-50 p-4">
                <Hidden id={a.id} action="return" back={path} />
                <h3 className="font-semibold">It&apos;s back</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="condition" value="good" defaultChecked /> Good condition</label>
                  <label className="flex items-center gap-2"><input type="radio" name="condition" value="needs_repair" /> Needs repair</label>
                </div>
                <div>
                  <label className={label} htmlFor="ret-note">What&apos;s wrong (if it needs repair)</label>
                  <input id="ret-note" name="note" className={input} maxLength={1000} />
                </div>
                <button className={outline}>Mark it back</button>
              </form>
            )}
            {a.status === "needs_repair" && canEdit && (
              <form action={assetActionAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-red-50 p-4">
                <Hidden id={a.id} action="repaired" back={path} />
                <div>
                  <label className={label} htmlFor="tt">New test & tag date (optional)</label>
                  <input id="tt" type="date" name="test_tag_due" className={input} />
                </div>
                <button className={primaryBtn}>Mark repaired — back in service</button>
              </form>
            )}
            {canEdit && a.status === "available" && (
              <form action={assetActionAction} className="flex flex-wrap items-end gap-3">
                <Hidden id={a.id} action="needs_repair" back={path} />
                <div className="min-w-56 flex-1">
                  <label className={label} htmlFor="nr">Take out of service — what&apos;s wrong?</label>
                  <input id="nr" name="note" required className={input} />
                </div>
                <button className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Needs repair</button>
              </form>
            )}
            {canEdit && (a.status === "available" || a.status === "retired") && (
              <form action={assetActionAction}>
                <Hidden id={a.id} action={a.status === "retired" ? "unretire" : "retire"} back={path} />
                <button className="text-sm text-slate-600 underline">{a.status === "retired" ? "Put it back on the register" : "Retire this tool (sold, lost or scrapped)"}</button>
              </form>
            )}
          </section>
        )}

        {canEdit ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6" data-testid="tool-details">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Details</h2>
              {a && <AssetPhotoUpload assetId={a.id} has={a.has_photo} />}
            </div>
            <form action={saveAssetAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="assetId" value={a?.id ?? ""} />
              <F id="name" text="Name" v={a?.name} required placeholder="e.g. Makita hammer drill" />
              <F id="asset_no" text="Asset number (blank: next T- number)" v={a?.asset_no} placeholder="e.g. T-014" />
              <div>
                <label className={label} htmlFor="company_id">Belongs to</label>
                <select id="company_id" name="company_id" defaultValue={a?.company_id ?? companies[0]?.id} className={input}>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <F id="category" text="Category" v={a?.category} placeholder="e.g. Power tools, Drainage" />
              <F id="make" text="Make" v={a?.make} />
              <F id="model" text="Model" v={a?.model} />
              <F id="serial_no" text="Serial number" v={a?.serial_no} />
              <F id="purchase_date" text="Bought" v={a?.purchase_date} type="date" />
              <F id="purchase_price" text="Price paid $" v={a?.purchase_price?.toString()} inputMode="decimal" />
              <F id="hire_rate_day" text="Hire charge to the job, $ per day (blank: no charge)" v={a?.hire_rate_day?.toString()} inputMode="decimal" />
              <F id="test_tag_due" text="Next test & tag" v={a?.test_tag_due} type="date" />
              <F id="service_due" text="Next service" v={a?.service_due} type="date" />
              <div className="sm:col-span-2">
                <label className={label} htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows={2} defaultValue={a?.notes ?? ""} className={area} />
              </div>
              <div><button className={primaryBtn}>{isNew ? "Add tool" : "Save details"}</button></div>
            </form>
          </section>
        ) : isNew ? (
          <p className="rounded-2xl bg-white p-5 text-sm">Only the office (owner/admin or office manager) can add tools.</p>
        ) : null}
      </div>

      {a && (
        <section className="overflow-x-auto rounded-2xl bg-white shadow-sm" data-testid="tool-history">
          <h2 className="px-5 pt-5 text-lg font-bold sm:px-6">History</h2>
          {a.history.length === 0 ? <p className="p-5 text-sm text-slate-600 sm:px-6">Nobody has taken it yet.</p> : (
            <table className="mt-3 w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#0F172A] text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                <tr><th className="px-5 py-3">Who</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">Taken</th><th className="px-4 py-3">Ended</th><th className="px-4 py-3">Condition</th><th className="px-5 py-3 text-right">Hire</th></tr>
              </thead>
              <tbody>
                {a.history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/70">
                    <td className="px-5 py-2.5">{h.holder}{h.given_by && <span className="block text-xs text-slate-600">from {h.given_by}</span>}</td>
                    <td className="px-4 py-2.5">{h.job_ref ? <Link href={`/dashboard/office/job/${encodeURIComponent(h.job_ref)}`} className="hover:underline">{h.job_label}</Link> : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{nzWhen(h.taken_at)}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {h.ended_at ? <>{nzWhen(h.ended_at)}<span className="block text-xs text-slate-600">{h.ended_reason === "handed_over" ? "handed over" : `back${h.ended_by ? ` · ${h.ended_by}` : ""}`}</span></> : <span className="font-semibold text-blue-700">Still out</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {h.condition === "needs_repair" ? <span className="font-semibold text-red-700">Needs repair{h.note ? `: ${h.note}` : ""}</span> : h.condition === "good" ? "Good" : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{h.hire ? `${h.hire_days} day${h.hire_days === 1 ? "" : "s"} · $${Number(h.hire).toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function Fig({ k, v, sub, warn = false }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{k}</p>
      <p className={`font-semibold ${warn ? "text-red-300" : ""}`}>{v}</p>
      {sub && <p className="text-xs text-slate-300">{sub}</p>}
    </div>
  );
}

function Hidden({ id, action, back }: { id: string; action: string; back: string }) {
  return (
    <>
      <input type="hidden" name="assetId" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

function F({ id, text, v, type = "text", required = false, placeholder, inputMode }: {
  id: string; text: string; v?: string | null; type?: string; required?: boolean; placeholder?: string; inputMode?: "decimal";
}) {
  return (
    <div>
      <label className={label} htmlFor={id}>{text}</label>
      <input id={id} name={id} type={type} defaultValue={v ?? ""} required={required} placeholder={placeholder} inputMode={inputMode} className={input} />
    </div>
  );
}
