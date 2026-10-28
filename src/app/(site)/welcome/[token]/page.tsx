// The link the text assistant sends ("here's your link to book"). Opening it doesn't use it up —
// phones open links to make previews — the customer presses Continue.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, Container } from "@/components/ui";
import { redeemLink, signInAvailable } from "@/lib/customer";

export const metadata: Metadata = { title: "Welcome back", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ failed?: string }> };

export default async function WelcomePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { failed } = await searchParams;

  async function go() {
    "use server";
    const ok = /^[0-9a-f]{64}$/.test(token) && signInAvailable() ? await redeemLink(token).catch(() => null) : null;
    redirect(ok?.ok ? "/get-started?welcome=1" : `/welcome/${encodeURIComponent(token)}?failed=1`);
  }

  return (
    <section className="bg-aqua-pale">
      <Container className="max-w-xl py-16 sm:py-24">
        <div className="rounded-3xl bg-white p-8 text-center">
          {failed ? (
            <>
              <h1 className="text-2xl font-bold">That link has expired</h1>
              <p className="mt-3 text-slate">
                Booking links work once, for 24 hours. You can still book: press &ldquo;Booked with us before?&rdquo; on
                the booking page and we&apos;ll text you a code.
              </p>
              <ButtonLink href="/get-started" className="mt-6">
                Book a job
              </ButtonLink>
            </>
          ) : (
            <form action={go}>
              <h1 className="text-2xl font-bold">Welcome back</h1>
              <p className="mt-3 text-slate">Tell us what&apos;s wrong and we&apos;ll fill in your details and address for you.</p>
              <button type="submit" className="mt-6 rounded-full bg-aqua px-8 py-3 font-semibold text-ink hover:bg-[#35b9df]">
                Continue
              </button>
            </form>
          )}
        </div>
      </Container>
    </section>
  );
}
