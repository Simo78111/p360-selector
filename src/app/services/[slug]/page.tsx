import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/CtaBand";
import { ButtonLink, Check, Container, PageHeader } from "@/components/ui";
import { finderHref } from "@/lib/finder";
import { getService, services } from "@/lib/services";
import { formatPrice, pricing } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const service = getService((await params).slug);
  if (!service) return {};
  return { title: `${service.name} in Auckland`, description: service.intro };
}

export default async function ServicePage({ params }: Props) {
  const service = getService((await params).slug);
  if (!service) notFound();

  return (
    <>
      <PageHeader eyebrow="Services" title={`${service.name} in Auckland`}>
        {service.intro}
      </PageHeader>

      <Container className="grid gap-12 py-16 lg:grid-cols-[1fr_380px]">
        <div className="space-y-12">
          <section>
            <h2 className="text-2xl font-bold">What we do</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {service.jobs.map((job) => (
                <li key={job} className="flex gap-3 rounded-xl bg-mist p-4">
                  <Check className="text-aqua-deep" /> {job}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold">Try this first</h2>
            <p className="mt-2 text-slate">Simple, safe checks you can do before you call anyone.</p>
            <ol className="mt-6 space-y-3">
              {service.diy.map((tip, i) => (
                <li key={tip} className="flex gap-4 rounded-xl border border-aqua-light bg-aqua-pale p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aqua text-sm font-bold">
                    {i + 1}
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-bold">Call a professional if…</h2>
            <ul className="mt-6 space-y-3">
              {service.callUs.map((item) => (
                <li key={item} className="flex gap-3 rounded-xl border-l-4 border-ink bg-mist p-4">
                  <span aria-hidden className="font-bold">!</span> {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="h-fit rounded-3xl bg-ink p-7 text-white lg:sticky lg:top-24">
          <p className="text-sm text-white/70">Call-outs from</p>
          <p className="font-display text-5xl font-extrabold text-aqua">{formatPrice(pricing.callOutFrom)}</p>
          <p className="mt-4 text-white/80">
            Tell us what&apos;s going on, add a photo, and secure your job with a {formatPrice(pricing.depositAmount)}{" "}
            deposit.
          </p>
          <ButtonLink href={finderHref(service.slug)} className="mt-6 w-full">
            Get started
          </ButtonLink>
        </aside>
      </Container>

      <CtaBand />
    </>
  );
}
