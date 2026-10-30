"use client";
// The quote builder (Fergus-style): a draft saves as you go (each field when you leave it); Publish freezes the
// version; New Version copies it. Sections appear to the customer as line items, a summary (names and quantities,
// one price) or one fixed price. Lines come from the price book, a favourite, or are typed. Costs, markups and
// margins only show for people with "see costs".
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { builderAction, favouriteLibraryAction, type BuilderOp } from "@/app/dashboard/quote-actions";
import { ItemSearch } from "@/components/office/ItemSearch";
import { APPEARS_AS, PRICE_SOURCE, STATUS_LABEL, type AppearsAs } from "@/lib/quote-shared";
import type { FavouriteLibrary, OfficeQuote, QuoteLine, QuoteSection } from "@/lib/quotes";

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined, dp = 2) => (n === null || n === undefined ? "" : String(Number(Number(n).toFixed(dp))));
const nzDay = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" }) : "";
const nzTime = (d: string) => new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });
const field = "w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent";
const cell = "rounded-md border border-black/10 bg-white px-1.5 py-1 text-right text-sm tabular-nums disabled:border-transparent disabled:bg-transparent";
const pill = "rounded-full px-3 py-1.5 text-xs font-semibold";

export function QuoteBuilder({ initial, jobPath }: { initial: OfficeQuote; jobPath: string }) {
  const [q, setQ] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const edit = q.can.edit;
  const costs = q.can.costs;

  useEffect(() => setQ(initial), [initial]);

  function run(o: BuilderOp, after?: () => void) {
    start(async () => {
      const r = await builderAction(q.version_id, o);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      if ("go" in r) {
        router.push(`${r.go}${r.message ? `?ok=${encodeURIComponent(r.message)}` : ""}`);
        return;
      }
      setQ(r.quote);
      setSavedAt(new Date().toISOString());
      setMsg(r.message ? { ok: true, text: r.message } : null);
      after?.();
    });
  }
  /** Save one field of the quote when it changes. */
  const saveField = (k: string, v: string, was: unknown) => {
    if (String(was ?? "") !== v) run({ op: "save", changes: { [k]: v } });
  };

  const statusText =
    q.status === "draft"
      ? `This quote version is a Draft (v${q.version_no}). Changes are saved automatically.`
      : q.status === "published"
        ? `Published${q.published_by ? ` by ${q.published_by}` : ""} ${q.published_at ? nzDay(q.published_at) : ""} · valid until ${nzDay(q.valid_until)}${q.expired ? " (expired)" : ""}${q.sent_at ? ` · sent ${nzTime(q.sent_at)}` : " · not sent yet"}`
        : "A newer version has been published. This one is kept for the record.";

  return (
    <div className="space-y-4" data-testid="quote-builder">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-2xl bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${jobPath}?tab=quotes`} className="text-sm text-slate hover:underline">← {q.job_ref}</Link>
          <h1 className="text-lg font-bold" data-testid="quote-number">{q.number}</h1>
          <span className={`${pill} ${q.status === "draft" ? "bg-amber-100 text-amber-900" : q.status === "published" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`} data-testid="version-status">
            {q.status === "draft" ? "DRAFT" : q.status === "published" ? "PUBLISHED" : "REPLACED"}
          </span>
          {q.quote_status !== "open" && (
            <span className={`${pill} ${q.quote_status === "accepted" ? "bg-emerald-600 text-white" : "bg-red-100 text-red-800"}`} data-testid="quote-status">
              {STATUS_LABEL[q.quote_status]}
            </span>
          )}
          {q.versions.length > 1 && (
            <label className="flex items-center gap-1 text-xs text-slate">
              Version
              <select
                aria-label="Open another version"
                value={q.version_id}
                onChange={(e) => router.push(`${jobPath}/quote/${e.target.value}`)}
                className="rounded-full border border-black/10 bg-white px-2 py-1 text-xs"
              >
                {q.versions.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    v{v.version_no} · {STATUS_LABEL[v.status]}{v.accepted ? " · accepted" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate" aria-live="polite" data-testid="save-state">
              {pending ? "Saving…" : savedAt ? `Saved ${nzTime(savedAt)}` : ""}
            </span>
            <a href={`/api/office/quote-pdf?v=${q.version_id}`} target="_blank" rel="noreferrer" className={`${pill} bg-mist`}>
              {q.status === "draft" ? "Preview PDF" : "PDF"}
            </a>
            {q.can.new_version && q.status !== "draft" && (
              <button type="button" onClick={() => run({ op: "newVersion" })} className={`${pill} bg-mist`}>+ New version</button>
            )}
            {edit && (
              <button
                type="button"
                onClick={() => confirm(q.version_no === 1 ? "Delete this quote?" : "Delete this draft version?") && run({ op: "deleteDraft" })}
                className={`${pill} bg-red-50 text-red-800`}
              >
                Delete draft
              </button>
            )}
            {edit && q.can.send && (
              <button type="button" onClick={() => run({ op: "publish" })} className={`${pill} bg-ink text-white`} data-testid="publish">
                Publish
              </button>
            )}
          </span>
        </div>
        <p className={`rounded-lg px-3 py-1.5 text-sm ${q.status === "draft" ? "bg-slate-500 text-white" : "bg-mist text-ink"}`}>
          {statusText}
          {edit && !q.can.send && " An office manager publishes and sends it."}
        </p>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-1.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* ── Settings ────────────────────────────────────────────────── */}
          <section className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Quote settings">
            <Labelled text="Valid for (days)">
              <input key={`vd-${q.valid_days}`} type="number" min={1} max={365} disabled={!edit} defaultValue={q.valid_days}
                onBlur={(e) => saveField("valid_days", e.target.value, q.valid_days)} className={field} aria-label="Valid for (days)" />
            </Labelled>
            <Labelled text="Deadline (to the customer by)">
              <input key={`dl-${q.deadline}`} type="date" disabled={!edit} defaultValue={q.deadline ?? ""}
                onChange={(e) => saveField("deadline", e.target.value, q.deadline)} className={field} aria-label="Deadline" />
            </Labelled>
            <Labelled text="Required deposit">
              <div className="flex gap-1">
                <select disabled={!edit} value={q.deposit_kind} aria-label="Deposit type"
                  onChange={(e) => {
                    const kind = e.target.value;
                    if (kind === "none") run({ op: "save", changes: { deposit_kind: "none" } });
                    else {
                      const v = prompt(kind === "percent" ? "Deposit: what percentage of the total (incl GST)?" : "Deposit amount (incl GST), $", kind === "percent" ? "20" : "");
                      if (v) run({ op: "save", changes: { deposit_kind: kind, deposit_value: v.replace(/[$,%\s]/g, "") } });
                    }
                  }}
                  className={field}>
                  <option value="none">None</option>
                  <option value="percent">%</option>
                  <option value="amount">$</option>
                </select>
                {q.deposit_kind !== "none" && (
                  <input key={`dv-${q.deposit_value}`} disabled={!edit} defaultValue={num(q.deposit_value)} inputMode="decimal" aria-label="Deposit"
                    onBlur={(e) => saveField("deposit_value", e.target.value.replace(/[$,%\s]/g, ""), num(q.deposit_value))} className={field} />
                )}
              </div>
            </Labelled>
            <Labelled text="Discount on the whole quote (%)">
              <input key={`qd-${q.discount_pct}`} disabled={!edit} defaultValue={num(q.discount_pct)} inputMode="decimal" aria-label="Quote discount"
                onBlur={(e) => saveField("discount_pct", e.target.value.replace(/[%\s]/g, ""), num(q.discount_pct))} className={field} />
            </Labelled>
            <p className="text-xs text-slate sm:col-span-2 lg:col-span-4">
              Pricing for this job: <strong>{q.pricing_tier}</strong> · {q.customer.name} · site {[q.site.site_name, q.site.address_line, q.site.suburb].filter(Boolean).join(", ")}
              {q.other_options.length > 0 && (
                <>
                  {" · Other options: "}
                  {q.other_options.map((o) => (
                    <Link key={o.option_letter} href={`${jobPath}/quote/${o.version_id}`} className="mr-2 font-semibold underline">
                      {o.option_letter}{o.name ? ` (${o.name})` : ""} · {STATUS_LABEL[o.status]}
                    </Link>
                  ))}
                </>
              )}
            </p>
          </section>

          {/* ── Wording ─────────────────────────────────────────────────── */}
          <section className="space-y-3 rounded-2xl bg-white p-4" aria-label="Wording">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Labelled text="Heading (Quote | …)">
                <input key={`h-${q.heading}`} disabled={!edit} defaultValue={q.heading} aria-label="Heading"
                  onBlur={(e) => saveField("heading", e.target.value, q.heading)} className={field} />
              </Labelled>
              <Labelled text="Option name (optional)">
                <input key={`on-${q.option_name}`} disabled={!edit} defaultValue={q.option_name ?? ""} placeholder={`Option ${q.option_letter}`} aria-label="Option name"
                  onBlur={(e) => saveField("option_name", e.target.value, q.option_name)} className={field} />
              </Labelled>
            </div>
            <Labelled text="Description of Works (start a line with ## for a heading, - for a bullet)">
              <textarea key={`d-${q.description}`} disabled={!edit} defaultValue={q.description ?? ""} rows={8} aria-label="Description of Works"
                onBlur={(e) => saveField("description", e.target.value, q.description)} className={`${field} font-mono text-xs`} />
            </Labelled>
            <div className="grid gap-3 md:grid-cols-2">
              <Labelled text="No allowance has been made for (one per line)">
                <textarea key={`x-${q.exclusions}`} disabled={!edit} defaultValue={q.exclusions ?? ""} rows={8} aria-label="Exclusions"
                  onBlur={(e) => saveField("exclusions", e.target.value, q.exclusions)} className={`${field} text-xs`} />
              </Labelled>
              <div className="space-y-3">
                <Labelled text="Note (e.g. NOTE - as discussed with…)">
                  <textarea key={`n-${q.note}`} disabled={!edit} defaultValue={q.note ?? ""} rows={2} aria-label="Note"
                    onBlur={(e) => saveField("note", e.target.value, q.note)} className={`${field} text-xs`} />
                </Labelled>
                <Labelled text="Terms">
                  <textarea key={`t-${q.terms}`} disabled={!edit} defaultValue={q.terms ?? ""} rows={5} aria-label="Terms"
                    onBlur={(e) => saveField("terms", e.target.value, q.terms)} className={`${field} text-xs`} />
                </Labelled>
              </div>
            </div>
          </section>

          {/* ── Sections ────────────────────────────────────────────────── */}
          {q.sections.map((s, i) => (
            <Section key={s.id} q={q} s={s} first={i === 0} last={i === q.sections.length - 1} run={run} />
          ))}
          {edit && <AddSection run={run} />}

          {/* ── Totals ──────────────────────────────────────────────────── */}
          <section className="ml-auto max-w-sm space-y-1 rounded-2xl bg-white p-4 text-sm" data-testid="totals" aria-label="Totals">
            <Row k="Subtotal" v={money(q.totals.subtotal)} />
            {Number(q.totals.discount) > 0 && (
              <>
                <Row k={`Discount (${Number(q.totals.discount_pct)}%)`} v={`−${money(q.totals.discount)}`} />
                <Row k="After discount" v={money(q.totals.net)} />
              </>
            )}
            <Row k="GST (15%)" v={money(q.totals.gst)} />
            <Row k="Total" v={money(q.totals.total)} bold />
            {q.totals.deposit !== null && (
              <Row k={q.deposit_kind === "percent" ? `Required deposit (${Number(q.deposit_value)}%)` : "Required deposit"} v={money(q.totals.deposit)} bold />
            )}
          </section>
        </div>

        {/* ── Side panel: margin, sending, accepting ───────────────────── */}
        <aside className="space-y-4">
          {costs && (
            <section className="rounded-2xl bg-white p-4 text-sm" data-testid="margin" aria-label="Margin">
              <h2 className="font-bold">Margin <span className="text-xs font-normal text-slate">(office only)</span></h2>
              <dl className="mt-2 space-y-1">
                <Row k="Cost" v={money(q.totals.cost)} />
                <Row k="Sell (excl GST)" v={money(q.totals.net)} />
                <Row k="Profit" v={money(q.totals.profit)} bold />
                <Row k="Margin" v={q.totals.margin_pct === null || q.totals.margin_pct === undefined ? "—" : `${q.totals.margin_pct}%`} />
                <Row k="Markup on cost" v={q.totals.markup_pct === null || q.totals.markup_pct === undefined ? "—" : `${q.totals.markup_pct}%`} />
              </dl>
            </section>
          )}
          <SendPanel q={q} run={run} />
        </aside>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────
type Run = (o: BuilderOp, after?: () => void) => void;

function Labelled({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-0.5 block text-xs font-semibold text-slate">{text}</span>
      {children}
    </div>
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

function Section({ q, s, first, last, run }: { q: OfficeQuote; s: QuoteSection; first: boolean; last: boolean; run: Run }) {
  const edit = q.can.edit;
  const costs = q.can.costs;
  const [adding, setAdding] = useState<"none" | "typed" | "fav">("none");
  const [saveFav, setSaveFav] = useState(false);
  const save = (changes: Record<string, unknown>) => run({ op: "section", sectionId: s.id, changes });
  return (
    <section className="rounded-2xl bg-white p-4" data-testid="quote-section" aria-label={`Section ${s.name}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-60 flex-1">
          <input key={`sn-${s.name}`} disabled={!edit} defaultValue={s.name} aria-label="Section name"
            onBlur={(e) => e.target.value !== s.name && save({ name: e.target.value })}
            className={`${field} text-base font-bold`} />
          <textarea key={`sd-${s.description}`} disabled={!edit} defaultValue={s.description ?? ""} rows={1} placeholder={edit ? "Section description (optional)" : ""} aria-label="Section description"
            onBlur={(e) => e.target.value !== (s.description ?? "") && save({ description: e.target.value })}
            className={`${field} mt-1 text-xs text-slate`} />
        </div>
        <label className="flex items-center gap-1 text-xs text-slate">
          Appears as
          <select disabled={!edit} value={s.appears_as} onChange={(e) => save({ appears_as: e.target.value as AppearsAs })}
            className="rounded-full border border-black/10 bg-white px-2 py-1 text-xs" aria-label="Appears as">
            {Object.entries(APPEARS_AS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-slate">
          Fixed price $
          <input key={`fp-${s.fixed_price}`} disabled={!edit} defaultValue={num(s.fixed_price)} placeholder="—" inputMode="decimal" aria-label="Section fixed price"
            onBlur={(e) => e.target.value.replace(/[$,\s]/g, "") !== num(s.fixed_price) && save({ fixed_price: e.target.value.replace(/[$,\s]/g, "") })}
            className={`${cell} w-24`} />
        </label>
        {edit && (
          <span className="flex gap-1">
            {!first && <button type="button" onClick={() => save({ move: "up" })} className={`${pill} bg-mist`} aria-label="Move section up">↑</button>}
            {!last && <button type="button" onClick={() => save({ move: "down" })} className={`${pill} bg-mist`} aria-label="Move section down">↓</button>}
            <button type="button" onClick={() => confirm(`Remove the section "${s.name}" and its lines?`) && save({ remove: true })}
              className={`${pill} bg-red-50 text-red-800`}>Remove</button>
          </span>
        )}
        {q.can.favourites && (
          <button type="button" onClick={() => setSaveFav((x) => !x)} className={`${pill} bg-mist`}>Save section to favourites</button>
        )}
      </div>
      {saveFav && <SaveSectionFav s={s} run={run} done={() => setSaveFav(false)} />}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate">
              <th className="py-1 font-semibold">Name</th>
              <th className="w-20 py-1 text-right font-semibold">Qty</th>
              <th className="w-16 py-1 font-semibold">UoM</th>
              {costs && <th className="w-24 py-1 text-right font-semibold">Cost</th>}
              <th className="w-24 py-1 text-right font-semibold">Price</th>
              {costs && <th className="w-20 py-1 text-right font-semibold">Markup</th>}
              <th className="w-16 py-1 text-right font-semibold">Disc %</th>
              <th className="w-24 py-1 text-right font-semibold">Total</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <Line key={l.id} q={q} s={s} l={l} first={i === 0} last={i === s.lines.length - 1} run={run} />
            ))}
            {s.lines.length === 0 && (
              <tr><td colSpan={9} className="py-2 text-sm text-slate">{s.fixed_price !== null ? "No lines: the fixed price is the section's price." : "No lines yet."}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 text-sm">
              <td className="py-1.5 text-xs text-slate" colSpan={3}>
                {s.fixed_price !== null && `Lines add up to ${money(s.lines_sell)}; the customer sees the fixed price.`}
              </td>
              {costs && <td className="py-1.5 text-right text-xs tabular-nums text-slate">{money(s.cost)}</td>}
              <td colSpan={costs ? 3 : 2} />
              <td className="py-1.5 text-right font-bold tabular-nums" data-testid="section-total">{money(s.sell)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {edit && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ItemSearch id={`search-${s.id}`} onPick={(it) => run({ op: "addLine", sectionId: s.id, line: { price_book_item_id: it.id, quantity: 1 } })} />
            <button type="button" onClick={() => setAdding(adding === "typed" ? "none" : "typed")} className={`${pill} bg-mist`}>+ Type a line</button>
            <button type="button" onClick={() => setAdding(adding === "fav" ? "none" : "fav")} className={`${pill} bg-mist`}>Add from favourites</button>
          </div>
          {adding === "typed" && <TypedLine s={s} costs={costs} run={run} done={() => setAdding("none")} />}
          {adding === "fav" && (
            <FavouritePicker
              title="Add a favourite's lines to this section"
              onPick={(id, quantity) => run({ op: "addLine", sectionId: s.id, line: { favourite_id: id, quantity } }, () => setAdding("none"))}
              withQuantity
              close={() => setAdding("none")}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Line({ q, s, l, first, last, run }: { q: OfficeQuote; s: QuoteSection; l: QuoteLine; first: boolean; last: boolean; run: Run }) {
  const edit = q.can.edit;
  const costs = q.can.costs;
  const save = (changes: Record<string, unknown>) => run({ op: "line", lineId: l.id, changes });
  const clean = (v: string) => v.replace(/[$,%\s]/g, "");
  return (
    <tr className="border-t border-black/5 align-top" data-testid="quote-line">
      <td className="py-1 pr-2">
        <input key={`ld-${l.description}`} disabled={!edit} defaultValue={l.description} aria-label="Line name"
          onBlur={(e) => e.target.value !== l.description && save({ description: e.target.value })} className={field} />
        <span className="ml-1 text-[11px] text-slate" title="Where the price came from">
          {l.code && `${l.code} · `}{l.source === "typed" ? "typed" : l.source === "favourite" ? "favourite" : "price book"} · {PRICE_SOURCE[l.price_source] ?? l.price_source}
        </span>
      </td>
      <td className="py-1">
        <input key={`lq-${l.quantity}`} disabled={!edit} defaultValue={num(l.quantity, 3)} inputMode="decimal" aria-label="Quantity"
          onBlur={(e) => clean(e.target.value) !== num(l.quantity, 3) && save({ quantity: clean(e.target.value) })} className={`${cell} w-full`} />
      </td>
      <td className="py-1">
        <input key={`lu-${l.unit}`} disabled={!edit} defaultValue={l.unit ?? ""} aria-label="Unit"
          onBlur={(e) => e.target.value !== (l.unit ?? "") && save({ unit: e.target.value })} className={`${field} w-full text-xs`} />
      </td>
      {costs && (
        <td className="py-1">
          <input key={`lc-${l.unit_cost}`} disabled={!edit || l.source !== "typed"} defaultValue={num(l.unit_cost)} inputMode="decimal" aria-label="Unit cost"
            title={l.source !== "typed" ? "From the price book" : undefined}
            onBlur={(e) => clean(e.target.value) !== num(l.unit_cost) && save({ unit_cost: clean(e.target.value) })} className={`${cell} w-full`} />
        </td>
      )}
      <td className="py-1">
        <input key={`ls-${l.unit_sell}`} disabled={!edit} defaultValue={num(l.unit_sell)} inputMode="decimal" aria-label="Unit price"
          onBlur={(e) => clean(e.target.value) !== num(l.unit_sell) && save({ unit_sell: clean(e.target.value) })} className={`${cell} w-full`} />
      </td>
      {costs && (
        <td className="py-1">
          <input key={`lm-${l.markup_pct}`} disabled={!edit || !l.unit_cost} defaultValue={num(l.markup_pct)} inputMode="decimal" aria-label="Markup %"
            onBlur={(e) => clean(e.target.value) !== num(l.markup_pct) && save({ markup_pct: clean(e.target.value) })} className={`${cell} w-full`} />
        </td>
      )}
      <td className="py-1">
        <input key={`lx-${l.discount_pct}`} disabled={!edit} defaultValue={num(l.discount_pct)} inputMode="decimal" aria-label="Line discount %"
          onBlur={(e) => clean(e.target.value) !== num(l.discount_pct) && save({ discount_pct: clean(e.target.value) })} className={`${cell} w-full`} />
      </td>
      <td className={`py-1.5 text-right tabular-nums ${s.fixed_price !== null ? "text-slate" : ""}`}>{money(l.total)}</td>
      <td className="py-1 pl-1 text-right whitespace-nowrap">
        {edit && (
          <>
            {!first && <button type="button" onClick={() => save({ move: "up" })} className="px-1 text-slate" aria-label="Move line up">↑</button>}
            {!last && <button type="button" onClick={() => save({ move: "down" })} className="px-1 text-slate" aria-label="Move line down">↓</button>}
            {l.price_source === "line" || l.source !== "typed" ? (
              <button type="button" onClick={() => save({ reprice: true })} className="px-1 text-slate" title="Reprice from the price book and the pricing order" aria-label="Reprice">⟳</button>
            ) : null}
            <button type="button" onClick={() => save({ remove: true })} className="px-1 font-bold text-red-700" aria-label="Remove line">×</button>
          </>
        )}
      </td>
    </tr>
  );
}

function TypedLine({ s, costs, run, done }: { s: QuoteSection; costs: boolean; run: Run; done: () => void }) {
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl bg-mist/60 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const line: Record<string, unknown> = {
          description: String(f.get("description") ?? ""), unit: String(f.get("unit") ?? ""),
          quantity: String(f.get("quantity") ?? "1"),
        };
        const cost = String(f.get("unit_cost") ?? "").replace(/[$,\s]/g, "");
        const sell = String(f.get("unit_sell") ?? "").replace(/[$,\s]/g, "");
        if (cost) line.unit_cost = cost;
        if (sell) line.unit_sell = sell;
        run({ op: "addLine", sectionId: s.id, line }, done);
      }}
    >
      <Labelled text="What it is"><input name="description" required autoFocus className={`${field} min-w-64`} /></Labelled>
      <Labelled text="Qty"><input name="quantity" defaultValue="1" inputMode="decimal" className={`${cell} w-16`} /></Labelled>
      <Labelled text="UoM"><input name="unit" className={`${field} w-16`} /></Labelled>
      {costs && <Labelled text="Cost each"><input name="unit_cost" inputMode="decimal" className={`${cell} w-24`} /></Labelled>}
      <Labelled text={costs ? "Price each (blank: cost + markup)" : "Price each"}><input name="unit_sell" inputMode="decimal" className={`${cell} w-28`} /></Labelled>
      <button className={`${pill} bg-ink text-white`}>Add line</button>
      <button type="button" onClick={done} className={`${pill} bg-white`}>Cancel</button>
    </form>
  );
}

function AddSection({ run }: { run: Run }) {
  const [fav, setFav] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-black/10 p-4 text-sm font-semibold">
        <button type="button" onClick={() => run({ op: "section", sectionId: null, changes: { name: "New section" } })} className="text-aqua-deep">
          + Add new section
        </button>
        <span className="font-normal text-slate">or</span>
        <button type="button" onClick={() => setFav((x) => !x)} className="text-aqua-deep">Add section from favourites</button>
      </div>
      {fav && (
        <FavouritePicker title="Add a favourite as a new section" onPick={(id) => run({ op: "favSection", favouriteId: id }, () => setFav(false))}
          close={() => setFav(false)} />
      )}
    </div>
  );
}

/** Browse the favourites library: folders down the side, favourites in the chosen folder. */
export function FavouritePicker({ title, onPick, close, withQuantity = false }: {
  title: string; onPick: (id: string, quantity: number) => void; close: () => void; withQuantity?: boolean;
}) {
  const [lib, setLib] = useState<FavouriteLibrary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [qty, setQty] = useState("1");
  useEffect(() => {
    favouriteLibraryAction().then(setLib).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const term = find.trim().toLowerCase();
  const path = (id: string | null) => lib?.folders.find((f) => f.id === id)?.path ?? "No folder";
  const shown = lib?.favourites.filter((f) => (term ? `${f.name} ${f.code ?? ""} ${path(f.folder_id)}`.toLowerCase().includes(term) : f.folder_id === folder)) ?? [];
  return (
    <div className="rounded-xl border border-black/10 bg-mist/60 p-3 text-sm" data-testid="favourite-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{title}</strong>
        <span className="flex items-center gap-2">
          {withQuantity && (
            <label className="flex items-center gap-1 text-xs">Qty <input value={qty} onChange={(e) => setQty(e.target.value)} className={`${cell} w-14`} /></label>
          )}
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a favourite…" aria-label="Find a favourite" className={`${field} w-48`} />
          <button type="button" onClick={close} className={`${pill} bg-white`}>Close</button>
        </span>
      </div>
      {err && <p className="mt-2 text-red-700">{err}</p>}
      {!lib && !err && <p className="mt-2 text-slate">Loading favourites…</p>}
      {lib && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[220px_1fr]">
          <ul className="max-h-64 overflow-auto rounded-lg bg-white p-1">
            {[{ id: null as string | null, path: "No folder" }, ...lib.folders].map((f) => (
              <li key={f.id ?? "none"}>
                <button type="button" onClick={() => { setFolder(f.id); setFind(""); }}
                  className={`w-full rounded px-2 py-1 text-left text-xs ${folder === f.id && !term ? "bg-ink text-white" : "hover:bg-mist"}`}>
                  📁 {f.path}
                </button>
              </li>
            ))}
          </ul>
          <ul className="max-h-64 overflow-auto rounded-lg bg-white p-1">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => onPick(f.id, Number(qty) || 1)}
                  className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-mist">
                  <span>🔖 <strong>{f.name}</strong> <span className="text-xs text-slate">{term ? `· ${path(f.folder_id)} ` : ""}· {f.lines} line{f.lines === 1 ? "" : "s"}</span></span>
                  <span className="text-xs text-slate">{f.fixed_price !== null ? `fixed ${money(f.fixed_price)}` : "priced line by line"}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-slate">{term ? "No favourites match." : "Nothing in this folder. Pick a folder on the left."}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function SaveSectionFav({ s, run, done }: { s: QuoteSection; run: Run; done: () => void }) {
  const [lib, setLib] = useState<FavouriteLibrary | null>(null);
  useEffect(() => {
    favouriteLibraryAction().then(setLib).catch(() => setLib({ can_edit: false, can_see_costs: false, folders: [], favourites: [] }));
  }, []);
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-mist/60 p-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run({ op: "saveSectionFav", sectionId: s.id, folderId: String(f.get("folder") || "") || null, name: String(f.get("name") || "") || null }, done);
      }}
    >
      <Labelled text="Favourite name"><input name="name" defaultValue={s.name} className={`${field} min-w-56`} /></Labelled>
      <Labelled text="Folder">
        <select name="folder" className={field}>
          <option value="">No folder</option>
          {lib?.folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
        </select>
      </Labelled>
      <button className={`${pill} bg-ink text-white`}>Save to favourites</button>
      <button type="button" onClick={done} className={`${pill} bg-white`}>Cancel</button>
      <p className="w-full text-xs text-slate">Price book lines stay linked to the price book; typed lines keep their cost; prices typed on this quote become the favourite&apos;s set prices.</p>
    </form>
  );
}

function SendPanel({ q, run }: { q: OfficeQuote; run: Run }) {
  const [to, setTo] = useState<string[]>(() => q.recipients.map((r) => r.email));
  const [mark, setMark] = useState(false);
  if (q.quote_status === "accepted") {
    return (
      <section className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950" data-testid="accepted-panel">
        <h2 className="font-bold">Accepted</h2>
        {q.accepted_at ? (
          <p className="mt-1">
            {q.accepted_via === "link" ? "Accepted online" : "Marked accepted by the office"}
            {q.accepted_by ? ` by ${q.accepted_by}` : ""} on {nzDay(q.accepted_at)}
            {q.accepted_order_number ? ` · order ${q.accepted_order_number}` : ""}. This version is the job&apos;s budget.
          </p>
        ) : (
          <p className="mt-1">Another version of this quote was accepted.</p>
        )}
      </section>
    );
  }
  if (q.quote_status !== "open") {
    return (
      <section className="rounded-2xl bg-white p-4 text-sm">
        <h2 className="font-bold">{STATUS_LABEL[q.quote_status]}</h2>
        {q.can.send && q.quote_status === "declined" && (
          <button type="button" onClick={() => run({ op: "reopen" })} className={`${pill} mt-2 bg-mist`}>Reopen</button>
        )}
      </section>
    );
  }
  if (!q.can.send) {
    return (
      <section className="rounded-2xl bg-white p-4 text-sm text-slate">
        <h2 className="font-bold text-ink">Sending</h2>
        <p className="mt-1">You can build this quote; publishing and sending it needs the &quot;publish and send quotes&quot; permission.</p>
      </section>
    );
  }
  if (q.status !== "published") {
    return (
      <section className="rounded-2xl bg-white p-4 text-sm text-slate">
        <h2 className="font-bold text-ink">Sending</h2>
        <p className="mt-1">{q.status === "draft" ? "Publish this version to send it. Publishing freezes it; later changes need a new version." : "Open the newest version to send it."}</p>
        <p className="mt-2 text-xs">Goes to: {q.recipients.length ? q.recipients.map((r) => r.email).join(", ") : "nobody yet (tick \"Gets quotes\" on a contact)"}</p>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 text-sm" data-testid="send-panel">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run({ op: "send", to, message: String(f.get("message") ?? "") });
        }}
      >
        <h2 className="font-bold">{q.sent_at ? "Send again" : "Send to the customer"}</h2>
        {q.recipients.length === 0 && <p className="text-amber-900">Nobody gets quotes yet: tick &quot;Gets quotes&quot; on a contact with an email on the customer&apos;s page.</p>}
        {q.recipients.map((r) => (
          <label key={r.email} className="flex items-center gap-2">
            <input type="checkbox" checked={to.includes(r.email)} onChange={(e) => setTo((x) => (e.target.checked ? [...x, r.email] : x.filter((y) => y !== r.email)))} />
            {r.name} <span className="text-xs text-slate">{r.email}</span>
          </label>
        ))}
        <textarea name="message" rows={3} placeholder="Message (optional)" aria-label="Message" className={`${field} text-xs`} />
        <button className={`${pill} w-full bg-emerald-700 text-white`} disabled={q.recipients.length === 0} data-testid="send">
          Email the quote (PDF + Accept link)
        </button>
        {q.sent_to && q.sent_at && (
          <p className="text-xs text-slate">Last sent {nzTime(q.sent_at)} to {q.sent_to.map((r) => r.email).join(", ")}</p>
        )}
      </form>
      <div className="border-t border-black/5 pt-3">
        {!mark ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMark(true)} className={`${pill} bg-mist`}>Mark accepted</button>
            <button type="button" onClick={() => { const r = prompt("Why was it declined? (optional)"); if (r !== null) run({ op: "decline", reason: r }); }}
              className={`${pill} bg-red-50 text-red-800`}>Mark declined</button>
          </div>
        ) : (
          <form className="space-y-2" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run({ op: "accept", name: String(f.get("name") ?? "") || null, order: String(f.get("order") ?? "") || null }, () => setMark(false));
          }}>
            <p className="text-xs text-slate">For when the customer accepted by email, phone or a signed PDF.</p>
            <input name="name" placeholder="Accepted by (name)" aria-label="Accepted by" className={field} />
            <input name="order" placeholder="Their order number (optional)" aria-label="Order number" className={field} />
            <div className="flex gap-2">
              <button className={`${pill} bg-emerald-700 text-white`}>Mark accepted</button>
              <button type="button" onClick={() => setMark(false)} className={`${pill} bg-mist`}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
