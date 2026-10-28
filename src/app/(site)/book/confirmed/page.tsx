import type { Metadata } from "next";
import { ClearDraft } from "@/components/booking/ClearDraft";
import { ButtonLink, Check, Container } from "@/components/ui";
import { formatPrice, pricing, site } from "@/lib/site";
import { markDepositPaid } from "@/lib/bookings-store";
import { getStripe } from "@/lib/stripe";
import { tierIds, tierInfo, type Tier } from "@/lib/tiers";
import { loadContactCard, localNumber } from "@/lib/contact-card";

export const metadata: Metadata = {
  title: "Booking received",
  robots: { index: false },
};

type Props = {
  searchParams: Promise<{ ref?: string; session_id?: string; test?: string; tier?: string; when?: string; area?: string }>;
};

export default async function ConfirmedPage({ searchParams }: Props) {
  const { ref, session_id, test, tier: tierParam, when: whenParam, area } = await searchParams;
  const reference = ref && /^P360-[A-Z0-9]{6}$/.test(ref) ? ref : null;
  const tier = (tierIds as readonly string[]).includes(tierParam ?? "") ? (tierParam as Tier) : null;
  // e.g. "Wed 28 Oct 7:30 am", from the scheduler. Only letters, digits, spaces and colons.
  const when = whenParam && /^[A-Za-z0-9 :]{5,30}$/.test(whenParam) ? whenParam : null;
  // "Wed 28 Oct morning": a day and window; the exact time is texted the afternoon before
  const windowed = when ? /(morning|afternoon)$/.test(when) : false;
  const steps = nextSteps(tier, when, area === "out", windowed);
  const card = await loadContactCard();

  // Check with Stripe that the deposit really went through.
  let paid: number | null = null;
  const stripe = getStripe();
  if (stripe && session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (reference && session.payment_status === "paid" && session.metadata?.reference === reference) {
        paid = (session.amount_total ?? 0) / 100;
        // Backup for the webhook; only the first call sends emails.
        await markDepositPaid(reference, { amount: paid, paymentId: String(session.payment_intent ?? session.id) });
      }
    } catch {
      // Unknown session: show the page without the payment line.
    }
  }

  return (
    <section className="bg-aqua-pale">
      <ClearDraft />
      <Container className="max-w-2xl py-16 sm:py-24">
        <div className="rounded-3xl bg-white p-8 text-center sm:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-aqua">
            <Check className="h-8 w-8" />
          </span>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl">Thanks, we&apos;ve got your booking</h1>
          {reference && (
            <p className="mt-3 text-slate">
              Your reference is <strong className="text-ink">{reference}</strong>
            </p>
          )}
          {paid !== null && <p className="mt-1 text-slate">Deposit of {formatPrice(paid)} received.</p>}
          {when && (
            <p className="mx-auto mt-6 max-w-md rounded-2xl bg-aqua-pale p-4">
              <span className="block text-sm text-slate">Your plumber is booked for</span>
              <strong className="font-display text-2xl">{windowed ? when.replace(/ (morning|afternoon)$/, ", $1") : when}</strong>
              {windowed && <span className="mt-1 block text-sm text-slate">We&apos;ll text you the exact time the afternoon before.</span>}
            </p>
          )}
          {!when && tier && <p className="mt-2 font-medium">{tierInfo[tier].label} booking</p>}
          {test && (
            <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Test booking: online payments aren&apos;t switched on yet, so no deposit was taken.
            </p>
          )}

          <div className="mt-8 rounded-2xl bg-mist p-6 text-left">
            <h2 className="font-bold">What happens next</h2>
            <ol className="mt-3 space-y-2 text-slate">
              {steps.map((s, i) => (
                <li key={i}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </div>

          {card.text_number && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-aqua-pale p-5 text-left">
              <p className="text-sm">
                <strong className="block text-base">Save us in your phone</strong>
                Your booking texts come from {localNumber(card.text_number)}. Next time, just text &ldquo;new job&rdquo; to book.
              </p>
              <a href="/plumbing360.vcf" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">
                Add to contacts
              </a>
            </div>
          )}

          <p className="mt-6 text-sm text-slate">
            Questions? Call <a href={site.phoneHref} className="font-medium text-aqua-deep">{site.phone}</a>. Our hours
            are {site.hours}.
          </p>
          <ButtonLink href="/" variant="outline" className="mt-8">
            Back to home
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

function nextSteps(tier: Tier | null, when: string | null, outsideArea: boolean, windowed = false): string[] {
  if (outsideArea || !tier) {
    return [
      "We'll review your details and photos.",
      "We'll call or text you to confirm a time, usually within one working day.",
      "We'll arrive with the right parts for the job.",
    ];
  }
  if (tier === "flexi") {
    return [
      "We've added you to our Flexi list. Keep your phone handy.",
      "When a plumber's working near you, we text you a time. Reply YES to take it.",
      `If nothing comes up, we still get to you within ${pricing.tiers.flexiWindowDays} days and text you the time.`,
    ];
  }
  return [
    windowed
      ? "We've texted you the day. The afternoon before, we text your exact arrival time."
      : when
        ? "We've texted you the booking. Reply to that text if the time doesn't work."
        : "We'll text you your booking time shortly.",
    "On the day, we text you when your plumber is on the way, with an arrival time.",
    "If your plumber finds more work, we text you the price first and only go ahead once you reply YES.",
  ];
}
