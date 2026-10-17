import type { Metadata } from "next";
import { CtaBand } from "@/components/CtaBand";
import { Container, PageHeader } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description: `${site.name} is an ${site.area} plumbing, drainage and gas fitting team.`,
};

// PLACEHOLDER copy: replace with the real story, team and licence details.
export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="About us" title={`A local ${site.area} team that would rather you didn't need us`}>
        We think most people should be able to fix a dripping tap or clear a slow drain themselves. For everything else,
        we&apos;re here.
      </PageHeader>

      <Container className="grid gap-12 py-16 lg:grid-cols-2">
        <div className="space-y-5 text-lg text-slate">
          <p>
            {site.name} started with a simple idea: give people honest information first. If a problem is simple and safe
            to fix yourself, we&apos;ll tell you how. If it isn&apos;t, we&apos;ll tell you why, and we&apos;ll come and
            fix it properly.
          </p>
          <p>
            Our team are licensed under the Plumbers, Gasfitters, and Drainlayers Act 2006, and all of our work is
            certified where it needs to be.
          </p>
          <p>
            We work across {site.area}, {site.hours}.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Honest first", "Free advice, even if it means you don't book us."],
            ["Licensed", "Certifying plumbers, gasfitters and drainlayers."],
            ["Prepared", "We read your photos and notes before we arrive."],
            ["Upfront", "Clear prices and a small deposit to lock in your job."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-aqua-pale p-6">
              <p className="text-lg font-bold">{title}</p>
              <p className="mt-2 text-slate">{body}</p>
            </div>
          ))}
        </div>
      </Container>

      <CtaBand />
    </>
  );
}
