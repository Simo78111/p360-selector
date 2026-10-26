import { homeRoutingAction, setHomeAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadPlumbers, officeEnabled, type PlumbersInfo } from "@/lib/office";

export const metadata = { title: "Plumbers" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function PlumbersPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let info: PlumbersInfo;
  try {
    info = await loadPlumbers();
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
        <h2 className="text-lg font-bold">Home addresses</h2>
        <p className="mt-1 text-sm text-slate">Only used for planning routes. Leave blank to remove.</p>
        <ul className="mt-4 divide-y divide-black/5">
          {info.plumbers.map((p) => (
            <li key={p.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {p.name}
                  {!p.active && <span className="ml-2 text-xs font-normal text-slate">inactive</span>}
                </p>
                <p className="text-xs text-slate">
                  {p.shift} · last 90 days: {p.jobs_90d} job{p.jobs_90d === 1 ? "" : "s"},{" "}
                  <span className={p.callbacks_90d ? "font-semibold text-orange-800" : ""}>
                    {p.callbacks_90d} callback{p.callbacks_90d === 1 ? "" : "s"}
                  </span>
                  {p.jobs_90d > 0 && ` (${Math.round((p.callbacks_90d / p.jobs_90d) * 100)}%)`}
                </p>
              </div>
              <form action={setHomeAction} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="plumberId" value={p.id} />
                <label className="sr-only" htmlFor={`home-${p.id}`}>Home address for {p.name}</label>
                <input
                  id={`home-${p.id}`}
                  name="address"
                  defaultValue={p.home_address ?? ""}
                  placeholder="e.g. 12 Smith Street, Takapuna"
                  className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm"
                />
                <button type="submit" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink">
                  Save
                </button>
              </form>
              {p.home_set && <p className="mt-1 text-xs text-emerald-800">Found on the map</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
