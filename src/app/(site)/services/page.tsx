import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/CtaBand";
import { Check, Container, PageHeader, ServiceIcon } from "@/components/ui";
import { services } from "@/lib/services";

export const metadata: Metadata = {
  title: "Services",
  description: "Residential plumbing, drainage and gas fitting across Auckland.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader eyebrow="Services" title="Plumbing, drainage and gas fitting for Auckland homes">
        Every job is carried out by a licensed tradesperson, and every service comes with free advice before you book.
      </PageHeader>

      <Container className="grid gap-6 py-16 md:grid-cols-3">
        {services.map((s) => (
          <Link
            key={s.slug}
            href={`/services/${s.slug}`}
            className="group flex flex-col rounded-3xl border-2 border-black/5 p-7 transition hover:border-aqua"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-aqua-light">
              <ServiceIcon slug={s.slug} className="h-7 w-7" />
            </span>
            <h2 className="mt-6 text-2xl font-bold">{s.name}</h2>
            <p className="mt-2 text-slate">{s.short}</p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {s.jobs.slice(0, 4).map((job) => (
                <li key={job} className="flex gap-2">
                  <Check className="text-aqua-deep" /> {job}
                </li>
              ))}
            </ul>
            <span className="mt-6 font-semibold text-aqua-deep group-hover:underline">Learn more →</span>
          </Link>
        ))}
      </Container>

      <CtaBand />
    </>
  );
}
