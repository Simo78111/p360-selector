import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Container, ServiceIcon } from "@/components/ui";
import { services } from "@/lib/services";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get started",
  description: "Answer a few quick questions to find the fix for your plumbing, drainage or gas problem.",
};

// Placeholder for the step-by-step job finder (Phase 2). For now, step 1 links
// through to the matching service page.
export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service: selected } = await searchParams;

  return (
    <section className="bg-aqua-pale">
      <Container className="max-w-2xl py-16 sm:py-24">
        <p className="text-sm font-semibold text-aqua-deep">Step 1 of 4</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">What do you need help with?</h1>
        <p className="mt-3 text-slate">
          Our step-by-step job finder is coming soon. In the meantime, pick a service for free tips and how to book.
        </p>

        <div className="mt-8 grid gap-3">
          {services.map((s) => (
            <Link
              key={s.slug}
              href={`/services/${s.slug}`}
              aria-current={selected === s.slug ? "true" : undefined}
              className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-5 transition hover:border-aqua ${
                selected === s.slug ? "border-aqua" : "border-transparent"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-aqua-light">
                <ServiceIcon slug={s.slug} className="h-6 w-6" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-sm text-slate">{s.short}</span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white p-5 text-sm text-slate">
          <p className="font-semibold text-ink">Smell gas?</p>
          <p className="mt-1">
            Turn off the gas at the meter or bottle if it&apos;s safe, open windows, don&apos;t use switches or flames,
            leave the house and call your gas supplier&apos;s emergency line. If anyone is in danger, call 111.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <span className="text-slate">Rather talk to someone?</span>
          <ButtonLink href={site.phoneHref} variant="outline">
            Call {site.phone}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
