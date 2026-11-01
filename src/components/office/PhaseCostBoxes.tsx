"use client";
// The cost boxes on each phase (job page → Job Summary): Labour, Supplier documents, Stock on hand / other. Each shows
// its cost and sell; click one with costs to see them underneath — labour per person, supplier invoices per document,
// stock per line item. Cost columns only for people with "Can see costs and margins".
import Link from "next/link";
import { useState } from "react";
import type { CostLine, JobCosts } from "@/lib/job-costs";

type Row = { key: string; cols: string[]; cost?: number; sell: number; pending: boolean };
type Box = { id: "labour" | "supplier" | "stock"; title: string; empty: string; head: string[]; rows: Row[] };

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—"
    : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nzDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" });
const hrs = (n: number) => `${Number(n.toFixed(2))} h`;
const sum = (ls: CostLine[], f: "cost" | "sell") => Math.round(ls.reduce((a, l) => a + Number(l[f] ?? 0), 0) * 100) / 100;

function buildBoxes(lines: CostLine[]): Box[] {
  // Labour: one row per person (days worked, hours, cost, charge)
  const people = new Map<string, CostLine[]>();
  for (const l of lines.filter((x) => x.kind === "labour")) {
    const k = l.who ?? "Unknown";
    people.set(k, [...(people.get(k) ?? []), l]);
  }
  const labour: Row[] = [...people.entries()].sort((a, b) => sum(b[1], "sell") - sum(a[1], "sell")).map(([who, ls]) => ({
    key: who,
    cols: [who, `${new Set(ls.map((l) => l.date)).size} day${new Set(ls.map((l) => l.date)).size === 1 ? "" : "s"}`,
           hrs(ls.reduce((a, l) => a + Number(l.qty), 0))],
    cost: ls.some((l) => l.cost !== undefined) ? sum(ls, "cost") : undefined,
    sell: sum(ls, "sell"),
    pending: ls.some((l) => l.status !== "approved"),
  }));

  // Supplier documents: one row per invoice (its lines added up)
  const docs = new Map<string, CostLine[]>();
  for (const l of lines.filter((x) => x.kind === "materials" || x.kind === "hire" || x.kind === "freight")) {
    docs.set(l.ref, [...(docs.get(l.ref) ?? []), l]);
  }
  const supplier: Row[] = [...docs.entries()].sort((a, b) => b[1][0].date.localeCompare(a[1][0].date)).map(([ref, ls]) => ({
    key: ref,
    cols: [ref, nzDay(ls[0].date), ls[0].who ?? "—", `${ls.length} line${ls.length === 1 ? "" : "s"}`],
    cost: ls.some((l) => l.cost !== undefined) ? sum(ls, "cost") : undefined,
    sell: sum(ls, "sell"),
    pending: ls.some((l) => l.status !== "approved"),
  }));

  // Stock on hand / other: every line item (nothing feeds this yet: Project 360 doesn't track stock)
  const stock: Row[] = lines
    .filter((x) => !["labour", "materials", "hire", "freight"].includes(x.kind))
    .map((l) => ({
      key: l.id, cols: [l.description, nzDay(l.date), `${Number(l.qty)}${l.unit ? ` ${l.unit}` : ""}`],
      cost: l.cost, sell: Number(l.sell), pending: l.status !== "approved",
    }));

  return [
    { id: "labour", title: "Labour", empty: "No hours on this phase yet.", head: ["Person", "Days", "Hours"], rows: labour },
    { id: "supplier", title: "Supplier documents", empty: "No supplier invoices on this phase yet.", head: ["Invoice", "Date", "Bought by", "Lines"], rows: supplier },
    { id: "stock", title: "Stock on hand / other", empty: "Nothing yet.", head: ["Item", "Date", "Qty"], rows: stock },
  ];
}

export function PhaseCostBoxes({ costs, costsHref }: { costs: JobCosts | null; costsHref: string }) {
  const [open, setOpen] = useState<Box["id"] | null>(null);
  const boxes = buildBoxes(costs?.lines ?? []);
  const canCosts = !!costs?.can_costs;
  const shown = boxes.find((b) => b.id === open && b.rows.length > 0) ?? null;

  return (
    <div className="mt-4" data-testid="cost-buckets">
      <div className="grid gap-2 sm:grid-cols-3">
        {boxes.map((b) => {
          const cost = b.rows.reduce((a, r) => a + (r.cost ?? 0), 0);
          const sell = b.rows.reduce((a, r) => a + r.sell, 0);
          const has = b.rows.length > 0;
          const on = shown?.id === b.id;
          const sub = b.id === "labour"
            ? `${b.rows.length} ${b.rows.length === 1 ? "person" : "people"}`
            : b.id === "supplier" ? `${b.rows.length} invoice${b.rows.length === 1 ? "" : "s"}` : `${b.rows.length} item${b.rows.length === 1 ? "" : "s"}`;
          return (
            <button key={b.id} type="button" disabled={!has} aria-expanded={has ? on : undefined}
              onClick={() => setOpen(on ? null : b.id)} data-testid={`cost-box-${b.id}`}
              className={`rounded-xl border p-3 text-left text-sm ${has ? "border-black/10 hover:border-ink" : "border-dashed border-black/10"} ${on ? "border-ink bg-aqua-pale/60" : ""}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{b.title}</span>
                {has && <span aria-hidden className="text-xs text-slate">{on ? "▲" : "▼"}</span>}
              </span>
              <span className="block text-xs text-slate">{has ? sub : b.empty}</span>
              <span className="mt-1 flex justify-between text-xs tabular-nums">
                {canCosts ? <span>Cost {money(cost)}</span> : <span />}
                <span>Sell {money(sell)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {shown && (
        <div className="mt-2 overflow-x-auto rounded-xl bg-mist/60 p-3" data-testid={`cost-detail-${shown.id}`}>
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-left text-xs text-slate">
              <tr>
                {shown.head.map((h, i) => <th key={h} className={`py-1 pr-3 font-semibold ${i > 1 && shown.id === "labour" ? "text-right" : ""}`}>{h}</th>)}
                {canCosts && <th className="py-1 pr-3 text-right font-semibold">Cost</th>}
                <th className="py-1 text-right font-semibold">Sell</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((r) => (
                <tr key={r.key} className="border-t border-black/5">
                  {r.cols.map((c, i) => (
                    <td key={i} className={`py-1.5 pr-3 ${i === 0 ? "font-medium" : "text-slate"} ${i > 1 && shown.id === "labour" ? "text-right tabular-nums" : ""}`}>
                      {c}{i === 0 && r.pending && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">not approved</span>}
                    </td>
                  ))}
                  {canCosts && <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.cost)}</td>}
                  <td className="py-1.5 text-right tabular-nums">{money(r.sell)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href={costsHref} className="mt-2 inline-block text-xs font-semibold text-aqua-deep">Every line in the Cost Report →</Link>
        </div>
      )}
    </div>
  );
}
