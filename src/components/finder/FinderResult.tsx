"use client";

import Link from "next/link";
import { useState, type RefObject } from "react";
import type { Outcome, Urgency } from "@/lib/finder";
import { formatPrice, pricing, site } from "@/lib/site";
import { track } from "@/lib/track";
import { ButtonLink, Check } from "../ui";

const badges: Record<Urgency, { label: string; className: string }> = {
  diy: { label: "You may be able to fix this yourself", className: "bg-aqua-light text-ink" },
  standard: { label: "Best handled by a professional", className: "bg-mist text-ink" },
  urgent: { label: "Act now to limit damage", className: "bg-amber-100 text-amber-900" },
  emergency: { label: "Safety first", className: "bg-red-600 text-white" },
};

type Props = {
  outcome: Outcome;
  urgency: Urgency;
  answers: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRestart: () => void;
};

export function FinderResult({ outcome, urgency, answers, headingRef, onRestart }: Props) {
  const [fixed, setFixed] = useState(false);
  const emergency = urgency === "emergency";
  const bookHref = `/book?a=${answers}`;

  return (
    <div>
      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${badges[urgency].className}`}>
        {badges[urgency].label}
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-bold outline-none sm:text-4xl">
        {outcome.title}
      </h1>
      <p className="mt-3 text-lg text-slate">{outcome.summary}</p>

      <section
        className={`mt-8 rounded-3xl p-6 sm:p-8 ${emergency ? "border-2 border-red-600 bg-white" : "bg-white"}`}
        aria-labelledby="tips-heading"
      >
        <h2 id="tips-heading" className="text-xl font-bold">
          {emergency ? "Do this now" : "Try this first"}
        </h2>
        <ol className="mt-5 space-y-4">
          {outcome.tips.map((tip, i) => (
            <li key={tip} className="flex gap-4">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  emergency ? "bg-red-600 text-white" : "bg-aqua"
                }`}
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{tip}</span>
            </li>
          ))}
        </ol>
      </section>

      {outcome.callIf.length > 0 && (
        <section className="mt-4 rounded-3xl bg-ink p-6 text-white sm:p-8" aria-labelledby="call-heading">
          <h2 id="call-heading" className="text-xl font-bold">
            {emergency ? "After that" : "Call a professional if…"}
          </h2>
          <ul className="mt-5 space-y-3">
            {outcome.callIf.map((item) => (
              <li key={item} className="flex gap-3">
                <Check className="mt-0.5 text-aqua" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(urgency === "urgent" || emergency) && !site.afterHours && (
        <p className="mt-4 rounded-2xl bg-white p-5 text-sm text-slate">
          Our hours are {site.hours}. Outside those hours, make things safe with the steps above, then book
          and we&apos;ll be in touch first thing.
        </p>
      )}

      <section className="mt-8 grid gap-4 rounded-3xl bg-aqua p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <p className="text-sm font-medium text-ink/70">{outcome.price.label}</p>
          <p className="font-display text-4xl font-extrabold">{formatPrice(outcome.price.amount)}</p>
          <p className="mt-1 text-sm text-ink/80">
            Secure your job with a {formatPrice(pricing.depositAmount)} deposit. Add photos and details on the next step.
          </p>
        </div>
        <ButtonLink
          href={bookHref}
          variant="dark"
          onClick={() => track("finder_book_click", { outcome: outcome.id, urgency })}
        >
          Book this job
        </ButtonLink>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        {fixed ? (
          <p className="font-semibold text-aqua-deep" role="status">
            Great news! Glad we could help. Keep us in mind for next time.
          </p>
        ) : (
          !emergency && (
            <button
              type="button"
              onClick={() => {
                setFixed(true);
                track("finder_fixed_myself", { outcome: outcome.id });
              }}
              className="rounded-full border-2 border-ink px-5 py-2.5 font-semibold hover:bg-ink hover:text-white"
            >
              I fixed it myself
            </button>
          )
        )}
        <button type="button" onClick={onRestart} className="font-medium text-slate hover:text-ink">
          Start again
        </button>
        <Link href={`/services/${outcome.service}`} className="font-medium text-aqua-deep hover:underline">
          More about this service
        </Link>
      </div>
    </div>
  );
}
