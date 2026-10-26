"use client";
// Build extra work for a job from the price book (plus labour or anything else),
// then text the customer for approval, just like the plumber's "Extra work found".
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchMaterialsAction, sendExtraWorkAction } from "@/app/dashboard/price-book-actions";
import type { ExtraLine, Material } from "@/lib/office";

type Line = {
  key: string;
  itemId?: string;
  code?: string;
  description: string;
  quantity: number;
  unitPrice: number;   // excl GST
  cost?: number;
  kind: "materials" | "labour" | "other";
};

const $ = (n: number) => `$${n.toFixed(2)}`;
const input = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm";

export function ExtraWorkBuilder({ jobId, firstName, pending }: { jobId: string; firstName: string; pending: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Material[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchMaterialsAction(query);
      if (mine !== seq.current) return;
      setSearching(false);
      if (r.ok) setResults(r.data); else setMsg({ ok: false, text: r.error });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (m: Material) => {
    setLines((ls) => {
      const have = ls.find((l) => l.itemId === m.id);
      if (have) return ls.map((l) => (l === have ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: m.id, itemId: m.id, code: m.code, description: m.description, quantity: 1,
                       unitPrice: Number(m.sell), cost: Number(m.cost), kind: "materials" }];
    });
    setMsg(null);
  };
  const addOther = (kind: "labour" | "other") =>
    setLines((ls) => [...ls, { key: `${kind}-${Date.now()}`, description: kind === "labour" ? "Labour" : "", quantity: 1, unitPrice: 0, kind }]);
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const excl = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice * 100) / 100, 0);
  const cost = lines.reduce((s, l) => s + (l.cost ?? 0) * l.quantity, 0);
  const valid = lines.length > 0 && lines.every((l) => l.description.trim() && l.quantity > 0 && l.unitPrice > 0);

  async function send() {
    setBusy(true); setMsg(null);
    const payload: ExtraLine[] = lines.map((l) =>
      l.itemId
        ? { price_book_item_id: l.itemId, quantity: l.quantity, unit_price: l.unitPrice }
        : { description: l.description.trim(), quantity: l.quantity, unit_price: l.unitPrice, kind: l.kind },
    );
    const r = await sendExtraWorkAction(jobId, payload, note);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Sent to ${firstName}: ${r.data.items}, $${Number(r.data.total_incl_gst).toFixed(2)} incl GST. They reply YES to approve.` });
    setLines([]); setNote(""); setQ("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {pending && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          Extra work is already waiting for {firstName}&apos;s answer. You can send more once they reply or it runs out.
        </p>
      )}
      <div>
        <label htmlFor="job-materials-q" className="text-sm font-medium">Search the price books</label>
        <input
          id="job-materials-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Code or words, e.g. isolating valve 15"
          className="mt-1 w-full rounded-full border border-black/10 px-4 py-2 text-sm"
          autoComplete="off"
        />
        {q.trim().length >= 2 && (
          <ul className="mt-2 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10" aria-label="Search results">
            {searching && results.length === 0 && <li className="p-3 text-sm text-slate">Searching…</li>}
            {!searching && results.length === 0 && <li className="p-3 text-sm text-slate">Nothing matches.</li>}
            {results.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  {m.description}
                  <span className="block truncate font-mono text-xs text-slate">
                    {m.code} · {m.supplier}{m.unit && ` · ${m.unit}`} · cost {$(Number(m.cost))}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-right">{$(Number(m.sell))}<span className="block text-xs text-slate">excl GST</span></span>
                  <button type="button" onClick={() => add(m)} className="rounded-full bg-aqua px-3 py-1 text-xs font-semibold text-ink">
                    Add
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-slate">
              <tr>
                <th className="py-1 font-medium">Item</th>
                <th className="w-20 py-1 font-medium">Qty</th>
                <th className="w-28 py-1 font-medium">Each excl GST</th>
                <th className="w-24 py-1 text-right font-medium">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-black/5 align-top" data-line>
                  <td className="py-2 pr-2">
                    {l.itemId ? (
                      <>
                        {l.description}
                        <span className="block font-mono text-xs text-slate">{l.code} · cost {$(l.cost ?? 0)}</span>
                      </>
                    ) : (
                      <input
                        aria-label="Description"
                        value={l.description}
                        onChange={(e) => update(l.key, { description: e.target.value })}
                        placeholder={l.kind === "labour" ? "Labour" : "What it is"}
                        className={`${input} w-full`}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      aria-label="Quantity"
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                      className={`${input} w-20`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      aria-label="Price each excl GST"
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.unitPrice || ""}
                      onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })}
                      className={`${input} w-28`}
                    />
                  </td>
                  <td className="py-2 text-right">{$(l.quantity * l.unitPrice)}</td>
                  <td className="py-2 text-right">
                    <button type="button" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="px-2 text-slate hover:text-red-700">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => addOther("labour")} className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:border-ink">
          + Labour
        </button>
        <button type="button" onClick={() => addOther("other")} className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:border-ink">
          + Something not in the price book
        </button>
      </div>

      {lines.length > 0 && (
        <div className="space-y-3 rounded-xl bg-mist/60 p-4">
          <p className="text-sm">
            {firstName} will see <strong>{$(Math.round(excl * 115) / 100)} incl GST</strong> ({$(excl)} + GST)
            {cost > 0 && (
              <span className="text-slate"> · materials cost {$(cost)}</span>
            )}
          </p>
          <label className="block text-sm">
            <span className="font-medium">Note for the job (optional, not texted)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm" />
          </label>
          <button
            type="button"
            onClick={send}
            disabled={!valid || busy || pending}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : `Text ${firstName} for approval`}
          </button>
          {!valid && <p className="text-xs text-slate">Every line needs a description, quantity and price.</p>}
        </div>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-900"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
