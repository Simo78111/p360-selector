import Link from "next/link";
import {
  copyFavouriteAction,
  saveFavouriteAction,
  saveFavouriteLineAction,
  saveFolderAction,
} from "@/app/dashboard/quote-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { FavLineAdder } from "@/components/office/FavLineAdder";
import { FavouritesImport } from "@/components/office/FavouritesImport";
import { area, input, label, money, primaryBtn, quietBtn } from "@/components/office/jm";
import { requireOffice } from "@/lib/auth";
import { loadCompanies, type Company } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";
import { loadFavourite, loadFavourites, PRICE_SOURCE, type FavouriteDetail, type FavouriteLibrary, type Folder } from "@/lib/quotes";

export const metadata = { title: "Favourites" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; f?: string; fav?: string; co?: string; deleted?: string }> };
const isId = (s: string | undefined): s is string => !!s && /^[0-9a-f-]{36}$/.test(s);

export default async function FavouritesPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, f, fav, co, deleted } = await searchParams;
  let lib: FavouriteLibrary;
  let companies: Company[];
  let detail: FavouriteDetail | null = null;
  try {
    [lib, companies] = await Promise.all([loadFavourites(session, deleted === "1"), loadCompanies()]);
    const priceFor = companies.find((c) => c.code === co) ?? companies.find((c) => c.code === "PTSL") ?? companies[0];
    if (isId(fav)) detail = await loadFavourite(session, fav, priceFor?.id ?? null);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const edit = lib.can_edit;
  const costs = lib.can_see_costs;
  const byId = new Map(lib.folders.map((d) => [d.id, d]));
  // The open folder (or the favourite's folder) and its parents, top first: one column each.
  const openId = isId(f) ? f : detail?.folder_id ?? null;
  const chain: Folder[] = [];
  for (let id = openId; id && byId.has(id) && chain.length < 20; id = byId.get(id)!.parent_id) chain.unshift(byId.get(id)!);
  const columns: (string | null)[] = [null, ...chain.map((d) => d.id)];
  const url = (folder: string | null, favourite?: string | null, extra: Record<string, string> = {}) =>
    `/dashboard/office/favourites?${new URLSearchParams({ ...(folder ? { f: folder } : {}), ...(favourite ? { fav: favourite } : {}), ...(co ? { co } : {}), ...extra })}`;
  const here = url(openId, detail?.id ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Favourites</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Ready-made quote sections in folders, shared by Plumbing 360 and Project 360. Add one to a quote as a new section or
          into a section. Lines from the price book follow the price book; prices come out at the quoting company&apos;s and
          customer&apos;s markup. A fixed price replaces the sum of the lines.
          {!edit && " You can use favourites; changing them needs the \"edit favourites\" permission."}
        </p>
      </div>
      <Flash ok={ok} err={err} />

      {/* ── Folder columns ─────────────────────────────────────────────── */}
      <section className="overflow-x-auto rounded-2xl bg-white" data-testid="favourite-columns">
        <div className="flex min-w-max divide-x divide-black/5">
          {columns.map((parent, ci) => {
            const folders = lib.folders.filter((d) => d.parent_id === parent);
            const favs = parent === null ? lib.favourites.filter((x) => x.folder_id === null && x.active) : lib.favourites.filter((x) => x.folder_id === parent && x.active);
            return (
              <div key={parent ?? "root"} className="w-64 p-2" data-testid="favourite-column">
                {edit && (
                  <details className="mb-1 text-xs">
                    <summary className="cursor-pointer font-semibold text-aqua-deep">+ Folder / + Favourite</summary>
                    <form action={saveFolderAction} className="mt-1 flex gap-1">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="parentId" value={parent ?? ""} />
                      <input name="name" required placeholder="New folder" aria-label="New folder name" className="w-full rounded-full border border-black/10 px-2 py-1" />
                      <button className={quietBtn}>Add</button>
                    </form>
                    <form action={saveFavouriteAction} className="mt-1 flex gap-1">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="folder_id" value={parent ?? ""} />
                      <input name="name" required placeholder="New favourite" aria-label="New favourite name" className="w-full rounded-full border border-black/10 px-2 py-1" />
                      <button className={quietBtn}>Add</button>
                    </form>
                  </details>
                )}
                <ul className="space-y-0.5 text-sm">
                  {folders.map((d) => (
                    <li key={d.id}>
                      <Link href={url(d.id)} className={`block truncate rounded-lg px-2 py-1 ${columns[ci + 1] === d.id ? "bg-mist font-semibold" : "hover:bg-mist"}`}>
                        📁 {d.name}
                      </Link>
                    </li>
                  ))}
                  {favs.map((x) => (
                    <li key={x.id}>
                      <Link href={url(x.folder_id, x.id)} className={`block truncate rounded-lg px-2 py-1 ${detail?.id === x.id ? "bg-ink text-white" : "hover:bg-mist"}`}>
                        🔖 {x.name}
                        {x.fixed_price !== null && <span className="ml-1 text-xs opacity-70">{money(x.fixed_price)}</span>}
                      </Link>
                    </li>
                  ))}
                  {folders.length + favs.length === 0 && <li className="px-2 py-1 text-xs text-slate">Empty</li>}
                </ul>
                {edit && parent !== null && ci === columns.length - 1 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-slate">Folder: rename / move / remove</summary>
                    <form action={saveFolderAction} className="mt-1 space-y-1">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="folderId" value={parent} />
                      <input name="name" defaultValue={byId.get(parent)?.name} aria-label="Folder name" className="w-full rounded-full border border-black/10 px-2 py-1" />
                      <select name="parentId" defaultValue={byId.get(parent)?.parent_id ?? ""} aria-label="Inside folder" className="w-full rounded-full border border-black/10 px-2 py-1">
                        <option value="">Top level</option>
                        {lib.folders.filter((d) => d.id !== parent).map((d) => <option key={d.id} value={d.id}>{d.path}</option>)}
                      </select>
                      <button className={quietBtn}>Save folder</button>
                    </form>
                    <form action={saveFolderAction} className="mt-1">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="folderId" value={parent} />
                      <input type="hidden" name="remove" value="1" />
                      <button className="text-red-700 underline">Remove this folder (only when empty)</button>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── The chosen favourite ───────────────────────────────────────── */}
      {detail && (
        <section className="space-y-4 rounded-2xl bg-white p-5 sm:p-6" data-testid="favourite-detail">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">🔖 {detail.name}{!detail.active && <span className="ml-2 text-sm text-red-700">(deleted)</span>}</h2>
            <nav className="flex gap-1 text-xs" aria-label="Priced for">
              <span className="self-center text-slate">Prices for</span>
              {companies.map((c) => (
                <Link key={c.id} href={url(detail!.folder_id, detail!.id, { co: c.code })} aria-current={detail!.priced_for_id === c.id ? "page" : undefined}
                  className={`rounded-full px-3 py-1 ${detail!.priced_for_id === c.id ? "bg-ink font-semibold text-white" : "bg-mist"}`}>{c.name}</Link>
              ))}
            </nav>
          </div>
          <p className="text-xs text-slate">
            {detail.folder_path ?? "No folder"} · last changed {new Date(detail.updated_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })}
            {detail.updated_by ? ` by ${detail.updated_by}` : ""} · priced at {detail.priced_for}&apos;s default markup (a customer&apos;s tier changes it on a quote)
          </p>

          {edit ? (
            <form action={saveFavouriteAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="back" value={here} />
              <input type="hidden" name="favouriteId" value={detail.id} />
              <div className="sm:col-span-2">
                <label className={label} htmlFor="fv-name">Name</label>
                <input id="fv-name" name="name" required defaultValue={detail.name} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="fv-code">Code (optional)</label>
                <input id="fv-code" name="code" defaultValue={detail.code ?? ""} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="fv-fixed">Fixed price (blank: sum of the lines)</label>
                <input id="fv-fixed" name="fixed_price" inputMode="decimal" defaultValue={detail.fixed_price ?? ""} placeholder="—" className={input} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={label} htmlFor="fv-desc">Description (goes onto the quote section)</label>
                <textarea id="fv-desc" name="description" rows={2} defaultValue={detail.description ?? ""} className={area} />
              </div>
              <div>
                <label className={label} htmlFor="fv-folder">Folder</label>
                <select id="fv-folder" name="folder_id" defaultValue={detail.folder_id ?? ""} className={input}>
                  <option value="">No folder</option>
                  {lib.folders.map((d) => <option key={d.id} value={d.id}>{d.path}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4"><button className={primaryBtn}>Save favourite</button></div>
            </form>
          ) : (
            detail.description && <p className="text-sm">{detail.description}</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="favourite-lines">
              <thead>
                <tr className="text-left text-xs text-slate">
                  <th className="py-1 font-semibold">Item</th>
                  <th className="w-20 py-1 text-right font-semibold">Qty</th>
                  {costs && <th className="w-24 py-1 text-right font-semibold">Unit cost</th>}
                  <th className="w-24 py-1 text-right font-semibold">Unit sell</th>
                  {costs && <th className="w-24 py-1 text-right font-semibold">Total cost</th>}
                  <th className="w-24 py-1 text-right font-semibold">Total sell</th>
                  {edit && <th className="w-56 py-1 font-semibold">Change</th>}
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id} className="border-t border-black/5 align-top">
                    <td className="py-1.5">
                      {l.kind === "labour" && <span className="mr-1 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-900">LABOUR</span>}
                      {l.code && <strong>{l.code} </strong>}{l.description}{l.unit ? <span className="text-xs text-slate"> ({l.unit})</span> : null}
                      <span className="block text-[11px] text-slate">{l.kind === "typed" ? "typed line" : "price book"} · {PRICE_SOURCE[l.source] ?? l.source}</span>
                      {l.item_missing && <span className="block text-xs text-red-700">This price book item is no longer active.</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{Number(l.quantity)}</td>
                    {costs && <td className="py-1.5 text-right tabular-nums">{money(l.unit_cost)}</td>}
                    <td className="py-1.5 text-right tabular-nums">{money(l.unit_sell)}</td>
                    {costs && <td className="py-1.5 text-right tabular-nums">{money(l.total_cost)}</td>}
                    <td className="py-1.5 text-right tabular-nums">{money(l.total_sell)}</td>
                    {edit && (
                      <td className="py-1.5 pl-2">
                        <form action={saveFavouriteLineAction} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="back" value={here} />
                          <input type="hidden" name="lineId" value={l.id} />
                          <input name="quantity" defaultValue={Number(l.quantity)} aria-label="Quantity" className="w-14 rounded-md border border-black/10 px-1 py-0.5 text-right text-xs" />
                          {l.kind === "typed" && costs && (
                            <input name="unit_cost" defaultValue={l.typed_cost ?? ""} placeholder="cost" aria-label="Unit cost" className="w-16 rounded-md border border-black/10 px-1 py-0.5 text-right text-xs" />
                          )}
                          <input name="line_price" defaultValue={l.line_price ?? ""} placeholder="set price" aria-label="Set price (override)" title="Override line item pricing: blank uses the pricing order"
                            className="w-20 rounded-md border border-black/10 px-1 py-0.5 text-right text-xs" />
                          <button className="text-xs font-semibold text-aqua-deep">Save</button>
                        </form>
                        <form action={saveFavouriteLineAction}>
                          <input type="hidden" name="back" value={here} />
                          <input type="hidden" name="lineId" value={l.id} />
                          <input type="hidden" name="remove" value="1" />
                          <button className="text-xs text-red-700 underline">Remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
                {detail.lines.length === 0 && <tr><td colSpan={7} className="py-2 text-slate">No lines yet.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 font-semibold">
                  <td className="py-1.5">Totals{detail.fixed_price !== null && <span className="ml-1 text-xs font-normal text-slate">(fixed price {money(detail.fixed_price)} is what a quote shows)</span>}</td>
                  <td />
                  {costs && <td />}
                  <td />
                  {costs && <td className="py-1.5 text-right tabular-nums">{money(detail.cost)}</td>}
                  <td className="py-1.5 text-right tabular-nums">{money(detail.sell)}</td>
                  {edit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {edit && (
            <div className="space-y-2 rounded-xl bg-mist/50 p-3">
              <p className="text-xs font-semibold text-slate">Add a line item</p>
              <FavLineAdder favouriteId={detail.id} back={here} />
              <form action={saveFavouriteLineAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="back" value={here} />
                <input type="hidden" name="favouriteId" value={detail.id} />
                <div className="min-w-56 flex-1">
                  <label className={label} htmlFor="fl-desc">…or type one in</label>
                  <input id="fl-desc" name="description" required className={input} />
                </div>
                <div><label className={label} htmlFor="fl-qty">Qty</label><input id="fl-qty" name="quantity" defaultValue="1" className={`${input} w-20`} /></div>
                <div><label className={label} htmlFor="fl-unit">Unit</label><input id="fl-unit" name="unit" className={`${input} w-20`} /></div>
                {costs && <div><label className={label} htmlFor="fl-cost">Cost each</label><input id="fl-cost" name="unit_cost" inputMode="decimal" className={`${input} w-24`} /></div>}
                <div><label className={label} htmlFor="fl-price">Set price (optional)</label><input id="fl-price" name="line_price" inputMode="decimal" className={`${input} w-24`} /></div>
                <button className={quietBtn}>Add line</button>
              </form>
              <div className="flex flex-wrap gap-2 pt-2">
                <form action={copyFavouriteAction}>
                  <input type="hidden" name="back" value={here} />
                  <input type="hidden" name="favouriteId" value={detail.id} />
                  <button className={quietBtn}>Copy favourite</button>
                </form>
                <form action={saveFavouriteAction}>
                  <input type="hidden" name="back" value={here} />
                  <input type="hidden" name="favouriteId" value={detail.id} />
                  <input type="hidden" name="active" value={detail.active ? "false" : "true"} />
                  <button className={`${quietBtn} ${detail.active ? "bg-red-50 text-red-800" : ""}`}>{detail.active ? "Delete favourite" : "Restore favourite"}</button>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Deleted favourites and the Fergus import ───────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 text-sm">
          <h2 className="font-bold">Deleted favourites</h2>
          {deleted === "1" ? (
            <ul className="mt-2 space-y-1">
              {lib.favourites.filter((x) => !x.active).map((x) => (
                <li key={x.id}><Link href={url(x.folder_id, x.id, { deleted: "1" })} className="underline">{x.name}</Link></li>
              ))}
              {lib.favourites.filter((x) => !x.active).length === 0 && <li className="text-slate">None.</li>}
            </ul>
          ) : (
            <Link href={url(openId, detail?.id ?? null, { deleted: "1" })} className="mt-2 inline-block text-aqua-deep underline">Show deleted favourites</Link>
          )}
        </div>
        {edit && (
          <div className="rounded-2xl bg-white p-5">
            <h2 className="text-sm font-bold">Import favourites from Fergus (CSV)</h2>
            <div className="mt-2"><FavouritesImport /></div>
          </div>
        )}
      </section>
    </div>
  );
}
