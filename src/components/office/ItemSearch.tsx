"use client";
// Price book search ("Add a line item"): type two or more letters, pick a result. Labour rates come first.
import { useEffect, useRef, useState } from "react";
import { itemSearchAction } from "@/app/dashboard/quote-actions";
import type { ItemHit } from "@/lib/quotes";

const money = (n: number | undefined) => (n === undefined ? "" : `$${Number(n).toFixed(2)}`);

export function ItemSearch({ onPick, placeholder = "Search the price book (code or name)…", id, autoFocus = false }: {
  onPick: (item: ItemHit) => void; placeholder?: string; id?: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await itemSearchAction(term);
        if (n === seq.current) {
          setHits(r);
          setErr(null);
        }
      } catch (e) {
        if (n === seq.current) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative min-w-64 flex-1" data-testid="item-search">
      <label className="sr-only" htmlFor={id ?? "item-search"}>Price book search</label>
      <input
        id={id ?? "item-search"}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            e.preventDefault();
            onPick(hits[0]);
            setQ("");
            setHits([]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={`${id ?? "item-search"}-list`}
        className="w-full rounded-full border border-black/10 bg-white px-3 py-2 text-sm"
      />
      {open && q.trim().length >= 2 && (
        <ul
          id={`${id ?? "item-search"}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-2xl border border-black/10 bg-white py-1 text-sm shadow-lg"
        >
          {busy && hits.length === 0 && <li className="px-3 py-2 text-slate">Searching…</li>}
          {err && <li className="px-3 py-2 text-red-700">{err}</li>}
          {!busy && !err && hits.length === 0 && <li className="px-3 py-2 text-slate">Nothing found. Type the line in instead.</li>}
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(h);
                  setQ("");
                  setHits([]);
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-mist"
              >
                <span>
                  {h.kind === "labour" && <span className="mr-1 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-900">LABOUR</span>}
                  <span className="font-semibold">{h.code}</span> {h.description}
                  <span className="text-xs text-slate"> · {h.kind === "labour" ? "per hour" : [h.unit, h.brand, h.supplier].filter(Boolean).join(" · ")}</span>
                </span>
                {h.cost !== undefined && <span className="shrink-0 text-xs text-slate">cost {money(h.cost)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
