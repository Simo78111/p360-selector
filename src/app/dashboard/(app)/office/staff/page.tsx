import { saveLicenceAction, saveStaffAction, staffActiveAction } from "@/app/dashboard/jm-actions";
import { staffPermissionsAction } from "@/app/dashboard/quote-actions";
import { loadStaffPermissions, PERM_LABEL, type Perm, type StaffPerms } from "@/lib/quotes";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { area, input, label, money, nzDate, primaryBtn, quietBtn } from "@/components/office/jm";
import { LICENCE_KINDS, loadCompanies, loadStaff, ROLE_LABEL, ROLES, TRADES, type Company, type Staff } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";
import { can, requireOffice } from "@/lib/auth";

export const metadata = { title: "Staff" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; show?: string }> };

export default async function StaffPage({ searchParams }: Props) {
  const session = await requireOffice("staff");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, show } = await searchParams;
  let staff: Staff[];
  let companies: Company[];
  let perms: Record<string, StaffPerms>;
  try {
    [staff, companies, perms] = await Promise.all([loadStaff(), loadCompanies(), loadStaffPermissions()]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const active = staff.filter((s) => s.active);
  const listed = show === "all" ? staff : active;
  const warnings = active.filter((s) => s.licence_warning);
  // Office managers see who's who and their licences; only an owner/admin changes staff, roles and rates.
  const owner = can(session, "owner");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Everyone in both companies: their role in each, licences and expiry dates, rates, and their Smartly employee code
          and pay rate for the timesheet export. People who work on jobs also appear in the diary and can sign in to the
          plumber app with the same login.
        </p>
      </div>
      <Flash ok={ok} err={err} />
      {!owner && <p className="text-sm text-slate">View only: an owner/admin adds and changes staff, roles and rates.</p>}

      {warnings.length > 0 && (
        <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Licences expired or expiring in the next 60 days: {warnings.map((s) => s.full_name).join(", ")}.
        </p>
      )}

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">People</h2>
          <p className="text-sm text-slate">
            {active.length} active
            {staff.length > active.length && (
              <>
                {" · "}
                <a className="underline" href={show === "all" ? "?" : "?show=all"}>
                  {show === "all" ? "hide" : "show"} {staff.length - active.length} inactive
                </a>
              </>
            )}
          </p>
        </div>

        {owner && <details className="group mt-4 rounded-2xl border-2 border-dashed border-aqua/60 open:border-solid open:bg-aqua-pale/30">
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-aqua-deep">
            <span className="group-open:hidden">+ Add a staff member</span>
            <span className="hidden group-open:inline">New staff member</span>
          </summary>
          <div className="px-4 pb-4">
            <StaffForm companies={companies} />
          </div>
        </details>}

        <ul className="mt-4 divide-y divide-black/5">
          {listed.map((s) => (
            <li key={s.id} className={`py-4 ${s.active ? "" : "opacity-60"}`} data-testid="staff-row">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {s.full_name}
                    {!s.active && <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs font-normal">inactive</span>}
                    {s.is_apprentice && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-normal text-violet-900">apprentice</span>}
                  </p>
                  <p className="text-sm text-slate">
                    {[s.trade && TRADES[s.trade], s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs">
                    {companies.map((c) =>
                      s.roles[c.code] ? (
                        <span key={c.id} className="rounded-full bg-aqua-pale px-2 py-0.5 font-semibold text-aqua-deep">
                          {c.name}: {ROLE_LABEL[s.roles[c.code]]}
                        </span>
                      ) : null,
                    )}
                    {Object.keys(s.roles).length === 0 && <span className="text-amber-800">No role in either company</span>}
                  </p>
                  {owner && <p className="mt-1 text-xs text-slate">
                    Cost {money(s.cost_rate)}/h · charge-out {money(s.charge_out_rate)}/h · Smartly{" "}
                    {s.smartly_employee_code ?? <span className="text-amber-800">no code</span>}
                    {s.smartly_pay_rate ? ` · Rate ${s.smartly_pay_rate}` : ""} · {s.login ? "has a login" : "no login yet"}
                    {s.works_on_jobs ? " · in the diary" : ""}
                  </p>}
                  {perms[s.id]?.office && (
                    <p className="mt-1 flex flex-wrap gap-1 text-xs" data-testid="staff-perms">
                      {(Object.keys(PERM_LABEL) as Perm[]).map((k) => (
                        <span key={k} className={`rounded-full px-2 py-0.5 ${perms[s.id][k].on ? "bg-emerald-50 text-emerald-900" : "bg-mist text-slate line-through"}`}
                          title={perms[s.id][k].set === null ? "From their role" : "Set for this person"}>
                          {PERM_LABEL[k].replace("Can ", "")}{perms[s.id][k].set !== null ? " *" : ""}
                        </span>
                      ))}
                    </p>
                  )}
                  {s.licences.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {s.licences.map((l) => (
                        <li key={l.id} className={l.expired ? "text-red-700" : l.expiring ? "text-amber-800" : "text-slate"}>
                          {LICENCE_KINDS[l.kind] ?? l.kind}
                          {l.number && ` ${l.number}`}
                          {l.expires_on && ` · ${l.expired ? "expired" : "expires"} ${nzDate(l.expires_on)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {owner && <form action={staffActiveAction}>
                  <input type="hidden" name="staffId" value={s.id} />
                  <input type="hidden" name="name" value={s.full_name} />
                  <input type="hidden" name="on" value={s.active ? "false" : "true"} />
                  <button className={quietBtn}>{s.active ? "Deactivate" : "Make active"}</button>
                </form>}
              </div>

              {owner && <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-aqua-deep">Edit {s.full_name.split(" ")[0]}</summary>
                <div className="mt-3 space-y-4 rounded-2xl bg-mist/40 p-4">
                  <StaffForm companies={companies} staff={s} />
                  {perms[s.id]?.office && <PermForm s={s} p={perms[s.id]} />}
                  <div>
                    <h3 className="text-sm font-bold">Licences</h3>
                    <ul className="mt-2 space-y-2">
                      {s.licences.map((l) => (
                        <li key={l.id}>
                          <LicenceForm staffId={s.id} licence={l} />
                        </li>
                      ))}
                      <li>
                        <LicenceForm staffId={s.id} />
                      </li>
                    </ul>
                  </div>
                </div>
              </details>}
            </li>
          ))}
          {listed.length === 0 && <li className="py-4 text-sm text-slate">No staff yet. Add the first one above.</li>}
        </ul>
      </section>
    </div>
  );
}

function StaffForm({ companies, staff }: { companies: Company[]; staff?: Staff }) {
  const s = staff;
  const f = (name: string) => `${name}-${s?.id ?? "new"}`;
  return (
    <form action={saveStaffAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {s && <input type="hidden" name="staffId" value={s.id} />}
      <div>
        <label className={label} htmlFor={f("name")}>Name</label>
        <input id={f("name")} name="full_name" required defaultValue={s?.full_name} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("phone")}>Mobile</label>
        <input id={f("phone")} name="phone" type="tel" defaultValue={s?.phone ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("email")}>Email (their login)</label>
        <input id={f("email")} name="email" type="email" defaultValue={s?.email ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("trade")}>Trade</label>
        <select id={f("trade")} name="trade" defaultValue={s?.trade ?? ""} className={input}>
          <option value="">—</option>
          {Object.entries(TRADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={f("cost")}>Cost rate ($/h excl GST)</label>
        <input id={f("cost")} name="cost_rate" inputMode="decimal" defaultValue={s?.cost_rate ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("charge")}>Charge-out rate ($/h excl GST)</label>
        <input id={f("charge")} name="charge_out_rate" inputMode="decimal" defaultValue={s?.charge_out_rate ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("smartly")}>Smartly employee code</label>
        <input id={f("smartly")} name="smartly_employee_code" defaultValue={s?.smartly_employee_code ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={f("payrate")}>Smartly pay rate</label>
        <select id={f("payrate")} name="smartly_pay_rate" defaultValue={s?.smartly_pay_rate?.toString() ?? ""} className={input}>
          <option value="">—</option>
          <option value="1">Rate 1</option>
          <option value="2">Rate 2</option>
          <option value="3">Rate 3</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor={f("password")}>{s?.login ? "New password (optional)" : "Password for a login (optional)"}</label>
        <input id={f("password")} name="password" type="password" autoComplete="new-password" minLength={8} className={input} />
      </div>
      {companies.map((c) => (
        <div key={c.id}>
          <label className={label} htmlFor={f(`role-${c.code}`)}>Role at {c.name}</label>
          <select id={f(`role-${c.code}`)} name={`role_${c.id}`} defaultValue={s?.roles[c.code] ?? ""} className={input}>
            <option value="">Not in {c.name}</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      ))}
      <div className="flex flex-col justify-end gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="works_on_jobs" defaultChecked={s?.works_on_jobs ?? false} /> Works on jobs (diary + plumber app)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_apprentice" defaultChecked={s?.is_apprentice ?? false} /> Apprentice
        </label>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={label} htmlFor={f("notes")}>Notes</label>
        <textarea id={f("notes")} name="notes" rows={2} defaultValue={s?.notes ?? ""} className={area} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <button className={primaryBtn}>{s ? "Save" : "Add staff member"}</button>
      </div>
    </form>
  );
}

function LicenceForm({ staffId, licence }: { staffId: string; licence?: Staff["licences"][number] }) {
  const l = licence;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={saveLicenceAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="staffId" value={staffId} />
        {l && <input type="hidden" name="licenceId" value={l.id} />}
        <select name="kind" aria-label="Licence type" defaultValue={l?.kind ?? "plumber"} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">
          {Object.entries(LICENCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="number" aria-label="Licence number" placeholder="Number" defaultValue={l?.number ?? ""} className="w-32 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm" />
        <input name="expires_on" aria-label="Expiry date" type="date" defaultValue={l?.expires_on ?? ""} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm" />
        <button className={quietBtn}>{l ? "Save" : "+ Add licence"}</button>
      </form>
      {l && (
        <form action={saveLicenceAction}>
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="licenceId" value={l.id} />
          <input type="hidden" name="remove" value="true" />
          <button className="text-xs text-red-700 underline">Remove</button>
        </form>
      )}
    </div>
  );
}

/** Permissions for one person: what their role gives them, or switched on/off just for them. */
function PermForm({ s, p }: { s: Staff; p: StaffPerms }) {
  return (
    <form action={staffPermissionsAction} className="space-y-2" data-testid="perm-form">
      <h3 className="text-sm font-bold">Permissions</h3>
      <input type="hidden" name="staffId" value={s.id} />
      <input type="hidden" name="name" value={s.full_name} />
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(PERM_LABEL) as Perm[]).map((k) => (
          <div key={k}>
            <label className={label} htmlFor={`perm-${k}-${s.id}`}>{PERM_LABEL[k]}</label>
            <select id={`perm-${k}-${s.id}`} name={k} defaultValue={p[k].set === null ? "default" : p[k].set ? "on" : "off"} className={input}>
              <option value="default">Role default ({p[k].role_default ? "yes" : "no"})</option>
              <option value="on">Yes, for {s.full_name.split(" ")[0]}</option>
              <option value="off">No, for {s.full_name.split(" ")[0]}</option>
            </select>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate">
        Anyone with an office role can build draft quotes on jobs they can work on. Publishing and sending, seeing cost prices and margins, and
        changing the favourites library follow these settings (role default: owner/admin and office manager yes, supervisor no).
      </p>
      <button className={quietBtn}>Save permissions</button>
    </form>
  );
}
