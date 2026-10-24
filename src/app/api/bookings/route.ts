import { NextResponse, type NextRequest } from "next/server";
import { bookingSchema, MAX_PHOTO_BYTES, MAX_PHOTOS, newReference } from "@/lib/booking";
import { createBooking, type Photo } from "@/lib/bookings-store";
import { sendToEngine, type EngineResult } from "@/lib/engine";
import { resolve } from "@/lib/finder";
import { tierInfo, tierPrices, tiersFor } from "@/lib/tiers";
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
    poolConsent: form.get("poolConsent") === "true",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return NextResponse.json({ error: "Please check the highlighted details.", errors }, { status: 400 });
  }
  const input = parsed.data;

  // Work out the job and price on the server rather than trusting the browser.
  const answers = input.answers.split(".");
  const { outcome, urgency, steps } = resolve(answers);
  if (!outcome || !urgency) {
    return NextResponse.json({ error: "Please start again from the job finder." }, { status: 400 });
  }
  if (!tiersFor(outcome, urgency).includes(input.tier)) {
    return NextResponse.json(
      { error: "That option isn't available for this job. Please choose again.", errors: { tier: "Please choose again" } },
      { status: 400 },
    );
  }
  const tierPrice = tierPrices(outcome.price.amount)[input.tier];

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

  // Book it into the schedule. If the engine can't take it (not set up, outside
  // the area, or an error) the booking is still saved and the office follows up.
  const engine: EngineResult = await sendToEngine(
    { ...input, reference },
    outcome,
    steps.map((s) => `${s.question.summaryLabel}: ${s.option.label}`),
    urgency,
  );
  if (engine.status === "address_not_found") {
    return NextResponse.json(
      {
        error: "We couldn't find that address on the map. Please check it.",
        errors: { street: "Check the street number and name" },
      },
      { status: 400 },
    );
  }
  if (engine.status === "failed") console.error("[booking] engine failed", reference, engine.error);

  await createBooking(
    {
      ...input,
      reference,
      createdAt: new Date().toISOString(),
      status: stripe ? "pending_payment" : "new",
      outcome: { id: outcome.id, title: outcome.title, service: outcome.service },
      urgency,
      priceLabel: `${tierInfo[input.tier].label}: ${outcome.price.label} $${tierPrice}`,
      depositAmount: stripe ? pricing.depositAmount : 0,
      engine: {
        status: engine.status,
        jobNumber: engine.status === "booked" ? engine.jobNumber : null,
        when: engine.status === "booked" ? engine.when : null,
      },
    },
    photos,
  );

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  if (!stripe) {
    // No payment: straight to the confirmation page. "test" flags deposits
    // that are switched on but missing their Stripe keys.
    const test = paymentMode() === "test" ? "&test=1" : "";
    return NextResponse.json({ reference, url: `${origin}/book/confirmed?${confirmParams(reference, input.tier, engine)}${test}` });
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
      success_url: `${origin}/book/confirmed?${confirmParams(reference, input.tier, engine)}&session_id={CHECKOUT_SESSION_ID}`,
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

/** What the confirmation page shows: the tier, and the time if we booked one. */
function confirmParams(reference: string, tier: string, engine: EngineResult) {
  const q = new URLSearchParams({ ref: reference, tier });
  if (engine.status === "booked" && engine.scheduled && engine.when) q.set("when", engine.when);
  if (engine.status === "outside_area") q.set("area", "out");
  return q.toString();
}
