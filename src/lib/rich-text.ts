// Formatted quote wording (17 Nov 2026): Description of Works, "No allowance has been made for", the note,
// the terms and section descriptions can have bold, underline, italic, bullets, numbered lists and bigger
// headings. Stored as plain text with simple marks, so old quotes still read the same and the PDF, the
// customer's quote page and the AI safety drafting can all read it:
//   "# Big heading"   "## Heading"   "- bullet" (or "• ")   "1. numbered"
//   **bold**   __underline__   *italic*
// Shared by the server (PDF, customer page) and the browser (the editor in the quote builder).

export type Run = { text: string; b?: boolean; u?: boolean; i?: boolean };
export type RichKind = "h1" | "h2" | "bullet" | "number" | "para";
export type RichBlock = { kind: RichKind; runs: Run[]; n?: number };

const INLINE = /\*\*\*(?=\S)([\s\S]*?\S)\*\*\*|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|(?<![*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/;

/** "Fit **new** __hot__ water" → runs with their styles. Unmatched marks stay as typed. */
export function inlineRuns(text: string, style: Omit<Run, "text"> = {}): Run[] {
  const out: Run[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ text: rest, ...style });
      break;
    }
    if (m.index > 0) out.push({ text: rest.slice(0, m.index), ...style });
    if (m[1] !== undefined) out.push(...inlineRuns(m[1], { ...style, b: true, i: true }));
    else if (m[2] !== undefined) out.push(...inlineRuns(m[2], { ...style, b: true }));
    else if (m[3] !== undefined) out.push(...inlineRuns(m[3], { ...style, u: true }));
    else out.push(...inlineRuns(m[4], { ...style, i: true }));
    rest = rest.slice(m.index + m[0].length);
  }
  // merge neighbours with the same style
  return out.reduce<Run[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && !!last.b === !!r.b && !!last.u === !!r.u && !!last.i === !!r.i) last.text += r.text;
    else if (r.text) acc.push({ ...r });
    return acc;
  }, []);
}

/**
 * The wording as blocks. defaultKind: what a plain line is ("bullet" for the exclusions list, where every
 * line has always been a bullet). Numbered lists count up within a run of numbered lines.
 */
export function richBlocks(s: string | null | undefined, defaultKind: "para" | "bullet" = "para"): RichBlock[] {
  const out: RichBlock[] = [];
  let n = 0;
  for (const raw of (s ?? "").split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) {
      n = 0;
      continue;
    }
    let kind: RichKind = defaultKind;
    let body = t;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      kind = m[1].length === 1 ? "h1" : "h2";
      body = m[2];
    } else if ((m = t.match(/^[-•]\s+(.*)$/)) || (m = t.match(/^\*\s+(.*)$/))) {
      kind = "bullet";
      body = m[1];
    } else if ((m = t.match(/^\d{1,3}[.)]\s+(.*)$/))) {
      kind = "number";
      body = m[1];
    } else if (defaultKind === "bullet" && (m = t.match(/^~\s?(.*)$/))) {
      kind = "para"; // a plain line inside the exclusions list
      body = m[1];
    }
    n = kind === "number" ? n + 1 : 0;
    out.push({ kind, runs: inlineRuns(body), ...(kind === "number" ? { n } : {}) });
  }
  return out;
}

/** The words without any marks (search, short previews, places that can only show plain text). */
export const plainText = (s: string | null | undefined, defaultKind: "para" | "bullet" = "para") =>
  richBlocks(s, defaultKind).map((b) => b.runs.map((r) => r.text).join("")).join("\n");

// ── To and from the editor (HTML) ──────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const runHtml = (r: Run) => {
  let h = esc(r.text);
  if (r.i) h = `<i>${h}</i>`;
  if (r.u) h = `<u>${h}</u>`;
  if (r.b) h = `<b>${h}</b>`;
  return h;
};
const runsHtml = (runs: Run[]) => runs.map(runHtml).join("") || "<br>";

export function toEditorHtml(s: string | null | undefined, defaultKind: "para" | "bullet" = "para"): string {
  const blocks = richBlocks(s, defaultKind);
  let html = "";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "bullet" || b.kind === "number") {
      const tag = b.kind === "bullet" ? "ul" : "ol";
      html += `<${tag}>`;
      while (i < blocks.length && blocks[i].kind === b.kind) html += `<li>${runsHtml(blocks[i++].runs)}</li>`;
      html += `</${tag}>`;
      i--;
    } else if (b.kind === "h1") html += `<h2>${runsHtml(b.runs)}</h2>`;
    else if (b.kind === "h2") html += `<h3>${runsHtml(b.runs)}</h3>`;
    else html += `<p>${runsHtml(b.runs)}</p>`;
  }
  return html || (defaultKind === "bullet" ? "<ul><li><br></li></ul>" : "<p><br></p>");
}

/** Marks around a run, keeping spaces outside them ("**word** " not "**word **", which wouldn't read back). */
function markRun(r: Run): string {
  const m = r.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!m[2]) return r.text;
  let t = m[2];
  if (r.i) t = `*${t}*`;
  if (r.u) t = `__${t}__`;
  if (r.b) t = `**${t}**`;
  return m[1] + t + m[3];
}

export function blocksToText(blocks: RichBlock[], defaultKind: "para" | "bullet" = "para"): string {
  return blocks
    .map((b) => {
      const body = b.runs.map(markRun).join("").replace(/\s+/g, " ").trim();
      if (!body) return null;
      switch (b.kind) {
        case "h1": return `# ${body}`;
        case "h2": return `## ${body}`;
        case "bullet": return defaultKind === "bullet" ? body : `- ${body}`;
        case "number": return `${b.n ?? 1}. ${body}`;
        default: return defaultKind === "bullet" ? `~ ${body}` : body;
      }
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}
