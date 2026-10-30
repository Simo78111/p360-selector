// The customer's quote page (the link in the quote email and on the PDF's Accept button): the quote as the customer
// sees it, a PDF download, and Accept (their name, an optional order number, tick the terms). No costs anywhere.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicAcceptAction } from "@/app/q/actions";
import { lines as splitLines, publicQuote, textBlocks, type PublicQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ accepted?: string; err?: string }> };

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" }) : "";
const qty = (n: number) => String(Number(n));

export default async function CustomerQuote({ params, searchParams }: Props) {
  const { token } = await params;
  const { accepted, err } = await searchParams;
  if (!/^[0-9a-f]{40,80}$/.test(token)) notFound();
  let q: PublicQuote | null;
  try {
    q = await publicQuote(token, !accepted && !err);
  } catch {
    q = null;
  }
  if (!q) notFound();
  const co = q.company;
  const logo = co.code === "PTSL" ? "/project360-quote-logo.png" : "/brand/logo.png";
  const done = q.quote_status === "accepted" && q.accepted_at;

  return (
    <main id="main" className="min-h-screen bg-mist px-4 py-8">
      <article className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm sm:p-10" data-testid="customer-quote">
        <header className="flex flex-wrap items-start justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={co.name} className="h-14 w-auto" />
          <address className="text-right text-sm not-italic">
            <strong>{co.legal_name}</strong>
            <br />
            {[co.address_line, co.suburb, [co.city, co.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            {co.phone && (<><br />Phone: {co.phone}</>)}
          </address>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <p className="font-semibold">{q.customer.name}</p>
            {q.customer.billing_address && <p className="whitespace-pre-line text-slate">{q.customer.billing_address}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 rounded-xl bg-mist p-3 text-sm">
            <dt className="text-slate">Quote</dt><dd>{q.number}</dd>
            <dt className="text-slate">Site</dt><dd>{[q.site.site_name, q.site.address_line, q.site.suburb].filter(Boolean).join(", ")}</dd>
            <dt className="text-slate">Order number</dt><dd>{q.order_number ?? "—"}</dd>
            <dt className="text-slate">Quote date</dt><dd>{day(q.published_at)}</dd>
            <dt className="text-slate">Valid until</dt><dd>{day(q.valid_until)}</dd>
            <dt className="text-slate">GST number</dt><dd>{co.gst_number}</dd>
          </dl>
        </div>

        {/* Status first: accepted / replaced / expired / problems */}
        {(accepted || done) && (
          <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-950" data-testid="accepted-message">
            <strong>Thank you{q.accepted_by ? `, ${q.accepted_by.split(" ")[0]}` : ""}: quote {q.number} is accepted.</strong> We&apos;ll be in touch to
            arrange the work.{q.accepted_at ? ` Accepted ${day(q.accepted_at)}.` : ""}
          </p>
        )}
        {err && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{err}</p>}
        {q.superseded && (
          <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-950">
            This quote has been updated.{" "}
            {q.latest_token ? <a href={`/q/${q.latest_token}`} className="font-semibold underline">Open the latest version</a> : "Please contact us for the latest version."}
          </p>
        )}
        {q.expired && q.quote_status === "open" && (
          <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-950">
            This quote expired on {day(q.valid_until)}. Please contact us{co.phone ? ` on ${co.phone}` : ""} for an updated quote.
          </p>
        )}
        {(q.quote_status === "closed" || q.quote_status === "declined") && (
          <p role="status" className="rounded-xl bg-mist p-4">This quote is no longer open. Please contact us if you have any questions.</p>
        )}

        <section>
          <h1 className="text-xl font-bold">Quote | {q.heading}</h1>
          {textBlocks(q.description).length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              <h2 className="font-bold">Description of Works</h2>
              <Blocks text={q.description} />
            </div>
          )}
          {splitLines(q.exclusions).length > 0 && (
            <div className="mt-3 text-sm">
              <h2 className="font-bold">No Allowance Has been made for</h2>
              <ul className="ml-5 list-disc">{splitLines(q.exclusions).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {q.note && <p className="mt-3 text-sm">{q.note}</p>}
        </section>

        <section className="space-y-5">
          {q.sections.map((s) => (
            <div key={s.id}>
              <h3 className="text-base font-bold">{s.name}</h3>
              {s.description && <p className="text-sm text-slate">{s.description}</p>}
              {s.appears_as !== "fixed" && s.lines.length > 0 && (
                <table className="mt-1 w-full text-sm">
                  <thead className="sr-only">
                    <tr><th>Item</th><th>Quantity</th>{s.appears_as === "lines" && <><th>Unit price</th><th>Amount</th></>}</tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l) => (
                      <tr key={l.id} className="border-b border-black/5">
                        <td className="py-1">{l.description}</td>
                        <td className="py-1 text-right tabular-nums">{qty(l.quantity)}{l.unit && s.appears_as === "lines" ? ` ${l.unit}` : ""}</td>
                        {s.appears_as === "lines" && (
                          <>
                            <td className="py-1 text-right tabular-nums">{money(l.unit_sell)}{Number(l.discount_pct) > 0 ? ` less ${Number(l.discount_pct)}%` : ""}</td>
                            <td className="py-1 text-right tabular-nums">{money(l.total)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-1 text-right font-semibold tabular-nums">{money(s.sell)}</p>
            </div>
          ))}
        </section>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-black/10 pt-3 text-sm" data-testid="customer-totals">
          <Row k="Subtotal" v={money(q.totals.subtotal)} />
          {Number(q.totals.discount) > 0 && <Row k={`Discount (${Number(q.totals.discount_pct)}%)`} v={`−${money(q.totals.discount)}`} />}
          <Row k="GST" v={money(q.totals.gst)} />
          <Row k="Total" v={money(q.totals.total)} bold />
          {q.totals.deposit !== null && <Row k="Required deposit" v={money(q.totals.deposit)} bold />}
        </dl>

        {q.terms && <div className="space-y-1 text-xs italic text-slate">{q.terms.split(/\r?\n/).filter(Boolean).map((t, i) => <p key={i}>{t}</p>)}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <a href={`/q/${token}/pdf`} className="rounded-full bg-mist px-4 py-2 text-sm font-semibold">Download the PDF</a>
        </div>

        {q.can_accept && !accepted && (
          <form action={publicAcceptAction} className="space-y-3 rounded-2xl border-2 border-emerald-600/40 bg-emerald-50/50 p-5" data-testid="accept-form">
            <h2 className="text-lg font-bold">Accept this quote</h2>
            <input type="hidden" name="token" value={token} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="block text-xs font-semibold text-slate">Your name</span>
                <input name="name" required maxLength={120} autoComplete="name" className="mt-1 w-full rounded-full border border-black/10 bg-white px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-semibold text-slate">Your order number (optional)</span>
                <input name="order" maxLength={60} defaultValue={q.order_number ?? ""} className="mt-1 w-full rounded-full border border-black/10 bg-white px-3 py-2" />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="terms" required className="mt-1" />
              <span>I accept this quote ({money(q.totals.total)} incl GST) and the terms above, on behalf of {q.customer.name}.</span>
            </label>
            <button className="rounded-full bg-emerald-700 px-6 py-2.5 font-semibold text-white">Accept quote</button>
          </form>
        )}
      </article>
    </main>
  );
}

function Row({ k, v, bold = false }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold" : ""}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

function Blocks({ text }: { text: string | null }) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) out.push(<ul key={`u${k}`} className="ml-5 list-disc">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  textBlocks(text).forEach((b, i) => {
    if (b.kind === "bullet") bullets.push(b.text);
    else {
      flush(i);
      out.push(b.kind === "heading" ? <h3 key={i} className="pt-2 font-bold">{b.text}</h3> : <p key={i}>{b.text}</p>);
    }
  });
  flush(9999);
  return <>{out}</>;
}
