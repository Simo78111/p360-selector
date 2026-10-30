import { markupAction } from "@/app/dashboard/price-book-actions";
import { PriceBookUpload } from "@/components/office/PriceBookUpload";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadPriceBooks, officeEnabled, searchMaterials, type Material, type PriceBooks } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Price books" };

type Props = { searchParams: Promise<{ q?: string; ok?: string; err?: string }> };

const $ = (n: number) => `$${Number(n).toFixed(2)}`;

export default async function PriceBooksPage({ searchParams }: Props) {
  await requireOffice("pricing");
  if (!officeEnabled()) return <NotConnected />;
  const { q = "", ok, err } = await searchParams;
  const query = q.trim().slice(0, 100);
  let info: PriceBooks;
  let found: Material[] = [];
  try {
    [info, found] = await Promise.all([loadPriceBooks(), query.length >= 2 ? searchMaterials(query, 50) : Promise.resolve([])]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const active = info.suppliers.filter((s) => s.active);
  const stale = active.filter((s) => !s.last_upload || s.last_upload.days_ago > 35);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Price books</h1>
        <p className="mt-1 text-sm text-slate">
          Upload each supplier&apos;s price book every month. Plumbers search it when they find extra work, and you can from any
          job. Customers are quoted cost + markup, plus GST.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      {stale.length > 0 && (
        <p className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm">
          <strong>Due for this month&apos;s price book:</strong> {stale.map((s) => s.name).join(", ")}.
        </p>
      )}

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Upload a price book</h2>
        <p className="mt-1 mb-4 text-sm text-slate">
          A CSV from your supplier. Excel files: save as CSV first. Uploading replaces that supplier&apos;s prices; quotes already
          sent keep their prices.
        </p>
        <PriceBookUpload suppliers={active.map((s) => ({ id: s.id, name: s.name }))} />
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Suppliers and markup</h2>
            <p className="mt-1 text-sm text-slate">Sell price = cost + markup. A supplier left blank uses the default.</p>
          </div>
          <form action={markupAction} className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Default markup %</span>
              <input id="markup-default" name="markup" inputMode="decimal" defaultValue={info.default_markup_pct} className="w-24 rounded-full border border-black/10 px-4 py-2 text-sm" />
            </label>
            <button className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink">Save</button>
          </form>
        </div>
        {info.suppliers.length === 0 ? (
          <p className="mt-4 text-sm text-slate">No price books yet. Upload your first one above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/5">
            {info.suppliers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-slate">
                    {s.items.toLocaleString()} items ·{" "}
                    {s.last_upload ? (
                      <span className={s.last_upload.days_ago > 35 ? "font-semibold text-amber-800" : ""}>
                        last uploaded {s.last_upload.at}
                        {s.last_upload.file && ` (${s.last_upload.file})`}
                      </span>
                    ) : (
                      "never uploaded"
                    )}
                  </p>
                </div>
                <form action={markupAction} className="flex items-center gap-2">
                  <input type="hidden" name="supplierId" value={s.id} />
                  <label className="sr-only" htmlFor={`markup-${s.id}`}>Markup for {s.name}</label>
                  <input
                    id={`markup-${s.id}`}
                    name="markup"
                    inputMode="decimal"
                    defaultValue={s.markup_pct ?? ""}
                    placeholder={`${info.default_markup_pct} (default)`}
                    className="w-32 rounded-full border border-black/10 px-4 py-2 text-sm"
                  />
                  <span className="text-sm">%</span>
                  <button className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink">Save</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Search materials</h2>
        <form className="mt-3 flex gap-2" action="/dashboard/office/price-books">
          <label className="sr-only" htmlFor="materials-q">Search materials</label>
          <input
            id="materials-q"
            name="q"
            defaultValue={query}
            placeholder="Code or words, e.g. isolating valve 15"
            className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm"
          />
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">Search</button>
        </form>
        {query.length >= 2 && (
          found.length === 0 ? (
            <p className="mt-4 text-sm text-slate">Nothing matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-mist text-slate">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                    <th className="px-3 py-2 text-right font-medium">Sell excl GST</th>
                    <th className="px-3 py-2 text-right font-medium">Customer pays</th>
                  </tr>
                </thead>
                <tbody>
                  {found.map((m) => (
                    <tr key={m.id} className="border-t border-black/5">
                      <td className="px-3 py-2">
                        {m.description}
                        <span className="block font-mono text-xs text-slate">
                          {m.code}
                          {m.unit && ` · ${m.unit}`}
                          {m.brand && ` · ${m.brand}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">{m.supplier}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {$(m.cost)}
                        {m.previous_cost !== null && m.previous_cost !== m.cost && (
                          <span className={`block text-xs ${m.cost > m.previous_cost ? "text-red-700" : "text-emerald-700"}`}>
                            was {$(m.previous_cost)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{$(m.sell)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{$(m.sell_incl_gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {info.uploads.length > 0 && (
        <section className="rounded-2xl bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">Recent uploads</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {info.uploads.map((u, i) => (
              <li key={i}>
                <strong>{u.supplier}</strong> · {u.at} · {u.rows.toLocaleString()} items: {u.added.toLocaleString()} new,{" "}
                {u.changed.toLocaleString()} price changes ({u.went_up.toLocaleString()} up), {u.removed.toLocaleString()} no longer listed
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
