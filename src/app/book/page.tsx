import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Container } from "@/components/ui";
import { resolve } from "@/lib/finder";
import { formatPrice, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Book a job",
  robots: { index: false },
};

// Placeholder until Phase 3 adds job details, photos and the Stripe deposit.
export default async function BookPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a = "" } = await searchParams;
  const { steps, outcome } = resolve(a.split(".").filter(Boolean));

  return (
    <section className="bg-aqua-pale">
      <Container className="max-w-2xl py-16 sm:py-24">
        <p className="text-sm font-semibold text-aqua-deep">Book a job</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{outcome ? outcome.title : "Tell us about your job"}</h1>

        {outcome && (
          <div className="mt-6 rounded-3xl bg-white p-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              {steps.map((s) => (
                <div key={s.question.id}>
                  <dt className="text-xs text-slate">{s.question.summaryLabel}</dt>
                  <dd className="font-medium">{s.option.label}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 border-t border-black/5 pt-5 text-sm">
              {outcome.price.label} <strong>{formatPrice(outcome.price.amount)}</strong>
            </p>
          </div>
        )}

        <div className="mt-6 rounded-3xl bg-white p-6">
          <p className="font-semibold">Online booking is almost ready.</p>
          <p className="mt-2 text-slate">
            Soon you&apos;ll be able to add photos, choose a time and pay your deposit here. For now, give us a call or
            send an email and we&apos;ll get you sorted.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href={site.phoneHref}>Call {site.phone}</ButtonLink>
            <ButtonLink href={`mailto:${site.email}`} variant="outline">
              Email us
            </ButtonLink>
          </div>
        </div>

        <Link href={a ? `/get-started?a=${a}` : "/get-started"} className="mt-6 inline-block font-medium text-slate hover:text-ink">
          ← Back to your result
        </Link>
      </Container>
    </section>
  );
}
