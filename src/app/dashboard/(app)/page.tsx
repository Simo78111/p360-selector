import Link from "next/link";
import { BarList } from "@/components/dashboard/BarList";
import { StatTile } from "@/components/dashboard/StatTile";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { Card, formatDateTime, parseDays, RangeTabs, StatusBadge } from "@/components/dashboard/ui";
import { loadStats } from "@/lib/dashboard-data";
import { requireOffice } from "@/lib/auth";

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireOffice("bookings");
  const days = parseDays((await searchParams).days);
  const stats = await loadStats(days);
  const period = `${days} days`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Overview</h1>
        <RangeTabs days={days} basePath="/dashboard" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.kpis.map((kpi, i) => (
          <div key={kpi.id} className={i === stats.kpis.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}>
            <StatTile kpi={kpi} periodLabel={period} />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Visitors per day" subtitle="People who visited any page. Today is still in progress.">
          <TrendChart data={stats.daily.map((d) => ({ date: d.date, value: d.visitors }))} label="Visitors" />
        </Card>
        <Card title="From visit to booking" subtitle="How many people made it to each step">
          <BarList
            valueLabel="people"
            bars={stats.funnel.map((step, i) => ({
              label: step.label,
              value: step.value,
              detail: i === 0 ? undefined : `${pct(step.value, stats.funnel[i - 1].value)} of previous`,
            }))}
          />
        </Card>
      </div>

      <Card title="What people need help with" subtitle="Job finder results, most common first">
        {stats.outcomes.length === 0 ? (
          <p className="text-sm text-slate">No job finder results yet.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate">
                <tr className="border-b border-black/5">
                  <th className="px-5 py-2 font-medium sm:pl-0">Result</th>
                  <th className="px-3 py-2 font-medium">Reached</th>
                  <th className="px-3 py-2 text-right font-medium">Fixed it themselves</th>
                  <th className="px-3 py-2 text-right font-medium">Clicked book</th>
                  <th className="px-5 py-2 text-right font-medium sm:pr-0">Booked</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {stats.outcomes.slice(0, 12).map((o) => {
                  const max = stats.outcomes[0].reached || 1;
                  return (
                    <tr key={o.id} className="border-b border-black/5 last:border-0">
                      <td className="px-5 py-2.5 font-medium sm:pl-0">{o.title}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 rounded-r-[4px] bg-chart" style={{ width: `${(o.reached / max) * 120}px` }} aria-hidden />
                          {o.reached}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {o.fixed} <span className="text-slate">({pct(o.fixed, o.reached)})</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{o.bookClicks}</td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap sm:pr-0">
                        {o.booked} <span className="text-slate">({pct(o.booked, o.reached)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Where people stop in the job finder" subtitle="Saw the question vs answered it">
          {stats.questions.length === 0 ? (
            <p className="text-sm text-slate">No job finder activity yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-slate">
                <tr className="border-b border-black/5">
                  <th className="py-2 font-medium">Question</th>
                  <th className="px-2 py-2 text-right font-medium">Saw it</th>
                  <th className="py-2 text-right font-medium">Left here</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {stats.questions.slice(0, 10).map((q) => {
                  const left = Math.max(0, q.reached - q.answered);
                  return (
                    <tr key={q.id} className="border-b border-black/5 last:border-0">
                      <td className="py-2.5">
                        {q.title}
                        <span className="block text-xs text-slate">{q.context}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{q.reached}</td>
                      <td className="py-2.5 text-right">
                        {left} <span className="text-slate">({pct(left, q.reached)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Bookings by suburb">
          <BarList
            valueLabel="bookings"
            empty="No bookings in this period."
            bars={stats.suburbs.slice(0, 8).map((s) => ({ label: s.suburb, value: s.count }))}
          />
        </Card>
      </div>

      <Card title="Latest bookings">
        {stats.recent.length === 0 ? (
          <p className="text-sm text-slate">No bookings in this period.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {stats.recent.map((b) => (
              <li key={b.reference}>
                <Link
                  href={`/dashboard/bookings/${b.reference}`}
                  className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-mist"
                >
                  <span>
                    <span className="font-medium">{b.outcomeTitle}</span>
                    <span className="text-slate"> · {b.suburb} · {b.name}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-slate">
                    {formatDateTime(b.createdAt)}
                    <StatusBadge status={b.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/dashboard/bookings" className="mt-4 inline-block text-sm font-semibold text-aqua-deep hover:underline">
          All bookings →
        </Link>
      </Card>
    </div>
  );
}
