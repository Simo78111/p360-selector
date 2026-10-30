import { homeRoutingAction, plumberActiveAction, savePlumberAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { plumberBackAction, plumberOffAction } from "@/app/dashboard/automation-actions";
import { loadPlumbersOff, type PlumberOff } from "@/lib/automation";
import { aucklandToday, loadPlumbers, officeEnabled, shiftDate, type PlumbersInfo } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Plumbers" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function PlumbersPage({ searchParams }: Props) {
  await requireOffice("bookings");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let info: PlumbersInfo;
  let off: PlumberOff[];
  const today = aucklandToday();
  try {
    [info, off] = await Promise.all([loadPlumbers(), loadPlumbersOff(today, shiftDate(today, 30)).catch(() => [])]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const homesSet = info.plumbers.filter((p) => p.active && p.home_set).length;
  const active = info.plumbers.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plumbers and routes</h1>
        <p className="mt-1 text-sm text-slate">
          Drive times come from Google (with traffic) and are looked up each afternoon before routes are planned at{" "}
          {info.plan_lock_time}. Every gap between jobs is the drive plus {info.park_buffer_min} minutes to park.{" "}
          {info.cached_drive_times} journeys looked up so far.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Off sick or on leave</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Plumbers can tap &ldquo;I&apos;m off sick&rdquo; in their app. Either way, their jobs that day go to someone else who
          can fit them, or to the next free day, and each customer is texted. Nothing new is booked with them that day.
        </p>
        {off.length > 0 && (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {off.map((o) => (
              <li key={`${o.plumber_id}-${o.date}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{o.plumber}</strong> · {o.date} · {o.reason}{o.note && ` — ${o.note}`}</span>
                <form action={plumberBackAction}>
                  <input type="hidden" name="plumberId" value={o.plumber_id} />
                  <input type="hidden" name="date" value={o.date} />
                  <input type="hidden" name="name" value={o.plumber} />
                  <button className="rounded-full bg-mist px-3 py-1 text-xs font-semibold">Back on</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={plumberOffAction} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
          <div>
            <label className="block font-medium" htmlFor="off-plumber">Plumber</label>
            <select id="off-plumber" name="plumberId" required className="rounded-full border border-black/10 px-3 py-2">
              {info.plumbers.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-medium" htmlFor="off-date">Day</label>
            <input id="off-date" name="date" type="date" required defaultValue={today} min={today} className="rounded-full border border-black/10 px-3 py-2" />
          </div>
          <div>
            <label className="block font-medium" htmlFor="off-reason">Why</label>
            <select id="off-reason" name="reason" className="rounded-full border border-black/10 px-3 py-2">
              <option value="sick">Sick</option>
              <option value="leave">Leave</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input name="note" placeholder="Note (optional)" aria-label="Note" className="min-w-0 flex-1 rounded-full border border-black/10 px-3 py-2" />
          <input type="hidden" name="name" value="" />
          <button className="rounded-full bg-ink px-4 py-2 font-semibold text-white">Mark off and move their jobs</button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold">Plan routes from home</h2>
            <p className="mt-1 text-sm text-slate">
              When this is on, each plumber&apos;s route counts the drive from home to the first job and from the last
              job back home. Jobs then go to whoever lives nearest when days are otherwise equal, and days start and end
              closer to home. {homesSet} of {active} plumbers have a home address.
            </p>
          </div>
          <form action={homeRoutingAction} className="text-right">
            <input type="hidden" name="on" value={info.route_from_home ? "false" : "true"} />
            <p className="mb-2 text-sm">
              Now: <strong>{info.route_from_home ? "On" : "Off"}</strong>
            </p>
            <button
              type="submit"
              disabled={!info.route_from_home && homesSet === 0}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {info.route_from_home ? "Turn off" : "Turn on"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Plumbers</h2>
          <p className="text-sm text-slate">
            {active} active{info.plumbers.length > active ? `, ${info.plumbers.length - active} inactive` : ""}
          </p>
        </div>

        <details className="group mt-4 rounded-2xl border-2 border-dashed border-aqua/60 open:border-solid open:bg-aqua-pale/30">
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-aqua-deep">
            <span className="group-open:hidden">+ Add a plumber</span>
            <span className="hidden group-open:inline">New plumber</span>
          </summary>
          <div className="px-4 pb-4">
            <PlumberForm />
          </div>
        </details>

        <ul className="mt-4 divide-y divide-black/5">
          {info.plumbers.map((p) => (
            <li key={p.id} className={`py-4 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {p.name}
                    {!p.active && <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs font-normal">inactive</span>}
                  </p>
                  <p className="text-sm text-slate">
                    {p.phone}
                    {p.email && ` · ${p.email}`}
                    {p.pgdb_licence_no && ` · PGDB ${p.pgdb_licence_no}`}
                  </p>
                  <p className="text-sm">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_gasfitter ? "bg-orange-100 text-orange-900" : "bg-aqua-pale text-aqua-deep"}`}>
                      {p.is_gasfitter ? "Plumber + gas fitter" : "Plumber"}
                    </span>
                    {p.rate_plumbing ? `$${Number(p.rate_plumbing).toFixed(2)}/h plumbing` : <span className="text-amber-800">no plumbing rate</span>}
                    {p.is_gasfitter &&
                      (p.rate_gas ? ` · $${Number(p.rate_gas).toFixed(2)}/h gas` : <span className="text-amber-800"> · no gas rate</span>)}
                  </p>
                  <p className="text-xs text-slate">
                    {p.shift} · {p.home_address ? `home: ${p.home_address}` : "no home address"} ·{" "}
                    {p.app_linked ? (
                      <span className="text-emerald-800">signed in to the app</span>
                    ) : p.email ? (
                      "not signed in to the app yet"
                    ) : (
                      "no app login (add an email)"
                    )}
                  </p>
                </div>
                <p className="text-xs text-slate">
                  {p.booked_ahead} booked ahead · last 90 days: {p.jobs_90d} job{p.jobs_90d === 1 ? "" : "s"},{" "}
                  <span className={p.callbacks_90d ? "font-semibold text-orange-800" : ""}>
                    {p.callbacks_90d} callback{p.callbacks_90d === 1 ? "" : "s"}
                  </span>
                  {p.jobs_90d > 0 && ` (${Math.round((p.callbacks_90d / p.jobs_90d) * 100)}%)`}
                </p>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-aqua-deep hover:underline">Edit {p.name}</summary>
                <div className="mt-3 rounded-2xl bg-mist/60 p-4">
                  <PlumberForm plumber={p} />
                  <form action={plumberActiveAction} className="mt-4 border-t border-black/10 pt-4">
                    <input type="hidden" name="plumberId" value={p.id} />
                    <input type="hidden" name="name" value={p.name} />
                    <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                    <button type="submit" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink">
                      {p.active ? "Make inactive" : "Make active again"}
                    </button>
                    <span className="ml-3 text-xs text-slate">
                      {p.active
                        ? p.booked_ahead > 0
                          ? `Move their ${p.booked_ahead} booked job${p.booked_ahead === 1 ? "" : "s"} first.`
                          : "Inactive plumbers aren't given jobs. Their history stays."
                        : "They'll be given jobs again."}
                    </span>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Plumber = PlumbersInfo["plumbers"][number];

const field = "w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm";

function PlumberForm({ plumber: p }: { plumber?: Plumber }) {
  const k = p?.id ?? "new";
  return (
    <form action={savePlumberAction} className="grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="plumberId" value={p.id} />}
      <label className="text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input id={`name-${k}`} name="name" required defaultValue={p?.name} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Mobile</span>
        <input id={`phone-${k}`} name="phone" type="tel" required defaultValue={p?.phone} placeholder="021 123 4567" className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input id={`email-${k}`} name="email" type="email" defaultValue={p?.email ?? ""} placeholder="for the plumber app login" className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">PGDB licence number</span>
        <input id={`licence-${k}`} name="licence" defaultValue={p?.pgdb_licence_no ?? ""} className={field} />
      </label>
      <div className="flex gap-3 text-sm">
        <label className="flex-1">
          <span className="mb-1 block font-medium">Starts</span>
          <input id={`start-${k}`} name="shiftStart" type="time" required defaultValue={p?.shift_start ?? "07:30"} className={field} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block font-medium">Finishes</span>
          <input id={`end-${k}`} name="shiftEnd" type="time" required defaultValue={p?.shift_end ?? "16:30"} className={field} />
        </label>
      </div>
      <fieldset className="grid gap-3 rounded-2xl border border-black/10 bg-white/60 p-3 text-sm sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 font-medium">Trade and hourly rates (excl GST)</legend>
        <label className="flex items-center gap-2 self-end pb-2">
          <input id={`gas-${k}`} name="gasfitter" type="checkbox" defaultChecked={p?.is_gasfitter} className="h-4 w-4" />
          Also a gas fitter
        </label>
        <label>
          <span className="mb-1 block">Plumbing $/hour</span>
          <input id={`rate-plumbing-${k}`} name="ratePlumbing" inputMode="decimal" defaultValue={p?.rate_plumbing ?? ""} placeholder="e.g. 95" className={field} />
        </label>
        <label>
          <span className="mb-1 block">Gas fitting $/hour</span>
          <input id={`rate-gas-${k}`} name="rateGas" inputMode="decimal" defaultValue={p?.rate_gas ?? ""} placeholder="gas fitters only" className={field} />
        </label>
        <p className="text-xs text-slate sm:col-span-3">
          Labour on extra work is charged at these rates. Gas jobs only go to gas fitters.
        </p>
      </fieldset>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Home address</span>
        <input
          id={`home-${k}`}
          name="home"
          defaultValue={p?.home_address ?? ""}
          placeholder="e.g. 12 Smith Street, Takapuna"
          className={field}
        />
        <span className="mt-1 block text-xs text-slate">Only used for planning routes. {p ? "Leave blank to remove." : "Optional."}</span>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">{p?.app_linked ? "New app password" : "App password"}</span>
        <input
          id={`password-${k}`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder={p ? "Leave blank to keep it as it is" : "Optional: at least 8 characters"}
          className={`${field} sm:max-w-sm`}
        />
        <span className="mt-1 block text-xs text-slate">
          Makes their login for the plumber app (email + this password). Give it to them in person, not by text.
        </span>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">
          {p ? "Save changes" : "Add plumber"}
        </button>
      </div>
    </form>
  );
}
