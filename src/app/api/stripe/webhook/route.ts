import { NextResponse, type NextRequest } from "next/server";
import { markDepositPaid } from "@/lib/bookings-store";
import { getStripe } from "@/lib/stripe";

// Stripe calls this after a customer pays, so the booking is marked as paid even
// if they close the browser before reaching the confirmation page.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe is not configured" }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const reference = session.metadata?.reference;
    if (reference && session.payment_status === "paid") {
      await markDepositPaid(reference, {
        amount: (session.amount_total ?? 0) / 100,
        paymentId: String(session.payment_intent ?? session.id),
      });
    }
  }

  return NextResponse.json({ received: true });
}
