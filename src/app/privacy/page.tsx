import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${site.name} collects and uses your personal information.`,
};

// DRAFT: have this reviewed before launch.
const sections = [
  {
    title: "What we collect",
    body: [
      "When you use our job finder or book a job, we collect the answers you give, your name, phone number, email address, the job address, any photos or descriptions you upload, and payment confirmation details.",
      "We also collect anonymous information about how the site is used, such as which pages and options are chosen, so we can improve it.",
    ],
  },
  {
    title: "Why we collect it",
    body: [
      "To understand your job, prepare for it, contact you about it, carry out the work and invoice you.",
      "To improve our website and the advice we provide.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "We only share your information with the services we use to run our business: job management software, payment processing (card details are handled by our payment provider, never stored by us), email, and website hosting. Some of these providers may store information outside New Zealand.",
      "We do not sell your information.",
    ],
  },
  {
    title: "Keeping it safe",
    body: [
      "We take reasonable steps to protect your information from loss, misuse and unauthorised access, and only keep it for as long as we need it for the purposes above or as required by law.",
    ],
  },
  {
    title: "Your rights",
    body: [
      `Under the Privacy Act 2020 you can ask to see and correct the personal information we hold about you. Email ${site.email} and we'll respond within 20 working days.`,
      "If you're not happy with how we've handled your information, you can contact the Office of the Privacy Commissioner at privacy.org.nz.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Privacy policy">
        How {site.name} collects, uses and protects your personal information.
      </PageHeader>
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
