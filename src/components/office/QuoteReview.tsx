import { sendQuoteAction } from "@/app/dashboard/automation-actions";
import type { Quote } from "@/lib/automation";

const cell = "rounded-lg border border-black/10 px-2 py-1 text-sm";

/** A quote Claude drafted: fix prices or lines, then send it to the customer. */
export function QuoteReview({ quote, back }: { quote: Quote; back: string }) {
  if (quote.status !== "draft") {
    return <p className="mt-2 text-sm text-slate">Quote {quote.status} — ${Number(quote.total).toFixed(2)} incl GST.</p>;
  }
  return (
    <form action={sendQuoteAction} className="mt-3 space-y-2 rounded-xl bg-mist p-3">
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="count" value={quote.lines.length} />
      <label className="block text-sm font-medium" htmlFor={`sum-${quote.id}`}>What the customer reads</label>
      <input id={`sum-${quote.id}`} name="summary" defaultValue={quote.summary ?? ""} required maxLength={300} className={`${cell} w-full`} />
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate">
          <tr><th>Line</th><th className="w-16">Qty</th><th className="w-24">Each excl GST</th><th className="w-14">Remove</th></tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="py-1 pr-2">
                <input type="hidden" name={`kind_${i}`} value={l.kind} />
                <input type="hidden" name={`item_${i}`} value={l.price_book_item_id ?? ""} />
                <input name={`desc_${i}`} defaultValue={l.description} aria-label="Description" readOnly={l.kind === "labour"} className={`${cell} w-full`} />
              </td>
              <td><input name={`qty_${i}`} type="number" step="0.25" min="0.25" defaultValue={Number(l.quantity)} aria-label="Quantity" className={`${cell} w-16`} /></td>
              <td>
                <input name={`price_${i}`} type="number" step="0.01" min="0" aria-label="Price each"
                       defaultValue={l.needs_price ? "" : Number(l.unit_price)} placeholder={l.needs_price ? "Price?" : undefined}
                       className={`${cell} w-24 ${l.needs_price ? "border-amber-500 bg-amber-50" : ""}`} />
              </td>
              <td className="text-center"><input type="checkbox" name={`remove_${i}`} aria-label="Remove line" /></td>
            </tr>
          ))}
          <tr>
            <td className="py-1 pr-2"><input name="add_desc" placeholder="Add a line (optional)" aria-label="New line" className={`${cell} w-full`} /></td>
            <td><input name="add_qty" type="number" step="0.25" min="0.25" defaultValue={1} aria-label="New line quantity" className={`${cell} w-16`} /></td>
            <td><input name="add_price" type="number" step="0.01" min="0" aria-label="New line price" className={`${cell} w-24`} /></td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate">Draft total ${Number(quote.total).toFixed(2)} incl GST (recalculated when sent). Valid {quote.valid_until ?? "30 days"}.</p>
        <button className="rounded-full bg-aqua px-4 py-2 text-sm font-semibold text-ink">Send quote to the customer</button>
      </div>
    </form>
  );
}
