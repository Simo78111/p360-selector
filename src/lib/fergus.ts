import "server-only";
import { relationships, timesOfDay } from "./booking";
import type { Booking, Photo } from "./bookings-store";

// Creates an enquiry in Fergus (Enquiries inbox) with the photos attached, so
// the office can convert it into a customer and job. Switched on by
// FERGUS_API_TOKEN, a Personal Access Token created in your Fergus account.
const BASE = "https://api.fergus.com";

export const fergusEnabled = () => Boolean(process.env.FERGUS_API_TOKEN);

async function call(path: string, init: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.FERGUS_API_TOKEN}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Fergus ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

export async function createFergusEnquiry(booking: Booking, photos: Photo[]): Promise<string | null> {
  if (!fergusEnabled()) {
    console.info("[fergus] skipped (no FERGUS_API_TOKEN):", booking.reference);
    return null;
  }

  const deposit =
    booking.status === "paid"
      ? `Deposit PAID: $${booking.depositAmount}`
      : booking.status === "pending_payment"
        ? "Deposit NOT yet paid"
        : "No deposit";

  const description = [
    `${booking.outcome.title} [${booking.urgency.toUpperCase()}]`,
    "",
    booking.description,
    "",
    `Finder: ${booking.answers.replaceAll(".", " > ")}`,
    `Price shown: ${booking.priceLabel}`,
    deposit,
    `Property: ${label(relationships, booking.relationship)}`,
    `Preferred: ${booking.days.join(", ")}, ${label(timesOfDay, booking.time)}`,
    `Access: ${booking.access || "None"}`,
    `Website ref: ${booking.reference}`,
  ].join("\n");

  const { data } = await call("/enquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${booking.outcome.title}, ${booking.suburb}`,
      email: booking.email,
      phoneNumber: booking.phone,
      description,
      source: `Website booking ${booking.reference}`,
      address1: booking.street,
      addressSuburb: booking.suburb,
      addressCity: "Auckland",
      addressPostcode: booking.postcode,
      addressCountry: "New Zealand",
    }),
  });
  const enquiryId = String(data.id);

  for (const photo of photos) {
    const form = new FormData();
    form.set("entityType", "enquiry");
    form.set("entityId", enquiryId);
    form.set("file", new Blob([new Uint8Array(photo.data)], { type: photo.type }), photo.name);
    try {
      await call("/attachments", { method: "POST", body: form });
    } catch (err) {
      console.error("[fergus] photo upload failed", booking.reference, photo.name, err);
    }
  }

  return enquiryId;
}
