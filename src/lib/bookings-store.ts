import "server-only";
import type { BookingInput } from "./booking";
import { sendCustomerEmail, sendOfficeEmail } from "./email";
import { createFergusEnquiry } from "./fergus";
import type { Outcome, Urgency } from "./finder";
import { getSupabase, PHOTO_BUCKET } from "./supabase";

export type Photo = { name: string; type: string; data: Buffer };

export type BookingStatus = "new" | "pending_payment" | "paid";

export type Booking = BookingInput & {
  reference: string;
  createdAt: string;
  status: BookingStatus;
  outcome: Pick<Outcome, "id" | "title" | "service">;
  urgency: Urgency;
  priceLabel: string;
  depositAmount: number;
  /** What the booking engine did with it (see src/lib/engine.ts). */
  engine?: { status: string; jobNumber?: number | null; when?: string | null };
};

type Row = Record<string, unknown>;

const toRow = (b: Booking, photoPaths: string[]): Row => ({
  reference: b.reference,
  created_at: b.createdAt,
  status: b.status,
  answers: b.answers,
  outcome_id: b.outcome.id,
  outcome_title: b.outcome.title,
  service: b.outcome.service,
  urgency: b.urgency,
  price_label: b.priceLabel,
  description: b.description,
  street: b.street,
  suburb: b.suburb,
  postcode: b.postcode,
  relationship: b.relationship,
  access: b.access,
  name: b.name,
  phone: b.phone,
  email: b.email,
  days: b.days,
  time_of_day: b.time,
  tier: b.tier,
  pool_consent: b.poolConsent,
  engine_status: b.engine?.status ?? null,
  engine_job_number: b.engine?.jobNumber ?? null,
  scheduled_for: b.engine?.when ?? null,
  photo_paths: photoPaths,
  deposit_amount: b.depositAmount,
});

const fromRow = (r: Row): Booking => ({
  reference: r.reference as string,
  createdAt: r.created_at as string,
  status: r.status as BookingStatus,
  answers: r.answers as string,
  outcome: { id: r.outcome_id as string, title: r.outcome_title as string, service: r.service as Outcome["service"] },
  urgency: r.urgency as Urgency,
  priceLabel: r.price_label as string,
  description: r.description as string,
  street: r.street as string,
  suburb: r.suburb as string,
  postcode: r.postcode as string,
  relationship: r.relationship as string,
  access: r.access as string,
  name: r.name as string,
  phone: r.phone as string,
  email: r.email as string,
  days: r.days as Booking["days"],
  time: r.time_of_day as string,
  tier: (r.tier as Booking["tier"]) ?? "standard",
  poolConsent: Boolean(r.pool_consent),
  remindersConsent: false,
  engine: r.engine_status
    ? { status: r.engine_status as string, jobNumber: r.engine_job_number as number | null, when: r.scheduled_for as string | null }
    : undefined,
  terms: true,
  depositAmount: Number(r.deposit_amount),
});

/**
 * Saves a new booking and its photos. If no payment is needed, the office is
 * told straight away; otherwise that waits for the deposit (markDepositPaid).
 */
export async function createBooking(booking: Booking, photos: Photo[]) {
  const db = getSupabase();

  if (db) {
    const paths: string[] = [];
    for (const [i, photo] of photos.entries()) {
      const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      const path = `${booking.reference}/${i + 1}.${ext}`;
      const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, photo.data, { contentType: photo.type });
      if (error) console.error("[booking] photo upload failed", booking.reference, error.message);
      else paths.push(path);
    }
    const { error } = await db.from("bookings").insert(toRow(booking, paths));
    if (error) {
      // Don't lose the booking: fall through and notify now with what we have.
      console.error("[booking] save failed", booking.reference, error.message);
      return notify(booking, photos);
    }
  } else {
    console.info("[booking] not saved (no Supabase keys):", booking.reference);
  }

  // Without a database there's no way to pick the booking up again after
  // payment, so notify now and flag the deposit as unpaid.
  if (booking.status !== "pending_payment" || !db) await notify(booking, photos);
}

/** Called by the Stripe webhook and the confirmation page; safe to call twice. */
export async function markDepositPaid(reference: string, details: { amount: number; paymentId: string }) {
  const db = getSupabase();
  if (!db) {
    console.info("[booking] deposit paid (not saved, no Supabase keys):", reference, details);
    return;
  }

  // Only the first caller flips pending_payment → paid, so emails go out once.
  const { data, error } = await db
    .from("bookings")
    .update({ status: "paid", deposit_amount: details.amount, payment_id: details.paymentId, paid_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("status", "pending_payment")
    .select()
    .maybeSingle();
  if (error) return console.error("[booking] mark paid failed", reference, error.message);
  if (!data) return;

  const photos: Photo[] = [];
  for (const path of (data.photo_paths as string[]) ?? []) {
    const { data: file } = await db.storage.from(PHOTO_BUCKET).download(path);
    if (file) photos.push({ name: path.split("/").pop()!, type: file.type, data: Buffer.from(await file.arrayBuffer()) });
  }
  await notify(fromRow(data), photos);
}

/** Emails the office and customer and creates the Fergus enquiry. Never throws. */
async function notify(booking: Booking, photos: Photo[]) {
  const [office, customer, fergus] = await Promise.allSettled([
    sendOfficeEmail(booking, photos),
    sendCustomerEmail(booking),
    createFergusEnquiry(booking, photos),
  ]);
  const errors: string[] = [];
  for (const [name, r] of [["Office email", office], ["Customer email", customer], ["Fergus", fergus]] as const) {
    if (r.status === "rejected") {
      console.error(`[booking] ${name} failed`, booking.reference, r.reason);
      errors.push(`${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`.slice(0, 500));
    }
  }

  const db = getSupabase();
  if (db) {
    await db
      .from("bookings")
      .update({
        // Only stamped when the office email was actually sent, not skipped.
        notified_at: office.status === "fulfilled" && office.value ? new Date().toISOString() : null,
        fergus_enquiry_id: fergus.status === "fulfilled" ? fergus.value : null,
        notify_error: errors.length ? errors.join("\n") : null,
      })
      .eq("reference", booking.reference);
  }
}
