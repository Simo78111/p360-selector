import type { Metadata } from "next";
import { CtaBand } from "@/components/CtaBand";
import { Container, PageHeader } from "@/components/ui";
import { formatPrice, pricing, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Why choose us",
  description: `Why ${site.area} homeowners choose ${site.name}.`,
};

const reasons = [
  {
    title: "You get advice before you get a bill",
    body: "Our job finder gives you free, safe tips for every common problem. If you can sort it yourself, great.",
  },
  {
    title: "We arrive prepared",
    body: "Your answers, photos and notes come straight to us, so we bring the right parts and fix it in one visit wherever possible.",
  },
  {
    title: "Clear, upfront pricing",
    body: `Call-outs start from ${formatPrice(pricing.callOutFrom)}. ${
      pricing.depositsEnabled
        ? `A ${formatPrice(pricing.depositAmount)} deposit secures your job.`
        : "We confirm the price with you before any work starts."
    }`,
  },
  {
    title: "Licensed and certified",
    body: "Every plumber, gasfitter and drainlayer on our team is licensed, and we provide the certificates your work needs.",
  },
  {
    title: "Plumbing, drainage and gas, one team",
    body: "No juggling different trades. From a blocked drain to a new gas hob, it's all handled by us.",
  },
  {
    title: "Local to Auckland",
    body: `We know ${site.area} homes, from old villas to new builds, and the problems that come with each.`,
  },
];

export default function WhyChooseUsPage() {
  return (
    <>
      <PageHeader eyebrow="Why us" title="A better way to get plumbing sorted">
        Fewer return visits, honest advice, and prices you know before we arrive.
      </PageHeader>

      <Container className="grid gap-6 py-16 md:grid-cols-2 lg:grid-cols-3">
        {reasons.map((r, i) => (
          <div key={r.title} className="rounded-3xl border-2 border-black/5 p-7">
            <span className="font-display text-4xl font-extrabold text-aqua">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="mt-4 text-xl font-bold">{r.title}</h2>
            <p className="mt-2 text-slate">{r.body}</p>
          </div>
        ))}
      </Container>

      <CtaBand />
    </>
  );
}
