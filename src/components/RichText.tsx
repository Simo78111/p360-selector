// Shows formatted quote wording (lib/rich-text.ts) as HTML: headings, bullets, numbered lists, bold,
// underline, italic. Server or browser.
import { Fragment, type ReactNode } from "react";
import { richBlocks, type RichBlock, type Run } from "@/lib/rich-text";

function RunEl({ r }: { r: Run }) {
  let el: ReactNode = r.text;
  if (r.i) el = <em>{el}</em>;
  if (r.u) el = <u>{el}</u>;
  if (r.b) el = <strong>{el}</strong>;
  return <>{el}</>;
}
const Runs = ({ runs }: { runs: Run[] }) => <>{runs.map((r, i) => <RunEl key={i} r={r} />)}</>;

export function RichText({ text, defaultKind = "para", className = "" }: { text: string | null | undefined; defaultKind?: "para" | "bullet"; className?: string }) {
  const blocks = richBlocks(text, defaultKind);
  if (!blocks.length) return null;
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "bullet" || b.kind === "number") {
      const items: RichBlock[] = [];
      while (i < blocks.length && blocks[i].kind === b.kind) items.push(blocks[i++]);
      i--;
      const li = items.map((x, j) => <li key={j}><Runs runs={x.runs} /></li>);
      out.push(b.kind === "bullet" ? <ul key={i}>{li}</ul> : <ol key={i}>{li}</ol>);
    } else if (b.kind === "h1") out.push(<h2 key={i}><Runs runs={b.runs} /></h2>);
    else if (b.kind === "h2") out.push(<h3 key={i}><Runs runs={b.runs} /></h3>);
    else out.push(<p key={i}><Runs runs={b.runs} /></p>);
  }
  return <div className={`rich-text ${className}`}>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</div>;
}
