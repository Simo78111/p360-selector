"use client";
// Monthly price book upload: read the CSV here in the browser, match the columns, check a
// preview, then send it to the engine in chunks (so big files don't hit upload limits).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { beginUploadAction, finishUploadAction, uploadRowsAction } from "@/app/dashboard/price-book-actions";
import { fieldLabels, guessColumns, parseCsv, rowCost, type Field } from "@/lib/csv";

const CHUNK = 1500;
const field = "w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm";

type Parsed = { file: string; rows: string[][]; headerRow: number; map: Partial<Record<Field, number>> };
type Done = { supplier: string; rows: number; added: number; changed: number; went_up: number; removed: number; skipped: number };

export function PriceBookUpload({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(suppliers[0]?.name ?? "");
  const [newSupplier, setNewSupplier] = useState(suppliers.length === 0);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [includesGst, setIncludesGst] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function onFile(file: File | undefined) {
    setError(null); setDone(null); setParsed(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError("That's an Excel file. Open it in Excel and use File → Save As → CSV, then choose the CSV here.");
      return;
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { setError("That file looks empty."); return; }
    const g = guessColumns(rows);
    setParsed({ file: file.name, rows, headerRow: g.headerRow, map: g.map });
    const base = file.name.replace(/\.(csv|txt)$/i, "");
    if (newSupplier && !supplier) setSupplier(base.split(/[\s_-]/)[0] ?? "");
  }

  const headers = parsed ? parsed.rows[parsed.headerRow] : [];
  const body = useMemo(() => (parsed ? parsed.rows.slice(parsed.headerRow + 1) : []), [parsed]);
  const ready = !!parsed && parsed.map.code !== undefined && parsed.map.description !== undefined && parsed.map.cost !== undefined;

  const items = useMemo(() => {
    if (!ready || !parsed) return [];
    const m = parsed.map;
    return body
      .map((r) => ({
        code: r[m.code!] ?? "",
        description: r[m.description!] ?? "",
        unit: m.unit !== undefined ? r[m.unit] : undefined,
        brand: m.brand !== undefined ? r[m.brand] : undefined,
        cost: rowCost(r, m, includesGst),
      }))
      .filter((x): x is typeof x & { cost: number } => x.code !== "" && x.description !== "" && x.cost !== null);
  }, [ready, parsed, body, includesGst]);

  function setCol(f: Field, v: string) {
    if (!parsed) return;
    const map = { ...parsed.map };
    if (v === "") delete map[f]; else map[f] = Number(v);
    setParsed({ ...parsed, map });
  }

  async function upload() {
    if (!parsed || !items.length) return;
    const name = supplier.trim();
    if (!name) { setError("Say which supplier this is from."); return; }
    setError(null); setProgress(0);
    const begin = await beginUploadAction(name, parsed.file);
    if (!begin.ok) { setError(begin.error); setProgress(null); return; }
    let skipped = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const r = await uploadRowsAction(begin.data.upload_id, items.slice(i, i + CHUNK));
      if (!r.ok) {
        setError(`Stopped part way: ${r.error}. Nothing was switched off; upload the file again.`);
        setProgress(null);
        return;
      }
      skipped += r.data.skipped;
      setProgress(Math.min(1, (i + CHUNK) / items.length));
    }
    const fin = await finishUploadAction(begin.data.upload_id);
    setProgress(null);
    if (!fin.ok) { setError(fin.error); return; }
    setDone({ supplier: fin.data.supplier, rows: fin.data.rows_in, added: fin.data.added, changed: fin.data.changed,
              went_up: fin.data.went_up, removed: fin.data.removed, skipped: body.length - items.length + skipped });
    setParsed(null);
    router.refresh();
  }

  const busy = progress !== null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Supplier</span>
          {newSupplier ? (
            <input id="pb-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Mico" className={field} />
          ) : (
            <select id="pb-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={field}>
              {suppliers.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={() => { setNewSupplier(!newSupplier); setSupplier(newSupplier ? suppliers[0]?.name ?? "" : ""); }}
            className="mt-1 text-xs font-medium text-aqua-deep hover:underline"
            hidden={suppliers.length === 0}
          >
            {newSupplier ? "Pick an existing supplier" : "+ New supplier"}
          </button>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">This month&apos;s price book (CSV)</span>
          <input
            id="pb-file"
            type="file"
            accept=".csv,.txt,text/csv,.xlsx,.xls"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {done && (
        <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">{done.supplier} price book updated: {done.rows.toLocaleString()} items.</p>
          <p className="mt-1">
            {done.added.toLocaleString()} new · {done.changed.toLocaleString()} price changes ({done.went_up.toLocaleString()} went up) ·{" "}
            {done.removed.toLocaleString()} no longer listed (switched off)
            {done.skipped > 0 && ` · ${done.skipped.toLocaleString()} rows skipped (no code, description or price)`}
          </p>
        </div>
      )}

      {parsed && (
        <div className="space-y-4 rounded-2xl bg-mist/60 p-4">
          <p className="text-sm">
            <strong>{parsed.file}</strong>: {body.length.toLocaleString()} rows. Check the columns are right, then upload.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(Object.keys(fieldLabels) as Field[]).map((f) => (
              <label key={f} className="text-sm">
                <span className="mb-1 block font-medium">
                  {fieldLabels[f].label}
                  {fieldLabels[f].required && <span className="text-red-700"> *</span>}
                </span>
                <select
                  id={`col-${f}`}
                  value={parsed.map[f] ?? ""}
                  onChange={(e) => setCol(f, e.target.value)}
                  className={field}
                >
                  <option value="">{fieldLabels[f].required ? "Choose a column" : "Not in this file"}</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
                {fieldLabels[f].help && <span className="mt-1 block text-xs text-slate">{fieldLabels[f].help}</span>}
              </label>
            ))}
            <label className="flex items-center gap-2 self-center text-sm">
              <input id="pb-gst" type="checkbox" checked={includesGst} onChange={(e) => setIncludesGst(e.target.checked)} className="h-4 w-4" />
              Prices in this file include GST
            </label>
          </div>

          {ready ? (
            <>
              <div className="overflow-x-auto rounded-xl bg-white">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-mist text-slate">
                    <tr>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Unit</th>
                      <th className="px-3 py-2 text-right font-medium">Cost excl GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 6).map((x, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="px-3 py-2 font-mono text-xs">{x.code}</td>
                        <td className="px-3 py-2">{x.description}</td>
                        <td className="px-3 py-2">{x.unit}</td>
                        <td className="px-3 py-2 text-right">${x.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={upload}
                  disabled={busy || items.length === 0}
                  className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : `Upload ${items.length.toLocaleString()} items`}
                </button>
                <span className="text-xs text-slate">
                  {body.length - items.length > 0 && `${(body.length - items.length).toLocaleString()} rows have no code, description or price and will be skipped. `}
                  Items in last month&apos;s book that aren&apos;t in this one are switched off.
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-900">Choose the code, description and price columns.</p>
          )}
        </div>
      )}
    </div>
  );
}
