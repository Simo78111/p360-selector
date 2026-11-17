"use client";
// Google address search (17 Nov 2026): type an address or a place name, pick it from Google's list, and the
// site fields fill themselves in. SiteFields is the whole site block (search + street, suburb, city, postcode,
// site name, access notes, map position) for any form that adds or edits a site.
import { useEffect, useRef, useState } from "react";
import type { PickedAddress, PlaceSuggestion } from "@/lib/places-shared";
import { useAutoSave } from "./AutoSaveForm";

const fieldCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-semibold text-slate";
const newToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function AddressSearch({ onPick, id, autoFocus, placeholder }: {
  onPick: (a: PickedAddress) => void; id?: string; autoFocus?: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const token = useRef(newToken());
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setList([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/office/places?q=${encodeURIComponent(text)}&s=${token.current}`);
        const j = (await r.json()) as { suggestions?: PlaceSuggestion[]; error?: string };
        if (n !== seq.current) return;
        if (!r.ok) throw new Error(j.error ?? "Google didn't answer.");
        setErr(null);
        setList(j.suggestions ?? []);
        setHi(0);
        setOpen(true);
      } catch (e) {
        if (n === seq.current) setErr(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    setBusy(true);
    try {
      const r = await fetch(`/api/office/places?id=${encodeURIComponent(s.id)}&s=${token.current}`);
      const j = (await r.json()) as { address?: PickedAddress; error?: string };
      if (!r.ok || !j.address) throw new Error(j.error ?? "Google didn't answer.");
      onPick(j.address);
      setQ("");
      setList([]);
      setErr(null);
      token.current = newToken(); // one Google "session" per address picked
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => list.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || list.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); void pick(list[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder ?? "Start typing the address or place name…"}
        aria-label="Search Google for the address"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? "addr"}-list`}
        aria-autocomplete="list"
        className={`${fieldCls} pl-9`}
        data-testid="address-search"
      />
      <span aria-hidden className="pointer-events-none absolute top-2 left-3 text-slate-400">⌕</span>
      {busy && <span className="absolute top-2 right-3 text-xs text-slate">Filling in…</span>}
      {open && list.length > 0 && (
        <ul id={`${id ?? "addr"}-list`} role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" data-testid="address-suggestions">
          {list.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                onMouseEnter={() => setHi(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === hi ? "bg-sky-50" : ""}`}
              >
                <span className="font-semibold">{s.main}</span>
                {s.secondary && <span className="text-slate"> · {s.secondary}</span>}
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-right text-[10px] text-slate-400">powered by Google</li>
        </ul>
      )}
      {err && <p className="mt-1 text-xs text-amber-800">{err} You can type the address in the boxes below instead.</p>}
    </div>
  );
}

export type SiteValues = {
  site_name?: string | null; address_line?: string | null; suburb?: string | null; city?: string | null;
  postcode?: string | null; access_notes?: string | null; lat?: number | null; lng?: number | null;
};

/**
 * A site's fields with Google search on top. Inputs carry the usual names (site_name, address_line, suburb,
 * city, postcode, access_notes, lat, lng), optionally with a prefix (e.g. "site_" in the new job form).
 * onFilled: called after Google fills the fields in (inside an AutoSaveForm it saves straight away by itself).
 */
export function SiteFields({ site, prefix = "", idPrefix = "site-", required = false, showAccess = true, onFilled, autoFocus }: {
  site?: SiteValues; prefix?: string; idPrefix?: string; required?: boolean; showAccess?: boolean;
  onFilled?: () => void; autoFocus?: boolean;
}) {
  const [v, setV] = useState({
    site_name: site?.site_name ?? "",
    address_line: site?.address_line ?? "",
    suburb: site?.suburb ?? "",
    city: site?.city ?? "Auckland",
    postcode: site?.postcode ?? "",
    access_notes: site?.access_notes ?? "",
    lat: site?.lat == null ? "" : String(site.lat),
    lng: site?.lng == null ? "" : String(site.lng),
  });
  const filled = useRef(false);
  const auto = useAutoSave();
  useEffect(() => {
    if (filled.current) {
      filled.current = false;
      (onFilled ?? auto?.saveNow)?.();
    }
  }, [v, onFilled, auto]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    // typing over the street means Google's map position may no longer match: drop it (it's looked up on save)
    setV((o) => ({ ...o, [k]: e.target.value, ...(k === "address_line" || k === "suburb" ? { lat: "", lng: "" } : {}) }));
  const box = (k: keyof typeof v, text: string, opts: { req?: boolean; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <label className={labelCls} htmlFor={`${idPrefix}${k}`}>{text}</label>
      <input id={`${idPrefix}${k}`} name={`${prefix}${k}`} value={v[k]} onChange={set(k)} required={opts.req} className={fieldCls} />
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="site-fields">
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls} htmlFor={`${idPrefix}search`}>Find the address (Google)</label>
        <AddressSearch
          id={`${idPrefix}search`}
          autoFocus={autoFocus}
          onPick={(a) => {
            filled.current = true;
            setV((o) => ({
              ...o,
              address_line: a.address_line,
              suburb: a.suburb,
              city: a.city || o.city,
              postcode: a.postcode,
              lat: a.lat == null ? "" : String(a.lat),
              lng: a.lng == null ? "" : String(a.lng),
              site_name: o.site_name || a.site_name,
            }));
          }}
        />
      </div>
      {box("address_line", "Street address", { req: required })}
      {box("suburb", "Suburb")}
      {box("city", "City")}
      {box("postcode", "Postcode")}
      {box("site_name", "Site name (optional)")}
      {showAccess && box("access_notes", "Access notes")}
      <input type="hidden" name={`${prefix}lat`} value={v.lat} />
      <input type="hidden" name={`${prefix}lng`} value={v.lng} />
      {v.lat && <p className="text-xs text-emerald-700 sm:col-span-2 lg:col-span-3">✓ On the map</p>}
    </div>
  );
}
