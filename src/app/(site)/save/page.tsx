// The link in the "save us in your phone" text (and on the booking confirmation).
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { loadContactCard, localNumber } from "@/lib/contact-card";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Save us in your phone", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SavePage() {
  const card = await loadContactCard();
  const number = card.text_number ? localNumber(card.text_number) : null;
  return (
    <section className="bg-aqua-pale">
      <Container className="max-w-xl py-14 sm:py-20">
        <div className="rounded-3xl bg-white p-8 text-center">
          <h1 className="text-3xl font-bold">Save us in your phone</h1>
          <p className="mt-3 text-slate">
            So we&apos;re easy to find next time: one tap adds {card.business} to your contacts.
          </p>
          <a
            href="/plumbing360.vcf"
            className="mt-6 inline-block rounded-full bg-aqua px-8 py-3 font-semibold text-ink hover:bg-[#35b9df]"
          >
            Add to my contacts
          </a>
          {number && (
            <div className="mt-8 rounded-2xl bg-aqua-pale p-5 text-left">
              <p className="font-semibold">Next time you need a plumber</p>
              <p className="mt-1 text-slate">
                Text <strong className="text-ink">&ldquo;new job&rdquo;</strong> to{" "}
                <a href={`sms:${card.text_number}?&body=new%20job`} className="font-semibold text-aqua-deep underline">
                  {number}
                </a>{" "}
                and we&apos;ll text you a link to book, with your details already filled in.
              </p>
            </div>
          )}
          <p className="mt-6 text-sm text-slate">
            Or call us on{" "}
            <a href={site.phoneHref} className="font-medium text-ink underline">
              {site.phone}
            </a>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}
