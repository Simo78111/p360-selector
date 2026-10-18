import { NextResponse, type NextRequest } from "next/server";
import { bookingSchema, MAX_PHOTO_BYTES, MAX_PHOTOS, newReference } from "@/lib/booking";
import { createBooking, type Photo } from "@/lib/bookings-store";
import { resolve } from "@/lib/finder";
import { pricing } from "@/lib/site";
import { getStripe, paymentMode } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Your booking was too large to send. Try fewer photos." }, { status: 413 });
  }

  const parsed = bookingSchema.safeParse({
    ...Object.fromEntries(Array.from(form.entries()).filter(([, v]) => typeof v === "string")),
    days: form.getAll("days"),
    terms: form.get("terms") === "true",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return NextResponse.json({ error: "Please check the highlighted details.", errors }, { status: 400 });
  }
  const input = parsed.data;

  // Work out the job and price on the server rather than trusting the browser.
  const { outcome, urgency } = resolve(input.answers.split("."));
  if (!outcome || !urgency) {
    return NextResponse.json({ error: "Please start again from the job finder." }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Please send no more than ${MAX_PHOTOS} photos.` }, { status: 400 });
  }
  const photos: Photo[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/") || file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "One of the photos couldn't be used. Please try a different one." }, { status: 400 });
    }
    photos.push({ name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) });
  }

  const reference = newReference();
  const stripe = getStripe();

  await createBooking(
    {
      ...input,
      reference,
      createdAt: new Date().toISOString(),
      status: stripe ? "pending_payment" : "new",
      outcome: { id: outcome.id, title: outcome.title, service: outcome.service },
      urgency,
      priceLabel: `${outcome.price.label} $${outcome.price.amount}`,
      depositAmount: stripe ? pricing.depositAmount : 0,
    },
    photos,
  );

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  if (!stripe) {
    // No payment: straight to the confirmation page. "test" flags deposits
    // that are switched on but missing their Stripe keys.
    const test = paymentMode() === "test" ? "&test=1" : "";
    return NextResponse.json({ reference, url: `${origin}/book/confirmed?ref=${reference}${test}` });
  }

  try {
    const metadata = { reference, outcome: outcome.id, answers: input.answers };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: Math.round(pricing.depositAmount * 100),
            product_data: {
              name: `Booking deposit: ${outcome.title}`,
              description: `Booking ${reference}. ${pricing.depositTerms}`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: `Plumbing360 booking ${reference}` },
      success_url: `${origin}/book/confirmed?ref=${reference}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book?a=${input.answers}&cancelled=1`,
    });
    return NextResponse.json({ reference, url: session.url });
  } catch (err) {
    console.error("[booking] Stripe checkout failed", reference, err);
    return NextResponse.json(
      { error: "We couldn't start the payment. Please try again, or give us a call." },
      { status: 502 },
    );
  }
}
