import Link from "next/link";
import { saveTrackingAction } from "@/app/dashboard/van-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { input, label, primaryBtn, quietBtn } from "@/components/office/jm";
import { VanMap, type MapVan } from "@/components/office/VanMap";
import { ago, distance, nzTime, VanStateChip, vanLine } from "@/components/office/vans-ui";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadVans, type Tracking, type VanList } from "@/lib/vans";

export const metadata = { title: "Vans" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; setup?: string }> };

export default async function VansPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, setup } = await searchParams;
  let data: VanList;
  try {
    data = await loadVans(session);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const t = data.tracking;
  const active = data.vans.filter((v) => v.active);
  const onMap: MapVan[] = active.filter((v) => v.pos).map((v) => ({
    id: v.id, name: v.name, lat: v.pos!.lat, lng: v.pos!.lng, state: v.state, label: vanLine(v), href: `/dashboard/office/vans/${v.id}`,
  }));
  const count = (s: string[]) => active.filter((v) => s.includes(v.state)).length;
  const unlinked = data.devices.filter((d) => !d.van);
  const canAdd = data.companies.length > 0;
  const showSetup = t.can_edit && (setup === "1" || !t.traccar_url);

  return (
    <div className="space-y-5" data-testid="vans-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Vans</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Where every van is right now, from the GPS trackers. Positions update every minute; open a van for its trail,
            stops and kilometres for any day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.can_edit && !showSetup && <Link href="/dashboard/office/vans?setup=1" className={quietBtn}>Tracking connection</Link>}
          {canAdd && <Link href="/dashboard/office/vans/new" className={primaryBtn} data-testid="add-van">+ Add a van</Link>}
        </div>
      </div>
      <Flash ok={ok} err={err} />
      <ConnectionBanner t={t} />
      {showSetup && <SetupCard t={t} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile n={count(["moving"])} label="Moving" bar="border-emerald-600" />
        <Tile n={count(["parked", "idling"])} label="Stopped" bar="border-blue-600" />
        <Tile n={count(["offline", "no_data"])} label="No signal / no data" bar="border-slate-400" />
        <div className="flex flex-col gap-1 rounded-2xl bg-[#0F172A] p-4 text-white shadow-sm">
          <span className="text-3xl leading-none font-bold tabular-nums text-sky-300">{active.length}</span>
          <span className="text-sm font-semibold">Vans</span>
        </div>
      </div>

      <VanMap vans={onMap} refreshSeconds={60} />

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        {data.vans.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">
            No vans yet.{canAdd ? " Add the first one with + Add a van, and pick its tracker once Traccar can see it." : ""}
          </p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm" data-testid="vans-table">
            <thead className="bg-[#0F172A] text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
              <tr>
                <th className="px-4 py-3">Van</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Today&apos;s booking</th>
              </tr>
            </thead>
            <tbody>
              {data.vans.map((v) => (
                <tr key={v.id} className={`border-t border-slate-100 align-top odd:bg-white even:bg-slate-50/70 hover:bg-sky-50 ${v.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/office/vans/${v.id}`} className="font-semibold hover:underline">{v.name}</Link>
                    <p className="text-xs text-slate-600">
                      {[v.rego, v.company, v.device ? v.device.name : "No tracker linked", !v.active && "Not in use"].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <VanStateChip state={v.state} />
                    {v.state === "moving" && v.pos?.speed ? <p className="mt-1 text-xs text-slate-600">{Math.round(v.pos.speed)} km/h</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{ago(v.pos?.at ?? null)}</td>
                  <td className="px-4 py-3">
                    {v.driver ? <>{v.driver.name}{v.driver.phone && <p className="text-xs text-slate-600">{v.driver.phone}</p>}</> : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {v.booking ? (
                      <>
                        {v.booking.job_ref ? (
                          <Link href={`/dashboard/office/job/${encodeURIComponent(v.booking.job_ref)}`} className="hover:underline">{v.booking.label}</Link>
                        ) : v.booking.label}
                        <p className="text-xs text-slate-600">
                          {nzTime(v.booking.starts_at)}–{nzTime(v.booking.ends_at)}{v.booking.site ? ` · ${v.booking.site}` : ""}
                        </p>
                        {v.booking.distance_m != null && (
                          <p className={`text-xs font-semibold ${v.booking.distance_m <= 200 ? "text-emerald-700" : "text-slate-700"}`}>
                            {v.booking.distance_m <= 200 ? "Van is on site" : `Van is ${distance(v.booking.distance_m)} away`}
                          </p>
                        )}
                      </>
                    ) : <span className="text-slate-500">{v.driver ? "Nothing booked today" : "No driver set"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {unlinked.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="unlinked-trackers">
          <h2 className="text-lg font-bold">Trackers not in a van yet</h2>
          <p className="mt-1 text-sm text-slate-600">Traccar can see these trackers. Open a van (or add one) and pick the tracker to start showing it.</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {unlinked.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium">{d.name}{d.imei && <span className="ml-2 text-xs text-slate-500">IMEI {d.imei}</span>}</span>
                <span className="text-slate-600">{d.status ?? "unknown"} · last heard {ago(d.last_update)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ n, label: l, bar }: { n: number; label: string; bar: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border-t-[5px] bg-white p-4 shadow-sm ${bar}`}>
      <span className="text-3xl leading-none font-bold tabular-nums">{n}</span>
      <span className="text-sm font-semibold">{l}</span>
    </div>
  );
}

function ConnectionBanner({ t }: { t: Tracking }) {
  if (!t.enabled) {
    return (
      <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700" role="status" data-testid="tracking-off">
        <strong>Tracking is off.</strong>{" "}
        {t.can_edit ? "Add your Traccar address under Tracking connection and switch it on." : "The owner switches it on once the Traccar account is set up."}
      </p>
    );
  }
  const stale = !t.last_ok_at || Date.now() - Date.parse(t.last_ok_at) > 5 * 60000;
  if (t.last_error || stale) {
    return (
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert" data-testid="tracking-error">
        <strong>Van positions aren&apos;t coming through.</strong>{" "}
        {t.last_error ?? "No update from Traccar in the last 5 minutes."}{" "}
        Last good update: {ago(t.last_ok_at)}.
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="tracking-ok">
      Connected to Traccar · last update {ago(t.last_ok_at)} · {t.last_devices ?? 0} tracker{t.last_devices === 1 ? "" : "s"}
    </p>
  );
}

function SetupCard({ t }: { t: Tracking }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="tracking-setup">
      <h2 className="text-lg font-bold">Tracking connection</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>In Traccar, add each tracker (Devices → +) using the IMEI printed on the tracker.</li>
        <li>In Traccar, make a token: Settings → Preferences → Token. Give it a long expiry.</li>
        <li>In Supabase (test project) → Edge Functions → Secrets, add <code>TRACCAR_TOKEN</code> with that token.</li>
        <li>Put your Traccar web address below (the one you log in at) and switch tracking on.</li>
      </ol>
      <form action={saveTrackingAction} className="mt-4 grid max-w-2xl gap-3">
        <div>
          <label htmlFor="traccar_url" className={label}>Traccar address</label>
          <input id="traccar_url" name="traccar_url" defaultValue={t.traccar_url ?? ""} placeholder="https://…" className={input} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={t.enabled} className="h-4 w-4" /> Tracking on (check every minute)
        </label>
        <div><button className={primaryBtn}>Save</button></div>
      </form>
    </section>
  );
}
