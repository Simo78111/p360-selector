import type { Metadata } from "next";
import { Suspense } from "react";
import { JobFinder } from "@/components/finder/JobFinder";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Find your fix",
  description:
    "Answer a few quick questions about your plumbing, drainage or gas problem. Get free tips to fix it yourself, or book a licensed tradesperson.",
};

export default function GetStartedPage() {
  return (
    <section className="min-h-[70vh] bg-aqua-pale">
      <Container className="py-10 sm:py-16">
        <Suspense>
          <JobFinder />
        </Suspense>
      </Container>
    </section>
  );
}
