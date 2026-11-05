"use client";
// The AI's list of what changed between two revisions (Phase 4c), shown in place of the items list. Each change says
// where it is (sheet, numbered area), what it means for the price, and which takeoff items have marks there; clicking
// it opens that spot on the drawing.
import type { AiChange, AiReport } from "@/lib/takeoff";
import { marksIn, type TakeoffItem, type TakeoffMark } from "@/lib/takeoff-shared";

const btn = "rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40";

export function AiChanges({ report, step, marks, items, onGo, onClose, onAgain }: {
  report: AiReport | null; step: string | null; marks: TakeoffMark[]; items: Map<string, TakeoffItem>;
  onGo: (pageId: string, box: [number, number, number, number] | null) => void; onClose: () => void; onAgain: (() => void) | null;
}) {
  const busy = !!step || report?.status === "queued" || report?.status === "running";
  const where = (c: AiChange, sheetTo: string) => {
    const pg = report?.pages.find((p) => p.to_page === sheetTo);
    const box = c.n ? pg?.regions.find((r) => r.n === c.n)?.box ?? null : null;
    return { pg, box };
  };
  // takeoff items with marks in the area (on the newer revision, or the older one if not copied yet)
  const near = (c: AiChange, sheetTo: string) => {
    const { pg, box } = where(c, sheetTo);
    if (!pg || !box) return [];
    const hit = [...marksIn(marks, pg.to_page, box), ...marksIn(marks, pg.from_page, box)];
    const byItem = new Map<string, number>();
    for (const m of hit) byItem.set(m.item_id, (byItem.get(m.item_id) ?? 0) + 1);
    return [...byItem].map(([id, n]) => ({ item: items.get(id), n })).filter((x) => x.item);
  };
  const sheets = report?.result?.sheets ?? [];
  const affecting = report?.result?.changes_all.filter((c) => c.affects_quote).length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ai-changes">
      <div className="flex items-center justify-between border-b border-black/10 p-2">
        <h2 className="text-sm font-semibold">
          What changed{report ? `: Rev ${report.from_rev} → Rev ${report.to_rev}` : ""} <span className="font-normal text-slate">(AI)</span>
        </h2>
        <button type="button" className={`${btn} bg-mist`} onClick={onClose}>Back to items</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {busy && (
          <p className="rounded-lg bg-aqua-pale/60 px-3 py-2 text-xs" role="status" data-testid="ai-step">
            {step ?? "The AI is reading the changed sheets… usually 1–2 minutes. You can keep working."}
          </p>
        )}
        {report?.status === "failed" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">Couldn&apos;t finish: {report.error}</p>
        )}
        {report?.status === "done" && report.result && (
          <>
            <p data-testid="ai-summary">{report.result.summary}</p>
            <p className="text-xs text-slate">
              {report.result.changes_all.length} changes on {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
              {affecting ? `, ${affecting} likely to affect the price` : ""}.
              {report.result.unchanged.length ? ` No changes found on ${report.result.unchanged.join(", ")}.` : ""}
            </p>
            {sheets.map((s) => (
              <section key={s.to_page} className="rounded-xl border border-black/10">
                <button type="button" className="w-full rounded-t-xl bg-mist/60 px-3 py-2 text-left" onClick={() => onGo(s.to_page, null)}>
                  <span className="font-semibold">{s.label ?? "Sheet"}</span>
                  <span className="block text-xs text-slate">{s.summary}</span>
                </button>
                <ul className="divide-y divide-black/5">
                  {s.changes.map((c, i) => {
                    const { box } = where(c, s.to_page);
                    const hits = near(c, s.to_page);
                    const skip = !c.affects_quote && c.kind.startsWith("drawing only");
                    return (
                      <li key={i} className={skip ? "opacity-60" : ""}>
                        <button type="button" className="w-full px-3 py-2 text-left hover:bg-aqua-pale/30" onClick={() => onGo(s.to_page, box)}
                          data-testid="ai-change">
                          <span className="flex flex-wrap items-center gap-1">
                            {c.n && <span className="rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-950">{c.n}</span>}
                            <span className="rounded-full bg-mist px-2 text-[10px] font-semibold uppercase tracking-wide">{c.kind}</span>
                            {c.affects_quote && <span className="rounded-full bg-red-100 px-2 text-[10px] font-semibold text-red-800">affects price</span>}
                            {c.confidence === "low" && <span className="rounded-full bg-mist px-2 text-[10px] text-slate">not sure</span>}
                          </span>
                          <span className="mt-1 block">{c.what}</span>
                          {c.impact && c.impact !== "None" && <span className="mt-0.5 block text-xs text-slate">{c.impact}</span>}
                          {hits.length > 0 && (
                            <span className="mt-1 block text-xs text-amber-800">
                              Your takeoff here: {hits.map((h) => `${h.item!.name} (${h.n})`).join(", ")}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="text-xs text-slate">
              The AI can miss things or flag drawing-only changes: check each spot on the plans before re-quoting.
            </p>
          </>
        )}
        {onAgain && !busy && (
          <button type="button" className={`${btn} bg-mist`} onClick={onAgain} data-testid="ai-again">Run it again</button>
        )}
      </div>
    </div>
  );
}
