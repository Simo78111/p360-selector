import "server-only";
// Sends website bookings to the booking engine (the AI-run scheduling system:
// its own Supabase project). Switched on by ENGINE_SUPABASE_URL,
// ENGINE_SUPABASE_SERVICE_ROLE_KEY and GOOGLE_MAPS_SERVER_KEY. Without them the
// site works as before: bookings are saved and emailed, and the office books
// the time by hand.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BookingInput } from "./booking";
import type { Outcome } from "./finder";
import { tierInfo } from "./tiers";
import { databaseAllowed } from "./test-mode";

export type EngineResult =
  | { status: "skipped"; reason: "not_configured" | "emergency" }
  | { status: "address_not_found" }
  | { status: "outside_area" }
  | { status: "booked"; jobId: string; jobNumber: number | null; scheduled: boolean; when: string | null }
  | { status: "failed"; error: string };

let client: SupabaseClient | null | undefined;
export function engine() {
  if (client === undefined) {
    const url = process.env.ENGINE_SUPABASE_URL;
    const key = process.env.ENGINE_SUPABASE_SERVICE_ROLE_KEY;
    client = url && key && databaseAllowed(url) && process.env.GOOGLE_MAPS_SERVER_KEY
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  }
  return client;
}

export const engineEnabled = () => engine() !== null;

/** NZ number to +64 format: 021 123 4567 → +64211234567. */
export function toE164(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+64")) return digits;
  if (digits.startsWith("64")) return `+${digits}`;
  if (digits.startsWith("0")) return `+64${digits.slice(1)}`;
  return `+64${digits}`;
}

/** Finds the address on the map. Null when Google can't place it to a street. */
export function geocode(street: string, suburb: string, postcode: string) {
  return geocodeAddress(`${street}, ${suburb} ${postcode}`);
}

/** Same, for a whole address written on one line (e.g. a plumber's home). */
export async function geocodeAddress(address: string) {
  const params = new URLSearchParams({
    address,
    components: "country:NZ",
    region: "nz",
    key: process.env.GOOGLE_MAPS_SERVER_KEY ?? "",
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results: { geometry: { location: { lat: number; lng: number }; location_type: string }; partial_match?: boolean }[];
  };
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") throw new Error(`Geocoding ${data.status}: ${data.error_message ?? ""}`);
  const top = data.results[0];
  // APPROXIMATE means only the suburb or city was found, not the street.
  if (!top || top.geometry.location_type === "APPROXIMATE") return null;
  return top.geometry.location;
}

const timeLabel = { any: "any time", morning: "morning", afternoon: "afternoon" } as const;

export async function sendToEngine(
  b: BookingInput & { reference: string },
  outcome: Pick<Outcome, "id" | "title">,
  selections: string[],
  urgency: string,
): Promise<EngineResult> {
  const db = engine();
  if (!db) return { status: "skipped", reason: "not_configured" };
  // Emergencies are told to call; the office handles anything that slips through.
  if (urgency === "emergency") return { status: "skipped", reason: "emergency" };

  try {
    const where = await geocode(b.street, b.suburb, b.postcode);
    if (!where) return { status: "address_not_found" };

    const description = [
      `${outcome.title} (website ${b.reference})`,
      ...selections,
      "",
      b.description,
      b.tier === "standard" ? `Preferred: ${b.days.join(", ")}, ${timeLabel[b.time as keyof typeof timeLabel] ?? b.time}` : "",
    ].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n");

    const { data: booked, error } = await db.rpc("create_booking", {
      p_full_name: b.name,
      p_phone: toE164(b.phone),
      p_email: b.email,
      p_address_line: b.street,
      p_suburb: b.suburb,
      p_postcode: b.postcode,
      p_lat: where.lat,
      p_lng: where.lng,
      p_service_code: outcome.id,
      p_tier: b.tier,
      p_description: description,
      p_access_notes: b.access || null,
      p_pool_offer_consent: b.poolConsent,
    });
    if (error) {
      if (error.hint === "outside_service_area") return { status: "outside_area" };
      if (error.hint === "address_not_located") return { status: "address_not_found" };
      return { status: "failed", error: `${error.hint ?? error.code}: ${error.message}` };
    }

    const jobId = (booked as { job_id: string }).job_id;
    const jobNumber = (booked as { job_number?: number }).job_number ?? null;

    const { error: updateError } = await db
      .from("jobs")
      .update({
        preferred_days: b.tier === "standard" ? b.days : [],
        preferred_time: b.tier === "standard" ? b.time : "any",
        source: "website",
        web_reference: b.reference,
      })
      .eq("id", jobId);
    if (updateError) console.error("[engine] saving preferences failed", b.reference, updateError);
    // the customer's notes for the plumber: the assistant files the practical bits on the property
    if (b.access?.trim()) {
      const { error: notesError } = await db.rpc("website_booking_notes", { p_job_id: jobId, p_notes: b.access });
      if (notesError) console.error("[engine] handing over access notes failed", b.reference, notesError);
    }
    if (b.remindersConsent) {
      const { error: consentError } = await db.rpc("website_marketing_consent", { p_job_id: jobId });
      if (consentError) console.error("[engine] saving reminders consent failed", b.reference, consentError);
    }

    // Flexi waits in the standby pool; the scheduler books it in before its window ends.
    if (b.tier === "flexi") return { status: "booked", jobId, jobNumber, scheduled: false, when: tierInfo.flexi.when };

    const { data: placed, error: scheduleError } = await db.rpc("auto_schedule_job", { p_job_id: jobId });
    if (scheduleError) {
      // The job is saved; the scheduler retries every 5 minutes and tells the office if it can't fit.
      console.error("[engine] auto-schedule failed", b.reference, scheduleError);
      return { status: "booked", jobId, jobNumber, scheduled: false, when: null };
    }
    const p = placed as { scheduled: boolean; start_local?: string };
    return { status: "booked", jobId, jobNumber, scheduled: p.scheduled, when: p.scheduled ? p.start_local ?? null : null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Puts the photos a customer sent with their booking into the job's Photos section
 * (private job-photos storage). A photo that fails is logged, never the booking.
 */
export async function attachBookingPhotos(
  jobId: string,
  reference: string,
  photos: { type: string; data: Buffer }[],
): Promise<number> {
  const db = engine();
  if (!db) return 0;
  let saved = 0;
  for (const [i, photo] of photos.entries()) {
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = `${jobId}/booking-${reference.replace(/[^A-Za-z0-9-]/g, "")}-${i + 1}.${ext}`;
    try {
      const { error: upErr } = await db.storage
        .from("job-photos")
        .upload(path, photo.data, { contentType: ext === "jpg" ? "image/jpeg" : photo.type, upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { error } = await db.rpc("website_add_photo", { p_job_id: jobId, p_path: path, p_bytes: photo.data.length });
      if (error) throw new Error(`${error.hint ?? error.code}: ${error.message}`);
      saved++;
    } catch (err) {
      console.error("[engine] booking photo not saved", reference, i + 1, err);
    }
  }
  return saved;
}
