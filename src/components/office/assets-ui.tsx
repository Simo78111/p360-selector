// Tool register bits shared by the list and the tool page.
import type { Asset } from "@/lib/assets";

export const ASSET_STATUS: Record<Asset["status"], { label: string; tone: string }> = {
  available: { label: "Available", tone: "bg-emerald-600 text-white" },
  out: { label: "Out", tone: "bg-blue-600 text-white" },
  needs_repair: { label: "Needs repair", tone: "bg-red-600 text-white" },
  retired: { label: "Retired", tone: "bg-slate-300 text-slate-900" },
};

export function AssetStatusChip({ status }: { status: Asset["status"] }) {
  const s = ASSET_STATUS[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

export const nzDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
export const nzWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }) : "—";
