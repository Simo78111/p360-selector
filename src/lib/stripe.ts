import "server-only";
import Stripe from "stripe";

// Stripe is switched on by adding STRIPE_SECRET_KEY to the environment
// (see .env.example). Until then, bookings skip payment and are marked as
// test bookings.
let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client === undefined) {
    const key = process.env.STRIPE_SECRET_KEY;
    client = key ? new Stripe(key) : null;
  }
  return client;
}

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
