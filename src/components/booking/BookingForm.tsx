"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  bookingSchema,
  isAucklandPostcode,
  relationships,
  tierRuleErrors,
  timesOfDay,
  weekdays,
  type BookingInput,
} from "@/lib/booking";
import { formatPrice, pricing, site } from "@/lib/site";
import { tierInfo, type Tier } from "@/lib/tiers";
import { track } from "@/lib/track";
import type { CustomerProfile } from "@/lib/customer";
import { PhotoPicker, type PickedPhoto } from "./PhotoPicker";
import { ReturningCustomer } from "./ReturningCustomer";

export type JobSummary = {
  answers: string;
  title: string;
  priceLabel: string;
  priceAmount: number;
  selections: { label: string; value: string }[];
  /** Tiers offered for this job, with GST-inclusive prices. */
  tiers: { id: Tier; price: number }[];
  /** Highlighted option, e.g. Priority for urgent jobs. */
  recommended?: Tier;
};

type Fields = Omit<BookingInput, "answers" | "terms" | "days" | "tier"> & { days: string[]; terms: boolean; tier: Tier };
type Errors = Partial<Record<keyof Fields | "form", string>>;

const blank: Fields = {
  description: "",
  street: "",
  suburb: "",
  postcode: "",
  relationship: "owner",
  access: "",
  name: "",
  phone: "",
  email: "",
  tier: "standard",
  days: [],
  time: "any",
  poolConsent: false,
  remindersConsent: false,
  terms: false,
};

const steps: { title: string; fields: (keyof Fields)[] }[] = [
  { title: "The job", fields: ["description"] },
  { title: "Where", fields: ["street", "suburb", "postcode", "relationship", "access"] },
  { title: "When", fields: ["tier", "days", "time", "poolConsent"] },
  { title: "Your details", fields: ["name", "phone", "email", "remindersConsent"] },
  { title: "Review and pay", fields: ["terms"] },
];

const DRAFT_KEY = "p360-booking-draft";

/** +64211234567 → 021 123 4567-ish: the format people recognise */
const localPhone = (p: string) => (p.startsWith("+64") ? `0${p.slice(3)}` : p);

