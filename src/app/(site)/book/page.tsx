import type { Metadata } from "next";
import { BookingForm, type JobSummary } from "@/components/booking/BookingForm";
import { ButtonLink, Container } from "@/components/ui";
import { resolve } from "@/lib/finder";
import { stripeEnabled } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Book a job",
  robots: { index: false },
};

export default async function BookPage({ searchParams }: { searchParams: Promise<{ a?: string; cancelled?: string }> }) {
  const { a = "", cancelled } = await searchParams;
  const { steps, outcome } = resolve(a.split(".").filter(Boolean));

  if (!outcome) {
    return (
      <section className="bg-aqua-pale">
        <Container className="max-w-2xl py-20 text-center">
          <h1 className="text-3xl font-bold">Let&apos;s start with what&apos;s wrong</h1>
          <p className="mt-3 text-slate">
            Answer a few quick questions first so we know what the job is and can give you a price.
          </p>
          <ButtonLink href="/get-started" className="mt-8">
            Find my fix
          </ButtonLink>
        </Container>
      </section>
    );
  }

  const job: JobSummary = {
    answers: steps.map((s) => s.option.id).join("."),
    title: outcome.title,
    priceLabel: outcome.price.label,
    priceAmount: outcome.price.amount,
    selections: steps.map((s) => ({ label: s.question.summaryLabel, value: s.option.label })),
  };

  return (
    <section className="bg-aqua-pale">
      <Container className="py-10 sm:py-16">
        {cancelled && (
          <p className="mb-6 rounded-2xl bg-white p-4 text-sm" role="status">
            Payment was cancelled and nothing was charged. Your details are still here when you&apos;re ready.
          </p>
        )}
        <BookingForm job={job} paymentsEnabled={stripeEnabled()} />
      </Container>
    </section>
  );
}
