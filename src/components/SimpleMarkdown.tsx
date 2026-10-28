// Renders the small Markdown the marketing agent writes: ## / ### headings, paragraphs, - and 1. lists,
// **bold** and [links](/path). No HTML is ever passed through; links go only to our pages or https sites.
import Link from "next/link";
import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(<strong key={`${key}-${i++}`}>{m[1]}</strong>);
    } else {
      const href = m[3];
      if (href.startsWith("/") && !href.startsWith("//")) {
        out.push(<Link key={`${key}-${i++}`} href={href} className="font-semibold text-aqua-deep underline">{m[2]}</Link>);
      } else if (/^https:\/\//.test(href)) {
        out.push(<a key={`${key}-${i++}`} href={href} rel="nofollow noopener" className="font-semibold text-aqua-deep underline">{m[2]}</a>);
      } else {
        out.push(m[2]);
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Item = { text: string; sub: { ordered: boolean; items: string[] } | null };

export function SimpleMarkdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list = null as { ordered: boolean; items: Item[] } | null;
  const flushPara = () => {
    if (!para.length) return;
    const k = `p${blocks.length}`;
    blocks.push(<p key={k} className="text-slate leading-relaxed">{inline(para.join(" "), k)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, j) => (
      <li key={j}>
        {inline(it.text, `${k}-${j}`)}
        {it.sub && (it.sub.ordered
          ? <ol className="mt-1 list-decimal space-y-1 pl-6">{it.sub.items.map((t, n) => <li key={n}>{inline(t, `${k}-${j}-${n}`)}</li>)}</ol>
          : <ul className="mt-1 list-disc space-y-1 pl-6">{it.sub.items.map((t, n) => <li key={n}>{inline(t, `${k}-${j}-${n}`)}</li>)}</ul>)}
      </li>
    ));
    blocks.push(list.ordered
      ? <ol key={k} className="list-decimal space-y-1 pl-6 text-slate">{items}</ol>
      : <ul key={k} className="list-disc space-y-1 pl-6 text-slate">{items}</ul>);
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };
  for (const raw of lines) {
    const line = raw.trim();
    const indented = /^( {2,}|\t)/.test(raw);
    let m: RegExpMatchArray | null;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      flush();
      const k = `h${blocks.length}`;
      blocks.push(m[1] === "##"
        ? <h2 key={k} className="pt-4 text-2xl font-bold">{inline(m[2], k)}</h2>
        : <h3 key={k} className="pt-2 text-lg font-bold">{inline(m[2], k)}</h3>);
      continue;
    }
    if ((m = line.match(/^(?:[-*]|(\d+)\.)\s+(.*)$/))) {
      flushPara();
      const ordered = Boolean(m[1]);
      // an indented item under a list item belongs to that item (e.g. options under step 2)
      if (indented && list && list.items.length) {
        const last = list.items[list.items.length - 1];
        last.sub = last.sub ?? { ordered, items: [] };
        last.sub.items.push(m[2]);
        continue;
      }
      if (list && list.ordered !== ordered) flushList();
      list = list ?? { ordered, items: [] };
      list.items.push({ text: m[2], sub: null });
      continue;
    }
    flushList();
    if (line.startsWith("#")) { flushPara(); para.push(line.replace(/^#+\s*/, "")); flushPara(); continue; }
    para.push(line);
  }
  flush();
  return <div className="space-y-4">{blocks}</div>;
}
