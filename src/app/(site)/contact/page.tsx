import type { Metadata } from "next";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${site.name}, ${site.area} plumbers, drainlayers and gasfitters.`,
};

export default function ContactPage() {
  return (
    <>
      <PageHeader eyebrow="Contact" title="Get in touch">
        The fastest way to book is through our job finder. It tells us exactly what you need.
      </PageHeader>

      <Container className="grid gap-6 py-16 md:grid-cols-3">
        <div className="rounded-3xl bg-aqua p-7">
          <h2 className="text-xl font-bold">Book a job</h2>
          <p className="mt-2 text-ink/80">Answer a few questions, add photos, and secure your booking.</p>
          <ButtonLink href="/get-started" variant="dark" className="mt-6">
            Get started
          </ButtonLink>
        </div>
        <div className="rounded-3xl bg-mist p-7">
          <h2 className="text-xl font-bold">Call or email</h2>
          <p className="mt-4">
            <a href={site.phoneHref} className="text-lg font-semibold text-aqua-deep hover:underline">
              {site.phone}
            </a>
          </p>
          <p className="mt-2">
            <a href={`mailto:${site.email}`} className="font-semibold text-aqua-deep hover:underline">
              {site.email}
            </a>
          </p>
        </div>
        <div className="rounded-3xl bg-mist p-7">
          <h2 className="text-xl font-bold">Hours and area</h2>
          <p className="mt-4">{site.hours}</p>
          <p className="mt-2">Servicing {site.area}</p>
          {!site.afterHours && (
            <p className="mt-4 text-sm text-slate">
              We don&apos;t offer after-hours call-outs. For a gas leak, call your gas supplier&apos;s emergency line. If
              anyone is in danger, call 111.
            </p>
          )}
        </div>
      </Container>
    </>
  );
}
