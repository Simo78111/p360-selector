import type { Metadata } from "next";
import { Suspense } from "react";
import { JobFinder } from "@/components/finder/JobFinder";
import { Container } from "@/components/ui";
import { currentCustomer } from "@/lib/customer";

export const metadata: Metadata = {
  title: "Find your fix",
  description:
    "Answer a few quick questions about your plumbing, drainage or gas problem. Get free tips to fix it yourself, or book a licensed tradesperson.",
};

export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  // arrived from a booking link sent by text: say they're signed in
  const me = welcome ? await currentCustomer() : null;
  return (
    <section className="min-h-[70vh] bg-aqua-pale">
      <Container className="py-10 sm:py-16">
        {me && (
          <p className="mb-6 rounded-2xl bg-white px-5 py-4" role="status">
            <strong>Welcome back, {me.first_name}.</strong>{" "}
            <span className="text-slate">Tell us what&apos;s wrong — your details and address will be filled in when you book.</span>
          </p>
        )}
        <Suspense>
          <JobFinder />
        </Suspense>
      </Container>
    </section>
  );
}
