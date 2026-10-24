import { z } from "zod";
import { tierIds } from "./tiers";

export const MAX_PHOTOS = 5;
/** Per photo, after the browser has resized it. */
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const timesOfDay = [
  { id: "any", label: "Any time" },
  { id: "morning", label: "Morning (7:30am – 12pm)" },
  { id: "afternoon", label: "Afternoon (12pm – 5pm)" },
] as const;
export const relationships = [
  { id: "owner", label: "I own the property" },
  { id: "tenant", label: "I'm renting" },
  { id: "manager", label: "I manage the property" },
] as const;

const nzPhone = /^(\+?64|0)[2-9]\d{6,9}$/;

export const bookingSchema = z.object({
  answers: z.string().min(1, "Please start from the job finder"),
  description: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(2000),
  street: z.string().trim().min(3, "Enter your street address").max(200),
  suburb: z.string().trim().min(2, "Enter your suburb").max(100),
  postcode: z.string().trim().regex(/^\d{4}$/, "Enter a 4-digit postcode"),
  relationship: z.enum(relationships.map((r) => r.id) as [string, ...string[]]),
  access: z.string().trim().max(500).optional().default(""),
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine((v) => nzPhone.test(v), "Enter a valid NZ phone number"),
  email: z.email("Enter a valid email address").max(200),
  tier: z.enum(tierIds),
  // Standard bookings pick their days; Priority and Flexi don't need to.
  days: z.array(z.enum(weekdays)).default([]),
  time: z.enum(timesOfDay.map((t) => t.id) as [string, ...string[]]),
  // Flexi: OK to text offers when a plumber is nearby (required for Flexi).
  poolConsent: z.boolean().default(false),
  terms: z.literal(true, { error: "Please accept the booking terms" }),
}).superRefine((b, ctx) => {
  for (const [path, message] of Object.entries(tierRuleErrors(b))) ctx.addIssue({ code: "custom", path: [path], message });
});

/**
 * Rules that depend on the chosen tier. Kept separate so the form can check them
 * on the "When" step even while later fields are still empty (Zod only runs
 * superRefine once every other field is valid).
 */
export function tierRuleErrors(b: { tier?: string; days?: readonly string[]; poolConsent?: boolean }) {
  const errors: Partial<Record<"days" | "poolConsent", string>> = {};
  if (b.tier === "standard" && !(b.days?.length)) errors.days = "Pick at least one day";
  if (b.tier === "flexi" && !b.poolConsent) errors.poolConsent = "Tick this so we can text you when a plumber's nearby";
  return errors;
}

export type BookingInput = z.infer<typeof bookingSchema>;

/**
 * Rough check for the Auckland region by postcode (0600–0999 Rodney/North
 * Shore/West, 1000–1999 central, 2000–2699 south). Used as a friendly warning,
 * not a hard block.
 */
export function isAucklandPostcode(postcode: string) {
  const n = Number(postcode);
  return /^\d{4}$/.test(postcode) && n >= 600 && n <= 2699;
}

/** Short, readable booking reference, e.g. P360-7KQ2MX. */
export function newReference() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `P360-${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}
