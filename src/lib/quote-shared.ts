// Labels and text helpers for quotes, shared by server pages and the quote builder in the browser.
export type AppearsAs = "lines" | "summary" | "fixed";
export const APPEARS_AS: Record<AppearsAs, string> = {
  lines: "Line items",
  summary: "Summary",
  fixed: "Fixed price",
};
export const PRICE_SOURCE: Record<string, string> = {
  line: "Set on this line",
  favourite: "Favourite",
  tier_item: "Pricing tier: this item",
  standard_rate: "Labour rate",
  tier_default: "Pricing tier markup",
  company_default: "Company markup",
};
// ── Shared text helpers ────────────────────────────────────────────────────
/** The Description of Works: "## Heading" lines, "- " or "• " bullets, and paragraphs. */
export type TextBlock = { kind: "heading" | "bullet" | "para"; text: string };
export function textBlocks(s: string | null | undefined): TextBlock[] {
  return (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const t = l.trim();
      if (/^#{1,3}\s+/.test(t)) return { kind: "heading" as const, text: t.replace(/^#{1,3}\s+/, "") };
      if (/^[-•*]\s+/.test(t)) return { kind: "bullet" as const, text: t.replace(/^[-•*]\s+/, "") };
      return { kind: "para" as const, text: t };
    });
}
export const lines = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•*]\s+/, "").trim()).filter(Boolean);

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  superseded: "Replaced by a newer version",
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  closed: "Closed",
};
