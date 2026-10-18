import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formatPrice, pricing, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Booking terms",
  description: `Booking terms for ${site.name}.`,
};

// PLACEHOLDER terms: confirm with the business and have them reviewed before launch.
const depositSection = {
  title: "Deposits",
  body: [
    `A deposit of ${formatPrice(pricing.depositAmount)} is taken when you book online. ${pricing.depositTerms}`,
    "Payments are processed securely by Stripe. We never see or store your card details.",
  ],
};

const sections = [
  ...(pricing.depositsEnabled ? [depositSection] : []),
  {
    title: "Prices",
    body: [
      "Prices shown on this website are starting prices. Your final price depends on the work and parts needed, and we'll talk it through with you before going ahead with anything beyond the original job.",
      "All prices include GST.",
    ],
  },
  {
    title: "Your booking",
    body: [
      "Choosing days and times tells us what suits you. We'll call or text to confirm an exact time.",
      `We work ${site.hours} and don't offer after-hours call-outs.`,
      "Please make sure we can safely access the work area, and let us know about pets, gate codes or parking.",
    ],
  },
  {
    title: "Free advice",
    body: [
      "Tips on this website are general guidance for simple checks only. They aren't a substitute for a licensed tradesperson, and you follow them at your own risk. If you're unsure, stop and call us.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Booking terms" />
      <Container className="max-w-3xl py-16">
        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-2xl font-bold">{s.title}</h2>
              <div className="mt-3 space-y-3 text-slate">
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
