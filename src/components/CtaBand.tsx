import { site } from "@/lib/site";
import { ButtonLink, Container } from "./ui";

export function CtaBand() {
  return (
    <section className="bg-aqua">
      <Container className="flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-ink">Got a problem? Let&apos;s narrow it down.</h2>
          <p className="mt-2 text-ink/80">
            Answer a few quick questions, get free tips, and book us if you need us.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/get-started" variant="dark">
            Get started
          </ButtonLink>
          <a
            href={site.phoneHref}
            className="inline-flex items-center rounded-full border-2 border-ink px-6 py-3 font-semibold text-ink hover:bg-ink hover:text-white"
          >
            Call {site.phone}
          </a>
        </div>
      </Container>
    </section>
  );
}
