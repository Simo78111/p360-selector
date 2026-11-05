"use client";
// Add or change a takeoff item: what it is (a favourite, a price book item or just a name), how it's measured
// (count / length / area), its group (= the quote section it goes to), colour, and the allowances: waste % and extra
// metres per run (both start at 0), plus optional labour per unit (e.g. 0.2 h Plumber per metre of pipe).
import { useEffect, useMemo, useState } from "react";
import { favouriteLibraryAction } from "@/app/dashboard/quote-actions";
import type { FavouriteLibrary, ItemHit } from "@/lib/quotes";
import { COLOURS, unitOf, type Takeoff, type TakeoffItem, type Tool } from "@/lib/takeoff-shared";
import { ItemSearch } from "../ItemSearch";
import { Modal } from "./TakeoffEditor";

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-slate";

export function ItemForm({ takeoff, item, onClose, onSave }: {
  takeoff: Takeoff; item: TakeoffItem | null; onClose: () => void; onSave: (changes: Record<string, unknown>) => Promise<boolean>;
}) {
  const used = new Set(takeoff.items.map((i) => i.colour));
  const [source, setSource] = useState<TakeoffItem["source"]>(item?.source ?? "favourite");
  const [favId, setFavId] = useState(item?.favourite_id ?? "");
  const [pb, setPb] = useState<{ id: string; code: string; description: string; unit: string | null } | null>(
    item?.price_book_item_id ? { id: item.price_book_item_id, code: item.code ?? "", description: item.name, unit: item.unit } : null);
  const [name, setName] = useState(item?.name ?? "");
  const [tool, setTool] = useState<Tool>(item?.tool ?? "count");
  const [group, setGroup] = useState(item?.group ?? (takeoff.groups.includes("Fixtures") ? "Fixtures" : takeoff.groups[0] ?? "Fixtures"));
  const [newGroup, setNewGroup] = useState("");
  const [colour, setColour] = useState(item?.colour ?? COLOURS.find((c) => !used.has(c)) ?? COLOURS[0]);
  const [unit, setUnit] = useState(item?.unit && item.unit !== unitOf(item.tool) ? item.unit : "");
  const [waste, setWaste] = useState(String(item?.waste_pct ?? 0));
  const [extra, setExtra] = useState(String(item?.extra_m_per_run ?? 0));
  const [labourId, setLabourId] = useState(item?.labour_item_id ?? "");
  const [hours, setHours] = useState(String(item?.labour_hours_per_unit ?? 0));
  const [lib, setLib] = useState<FavouriteLibrary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasMarks = (item?.marks ?? 0) > 0;

  useEffect(() => {
    favouriteLibraryAction().then(setLib).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  // favourites grouped by folder, the "Takeoff fixtures" folder first
  const favOptions = useMemo(() => {
    if (!lib) return [];
    const folders = new Map(lib.folders.map((f) => [f.id, f.name]));
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const f of lib.favourites.filter((x) => x.active)) {
      const g = (f.folder_id && folders.get(f.folder_id)) || "No folder";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ id: f.id, name: f.name });
    }
    return [...groups.entries()].sort((a, b) => (a[0] === "Takeoff fixtures" ? -1 : b[0] === "Takeoff fixtures" ? 1 : a[0].localeCompare(b[0])));
  }, [lib]);

  function pickFavourite(id: string) {
    setFavId(id);
    const f = lib?.favourites.find((x) => x.id === id);
    if (f && (!name || name === lib?.favourites.find((x) => x.id === favId)?.name)) setName(f.name);
    if (!hasMarks) setTool("count");
  }
  function pickItem(h: ItemHit) {
    setPb({ id: h.id, code: h.code, description: h.description, unit: h.unit });
    setName(h.description);
    if (!hasMarks) setTool(/^(m|metre|mtr|lm)$/i.test(h.unit ?? "") ? "length" : "count");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const g = group === "__new" ? newGroup.trim() : group;
    if (!g) return setErr("Name the new group.");
    if (source === "favourite" && !favId) return setErr("Pick a favourite.");
    if (source === "price_book" && !pb) return setErr("Search the price book and pick an item.");
    if (source === "typed" && !name.trim()) return setErr("Give it a name.");
    const changes: Record<string, unknown> = {
      name: name.trim() || undefined, tool, group: g, colour, unit: unit.trim(),
      waste_pct: waste || "0", extra_m_per_run: tool === "length" ? extra || "0" : "0",
      labour_item_id: labourId || null, labour_hours_per_unit: labourId ? hours || "0" : "0",
    };
    if (source === "favourite") changes.favourite_id = favId;
    else if (source === "price_book") changes.price_book_item_id = pb!.id;
    else if (item && item.source !== "typed") changes.favourite_id = null;   // switching to "just a name"
    if (item && hasMarks) delete changes.tool;
    setBusy(true);
    const ok = await onSave(changes);
    setBusy(false);
    if (!ok) setErr("Not saved: see the message at the top.");
  }

  return (
    <Modal title={item ? `Edit ${item.name}` : "Add an item to take off"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4 text-sm" data-testid="item-form">
        <fieldset>
          <legend className={label}>What is it?</legend>
          <div className="mt-1 flex gap-2">
            {([["favourite", "A favourite"], ["price_book", "A price book item"], ["typed", "Just a name"]] as const).map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${source === v ? "bg-ink text-white" : "bg-mist"}`}>
                <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v)} className="sr-only" />{l}
              </label>
            ))}
          </div>
        </fieldset>

        {source === "favourite" && (
          <div>
            <label className={label} htmlFor="tk-fav">Favourite</label>
            <select id="tk-fav" className={field} value={favId} onChange={(e) => pickFavourite(e.target.value)}>
              <option value="">{lib ? "Pick a favourite…" : "Loading favourites…"}</option>
              {favOptions.map(([g, fs]) => (
                <optgroup key={g} label={g}>
                  {fs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate">Each one counted brings in the favourite&apos;s lines (e.g. 1st-fix fittings and plumber hours) when it&apos;s sent to the quote.</p>
          </div>
        )}
        {source === "price_book" && (
          <div>
            <span className={label}>Price book item</span>
            <div className="mt-1 flex"><ItemSearch onPick={pickItem} id="tk-item-search" /></div>
            {pb && <p className="mt-1 text-xs">Picked: <strong>{pb.code}</strong> {pb.description}{pb.unit ? ` (per ${pb.unit})` : ""}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="tk-name">Name on the takeoff and quote</label>
            <input id="tk-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={200}
              placeholder={source === "typed" ? "e.g. DN100 PVC drainage" : "Uses the item's name if left empty"} />
          </div>
          <div>
            <span className={label}>Measured by</span>
            <div className="mt-1 flex gap-1">
              {(["count", "length", "area"] as const).map((v) => (
                <button key={v} type="button" disabled={hasMarks && v !== tool} onClick={() => setTool(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${tool === v ? "bg-ink text-white" : "bg-mist"}`}>
                  {v === "count" ? "Count (ea)" : v === "length" ? "Length (m)" : "Area (m²)"}
                </button>
              ))}
            </div>
            {hasMarks && <p className="mt-1 text-xs text-slate">It has marks, so this can&apos;t change.</p>}
          </div>
          <div>
            <label className={label} htmlFor="tk-group">Group (the quote section it goes to)</label>
            <select id="tk-group" className={field} value={group} onChange={(e) => setGroup(e.target.value)}>
              {takeoff.groups.map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="__new">New group…</option>
            </select>
            {group === "__new" && <input aria-label="New group name" className={`${field} mt-1`} value={newGroup} maxLength={60}
              onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Gas" />}
          </div>
          <div>
            <span className={label}>Colour</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {COLOURS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={colour === c} onClick={() => setColour(c)}
                  className={`h-6 w-6 rounded-full border-2 ${colour === c ? "border-ink" : "border-white"}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className={label} htmlFor="tk-unit">Unit (optional)</label>
            <input id="tk-unit" className={field} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder={unitOf(tool)} />
          </div>
          {tool !== "count" && (
            <div>
              <label className={label} htmlFor="tk-waste">Waste %</label>
              <input id="tk-waste" className={field} inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} />
            </div>
          )}
          {tool === "length" && (
            <div>
              <label className={label} htmlFor="tk-extra">Extra metres per run (rises and drops)</label>
              <input id="tk-extra" className={field} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
          )}
          <div>
            <label className={label} htmlFor="tk-labour">Labour per {unitOf(tool, unit)} (optional)</label>
            <select id="tk-labour" className={field} value={labourId} onChange={(e) => setLabourId(e.target.value)}>
              <option value="">None{source === "favourite" ? " (the favourite has its own)" : ""}</option>
              {takeoff.labour_rates.map((r) => <option key={r.id} value={r.id}>{r.description}</option>)}
            </select>
          </div>
          {labourId && (
            <div>
              <label className={label} htmlFor="tk-hours">Hours per {unitOf(tool, unit)}</label>
              <input id="tk-hours" className={field} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          )}
        </div>

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full bg-mist px-4 py-2 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : item ? "Save" : "Add item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
