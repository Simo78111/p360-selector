import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { loadAreaPages } from "@/lib/marketing";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Areas we cover",
  description: "Plumbing, drainage and gas fitting across Auckland suburbs. Find your area.",
};

export default async function AreasPage() {
  const pages = await loadAreaPages();
  const bySuburb = new Map<string, typeof pages>();
  for (const p of pages) bySuburb.set(p.suburb, [...(bySuburb.get(p.suburb) ?? []), p]);

  return (
    <>
      <PageHeader eyebrow="Auckland" title="Areas we cover">
        We work right across Auckland. Here are some of the suburbs we&apos;re in most.
      </PageHeader>
      <Container className="py-16">
        {pages.length === 0 ? (
          <p className="text-slate">Anywhere in Auckland — <Link href="/get-started" className="underline">book online</Link>.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...bySuburb.entries()].map(([suburb, list]) => (
              <section key={suburb} className="rounded-2xl bg-mist p-5">
                <h2 className="font-bold">{suburb}</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {list.map((p) => (
                    <li key={p.slug}><Link href={`/areas/${p.slug}`} className="text-aqua-deep underline">{p.h1}</Link></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
