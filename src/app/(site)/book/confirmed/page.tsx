import type { Metadata } from "next";
import { ClearDraft } from "@/components/booking/ClearDraft";
import { ButtonLink, Check, Container } from "@/components/ui";
import { formatPrice, site } from "@/lib/site";
import { markDepositPaid } from "@/lib/bookings-store";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Booking received",
  robots: { index: false },
};

type Props = { searchParams: Promise<{ ref?: string; session_id?: string; test?: string }> };

export default async function ConfirmedPage({ searchParams }: Props) {
  const { ref, session_id, test } = await searchParams;
  const reference = ref && /^P360-[A-Z0-9]{6}$/.test(ref) ? ref : null;

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
          {test && (
            <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Test booking: online payments aren&apos;t switched on yet, so no deposit was taken.
            </p>
          )}

          <div className="mt-8 rounded-2xl bg-mist p-6 text-left">
            <h2 className="font-bold">What happens next</h2>
            <ol className="mt-3 space-y-2 text-slate">
              <li>1. We&apos;ll review your details and photos.</li>
              <li>2. We&apos;ll call or text you to confirm a time, usually within one working day.</li>
              <li>3. We&apos;ll arrive with the right parts for the job.</li>
            </ol>
          </div>

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
