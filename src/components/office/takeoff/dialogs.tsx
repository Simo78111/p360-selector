"use client";
// The scale dialog (per page: from a ratio and sheet size, by calibrating two points, or checking a dimension) and the
// send-to-quote dialog (pick a draft quote or start a new one; each group goes to the section of the same name).
import { useState } from "react";
import type { ScaleChange } from "@/lib/takeoff";
import { RATIOS, SHEETS, fmtQty, runLength, scaleText, unitOf, type Pt, type Takeoff, type TakeoffPage } from "@/lib/takeoff-shared";
import { Modal, type Totals } from "./TakeoffEditor";

const field = "rounded-lg border border-black/15 bg-white px-3 py-2 text-sm";
const primary = "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "rounded-full bg-mist px-4 py-2 text-sm font-semibold";

export function ScaleDialog({ page, hints, points, mode, onClose, onCalibrateStart, onSave }: {
  page: TakeoffPage; hints: { ratios: number[]; sheet: TakeoffPage["sheet"] }; points: Pt[] | null; mode: string;
  onClose: () => void; onCalibrateStart: () => void; onSave: (change: ScaleChange, message: string) => Promise<boolean>;
}) {
  const [ratio, setRatio] = useState(String(page.ratio ?? hints.ratios.find((r) => r === 50 || r === 100) ?? hints.ratios[0] ?? 50));
  const [sheet, setSheet] = useState<string>(page.sheet ?? hints.sheet ?? "A1");
  const [mm, setMm] = useState("");
  const [labelText, setLabelText] = useState(page.label ?? "");
  const [busy, setBusy] = useState(false);
  const two = points && points.length === 2 ? (points as [Pt, Pt]) : null;
  const go = async (c: ScaleChange, m: string) => {
    setBusy(true);
    await onSave(c, m);
    setBusy(false);
  };

  // two points clicked to calibrate: type the real length
  if (two && mode === "calibrate") {
    return (
      <Modal title={`Calibrate page ${page.page_no}`} onClose={onClose}>
        <form className="space-y-3 text-sm" onSubmit={(e) => {
          e.preventDefault();
          void go({ method: "calibrated", a: two[0], b: two[1], mm: Number(mm) }, `Page ${page.page_no} calibrated`);
        }}>
          <p>What&apos;s the real length between the two points you clicked? Use the scale bar or a dimension written on the drawing.</p>
          <label className="block">
            <span className="text-xs font-semibold text-slate">Real length in millimetres</span>
            <input autoFocus required inputMode="decimal" className={`${field} mt-1 w-full`} value={mm} onChange={(e) => setMm(e.target.value)}
              placeholder="e.g. 5000 for 5 m" data-testid="calib-mm" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={onCalibrateStart}>Click again</button>
            <button type="submit" className={primary} disabled={busy || !(Number(mm) > 0)}>Set scale</button>
          </div>
        </form>
      </Modal>
    );
  }

  // two points clicked to check a dimension
  if (two && mode === "check" && page.mm_per_unit) {
    const measured = runLength(two) * page.mm_per_unit;
    return (
      <Modal title={`Check page ${page.page_no}'s scale`} onClose={onClose}>
        <div className="space-y-3 text-sm">
          <p>That measures <strong data-testid="check-measured">{(measured / 1000).toFixed(2)} m ({Math.round(measured).toLocaleString("en-NZ")} mm)</strong> at {scaleText(page)}.
            Does it match the dimension written on the drawing?</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={onCalibrateStart}>No: calibrate instead</button>
            <button type="button" className={primary} disabled={busy} onClick={() => void go({ checked: true }, `Page ${page.page_no}'s scale checked`)}>
              Yes, it matches
            </button>
          </div>
          <form className="flex items-end gap-2 border-t border-black/10 pt-3" onSubmit={(e) => {
            e.preventDefault();
            void go({ method: "calibrated", a: two[0], b: two[1], mm: Number(mm) }, `Page ${page.page_no} calibrated from that dimension`);
          }}>
            <label className="flex-1">
              <span className="text-xs font-semibold text-slate">Or type what it should be (mm) to calibrate from it</span>
              <input inputMode="decimal" className={`${field} mt-1 w-full`} value={mm} onChange={(e) => setMm(e.target.value)} />
            </label>
            <button type="submit" className={secondary} disabled={busy || !(Number(mm) > 0)}>Calibrate</button>
          </form>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Scale for page ${page.page_no}${page.label ? ` · ${page.label}` : ""}`} onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="scale-dialog">
        <p>Now: <strong>{scaleText(page)}</strong>{page.mm_per_unit ? (page.checked ? " · checked" : " · not checked yet") : ""}.
          Each page has its own scale; a page with a detail at a different scale is best calibrated on the part you measure.</p>
        {hints.ratios.length > 0 && (
          <p className="rounded-lg bg-aqua-pale/50 px-3 py-2 text-xs">
            Written on this page: {hints.ratios.map((r) => `1:${r}`).join(" · ")}{hints.sheet ? ` (for ${hints.sheet})` : ""}. The drawings say to scale with caution, so check a dimension after.
          </p>
        )}
        <form className="space-y-2 rounded-xl border border-black/10 p-3" onSubmit={(e) => {
          e.preventDefault();
          void go({ method: "ratio", ratio: Number(ratio), sheet }, `Page ${page.page_no} set to 1:${ratio} @ ${sheet}`);
        }}>
          <p className="font-semibold">From the ratio</p>
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="block text-xs font-semibold text-slate">Scale 1:</span>
              <input list="tk-ratios" inputMode="decimal" className={`${field} w-24`} value={ratio} onChange={(e) => setRatio(e.target.value)} data-testid="ratio" />
              <datalist id="tk-ratios">{[...new Set([...hints.ratios, ...RATIOS])].map((r) => <option key={r} value={r} />)}</datalist>
            </label>
            <label>
              <span className="block text-xs font-semibold text-slate">at sheet size</span>
              <select className={field} value={sheet} onChange={(e) => setSheet(e.target.value)} data-testid="sheet">
                {SHEETS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <button type="submit" className={primary} disabled={busy || !(Number(ratio) > 0)}>Use 1:{ratio || "?"} @ {sheet}</button>
          </div>
          {hints.ratios.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {hints.ratios.map((r) => (
                <button key={r} type="button" onClick={() => setRatio(String(r))} className="rounded-full bg-mist px-2 py-0.5 text-xs">1:{r}</button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate">The sheet size is the one the scale is written for (these drawings: &quot;scales shown are for an A1&quot;), even if the PDF was printed smaller.</p>
        </form>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 p-3">
          <div>
            <p className="font-semibold">Calibrate</p>
            <p className="text-xs text-slate">Click both ends of the scale bar or a known dimension, then type its real length. Most accurate.</p>
          </div>
          <button type="button" className={secondary} onClick={onCalibrateStart} data-testid="calibrate">Click two points</button>
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          void go({ label: labelText }, "Page name saved");
        }}>
          <label className="flex-1">
            <span className="text-xs font-semibold text-slate">Page name</span>
            <input className={`${field} mt-1 w-full`} value={labelText} maxLength={120} onChange={(e) => setLabelText(e.target.value)} placeholder="e.g. H-110 Sanitary" />
          </label>
          <button type="submit" className={secondary} disabled={busy}>Save name</button>
        </form>
      </div>
    </Modal>
  );
}

export function SendToQuote({ takeoff, totals, onClose, onSend }: {
  takeoff: Takeoff; totals: Totals; onClose: () => void; onSend: (versionId: string | null) => Promise<string | null>;
}) {
  const drafts = takeoff.quotes.filter((q) => q.status === "draft" && q.quote_status === "open");
  const locked = takeoff.quotes.filter((q) => q.status === "published");
  const [pick, setPick] = useState<string>(drafts.find((q) => q.from_takeoff)?.version_id ?? drafts[0]?.version_id ?? "new");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const measured = takeoff.items.filter((i) => (totals.get(i.id)?.quantity ?? 0) > 0);
  const groups = takeoff.groups.filter((g) => measured.some((i) => i.group === g));
  const unscaled = takeoff.items.reduce((s, i) => s + (totals.get(i.id)?.unscaled ?? 0), 0);
  const chosen = drafts.find((q) => q.version_id === pick);

  return (
    <Modal title="Send the takeoff to a quote" onClose={onClose} wide>
      <div className="space-y-4 text-sm" data-testid="send-to-quote-dialog">
        <div>
          <p className="font-semibold">What goes where</p>
          <ul className="mt-1 space-y-1">
            {groups.map((g) => (
              <li key={g} className="rounded-lg bg-mist px-3 py-1.5">
                <strong>{g}</strong> section: {measured.filter((i) => i.group === g).map((i) =>
                  `${i.name} ${fmtQty(totals.get(i.id)!.quantity, i.tool)} ${unitOf(i.tool, i.unit)}`).join(" · ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate">
            Favourites bring in their lines (labour lines show in the quote&apos;s Labour part); prices come from the price book at the
            customer&apos;s tier. Items with nothing measured are left out.
          </p>
          {unscaled > 0 && <p className="mt-1 text-xs font-semibold text-red-700">{unscaled} marks are on pages with no scale and won&apos;t be counted.</p>}
        </div>
        <fieldset className="space-y-1">
          <legend className="font-semibold">Which quote?</legend>
          {drafts.map((q) => (
            <label key={q.version_id} className="flex items-center gap-2">
              <input type="radio" name="quote" checked={pick === q.version_id} onChange={() => setPick(q.version_id)} />
              {q.number} (draft){q.from_takeoff ? " · sent from the takeoff before" : ""}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="radio" name="quote" checked={pick === "new"} onChange={() => setPick("new")} /> Start a new quote option
          </label>
          {locked.length > 0 && (
            <p className="text-xs text-slate">
              {locked.map((q) => q.number).join(", ")} {locked.length === 1 ? "is" : "are"} published and can&apos;t change: make a new version on the quote first to send changes to it.
            </p>
          )}
        </fieldset>
        {chosen?.from_takeoff && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Sending again replaces the lines that came from the takeoff last time. Lines added by hand on the quote stay as they are.
          </p>
        )}
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={busy || measured.length === 0} data-testid="send-confirm" onClick={async () => {
            setBusy(true);
            setErr(await onSend(pick === "new" ? null : pick));
            setBusy(false);
          }}>{busy ? "Sending…" : `Send ${measured.length} items`}</button>
        </div>
      </div>
    </Modal>
  );
}
