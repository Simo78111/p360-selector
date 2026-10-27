import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { unsubscribe, unsubscribeInfo } from "@/lib/marketing";
import { site } from "@/lib/site";

// The link at the bottom of reminder emails. Opening it shows a button (so email scanners that
// follow links don't unsubscribe people by accident); pressing it stops all marketing to them.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> };

async function unsubscribeAction(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  await unsubscribe(token);
  redirect(`/unsubscribe/${token}?done=1`);
}

export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { done } = await searchParams;
  const info = await unsubscribeInfo(token).catch(() => null);

  return (
    <Container className="max-w-xl py-20">
      {!info ? (
        <>
          <h1 className="text-2xl font-bold">That link doesn&apos;t work</h1>
          <p className="mt-3 text-slate">
            To stop our emails, reply to one with &ldquo;unsubscribe&rdquo; or email {site.email} and we&apos;ll sort it.
          </p>
        </>
      ) : done || info.opted_out ? (
        <>
          <h1 className="text-2xl font-bold">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-slate">
            Thanks{info.first_name ? `, ${info.first_name}` : ""}. You won&apos;t get any more reminders or offers from {site.name}.
            You&apos;ll still get texts and emails about any job you book with us.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Stop reminders from {site.name}?</h1>
          <p className="mt-3 text-slate">
            {info.first_name ? `Hi ${info.first_name}. ` : ""}Press the button and we won&apos;t send you any more maintenance
            reminders or offers, by email or text.
          </p>
          <form action={unsubscribeAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white">Unsubscribe me</button>
          </form>
        </>
      )}
    </Container>
  );
}
