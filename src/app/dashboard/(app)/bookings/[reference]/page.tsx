import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, StatusBadge } from "@/components/dashboard/ui";
import { relationships, timesOfDay } from "@/lib/booking";
import { loadBooking, usingSampleData } from "@/lib/dashboard-data";
import { formatPrice } from "@/lib/site";
import { setBookingStatus } from "../../../actions";

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

export default async function BookingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { booking, photoUrls } = await loadBooking(reference);
  if (!booking) notFound();
  const sample = usingSampleData();

  const details: [string, React.ReactNode][] = [
    ["Received", formatDateTime(booking.createdAt)],
    ["Job", `${booking.outcomeTitle} (${booking.service})`],
    ["Urgency", booking.urgency],
    ["Finder answers", booking.answers.replaceAll(".", " → ")],
    ["Price shown", booking.priceLabel],
    [
      "Deposit",
      booking.paidAt ? `${formatPrice(booking.depositAmount)} paid ${formatDateTime(booking.paidAt)}` : booking.status === "pending_payment" ? "Not paid yet" : "None",
    ],
    ["Preferred", `${booking.days.join(", ")} · ${label(timesOfDay, booking.time)}`],
    ["Property", label(relationships, booking.relationship)],
    ["Access notes", booking.access || "None"],
    ["Emailed to office", booking.notifiedAt ? formatDateTime(booking.notifiedAt) : "Not yet"],
    ["Fergus enquiry", booking.fergusEnquiryId ? `#${booking.fergusEnquiryId}` : "Not created"],
  ];

  const actions: { status: string; label: string }[] =
    booking.status === "completed" || booking.status === "cancelled"
      ? [{ status: booking.paidAt ? "paid" : "new", label: "Reopen" }]
      : [
          { status: "completed", label: "Mark completed" },
          { status: "cancelled", label: "Cancel" },
        ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/bookings" className="text-sm font-medium text-slate hover:text-ink">
        ← All bookings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate">{booking.reference}</p>
          <h1 className="text-2xl font-bold">{booking.outcomeTitle}</h1>
          <div className="mt-2">
            <StatusBadge status={booking.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <form key={a.status} action={setBookingStatus.bind(null, booking.reference, a.status)}>
              <button
                type="submit"
                disabled={sample}
                title={sample ? "Not available with sample data" : undefined}
                className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {a.label}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6">
            <h2 className="font-bold">What the customer said</h2>
            <p className="mt-3 whitespace-pre-wrap">{booking.description}</p>
            {photoUrls.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photoUrls.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-mist">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={url} alt={`Photo ${i + 1} from the customer`} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate">No photos.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6">
            <h2 className="font-bold">Details</h2>
            <dl className="mt-3 divide-y divide-black/5 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <dt className="text-slate">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-2xl bg-white p-6">
          <h2 className="font-bold">Customer</h2>
          <p className="text-lg font-semibold">{booking.name}</p>
          <p>
            <a href={`tel:${booking.phone.replace(/\s/g, "")}`} className="font-medium text-aqua-deep hover:underline">
              {booking.phone}
            </a>
          </p>
          <p>
            <a href={`mailto:${booking.email}?subject=Your booking ${booking.reference}`} className="font-medium text-aqua-deep hover:underline">
              {booking.email}
            </a>
          </p>
          <p className="border-t border-black/5 pt-4">
            {booking.street}
            <br />
            {booking.suburb} {booking.postcode}
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.street}, ${booking.suburb} ${booking.postcode}, New Zealand`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-semibold text-aqua-deep hover:underline"
          >
            Open in Google Maps →
          </a>
        </aside>
      </div>
    </div>
  );
}
