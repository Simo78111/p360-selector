"use client";
// The office TV: everything at a glance, readable from across the room.
// Refreshes every 30 seconds; shows how old the numbers are if the connection drops; a soft chime when
// something new and urgent turns up (after one click, as browsers block sound until then).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenData } from "@/lib/screen";

const REFRESH_MS = 30_000;
const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("en-NZ")}`;
const ago = (min: number) => (min < 1 ? "just now" : min < 60 ? `${min} min` : min < 60 * 24 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${Math.floor(min / 1440)}d`);

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((delay, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.65);
    });
  } catch { /* no sound available */ }
}

export function ScreenBoard({ token, initial }: { token: string; initial: ScreenData }) {
  const [data, setData] = useState(initial);
  const [updated, setUpdated] = useState(() => Date.now());
  const [problem, setProblem] = useState<"offline" | "gone" | null>(null);
  const [clock, setClock] = useState("");
  const [sound, setSound] = useState(false);
  const seenUrgent = useRef(new Set(initial.attention.items.filter((i) => i.severity === "urgent").map((i) => i.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/screen/${token}`, { cache: "no-store" });
      if (res.status === 404) { setProblem("gone"); return; }
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ScreenData;
      const urgent = next.attention.items.filter((i) => i.severity === "urgent").map((i) => i.id);
      const brandNew = urgent.filter((id) => !seenUrgent.current.has(id));
      urgent.forEach((id) => seenUrgent.current.add(id));
      if (brandNew.length) {
        setFresh(new Set(brandNew));
        if (sound && next.chime) chime();
      }
      setData(next);
      setUpdated(Date.now());
      setProblem(null);
    } catch {
      setProblem("offline");
    }
  }, [token, sound]);

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // clock (Auckland time) and staleness, every second
  const [, tick] = useState(0);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" });
    const t = setInterval(() => { setClock(fmt.format(new Date())); tick((n) => n + 1); }, 1000);
    setClock(fmt.format(new Date()));
    return () => clearInterval(t);
  }, []);

  // keep the computer's screen awake; reload twice a day to pick up website updates
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const grab = () => nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    grab();
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    document.addEventListener("visibilitychange", onVis);
    const reload = setTimeout(() => location.reload(), 12 * 60 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearTimeout(reload); lock?.release().catch(() => {}); };
  }, []);

  // first click: sound on and full screen
  const enable = () => {
    setSound(true);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const staleMin = Math.floor((Date.now() - updated) / 60000);
  const d = data;
  const t = d.today;
  const weekDiff = d.week.last_week_same_point > 0
    ? Math.round(((d.week.revenue_excl_gst - d.week.last_week_same_point) / d.week.last_week_same_point) * 100) : null;

  return (
    <main onClick={enable} onKeyDown={enable} className="screen flex h-screen flex-col gap-[0.8rem] overflow-hidden bg-[#0b1116] p-[1rem] text-white">
      {/* the whole board scales with the screen: 1rem = 1/96 of its width (20px on a 1080p TV) */}
      <style>{`html{font-size:1.0417vw}@media (max-aspect-ratio:16/10){html{font-size:1.7vh}}
        @keyframes pulse-red{0%,100%{background:rgba(220,38,38,.28)}50%{background:rgba(220,38,38,.5)}}
        .pulse{animation:pulse-red 1.6s ease-in-out infinite}`}</style>

      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-[0.8rem]">
          <span className="font-display text-[1.6rem] font-extrabold">Plumbing<span className="text-aqua">360</span></span>
          <span className="text-[1rem] text-white/60">Auckland · {d.date_local}</span>
          {(d.test_mode.texts || d.test_mode.emails) && (
            <span className="rounded-full bg-amber-400/20 px-[0.7rem] py-[0.15rem] text-[0.8rem] font-semibold text-amber-300">
              TEST MODE: {[d.test_mode.texts && "texts", d.test_mode.emails && "emails"].filter(Boolean).join(" & ")} not really sent
            </span>
          )}
        </div>
        <div className="flex items-center gap-[1rem]">
          {problem === "gone" && <span className="rounded-full bg-red-600 px-[0.8rem] py-[0.2rem] text-[0.9rem] font-semibold">Screen link no longer works</span>}
          {problem !== "gone" && (staleMin >= 2 || problem === "offline") && (
            <span className="rounded-full bg-red-600 px-[0.8rem] py-[0.2rem] text-[0.9rem] font-semibold">
              Not updating — last update {staleMin} min ago
            </span>
          )}
          {!sound && d.chime && <span className="text-[0.75rem] text-white/40">Click anywhere for sound and full screen</span>}
          <span className="font-display text-[2rem] font-bold tabular-nums">{clock}</span>
        </div>
      </header>

      {/* numbers */}
      <section className="grid grid-cols-4 gap-[0.8rem]">
        <Tile label="Revenue today" sub="excl GST, invoiced">
          <span className="text-[2.6rem] font-bold">{money(t.revenue_excl_gst)}</span>
          {t.target ? <Progress value={t.revenue_excl_gst} target={t.target} /> : <span className="text-[0.85rem] text-white/50">{t.invoices} invoice{t.invoices === 1 ? "" : "s"} · {money(t.paid)} paid today</span>}
        </Tile>
        <Tile label="Jobs today" sub={t.jobs_on_now ? `${t.jobs_on_now} on now` : "none on right now"}>
          <span className="text-[2.6rem] font-bold">{t.jobs_done}<span className="text-white/40"> / {t.jobs_booked}</span></span>
          <Progress value={t.jobs_done} target={Math.max(t.jobs_booked, 1)} plain />
        </Tile>
        <Tile label="This week" sub="excl GST, Monday to now">
          <span className="text-[2.6rem] font-bold">{money(d.week.revenue_excl_gst)}</span>
          {d.week.target ? <Progress value={d.week.revenue_excl_gst} target={d.week.target} />
            : weekDiff === null ? <span className="text-[0.85rem] text-white/50">no figures for last week yet</span>
            : <span className={`text-[1rem] font-semibold ${weekDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {weekDiff >= 0 ? "▲" : "▼"} {Math.abs(weekDiff)}% on last week ({money(d.week.last_week_same_point)})
              </span>}
        </Tile>
        <Tile label="Owed to us" sub={`${d.money.owed_count} invoice${d.money.owed_count === 1 ? "" : "s"} unpaid`} alert={d.money.overdue_14 > 0}>
          <span className="text-[2.6rem] font-bold">{money(d.money.owed)}</span>
          <span className={`text-[1rem] font-semibold ${d.money.overdue > 0 ? "text-red-400" : "text-white/50"}`}>
            {d.money.overdue > 0 ? `${money(d.money.overdue)} overdue (${d.money.overdue_count})` : "nothing overdue"}
          </span>
        </Tile>
      </section>

      {/* the three working columns */}
      <section className="grid min-h-0 flex-1 grid-cols-12 gap-[0.8rem]">
        <Panel className="col-span-4" title="Needs attention"
               badge={d.attention.urgent ? `${d.attention.urgent} urgent` : null} count={d.attention.total}>
          {d.attention.items.length === 0 ? <Empty>All clear 👍</Empty> : (
            <ul className="space-y-[0.5rem]">
              {d.attention.items.map((a) => (
                <li key={a.id} className={`rounded-[0.6rem] p-[0.6rem] ${a.severity === "urgent" ? "pulse border-l-[0.3rem] border-red-500" : a.severity === "warning" ? "border-l-[0.3rem] border-amber-400 bg-white/[0.06]" : "bg-white/[0.04]"} ${fresh.has(a.id) ? "ring-2 ring-red-400" : ""}`}>
                  <p className="text-[1rem] leading-snug">{a.message}</p>
                  <p className="mt-[0.15rem] text-[0.8rem] text-white/55">
                    {a.job_number ? `Job #${a.job_number} · ` : ""}waiting {ago(a.waiting_min)}
                  </p>
                </li>
              ))}
              {d.attention.total > d.attention.items.length && (
                <li className="text-[0.85rem] text-white/50">+{d.attention.total - d.attention.items.length} more in the office console</li>
              )}
            </ul>
          )}
        </Panel>

        <Panel className="col-span-5" title="Plumbers today" count={null}>
          {d.plumbers.length === 0 ? <Empty>No plumbers set up</Empty> : (
            <ul className="space-y-[0.5rem]">
              {d.plumbers.map((p) => <PlumberRow key={p.name} p={p} />)}
            </ul>
          )}
        </Panel>

        <Panel className="col-span-3" title="New jobs (24h)" count={d.new_jobs.length || null}>
          {d.new_jobs.length === 0 ? <Empty>No new bookings yet today</Empty> : (
            <ul className="space-y-[0.45rem]">
              {d.new_jobs.map((j) => (
                <li key={j.job_number} className={`rounded-[0.6rem] p-[0.55rem] ${j.tier === "priority" ? "border-l-[0.3rem] border-red-500 bg-red-500/15" : "bg-white/[0.05]"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.95rem] font-semibold">{j.service}</span>
                    <span className="shrink-0 text-[0.75rem] text-white/50">{ago(j.booked_min_ago)} ago</span>
                  </div>
                  <p className="text-[0.85rem] text-white/70">
                    #{j.job_number} · {j.customer}{j.suburb ? `, ${j.suburb}` : ""}
                    {j.tier === "priority" && <span className="ml-1 font-bold text-red-300">PRIORITY</span>}
                    {j.tier === "flexi" && <span className="ml-1 text-aqua">Flexi</span>}
                    {j.callback && <span className="ml-1 text-amber-300">Callback</span>}
                  </p>
                  <p className={`text-[0.8rem] ${j.when ? "text-white/55" : "text-amber-300"}`}>
                    {j.status === "cancelled" ? "Cancelled" : j.when ? `${j.when}${j.plumber ? ` · ${j.plumber}` : ""}` : j.tier === "flexi" ? "In the standby pool" : "Waiting for a time"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* pipeline strip */}
      <footer className="grid grid-cols-8 gap-[0.6rem]">
        <Stat label="Paid today" value={money(t.paid)} />
        <Stat label="Quotes out" value={`${d.pipeline.quotes}`} sub={d.pipeline.quotes ? money(d.pipeline.quotes_value) : undefined} />
        <Stat label="Extra work waiting" value={`${d.pipeline.extra_work}`} sub={d.pipeline.extra_work ? money(d.pipeline.extra_work_value) : undefined} />
        <Stat label="Waiting for a time" value={`${d.waiting_for_time}`} warn={d.waiting_for_time > 0} />
        <Stat label="Flexi pool" value={`${d.flexi_pool}`} />
        <Stat label="Gaps being filled" value={`${d.gaps.length}`}
              sub={d.gaps[0] ? `${d.gaps[0].plumber} from ${d.gaps[0].from}${d.gaps[0].offers_out ? `, ${d.gaps[0].offers_out} offers out` : ""}` : undefined} />
        <Stat label="Reviews asked (week)" value={`${d.pipeline.reviews_asked_week}`} />
        <Stat label="Marketing to approve" value={`${d.pipeline.marketing_waiting}`} warn={d.pipeline.marketing_waiting > 0} />
      </footer>
    </main>
  );
}

function Tile({ label, sub, alert, children }: { label: string; sub: string; alert?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col justify-between gap-[0.3rem] rounded-[0.9rem] p-[0.9rem] ${alert ? "bg-red-500/20" : "bg-white/[0.06]"}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.95rem] font-semibold uppercase tracking-wide text-white/60">{label}</span>
        <span className="text-[0.8rem] text-white/40">{sub}</span>
      </div>
      {children}
    </div>
  );
}

function Progress({ value, target, plain }: { value: number; target: number; plain?: boolean }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div>
      <div className="h-[0.55rem] overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : "bg-aqua"}`} style={{ width: `${pct}%` }} />
      </div>
      {!plain && <p className="mt-[0.2rem] text-[0.8rem] text-white/55">{pct}% of {money(target)} target</p>}
    </div>
  );
}

function Panel({ title, count, badge, className, children }: { title: string; count: number | null; badge?: string | null; className: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-[0.9rem] bg-white/[0.04] p-[0.9rem] ${className}`}>
      <div className="mb-[0.6rem] flex items-center gap-[0.6rem]">
        <h2 className="text-[1.25rem] font-bold">{title}</h2>
        {count !== null && <span className="rounded-full bg-white/10 px-[0.6rem] text-[0.9rem] font-semibold">{count}</span>}
        {badge && <span className="pulse rounded-full px-[0.6rem] text-[0.9rem] font-bold text-red-100">{badge}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="pt-[1rem] text-center text-[1.2rem] text-white/40">{children}</p>;
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-[0.7rem] bg-white/[0.05] px-[0.7rem] py-[0.5rem]">
      <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-white/50">{label}</p>
      <p className={`text-[1.5rem] font-bold leading-tight ${warn ? "text-amber-300" : ""}`}>{value}</p>
      {sub && <p className="truncate text-[0.72rem] text-white/50">{sub}</p>}
    </div>
  );
}

function PlumberRow({ p }: { p: ScreenData["plumbers"][number] }) {
  const over = p.now?.over_min ?? 0;
  const late = p.next?.late_min ?? 0;
  const state = p.off ? { text: "Off today", tone: "bg-white/10 text-white/60" }
    : p.now?.state === "on_site" ? (over > 0 ? { text: `On site · ${over} min over`, tone: "bg-red-500/30 text-red-100" } : { text: "On site", tone: "bg-emerald-500/25 text-emerald-200" })
    : p.now?.state === "en_route" ? { text: "On the way", tone: "bg-aqua/25 text-aqua-light" }
    : p.jobs_total > 0 && p.jobs_done === p.jobs_total ? { text: "Day done", tone: "bg-white/10 text-white/70" }
    : p.jobs_total === 0 ? { text: "No jobs", tone: "bg-amber-400/20 text-amber-200" }
    : { text: "Between jobs", tone: "bg-white/10 text-white/80" };
  return (
    <li className={`rounded-[0.6rem] p-[0.6rem] ${p.off ? "bg-white/[0.02] opacity-60" : "bg-white/[0.06]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[1.15rem] font-bold">
          {p.name}{p.gasfitter && <span className="ml-[0.4rem] rounded bg-orange-500/25 px-[0.35rem] text-[0.7rem] font-semibold text-orange-200">GAS</span>}
          {p.alerts > 0 && <span className="ml-[0.4rem] text-[0.8rem] text-red-300">⚠ {p.alerts}</span>}
        </span>
        <span className="flex items-center gap-[0.6rem]">
          <span className="text-[0.95rem] tabular-nums text-white/70">{p.jobs_done}/{p.jobs_total} done</span>
          <span className={`rounded-full px-[0.6rem] py-[0.1rem] text-[0.85rem] font-semibold ${state.tone}`}>{state.text}</span>
        </span>
      </div>
      {!p.off && (
        <div className="mt-[0.25rem] space-y-[0.1rem] text-[0.95rem]">
          <p className="truncate text-white/80">
            <span className="inline-block w-[3.2rem] text-white/45">Now</span>
            {p.now ? [p.now.state === "en_route" && p.now.eta ? `ETA ${p.now.eta}` : p.now.expected_finish ? ((p.now.over_min ?? 0) > 0 ? `was due ${p.now.expected_finish}` : `done ~${p.now.expected_finish}`) : null,
                      p.now.suburb, `${p.now.service} (#${p.now.job_number})`].filter(Boolean).join(" · ") : "—"}
          </p>
          <p className="truncate text-white/80">
            <span className="inline-block w-[3.2rem] text-white/45">Next</span>
            {p.next ? (
              <>
                {p.next.at}
                {late >= 15 && <span className="ml-1 font-semibold text-red-300">(+{late} min late)</span>}
                {p.next.tier === "priority" && <span className="ml-1 font-bold text-red-300">PRIORITY</span>}
                {" "}· {p.next.suburb ? `${p.next.suburb} · ` : ""}{p.next.service}
              </>
            ) : "—"}
          </p>
        </div>
      )}
      {p.last_seen_min !== null && p.last_seen_min > 30 && !p.off && (p.now || p.next) && (
        <p className="mt-[0.15rem] text-[0.75rem] text-amber-300">No phone location for {ago(p.last_seen_min)}</p>
      )}
    </li>
  );
}
