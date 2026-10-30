"use client";
// Fergus favourites import: choose the CSV, check first (nothing is saved), then import. One row per line of a
// favourite. Recognised columns (any case; first match wins) are listed in COLUMNS below.
// ⚠️ Fergus's real favourites export hasn't been seen yet: these names are a guess. Check against the real file.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { importFavouritesAction } from "@/app/dashboard/quote-actions";
import { parseCsv } from "@/lib/csv";
import type { ImportReport } from "@/lib/quotes";

const COLUMNS: Record<string, string[]> = {
  folder: ["folder", "folder path", "category", "group", "path"],
  favourite: ["favourite", "favorite", "favourite name", "favorite name", "section", "section name", "name"],
  description: ["description", "section description", "favourite description", "notes"],
  fixed_price: ["fixed price", "fixture price", "section price", "price override", "fixed"],
  item_code: ["item code", "product code", "code", "sku", "part number"],
  item_name: ["item name", "item", "product name", "product", "line item", "line description"],
  quantity: ["quantity", "qty"],
  unit_cost: ["unit cost", "cost", "cost price"],
  unit_price: ["unit sell", "unit price", "sell", "sell price", "line price"],
};

function mapRows(text: string): { rows: Record<string, string>[]; found: string[]; missing: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return { rows: [], found: [], missing: ["favourite"] };
  const head = grid[0].map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLUMNS)) {
    const i = names.map((n) => head.indexOf(n)).find((x) => x >= 0);
    if (i !== undefined && !Object.values(idx).includes(i)) idx[k] = i;
  }
  const rows = grid.slice(1).map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, (r[i] ?? "").trim()])));
  return { rows, found: Object.keys(idx), missing: ["favourite"].filter((k) => !(k in idx)) };
}

export function FavouritesImport() {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const mapped = text ? mapRows(text) : null;

  async function go(dryRun: boolean) {
    if (!mapped) return;
    setBusy(dryRun ? "Checking…" : "Importing…");
    setErr(null);
    const r = await importFavouritesAction(mapped.rows, dryRun);
    setBusy(null);
    if (!r.ok) setErr(r.error);
    else {
      setReport(r.report);
      if (!dryRun) router.refresh();
    }
  }

  return (
    <div className="space-y-3 text-sm" data-testid="favourites-import">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Fergus favourites CSV"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          setReport(null);
          setErr(null);
          if (!f) return;
          if (/\.xlsx?$/i.test(f.name)) {
            setErr("That's an Excel file. Save it as CSV first (File → Save As → CSV).");
            return;
          }
          setName(f.name);
          setText(await f.text());
        }}
      />
      {mapped && (
        <p className="text-xs text-slate">
          {name}: {mapped.rows.length} rows. Columns found: {mapped.found.join(", ") || "none"}.
          {mapped.missing.length > 0 && <strong className="text-red-700"> Needs a favourite name column.</strong>}
        </p>
      )}
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!mapped || mapped.missing.length > 0 || !!busy} onClick={() => go(true)}
          className="rounded-full bg-mist px-4 py-2 font-semibold disabled:opacity-50">Check first</button>
        <button type="button" disabled={!report?.dry_run || !!busy} onClick={() => go(false)}
          className="rounded-full bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50">Import</button>
        {busy && <span className="self-center text-slate">{busy}</span>}
      </div>
      {report && (
        <div role="status" className={`rounded-xl p-3 ${report.dry_run ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
          <p className="font-semibold">
            {report.dry_run ? "Check only, nothing saved: " : "Imported: "}
            {report.rows} rows → {report.folders} new folders, {report.favourites} new favourites, {report.lines} lines.
            {report.dry_run && " Press Import to save it."}
          </p>
          {report.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {report.problems.slice(0, 50).map((p, i) => <li key={i}>Row {p.row + 1}: {p.problem}</li>)}
              {report.problems.length > 50 && <li>…and {report.problems.length - 50} more</li>}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-slate">
        One row per line of a favourite. Columns it looks for: Folder (e.g. &quot;Drainlaying &gt; Pipe&quot;), Favourite, Description, Fixed price,
        Item code, Item name, Quantity, Unit cost, Unit price. A favourite with the same name in the same folder is replaced, so importing again updates it.
        Item codes found in the price book are linked (labour codes PB/GF too); others come in as typed lines.
      </p>
    </div>
  );
}
