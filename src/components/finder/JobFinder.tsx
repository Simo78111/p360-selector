"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type CSSProperties } from "react";
import { resolve, stepsRemaining, type Step } from "@/lib/finder";
import { track } from "@/lib/track";
import { ServiceIcon } from "../ui";
import { FinderResult } from "./FinderResult";

export const encodeAnswers = (ids: string[]) => ids.join(".");

// Icons for the first question's options.
const serviceIcons: Record<string, string> = { plumbing: "plumbing", drainage: "drainage", gas: "gas-fitting" };

const columnsFor = (count: number) => (count <= 5 ? count : Math.ceil(count / 2));

export function JobFinder() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const answers = (params.get("a") ?? "").split(".").filter(Boolean);
  const { steps, current, outcome, urgency } = resolve(answers);
  const validIds = steps.map((s) => s.option.id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const go = (ids: string[]) => {
    const query = ids.length ? `?a=${encodeAnswers(ids)}` : "";
    router.push(`${pathname}${query}`, { scroll: false });
  };

  // Move focus to the new heading on each step so screen readers announce it,
  // and bring it into view on small screens.
  const key = encodeAnswers(validIds);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [key]);

  useEffect(() => {
    if (outcome) track("finder_outcome", { outcome: outcome.id, urgency, answers: key });
  }, [outcome, urgency, key]);

  const answered = steps.length;
  const total = answered + stepsRemaining(current);
  const progress = current ? Math.round((answered / total) * 100) : 100;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-aqua-deep">
              {current ? `Step ${answered + 1} of ${total}` : "Your result"}
            </span>
            {answered > 0 && (
              <button
                type="button"
                onClick={() => go(validIds.slice(0, -1))}
                className="font-medium text-slate hover:text-ink"
              >
                ← Back
              </button>
            )}
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress"
          >
            <div className="h-full rounded-full bg-aqua transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <SelectionChips steps={steps} onEdit={(i) => go(validIds.slice(0, i))} className="mb-6 lg:hidden" />

        <div key={key} className="animate-step">
          {current ? (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none sm:text-4xl">
                {current.title}
              </h1>
              {current.subtitle && <p className="mt-2 text-slate">{current.subtitle}</p>}
              {/* Tall cards side by side: up to 5 in one row, more split evenly over two rows. */}
              <div
                className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
                style={{ "--cols": columnsFor(current.options.length) } as CSSProperties}
              >
                {current.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      track("finder_answer", { question: current.id, answer: option.id });
                      go([...validIds, option.id]);
                    }}
                    className={`group flex min-h-44 flex-col rounded-2xl border-2 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-aqua hover:shadow-md sm:min-h-72 ${
                      option.urgency === "emergency" ? "border-ink/20" : "border-transparent"
                    }`}
                  >
                    {serviceIcons[option.id] && (
                      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-aqua-light">
                        <ServiceIcon slug={serviceIcons[option.id]} className="h-6 w-6" />
                      </span>
                    )}
                    <span className="block font-semibold">{option.label}</span>
                    {option.hint && <span className="mt-1 block text-sm text-slate">{option.hint}</span>}
                    <span
                      aria-hidden
                      className="mt-auto flex h-9 w-9 items-center justify-center self-end rounded-full bg-aqua-pale text-slate transition group-hover:bg-aqua group-hover:text-ink"
                    >
                      →
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : outcome && urgency ? (
            <FinderResult outcome={outcome} urgency={urgency} answers={key} headingRef={headingRef} onRestart={() => go([])} />
          ) : null}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-3xl bg-white p-6">
          <h2 className="text-lg font-bold">Your job</h2>
          {steps.length === 0 ? (
            <p className="mt-3 text-sm text-slate">Your answers will appear here as you go.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {steps.map((step, i) => (
                <li key={step.question.id}>
                  <button
                    type="button"
                    onClick={() => go(validIds.slice(0, i))}
                    className="group w-full rounded-xl p-2 -m-2 text-left hover:bg-aqua-pale"
                  >
                    <span className="block text-xs text-slate">{step.question.summaryLabel}</span>
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {step.option.label}
                      <span className="text-xs text-aqua-deep opacity-0 group-hover:opacity-100">Change</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {steps.length > 0 && (
            <button type="button" onClick={() => go([])} className="mt-6 text-sm font-medium text-slate hover:text-ink">
              Start again
            </button>
          )}
        </div>
        <p className="mt-4 px-2 text-xs text-slate">
          Need help now? <Link href="/contact" className="underline">Contact us</Link>
        </p>
      </aside>
    </div>
  );
}

function SelectionChips({
  steps,
  onEdit,
  className = "",
}: {
  steps: Step[];
  onEdit: (index: number) => void;
  className?: string;
}) {
  if (!steps.length) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Your answers">
      {steps.map((step, i) => (
        <li key={step.question.id}>
          <button
            type="button"
            onClick={() => onEdit(i)}
            className="rounded-full bg-white px-3 py-1 text-sm font-medium hover:bg-aqua-light"
            aria-label={`Change ${step.question.summaryLabel}: ${step.option.label}`}
          >
            {step.option.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
