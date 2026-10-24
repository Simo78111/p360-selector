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
    title: "Priority, Standard and Flexi",
    body: [
      "Priority: we book the soonest slot we have, usually today or the next working day. Priority costs more than Standard because we move other work to fit you in.",
      "Standard: you choose the days and time of day that suit you, and we book you into the first slot that matches.",
      `Flexi: you get a lower price in return for flexibility. We may come any time in the ${pricing.tiers.flexiWindowDays} days after you book. When a plumber is working near you, we text you a time; reply YES to take it. The first customer to reply gets the slot. If no slot comes up, we book you in before the ${pricing.tiers.flexiWindowDays} days are up and text you the time.`,
      "By choosing Flexi you agree to receive these texts. Reply STOP at any time to stop them.",
      "Arrival times are our best estimate. We text you when your plumber is on the way, and again if they're running late.",
    ],
  },
  {
    title: "Your booking",
    body: [
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
