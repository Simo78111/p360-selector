import "server-only";
import type { BookingInput } from "./booking";
import type { Outcome, Urgency } from "./finder";

export type Photo = { name: string; type: string; data: Buffer };

export type Booking = BookingInput & {
  reference: string;
  createdAt: string;
  outcome: Pick<Outcome, "id" | "title" | "service">;
  urgency: Urgency;
  priceLabel: string;
  depositAmount: number;
  photos: Photo[];
};

// PLACEHOLDER: Phase 4 replaces these with the database and photo storage,
// then sends the email to the office and creates the enquiry in Fergus.
// Until then a booking is only logged on the server, so photos are not kept.

export async function saveBooking(booking: Booking) {
  const { photos, ...rest } = booking;
  console.info("[booking] received", {
    ...rest,
    photos: photos.map((p) => `${p.name} (${Math.round(p.data.length / 1024)} KB)`),
  });
}

export async function markDepositPaid(reference: string, details: { amount: number; paymentId: string }) {
  console.info("[booking] deposit paid", reference, details);
}
