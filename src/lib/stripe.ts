import "server-only";
import Stripe from "stripe";
import { pricing } from "./site";

// Stripe is used only when deposits are switched on (pricing.depositsEnabled)
// and STRIPE_SECRET_KEY is set (see .env.example). Otherwise bookings go
// through with no payment.
let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client === undefined) {
    const key = pricing.depositsEnabled ? process.env.STRIPE_SECRET_KEY : undefined;
    client = key ? new Stripe(key) : null;
  }
  return client;
}

export const stripeEnabled = () => pricing.depositsEnabled && Boolean(process.env.STRIPE_SECRET_KEY);

/** "on": deposits taken. "test": deposits switched on but Stripe keys missing. "off": no deposits. */
export const paymentMode = (): "on" | "test" | "off" =>
  !pricing.depositsEnabled ? "off" : stripeEnabled() ? "on" : "test";
