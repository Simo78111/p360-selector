import "server-only";
import Stripe from "stripe";
import { pricing } from "./site";
import { liveServiceAllowed } from "./test-mode";

// Stripe is used only when deposits are switched on (pricing.depositsEnabled)
// and STRIPE_SECRET_KEY is set (see .env.example). Otherwise bookings go
// through with no payment.
let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client === undefined) {
    const key = pricing.depositsEnabled ? stripeKey() : undefined;
    client = key ? new Stripe(key) : null;
  }
  return client;
}

export const stripeEnabled = () => pricing.depositsEnabled && Boolean(stripeKey());

/** A test site may only use Stripe's test keys (sk_test_...). */
function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && (liveServiceAllowed() || key.startsWith("sk_test_")) ? key : undefined;
}

/** "on": deposits taken. "test": deposits switched on but Stripe keys missing. "off": no deposits. */
export const paymentMode = (): "on" | "test" | "off" =>
  !pricing.depositsEnabled ? "off" : stripeEnabled() ? "on" : "test";
