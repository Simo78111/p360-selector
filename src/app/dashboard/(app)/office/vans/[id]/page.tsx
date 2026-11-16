import Link from "next/link";
import { notFound } from "next/navigation";
import { saveVanAction } from "@/app/dashboard/van-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { area, input, label, primaryBtn, quietBtn } from "@/components/office/jm";
import { VanMap, type MapPin } from "@/components/office/VanMap";
import { ago, nzTime, VanStateChip, vanLine } from "@/components/office/vans-ui";
import { requireOffice } from "@/lib/auth";
import { aucklandToday, officeEnabled } from "@/lib/office";
import { loadVan, loadVans, summariseDay, type VanDetail, type VanList } from "@/lib/vans";

export const metadata = { title: "Van" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; day?: string; edit?: string }> };

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

export default async function VanPage({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { id } = await params;
  const { ok, err, day: dayParam, edit } = await searchParams;
  const isNew = id === "new";
  if (!isNew && !isId(id)) notFound();
  const today = aucklandToday();
  const day = isDay(dayParam) && dayParam <= today ? dayParam : today;

  let v: VanDetail | null = null;
  let list: VanList;
  try {
    [v, list] = await Promise.all([isNew ? Promise.resolve(null) : loadVan(session, id, day), loadVans(session)]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!isNew && !v) notFound();
  const canEdit = isNew ? list.companies.length > 0 : !!v?.can_edit;
  const editing = canEdit && (isNew || edit === "1");
  const path = `/dashboard/office/vans/${id}`;

  const summary = v ? summariseDay(v.trail, v.bookings) : null;
  const pins: MapPin[] = [
    ...(summary?.stops ?? []).map((s) => ({
      lat: s.lat, lng: s.lng, kind: "stop" as const,
      label: `Stopped ${nzTime(s.from)}–${nzTime(s.to)} (${s.minutes} min)${s.near ? ` · ${s.near.label}` : ""}`,
    })),
    ...(v?.bookings ?? []).filter((b) => b.lat != null && b.lng != null).map((b) => ({
      lat: b.lat!, lng: b.lng!, kind: "site" as const, label: `${b.label} · ${nzTime(b.starts_at)}${b.site ? ` · ${b.site}` : ""}`,
    })),
  ];
  const isToday = day === today;
  const vanOnMap = v?.pos && isToday ? [{ id: v.id, name: v.name, lat: v.pos.lat, lng: v.pos.lng, state: v.state, label: vanLine(v) }] : [];

  return (
    <div className="space-y-6" data-testid="van-page">
      <p className="text-sm"><Link href="/dashboard/office/vans" className="text-slate-600 hover:underline">← All vans</Link></p>
      <Flash ok={ok} err={err} />

      {v && (
        <section className="overflow-hidden rounded-2xl bg-[#0F172A] text-white shadow-[0_8px_24px_rgba(15,23,42,.12)]" data-testid="van-header">
          <div className="flex flex-wrap items-start justify-between gap-6 px-5 py-5 sm:px-7">
            <div className="space-y-2">
              <p className="text-sm font-semibold tracking-wide text-sky-200">
                {[v.rego, v.company, v.device ? `${v.device.name}${v.device.imei ? ` · IMEI ${v.device.imei}` : ""}` : "No tracker linked"].filter(Boolean).join(" · ")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold sm:text-3xl">{v.name}</h1>
                <VanStateChip state={v.state} />
              </div>
              <p className="text-sm text-slate-300">
                {v.driver ? `Usually driven by ${v.driver.name}` : "No usual driver set"} · last seen {ago(v.pos?.at ?? null)}
              </p>
            </div>
            {canEdit && !editing && <Link href={`${path}?edit=1&day=${day}`} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-300">Edit van</Link>}
          </div>
        </section>
      )}
      {isNew && <h1 className="text-3xl font-bold">Add a van</h1>}

      {editing && <VanForm v={v} list={list} />}

      {v && summary && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              {isToday ? "Today" : new Date(`${day}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <form className="flex items-center gap-2">
              <Link href={`${path}?day=${shiftDay(day, -1)}`} className={quietBtn} aria-label="Day before">←</Link>
              <input type="date" name="day" defaultValue={day} max={today} className={`${input} w-auto`} aria-label="Day" />
              <button className={quietBtn}>Show</button>
              {!isToday && <Link href={`${path}?day=${shiftDay(day, 1)}`} className={quietBtn} aria-label="Day after">→</Link>}
              {!isToday && <Link href={path} className={quietBtn}>Today</Link>}
            </form>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fig k="Distance" v={`${summary.km} km`} />
            <Fig k="Driving" v={hm(summary.driveMinutes)} />
            <Fig k="First / last move" v={summary.firstMove ? `${nzTime(summary.firstMove)} – ${nzTime(summary.lastMove!)}` : "—"} />
            <Fig k="Stops (5 min+)" v={String(summary.stops.length)} />
          </div>

          {v.trail.length === 0 && vanOnMap.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-slate-600">No positions for this van on this day.</p>
          ) : (
            <VanMap vans={vanOnMap} trail={v.trail.map(([, la, ln]) => [la, ln] as [number, number])} pins={pins} refreshSeconds={isToday ? 60 : 0} height={480} />
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="van-stops">
              <h3 className="font-bold">Stops</h3>
              {summary.stops.length === 0 ? <p className="mt-2 text-sm text-slate-600">No stops of 5 minutes or more.</p> : (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {summary.stops.map((s) => (
                    <li key={s.from} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="tabular-nums">{nzTime(s.from)} – {nzTime(s.to)} <span className="text-slate-500">({hm(s.minutes)})</span></span>
                      <span className={s.near ? "font-medium text-emerald-800" : "text-slate-500"}>
                        {s.near ? `At ${s.near.label}` : `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="van-bookings">
              <h3 className="font-bold">{v.driver ? `${v.driver.name}'s bookings` : "Bookings"}</h3>
              {!v.driver ? <p className="mt-2 text-sm text-slate-600">Set the usual driver to see their bookings against the van.</p>
                : v.bookings.length === 0 ? <p className="mt-2 text-sm text-slate-600">Nothing booked on this day.</p> : (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {v.bookings.map((b) => (
                    <li key={`${b.starts_at}${b.job_ref}`} className="py-2">
                      <span className="tabular-nums">{nzTime(b.starts_at)}–{nzTime(b.ends_at)}</span>{" "}
                      {b.job_ref ? <Link href={`/dashboard/office/job/${encodeURIComponent(b.job_ref)}`} className="font-medium hover:underline">{b.label}</Link> : b.label}
                      {b.site && <p className="text-xs text-slate-600">{b.site}{b.lat == null ? " (not on the map yet)" : ""}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Fig({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{k}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{v}</p>
    </div>
  );
}

function VanForm({ v, list }: { v: VanDetail | null; list: VanList }) {
  const devices = list.devices.filter((d) => !d.van || d.id === v?.device_id);
  return (
    <form action={saveVanAction} className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2" data-testid="van-form">
      <input type="hidden" name="vanId" value={v?.id ?? ""} />
      <div>
        <label htmlFor="name" className={label}>Name</label>
        <input id="name" name="name" required maxLength={60} defaultValue={v?.name ?? ""} placeholder="Van 3" className={input} />
      </div>
      <div>
        <label htmlFor="rego" className={label}>Rego</label>
        <input id="rego" name="rego" maxLength={12} defaultValue={v?.rego ?? ""} placeholder="ABC123" className={input} />
      </div>
      <div>
        <label htmlFor="company_id" className={label}>Company</label>
        <select id="company_id" name="company_id" defaultValue={v?.company_id ?? list.companies[0]?.id} className={input}>
          {list.companies.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="driver_staff_id" className={label}>Usual driver</label>
        <select id="driver_staff_id" name="driver_staff_id" defaultValue={v?.driver?.staff_id ?? ""} className={input}>
          <option value="">Nobody set</option>
          {list.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="device_id" className={label}>GPS tracker</label>
        <select id="device_id" name="device_id" defaultValue={v?.device_id ?? ""} className={input}>
          <option value="">No tracker</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.imei ? ` · IMEI ${d.imei}` : ""}{d.status ? ` · ${d.status}` : ""}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {list.devices.length === 0 ? "No trackers yet: add them in Traccar and switch tracking on (Vans → Tracking connection)." : "Trackers come from Traccar. Each tracker can be in one van."}
        </p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="notes" className={label}>Notes</label>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={v?.notes ?? ""} className={area} />
      </div>
      {v && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="active" defaultChecked={v.active} className="h-4 w-4" /> In use (untick for a sold or parked-up van)
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className={primaryBtn}>{v ? "Save van" : "Add van"}</button>
        <Link href={v ? `/dashboard/office/vans/${v.id}` : "/dashboard/office/vans"} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-500">Cancel</Link>
      </div>
    </form>
  );
}
