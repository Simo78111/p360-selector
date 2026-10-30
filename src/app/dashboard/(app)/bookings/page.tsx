import Link from "next/link";
import { formatDateTime, parseDays, RangeTabs, StatusBadge, statusList } from "@/components/dashboard/ui";
import { loadBookings, type BookingStatus } from "@/lib/dashboard-data";
import { requireOffice } from "@/lib/auth";

type Props = { searchParams: Promise<{ days?: string; status?: string }> };

export default async function BookingsPage({ searchParams }: Props) {
  await requireOffice("bookings");
  const params = await searchParams;
  const days = parseDays(params.days);
  const status = statusList.some((s) => s.id === params.status) ? (params.status as BookingStatus) : undefined;
  const bookings = await loadBookings(new Date(Date.now() - days * 86_400_000), status);
  const statusQuery = status ? `&status=${status}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <RangeTabs days={days} basePath="/dashboard/bookings" extra={statusQuery} />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {[{ id: undefined, label: "All" }, ...statusList].map((s) => (
          <Link
            key={s.label}
            href={`/dashboard/bookings?days=${days}${s.id ? `&status=${s.id}` : ""}`}
            aria-current={s.id === status ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ${s.id === status ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl bg-white">
        {bookings.length === 0 ? (
          <p className="p-6 text-sm text-slate">No bookings match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-5 py-3 font-medium">Received</th>
                  <th className="px-3 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Suburb</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.reference} className="border-t border-black/5 hover:bg-aqua-pale/50">
                    <td className="px-5 py-3 whitespace-nowrap text-slate">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/dashboard/bookings/${b.reference}`} className="font-medium hover:text-aqua-deep hover:underline">
                        {b.outcomeTitle}
                      </Link>
                      {(b.urgency === "urgent" || b.urgency === "emergency") && (
                        <span className="ml-2 text-xs font-semibold text-amber-800">Urgent</span>
                      )}
                      <span className="block text-xs text-slate">{b.reference}</span>
                    </td>
                    <td className="px-3 py-3">{b.name}</td>
                    <td className="px-3 py-3">{b.suburb}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate">Showing {bookings.length} booking{bookings.length === 1 ? "" : "s"}.</p>
    </div>
  );
}