export function BookingForm({
  job,
  payments,
  customer = null,
  signIn = false,
}: {
  job: JobSummary;
  payments: "on" | "test" | "off";
  /** Signed-in returning customer (from the cookie), if any */
  customer?: CustomerProfile | null;
  /** Show "Booked with us before?" (needs the booking engine) */
  signIn?: boolean;
}) {
  const deposits = payments !== "off";
  const [me, setMe] = useState<CustomerProfile | null>(customer);
  // which saved address is chosen ("new" = typing one)
  const [addressId, setAddressId] = useState<string>("new");
  const [step, setStep] = useState(0);
  const offered = job.tiers.map((t) => t.id);
  const startTier: Tier = offered.includes("standard") ? "standard" : offered[0];
  const [fields, setFields] = useState<Fields>({ ...blank, tier: startTier });
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const loaded = useRef(false);

  // Keep typed details if the customer leaves for payment and comes back.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = { ...blank, ...JSON.parse(saved), terms: false } as Fields;
        if (!offered.includes(draft.tier)) draft.tier = startTier; // a different job may offer different tiers
        setFields(draft);
      }
    } catch {}
    loaded.current = true;
    // Runs once on load only; the job (and so its tiers) can't change on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
    } catch {}
  }, [fields]);

  // Signed in: fill in what's still empty, and start with their most recent address
  useEffect(() => {
    if (!me) return;
    setFields((f) => {
      const next = {
        ...f,
        name: f.name || me.name,
        phone: f.phone || localPhone(me.phone),
        email: f.email || me.email || "",
      };
      const known = me.addresses.find((a) => a.street.toLowerCase() === f.street.trim().toLowerCase());
      const pick = known ?? (f.street.trim() ? null : me.addresses[0]);
      if (pick) {
        setAddressId(pick.id);
        return { ...next, street: pick.street, suburb: pick.suburb, postcode: pick.postcode ?? next.postcode };
      }
      return next;
    });
  }, [me]);

  function chooseAddress(id: string) {
    setAddressId(id);
    const a = me?.addresses.find((x) => x.id === id);
    setFields((f) => (a ? { ...f, street: a.street, suburb: a.suburb, postcode: a.postcode ?? "" } : { ...f, street: "", suburb: "", postcode: "" }));
    setErrors((e) => ({ ...e, street: undefined, suburb: undefined, postcode: undefined }));
  }
  const saved = me?.addresses.find((a) => a.id === addressId) ?? null;
  const typingAddress = !saved || !saved.postcode;
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function validate(names: (keyof Fields)[]) {
    const result = bookingSchema.safeParse({ ...fields, answers: job.answers });
    const found: Errors = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Fields;
        if (names.includes(key) && !found[key]) found[key] = issue.message;
      }
    }
    for (const [key, message] of Object.entries(tierRuleErrors(fields)) as [keyof Fields, string][]) {
      if (names.includes(key) && !found[key]) found[key] = message;
    }
    setErrors(found);
    return found;
  }

  function goTo(next: number) {
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function onNext() {
    if (Object.keys(validate(steps[step].fields)).length) return;
    track("booking_step", { step: steps[step].title });
    goTo(step + 1);
  }

  async function onSubmit() {
    const found = validate(steps.flatMap((s) => s.fields));
    if (Object.keys(found).length) {
      const firstBad = steps.findIndex((s) => s.fields.some((f) => found[f]));
      if (firstBad >= 0 && firstBad !== step) goTo(firstBad);
      return;
    }
    setSubmitting(true);
    const body = new FormData();
    body.set("answers", job.answers);
    for (const [key, value] of Object.entries(fields)) {
      if (key === "days") (value as string[]).forEach((d) => body.append("days", d));
      else body.set(key, String(value));
    }
    photos.forEach((p, i) => body.append("photos", p.blob, `photo-${i + 1}.jpg`));

    try {
      const res = await fetch("/api/bookings", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ ...(data.errors ?? {}), form: data.error ?? "Something went wrong. Please try again." });
        setSubmitting(false);
        // e.g. the address couldn't be found: take them back to that step
        const bad = steps.findIndex((s) => s.fields.some((f) => data.errors?.[f]));
        if (bad >= 0 && bad !== step) goTo(bad);
        return;
      }
      track("booking_submitted", { reference: data.reference });
      window.location.assign(data.url);
    } catch {
      setErrors({ form: `We couldn't send your booking. Check your connection, or call us on ${site.phone}.` });
      setSubmitting(false);
    }
  }

  const outsideAuckland = /^\d{4}$/.test(fields.postcode) && !isAucklandPostcode(fields.postcode);
  const chosen = job.tiers.find((t) => t.id === fields.tier) ?? job.tiers[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {signIn && (
          <ReturningCustomer
            me={me}
            onSignedIn={(p) => setMe(p)}
            onSignedOut={() => {
              // "Not you?": take their details back off the form
              setMe(null);
              setAddressId("new");
              setFields((f) => ({ ...f, name: "", phone: "", email: "", street: "", suburb: "", postcode: "" }));
            }}
          />
        )}
        <ol className="mb-8 flex gap-2" aria-label="Booking steps">
          {steps.map((s, i) => (
            <li key={s.title} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-aqua" : "bg-white"}`} />
              <span
                className={`mt-2 hidden text-xs font-medium sm:block ${i === step ? "text-ink" : "text-slate"}`}
                aria-current={i === step ? "step" : undefined}
              >
                {s.title}
              </span>
            </li>
          ))}
        </ol>

        <div key={step} className="animate-step rounded-3xl bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold text-aqua-deep">
            Step {step + 1} of {steps.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-1 text-2xl font-bold outline-none sm:text-3xl">
            {
              [
                "Tell us about the job",
                "Where's the job?",
                "When would you like us?",
                "How can we reach you?",
                "Check your booking",
              ][step]
            }
          </h1>

          <div className="mt-6 space-y-6">
            {step === 0 && (
              <>
                <Field label="What's happening?" error={errors.description} htmlFor="description">
                  <textarea
                    id="description"
                    rows={5}
                    value={fields.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="e.g. The toilet has been running non-stop since yesterday. I've turned off the valve but it's still dripping."
                    className={inputClass(errors.description)}
                  />
                </Field>
                <div>
                  <p className="mb-2 font-medium">Photos</p>
                  <PhotoPicker photos={photos} onChange={setPhotos} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                {me && me.addresses.length > 0 && (
                  <fieldset>
                    <legend className="mb-2 font-medium">Your addresses</legend>
                    <div className="grid gap-2">
                      {me.addresses.map((a) => (
                        <Choice key={a.id} type="radio" name="saved-address" checked={addressId === a.id} onChange={() => chooseAddress(a.id)}>
                          <span>
                            {a.street}, {a.suburb}
                            {a.last_visit && <span className="block text-xs font-normal text-slate">Last booked {a.last_visit}</span>}
                          </span>
                        </Choice>
                      ))}
                      <Choice type="radio" name="saved-address" checked={addressId === "new"} onChange={() => chooseAddress("new")}>
                        Somewhere else
                      </Choice>
                    </div>
                  </fieldset>
                )}
                {saved && saved.notes.length > 0 && (
                  <div className="rounded-2xl bg-mist p-4 text-sm">
                    <p className="font-medium">We already have these notes for the plumber:</p>
                    <ul className="mt-1 text-slate">
                      {saved.notes.map((n, i) => (
                        <li key={i}>
                          {n.label}: {n.body}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {typingAddress && (
                <>
                <Field label="Street address" error={errors.street} htmlFor="street">
                  <input
                    id="street"
                    autoComplete="address-line1"
                    value={fields.street}
                    onChange={(e) => set("street", e.target.value)}
                    className={inputClass(errors.street)}
                  />
                </Field>
                <div className="grid gap-6 sm:grid-cols-[1fr_140px]">
                  <Field label="Suburb" error={errors.suburb} htmlFor="suburb">
                    <input
                      id="suburb"
                      autoComplete="address-level2"
                      value={fields.suburb}
                      onChange={(e) => set("suburb", e.target.value)}
                      className={inputClass(errors.suburb)}
                    />
                  </Field>
                  <Field label="Postcode" error={errors.postcode} htmlFor="postcode">
                    <input
                      id="postcode"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={4}
                      value={fields.postcode}
                      onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))}
                      className={inputClass(errors.postcode)}
                    />
                  </Field>
                </div>
                </>
                )}
                {outsideAuckland && (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
                    That postcode looks like it&apos;s outside {site.area}. We&apos;re only working in {site.area} for now,
                    but you can still send the booking and we&apos;ll let you know if we can help.
                  </p>
                )}
                <fieldset>
                  <legend className="mb-2 font-medium">The property</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {relationships.map((r) => (
                      <Choice
                        key={r.id}
                        type="radio"
                        name="relationship"
                        checked={fields.relationship === r.id}
                        onChange={() => set("relationship", r.id)}
                      >
                        {r.label}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
                <Field
                  label={saved ? "Anything new for the plumber? (optional)" : "Access notes (optional)"}
                  htmlFor="access"
                  hint={saved ? "A new gate code, a new dog… anything that's changed." : "Gate codes, pets, parking, where to find the toby…"}
                >
                  <textarea
                    id="access"
                    rows={2}
                    value={fields.access}
                    onChange={(e) => set("access", e.target.value)}
                    className={inputClass()}
                  />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <fieldset>
                  <legend className="sr-only">How soon</legend>
                  <div className="grid gap-3">
                    {job.tiers.map((t) => {
                      const info = tierInfo[t.id];
                      const checked = fields.tier === t.id;
                      const saving = t.id === "flexi" ? job.priceAmount - t.price : 0;
                      return (
                        <label
                          key={t.id}
                          className={`relative flex cursor-pointer gap-4 rounded-2xl border-2 p-4 transition has-focus-visible:outline-3 has-focus-visible:outline-aqua-deep sm:p-5 ${
                            checked ? "border-aqua bg-aqua-pale" : "border-black/10 hover:border-aqua"
                          }`}
                        >
                          <input
                            type="radio"
                            name="tier"
                            value={t.id}
                            checked={checked}
                            onChange={() => set("tier", t.id)}
                            className="mt-1 h-5 w-5 shrink-0 accent-aqua-deep"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <span className="font-bold">
                                {info.label}
                                {job.recommended === t.id && (
                                  <span className="ml-2 rounded-full bg-ink px-2 py-0.5 align-middle text-xs font-semibold text-white">
                                    Recommended
                                  </span>
                                )}
                              </span>
                              <span className="font-display text-xl font-extrabold">
                                <span className="text-sm font-medium text-slate">from </span>
                                {formatPrice(t.price)}
                              </span>
                            </span>
                            <span className="mt-0.5 block font-medium">{info.when}</span>
                            <span className="mt-1 block text-sm text-slate">{info.detail}</span>
                            {saving > 0 && (
                              <span className="mt-2 inline-block rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-aqua-deep">
                                Save {formatPrice(saving)}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {fields.tier === "standard" && (
                  <>
                    <fieldset>
                      <legend className="mb-2 font-medium">Which days suit you?</legend>
                      <div className="flex flex-wrap gap-2">
                        {weekdays.map((d) => (
                          <Choice
                            key={d}
                            type="checkbox"
                            name="days"
                            checked={fields.days.includes(d)}
                            onChange={(on) => set("days", on ? [...fields.days, d] : fields.days.filter((x) => x !== d))}
                            compact
                          >
                            {d}
                          </Choice>
                        ))}
                      </div>
                      {errors.days && <ErrorText>{errors.days}</ErrorText>}
                    </fieldset>
                    <fieldset>
                      <legend className="mb-2 font-medium">Preferred time</legend>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {timesOfDay.map((t) => (
                          <Choice key={t.id} type="radio" name="time" checked={fields.time === t.id} onChange={() => set("time", t.id)}>
                            {t.label}
                          </Choice>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}

                {fields.tier === "flexi" && (
                  <div>
                    <label className="flex items-start gap-3 rounded-2xl bg-mist p-4">
                      <input
                        type="checkbox"
                        checked={fields.poolConsent}
                        onChange={(e) => set("poolConsent", e.target.checked)}
                        className="mt-1 h-5 w-5 accent-aqua-deep"
                      />
                      <span className="text-sm">
                        <strong>Text me when a plumber&apos;s nearby.</strong> We&apos;ll send you a time; reply YES to take
                        it. Reply STOP any time to stop these texts.
                      </span>
                    </label>
                    {errors.poolConsent && <ErrorText>{errors.poolConsent}</ErrorText>}
                  </div>
                )}

                <p className="text-sm text-slate">
                  Prices are starting prices and include GST. If your plumber finds more work, we text you the price
                  and only go ahead once you reply YES.
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Your name" error={errors.name} htmlFor="name">
                  <input
                    id="name"
                    autoComplete="name"
                    value={fields.name}
                    onChange={(e) => set("name", e.target.value)}
                    className={inputClass(errors.name)}
                  />
                </Field>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Mobile" error={errors.phone} htmlFor="phone">
                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={fields.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      className={inputClass(errors.phone)}
                    />
                  </Field>
                  <Field label="Email" error={errors.email} htmlFor="email">
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={fields.email}
                      onChange={(e) => set("email", e.target.value)}
                      className={inputClass(errors.email)}
                    />
                  </Field>
                </div>
                <p className="text-sm text-slate">We text you about your booking at this number.</p>
                <label className="flex items-start gap-3 rounded-2xl bg-mist p-4">
                  <input
                    type="checkbox"
                    checked={fields.remindersConsent}
                    onChange={(e) => set("remindersConsent", e.target.checked)}
                    className="mt-1 h-5 w-5 accent-aqua-deep"
                  />
                  <span className="text-sm">
                    <strong>Send me maintenance reminders</strong> (optional) — e.g. when a drain or hot water cylinder is due
                    a check, or a seasonal offer. A few a year at most; reply STOP or unsubscribe any time.
                  </span>
                </label>
              </>
            )}

            {step === 4 && (
              <>
                <dl className="divide-y divide-black/5 rounded-2xl bg-mist px-5">
                  <Row label="Job" onEdit={() => goTo(0)}>
                    {job.title}
                    <span className="mt-1 block text-sm text-slate">{fields.description}</span>
                    {photos.length > 0 && (
                      <span className="mt-1 block text-sm text-slate">
                        {photos.length} photo{photos.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </Row>
                  <Row label="Address" onEdit={() => goTo(1)}>
                    {fields.street}, {fields.suburb} {fields.postcode}
                  </Row>
                  <Row label="Contact" onEdit={() => goTo(3)}>
                    {fields.name}
                    <span className="block text-sm text-slate">
                      {fields.phone} · {fields.email}
                    </span>
                  </Row>
                  <Row label="When" onEdit={() => goTo(2)}>
                    {tierInfo[fields.tier].label} · from {formatPrice(chosen.price)}
                    <span className="block text-sm text-slate">
                      {fields.tier === "standard"
                        ? `${fields.days.join(", ")} · ${timesOfDay.find((t) => t.id === fields.time)?.label}`
                        : tierInfo[fields.tier].when}
                    </span>
                  </Row>
                </dl>

                {deposits ? (
                  <div className="rounded-2xl bg-aqua-pale p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-semibold">Deposit due now</span>
                      <span className="font-display text-3xl font-extrabold">{formatPrice(pricing.depositAmount)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate">{pricing.depositTerms}</p>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-aqua-pale p-5 text-sm">
                    <strong>No payment needed now.</strong> We&apos;ll confirm the price with you before any work starts.
                  </p>
                )}

                <div>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={fields.terms}
                      onChange={(e) => set("terms", e.target.checked)}
                      className="mt-1 h-5 w-5 accent-aqua-deep"
                    />
                    <span>
                      I agree to the{" "}
                      <Link href="/terms" target="_blank" className="font-medium text-aqua-deep underline">
                        booking terms
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.terms && <ErrorText>{errors.terms}</ErrorText>}
                </div>

                {payments === "test" && (
                  <p className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
                    <strong>Test mode:</strong> online payments aren&apos;t switched on yet, so no deposit will be taken.
                    The booking will still be sent.
                  </p>
                )}
              </>
            )}
          </div>

          {errors.form && (
            <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">
              {errors.form}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} className="font-medium text-slate hover:text-ink">
                ← Back
              </button>
            ) : (
              <Link href={`/get-started?a=${job.answers}`} className="font-medium text-slate hover:text-ink">
                ← Back to tips
              </Link>
            )}
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={onNext}
                className="rounded-full bg-aqua px-7 py-3 font-semibold text-ink hover:bg-[#35b9df]"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="rounded-full bg-ink px-7 py-3 font-semibold text-white hover:bg-slate disabled:opacity-60"
              >
                {submitting
                  ? "Sending…"
                  : payments === "on"
                    ? `Pay ${formatPrice(pricing.depositAmount)} deposit`
                    : "Send booking"}
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-3xl bg-white p-6 lg:sticky lg:top-24">
        <p className="text-sm text-slate">Your job</p>
        <h2 className="mt-1 text-xl font-bold">{job.title}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {job.selections.map((s) => (
            <div key={s.label} className="flex justify-between gap-3">
              <dt className="text-slate">{s.label}</dt>
              <dd className="text-right font-medium">{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 space-y-1 border-t border-black/5 pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate">
              {job.priceLabel} <span className="whitespace-nowrap">({tierInfo[fields.tier].label})</span>
            </span>
            <span className="font-semibold">{formatPrice(chosen.price)}</span>
          </div>
          {deposits && (
            <div className="flex justify-between">
              <span className="text-slate">Deposit today</span>
              <span className="font-semibold">{formatPrice(pricing.depositAmount)}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

const inputClass = (error?: string) =>
  `w-full rounded-xl border-2 bg-white px-4 py-3 text-base outline-none focus:border-aqua-deep ${
    error ? "border-red-500" : "border-black/10"
  }`;

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-slate">{hint}</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 text-sm font-medium text-red-700" role="alert">
      {children}
    </p>
  );
}

function Choice({
  type,
  name,
  checked,
  onChange,
  compact,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 text-sm font-medium transition has-focus-visible:outline-3 has-focus-visible:outline-aqua-deep ${
        compact ? "px-4 py-2.5" : "px-4 py-3"
      } ${checked ? "border-aqua bg-aqua-pale" : "border-black/10 hover:border-aqua"}`}
    >
      <input type={type} name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      {children}
    </label>
  );
}

function Row({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-4">
      <dt className="w-20 shrink-0 text-sm text-slate">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
      <button type="button" onClick={onEdit} className="self-start text-sm font-medium text-aqua-deep hover:underline">
        Edit
      </button>
    </div>
  );
}
