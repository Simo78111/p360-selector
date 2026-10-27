import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/CtaBand";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { loadAreaPage } from "@/lib/marketing";
import { site } from "@/lib/site";

// Area pages are written by the marketing agent and published from the office console (engine: seo_pages).
export const revalidate = 3600;
export const dynamicParams = true;
export const generateStaticParams = () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await loadAreaPage((await params).slug).catch(() => null);
  if (!page) return {};
  return {
    title: { absolute: page.title },
    description: page.meta_description,
    alternates: { canonical: `${site.url}/areas/${page.slug}` },
    openGraph: { title: page.title, description: page.meta_description, url: `${site.url}/areas/${page.slug}`, type: "website" },
  };
}

export default async function AreaPage({ params }: Props) {
  const page = await loadAreaPage((await params).slug).catch(() => null);
  if (!page) notFound();

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Plumber",
      name: site.name,
      url: site.url,
      telephone: site.phone,
      areaServed: { "@type": "Place", name: `${page.suburb}, Auckland` },
    },
    ...(page.faqs.length ? [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    }] : []),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <PageHeader eyebrow={`${page.suburb}, Auckland`} title={page.h1}>{page.intro}</PageHeader>

      <Container className="grid gap-12 py-16 lg:grid-cols-[1fr_340px]">
        <article className="space-y-10">
          <SimpleMarkdown source={page.body_md} />

          {page.faqs.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold">Questions</h2>
              <div className="mt-4 space-y-3">
                {page.faqs.map((f) => (
                  <details key={f.q} className="rounded-xl bg-mist p-4">
                    <summary className="cursor-pointer font-semibold">{f.q}</summary>
                    <p className="mt-2 text-slate">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {page.related.length > 0 && (
            <nav aria-label="Nearby" className="rounded-2xl border border-black/10 p-5">
              <h2 className="font-bold">Also around Auckland</h2>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {page.related.map((r) => (
                  <li key={r.slug}><Link href={`/areas/${r.slug}`} className="text-aqua-deep underline">{r.h1}</Link></li>
                ))}
              </ul>
            </nav>
          )}
        </article>

        <aside className="h-fit rounded-3xl bg-ink p-7 text-white lg:sticky lg:top-24">
          <p className="text-sm text-white/70">{page.suburb}</p>
          <p className="font-display text-3xl font-extrabold text-aqua">Book online</p>
          <p className="mt-4 text-white/80">Tell us what&apos;s going on, see the price for common jobs, and pick a time. We text you when the plumber is on the way.</p>
          <ButtonLink href="/get-started" className="mt-6 w-full">Get started</ButtonLink>
        </aside>
      </Container>

      <CtaBand />
    </>
  );
}
