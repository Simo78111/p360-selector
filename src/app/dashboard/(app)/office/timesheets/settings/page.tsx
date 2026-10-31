import Link from "next/link";
import { saveAllowanceAction, savePayRuleAction } from "@/app/dashboard/timesheet-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn } from "@/components/office/jm";
import { APPLIES_NAME, loadTsSettings, type Allowance, type PayRule, type TsSettings } from "@/lib/timesheets";
import { officeEnabled } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Pay rates and allowances" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };
const BACK = "/dashboard/office/timesheets/settings";

export default async function TimesheetSettingsPage({ searchParams }: Props) {
  await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let s: TsSettings;
  try {
    s = await loadTsSettings();
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/dashboard/office/timesheets" className="text-aqua-deep">‹ Timesheets</Link></p>
        <h1 className="text-2xl font-bold">Pay rates and allowances</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          What Smartly&rsquo;s pay rates 2 and 3 mean for your team. Weekend and night-work rates are suggested on each timesheet
          line automatically; the office can always pick another rate from the dropdown. Rate 1 is ordinary time.
          Breaks: {s.break_min} minutes unpaid on days over {s.break_after_min / 60} hours. Times round to the nearest {s.round_min} minutes.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-bold">Pay rates</h2>
        <ul className="mt-3 space-y-3">
          {s.rules.map((r) => <li key={r.id}><RuleForm r={r} /></li>)}
          <li><details><summary className="cursor-pointer text-sm font-semibold text-aqua-deep">+ Add a pay rate</summary><div className="mt-2"><RuleForm /></div></details></li>
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-bold">Allowances (#51)</h2>
        <p className="mt-1 text-sm text-slate">
          Put in the Smartly pay component number once you have it (Smartly → Company details → Pay components). Until then
          the allowance is left out of the Smartly file with a warning. The tool allowance is on for apprentices; switch it on
          for anyone else on their Staff page.
        </p>
        <ul className="mt-3 space-y-3">
          {s.allowances.map((a) => <li key={a.id}><AllowanceForm a={a} /></li>)}
          <li><details><summary className="cursor-pointer text-sm font-semibold text-aqua-deep">+ Add an allowance</summary><div className="mt-2"><AllowanceForm /></div></details></li>
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-bold">Leave types</h2>
        <p className="mt-1 text-sm text-slate">Smartly&rsquo;s own leave lines. Plumbers can ask for the ones ticked in the app.</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {s.leave_types.map((t) => <li key={t.code}>#{t.code} {t.name}{t.plumber_can_ask ? " ✓" : ""}</li>)}
        </ul>
      </section>
    </div>
  );
}

function RuleForm({ r }: { r?: PayRule }) {
  const k = r?.id ?? "new";
  return (
    <form action={savePayRuleAction} className="grid gap-2 rounded-xl border border-black/5 p-3 sm:grid-cols-8" data-testid="pay-rule">
      <input type="hidden" name="id" value={r?.id ?? ""} />
      <input type="hidden" name="back" value={BACK} />
      <input type="hidden" name="sort" value={r?.sort ?? ""} />
      <div className="sm:col-span-2"><label className={label} htmlFor={`n-${k}`}>Name</label>
        <input id={`n-${k}`} name="name" defaultValue={r?.name ?? ""} required className={input} /></div>
      <div><label className={label} htmlFor={`r-${k}`}>Smartly rate</label>
        <select id={`r-${k}`} name="pay_rate" defaultValue={r?.pay_rate ?? 2} className={input}>
          <option value="1">Rate 1</option><option value="2">Rate 2</option><option value="3">Rate 3</option>
        </select></div>
      <div className="sm:col-span-2"><label className={label} htmlFor={`a-${k}`}>When</label>
        <select id={`a-${k}`} name="applies" defaultValue={r?.applies ?? "manual"} className={input}>
          {(Object.keys(APPLIES_NAME) as PayRule["applies"][]).map((a) => <option key={a} value={a}>{APPLIES_NAME[a]}</option>)}
        </select></div>
      <div><label className={label} htmlFor={`f-${k}`}>Night from</label>
        <input id={`f-${k}`} name="night_from" type="time" defaultValue={r?.night_from ?? ""} className={input} /></div>
      <div><label className={label} htmlFor={`t-${k}`}>Night until</label>
        <input id={`t-${k}`} name="night_to" type="time" defaultValue={r?.night_to ?? ""} className={input} /></div>
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> On</label>
        <button className={primaryBtn}>Save</button>
      </div>
    </form>
  );
}

function AllowanceForm({ a }: { a?: Allowance }) {
  const k = a?.id ?? "new";
  return (
    <form action={saveAllowanceAction} className="grid gap-2 rounded-xl border border-black/5 p-3 sm:grid-cols-6" data-testid="allowance">
      <input type="hidden" name="id" value={a?.id ?? ""} />
      <input type="hidden" name="back" value={BACK} />
      <div className="sm:col-span-2"><label className={label} htmlFor={`an-${k}`}>Name</label>
        <input id={`an-${k}`} name="name" defaultValue={a?.name ?? ""} required className={input} readOnly={a?.is_tool_allowance} /></div>
      <div><label className={label} htmlFor={`ar-${k}`}>Smartly number</label>
        <input id={`ar-${k}`} name="smartly_ref" inputMode="numeric" defaultValue={a?.smartly_ref ?? ""} placeholder="e.g. 101" className={input} /></div>
      <div><label className={label} htmlFor={`ap-${k}`}>Paid per</label>
        <select id={`ap-${k}`} name="per" defaultValue={a?.per ?? "week"} className={input}>
          <option value="week">Week worked</option><option value="day">Day worked</option><option value="hour">Hour worked</option>
        </select></div>
      <div className="flex items-end gap-3 sm:col-span-2">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={a?.active ?? true} /> On</label>
        <button className={primaryBtn}>Save</button>
        {a && !a.smartly_ref && <span className="text-xs font-semibold text-amber-800">No Smartly number yet</span>}
      </div>
    </form>
  );
}
