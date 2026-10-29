"use client";
// Fergus import: pick the company and the kind of export, choose the CSV, check first (nothing is
// saved), then import. Big files go in chunks so they don't hit upload limits.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fergusImportAction } from "@/app/dashboard/jm-actions";
import { guessKind, KIND_LABEL, readFergusCsv, type ImportKind, type Parsed } from "@/lib/fergus-import";
import { parseCsv } from "@/lib/csv";
import type { ImportResult } from "@/lib/jm";

const CHUNK = 1000;
const ORDER: ImportKind[] = ["customers", "sites", "contacts", "tier_prices"];

export function FergusImport({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[companies.length - 1]?.id ?? "");
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [kind, setKind] = useState<ImportKind>("customers");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parsed: Parsed | null = text ? readFergusCsv(kind, text) : null;

  async function onFile(file: File | undefined) {
    setError(null); setResult(null); setText(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError("That's an Excel file. Open it in Excel and use File → Save As → CSV, then choose the CSV here.");
      return;
    }
    const t = await file.text();
    setFileName(file.name);
    setKind(guessKind(parseCsv(t)[0] ?? []));
    setText(t);
  }

  async function go(dryRun: boolean) {
    if (!parsed) return;
    setError(null); setResult(null);
    const total: ImportResult = { kind, rows: 0, added: 0, updated: 0, skipped: 0, dry_run: dryRun, problems: [] };
    // check-first runs the whole file in one go (so it sees rows that depend on each other)
    const chunks = dryRun ? [parsed.rows] : Array.from({ length: Math.ceil(parsed.rows.length / CHUNK) }, (_, i) => parsed.rows.slice(i * CHUNK, (i + 1) * CHUNK));
    for (const [i, rows] of chunks.entries()) {
      setBusy(dryRun ? "Checking…" : `Importing ${Math.min((i + 1) * CHUNK, parsed.rows.length)} of ${parsed.rows.length}…`);
      const r = await fergusImportAction(companyId, kind, rows, dryRun, fileName);
      if (!r.ok) { setError(r.error); setBusy(null); return; }
      total.rows += r.result.rows; total.added += r.result.added; total.updated += r.result.updated; total.skipped += r.result.skipped;
      total.problems.push(...r.result.problems.map((p) => ({ ...p, row: p.row !== undefined ? p.row + i * CHUNK : undefined })));
    }
    setBusy(null);
    setResult(total);
    if (!dryRun) router.refresh();
  }

  const company = companies.find((c) => c.id === companyId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs font-semibold text-slate" htmlFor="fi-company">Into</label>
          <select id="fi-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setResult(null); }} className="rounded-full border border-black/10 bg-white px-3 py-2">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate" htmlFor="fi-file">Fergus CSV export</label>
          <input id="fi-file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        </div>
        {text && (
          <div>
            <label className="block text-xs font-semibold text-slate" htmlFor="fi-kind">It&apos;s a list of</label>
            <select id="fi-kind" value={kind} onChange={(e) => { setKind(e.target.value as ImportKind); setResult(null); }} className="rounded-full border border-black/10 bg-white px-3 py-2">
              {ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {parsed && (
        <div className="rounded-2xl bg-mist/40 p-4 text-sm">
          <p><strong>{parsed.rows.length}</strong> rows in {fileName}. Columns found:{" "}
            {Object.keys(parsed.map).map((f) => <code key={f} className="mr-1 rounded bg-white px-1">{f}</code>)}
          </p>
          {parsed.missing.length > 0 ? (
            <p className="mt-2 text-red-800" role="alert">Can&apos;t import: no column for {parsed.missing.join("; ")}. Check this is a {KIND_LABEL[kind].toLowerCase()} export.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={!!busy} onClick={() => go(true)} className="rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-black/10 disabled:opacity-50">Check first</button>
              <button disabled={!!busy} onClick={() => go(false)} className="rounded-full bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50">
                Import into {company?.name}
              </button>
              {busy && <span className="self-center text-slate" role="status">{busy}</span>}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`rounded-2xl p-4 text-sm ${result.dry_run ? "bg-sky-50" : "bg-emerald-50"}`} role="status">
          <p className="font-semibold">
            {result.dry_run ? "Check only, nothing saved: " : "Imported: "}
            {result.added} new · {result.updated} updated · {result.skipped} skipped · {result.problems.length} to look at
          </p>
          {result.problems.length > 0 && (
            <ul className="mt-2 max-h-72 list-disc space-y-0.5 overflow-auto pl-5">
              {result.problems.slice(0, 300).map((p, i) => (
                <li key={i}>{p.row !== undefined && `Row ${p.row + 1}: `}{p.name && <strong>{p.name}: </strong>}{p.problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
