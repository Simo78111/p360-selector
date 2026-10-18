import Link from "next/link";
import { CtaBand } from "@/components/CtaBand";
import { ButtonLink, Check, Container, ServiceIcon } from "@/components/ui";
import { finderHref } from "@/lib/finder";
import { services } from "@/lib/services";
import { formatPrice, pricing, site } from "@/lib/site";

const steps = [
  {
    title: "Tell us what's going on",
    body: "Tap through a few simple questions: leak or blockage, which room, how bad. It takes under a minute.",
  },
  {
    title: "Get free advice",
    body: "We show you safe, simple things to try first, and tell you clearly when it's time to call a pro.",
  },
  {
    title: "Book us if you need us",
    body: pricing.depositsEnabled
      ? "Add a photo and a few details, pay a small deposit, and we arrive knowing exactly what the job is."
      : "Add a photo and a few details, and we arrive knowing exactly what the job is.",
  },
];

export default function Home() {
  return (
    <>
      <section className="bg-aqua-pale">
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-white px-3 py-1 text-sm font-medium text-aqua-deep">
              {site.area} plumbers, drainlayers and gasfitters
            </p>
            <h1 className="text-4xl leading-tight font-extrabold sm:text-6xl">
              Fix it yourself, or let us fix it <span className="text-aqua-deep">properly.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate">
              Answer a few quick questions and we&apos;ll point you to the fix. Free tips for the simple stuff, and a
              licensed tradesperson for everything else.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/get-started">Find my fix</ButtonLink>
              <ButtonLink href="/services" variant="outline">
                Our services
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate">
              <li className="flex items-center gap-2">
                <Check className="text-aqua-deep" /> Licensed and certified
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-aqua-deep" /> Upfront pricing
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-aqua-deep" /> Call-outs from {formatPrice(pricing.callOutFrom)}
              </li>
            </ul>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-xl shadow-aqua/10 sm:p-8">
            <p className="text-sm font-semibold text-aqua-deep">Step 1</p>
            <h2 className="mt-1 text-2xl font-bold">What do you need help with?</h2>
            <div className="mt-6 grid gap-3">
              {services.map((s) => (
                <Link
                  key={s.slug}
                  href={finderHref(s.slug)}
                  className="group flex items-center gap-4 rounded-2xl border-2 border-black/5 p-4 transition hover:border-aqua hover:bg-aqua-pale"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-aqua-light text-ink">
                    <ServiceIcon slug={s.slug} className="h-6 w-6" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-sm text-slate">{s.short}</span>
                  </span>
                  <span aria-hidden className="text-slate transition group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-20">
          <h2 className="text-3xl font-bold sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl bg-mist p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aqua font-bold">{i + 1}</span>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-slate">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="bg-mist">
        <Container className="py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">Free tips before you call</h2>
              <p className="mt-3 max-w-2xl text-slate">
                Plenty of problems have a simple first step. Here are a few we share every week.
              </p>
            </div>
            <Link href="/services" className="font-semibold text-aqua-deep hover:underline">
              See all services →
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {services.map((s) => (
              <article key={s.slug} className="rounded-2xl bg-white p-6">
                <div className="flex items-center gap-3">
                  <ServiceIcon slug={s.slug} className="h-6 w-6 text-aqua-deep" />
                  <h3 className="text-lg font-bold">{s.name}</h3>
                </div>
                <p className="mt-4 text-slate">{s.diy[0]}</p>
                <Link href={`/services/${s.slug}`} className="mt-4 inline-block text-sm font-semibold text-aqua-deep hover:underline">
                  More {s.name.toLowerCase()} tips →
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section>
        <Container className="grid gap-10 py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">We turn up knowing the job</h2>
            <p className="mt-4 text-lg text-slate">
              Because you&apos;ve already told us what&apos;s wrong and sent a photo, we bring the right parts the first
              time. Fewer return visits, less time on the clock, and a smaller bill.
            </p>
            <ButtonLink href="/why-choose-us" variant="outline" className="mt-8">
              Why choose us
            </ButtonLink>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ["Licensed", "Certifying plumbers, gasfitters and drainlayers"],
              ["Upfront", `Call-outs from ${formatPrice(pricing.callOutFrom)}, no surprises`],
              ["Local", `Based in ${site.area}, working across the region`],
              ["Tidy", "We leave your home the way we found it"],
            ].map(([title, body]) => (
              <li key={title} className="rounded-2xl border border-black/10 p-5">
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-sm text-slate">{body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
