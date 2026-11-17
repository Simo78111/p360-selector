"use client";
// A small formatted-text box for quote wording (17 Nov 2026): bold, underline, italic, bullets, numbered
// lists, Heading and Large heading. What's typed is kept as plain text with simple marks (see lib/rich-text.ts),
// so the PDF and the customer's quote page show the same formatting. Saves when you click out of the box and
// a few seconds after you stop typing. Ctrl/Cmd+B, U and I work too. Pasted text comes in plain.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { blocksToText, toEditorHtml, type RichBlock, type RichKind, type Run } from "@/lib/rich-text";

type Style = Omit<Run, "text">;
const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "BLOCKQUOTE", "PRE"]);

/** The editor's HTML back to blocks (b/strong, u, i/em, and the same as inline styles from other browsers). */
export function domToBlocks(root: HTMLElement, defaultKind: "para" | "bullet"): RichBlock[] {
  const blocks: RichBlock[] = [];
  let cur: RichBlock | null = null;
  const bare: RichKind = defaultKind === "bullet" ? "bullet" : "para";

  const walk = (node: Node, style: Style, kind: RichKind) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data.replace(/ /g, " ").replace(/[\r\n]+/g, " ");
      if (!text) return;
      if (!cur) {
        cur = { kind, runs: [] };
        blocks.push(cur);
      }
      cur.runs.push({ text, ...style });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      cur = null;
      return;
    }
    const s: Style = { ...style };
    const css = node.style;
    if (tag === "B" || tag === "STRONG" || css.fontWeight === "bold" || Number(css.fontWeight) >= 600) s.b = true;
    if (tag === "U" || css.textDecoration.includes("underline") || css.textDecorationLine?.includes("underline")) s.u = true;
    if (tag === "I" || tag === "EM" || css.fontStyle === "italic") s.i = true;
    if (!BLOCK_TAGS.has(tag)) {
      node.childNodes.forEach((c) => walk(c, s, kind));
      return;
    }
    let k: RichKind = kind;
    if (tag === "UL") k = "bullet";
    else if (tag === "OL") k = "number";
    else if (tag === "H1" || tag === "H2") k = "h1";
    else if (/^H[3-6]$/.test(tag)) k = "h2";
    else if (tag === "P") k = kind === "bullet" || kind === "number" ? kind : "para";
    // LI / DIV keep the kind they're in
    if (tag === "UL" || tag === "OL") {
      cur = null;
      node.childNodes.forEach((c) => walk(c, s, k));
      cur = null;
      return;
    }
    cur = null;
    node.childNodes.forEach((c) => walk(c, s, k));
    cur = null;
  };
  root.childNodes.forEach((c) => walk(c, {}, c instanceof HTMLElement && c.tagName === "P" ? "para" : bare));
  // number the numbered lists
  let n = 0;
  for (const b of blocks) {
    n = b.kind === "number" ? n + 1 : 0;
    if (b.kind === "number") b.n = n;
  }
  return blocks;
}

const btn = "min-w-8 rounded-md px-2 py-1 text-sm hover:bg-slate-100 aria-pressed:bg-slate-800 aria-pressed:text-white";

export function RichTextEditor({ value, onSave, disabled, label, defaultKind = "para", minHeight = 140, testId, compact, placeholder, className = "" }: {
  value: string | null;
  onSave: (text: string) => void;
  disabled?: boolean;
  label: string;
  /** "bullet": every plain line is a bullet (the "No allowance has been made for" list). */
  defaultKind?: "para" | "bullet";
  minHeight?: number;
  testId?: string;
  /** Small box: the toolbar only shows while you're in it. */
  compact?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useRef(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const range = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState({ b: false, u: false, i: false, ul: false, ol: false, block: "p" });

  // Fill the box; refill when the saved wording changes elsewhere (not while someone is typing in it).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if ((value ?? "") !== saved.current || !el.innerHTML) {
      el.innerHTML = toEditorHtml(value, defaultKind);
      saved.current = value ?? "";
    }
  }, [value, defaultKind]);

  const current = useCallback(() => (ref.current ? blocksToText(domToBlocks(ref.current, defaultKind), defaultKind) : saved.current), [defaultKind]);
  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = current();
    if (text !== saved.current) {
      saved.current = text;
      onSave(text);
    }
  }, [current, onSave]);

  // Which buttons are "on" where the cursor is.
  useEffect(() => {
    if (!focused) return;
    const update = () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
      const block = String(document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
      setActive({
        b: document.queryCommandState("bold"),
        u: document.queryCommandState("underline"),
        i: document.queryCommandState("italic"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        block,
      });
    };
    document.addEventListener("selectionchange", update);
    update();
    return () => document.removeEventListener("selectionchange", update);
  }, [focused]);

  const cmd = (name: string, arg?: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // back to where the cursor was (the size dropdown takes the focus away while it's open)
    const sel = document.getSelection();
    if (sel && range.current && el.contains(range.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
    document.execCommand(name, false, arg);
    later();
  };
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 3000);
  };
  const styleValue = active.block === "h2" || active.block === "h1" ? "h2" : active.block === "h3" ? "h3" : "p";

  return (
    <div className={`group rounded-lg border ${disabled ? "border-transparent" : "border-black/10"} bg-white ${className}`} data-testid={testId}>
      {!disabled && (
        <div className={`${compact ? "hidden group-focus-within:flex" : "flex"} flex-wrap items-center gap-0.5 border-b border-black/5 px-1 py-1`} role="toolbar" aria-label={`${label} formatting`}
          onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
          <select
            aria-label="Text size"
            value={styleValue}
            onChange={(e) => cmd("formatBlock", `<${e.target.value}>`)}
            className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs"
          >
            <option value="p">Normal text</option>
            <option value="h3">Heading</option>
            <option value="h2">Large heading</option>
          </select>
          <span className="mx-1 h-5 w-px bg-black/10" />
          <button type="button" className={`${btn} font-bold`} aria-pressed={active.b} onClick={() => cmd("bold")} title="Bold (Ctrl/Cmd+B)">B</button>
          <button type="button" className={`${btn} underline`} aria-pressed={active.u} onClick={() => cmd("underline")} title="Underline (Ctrl/Cmd+U)">U</button>
          <button type="button" className={`${btn} italic`} aria-pressed={active.i} onClick={() => cmd("italic")} title="Italic (Ctrl/Cmd+I)">I</button>
          <span className="mx-1 h-5 w-px bg-black/10" />
          <button type="button" className={btn} aria-pressed={active.ul} onClick={() => cmd("insertUnorderedList")} title="Bullet points">• List</button>
          <button type="button" className={btn} aria-pressed={active.ol} onClick={() => cmd("insertOrderedList")} title="Numbered list">1. List</button>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          save();
        }}
        onInput={later}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          if (text) document.execCommand("insertText", false, text);
        }}
        data-placeholder={disabled ? undefined : placeholder}
        style={{ minHeight: disabled ? undefined : minHeight }}
        className={`rich-text max-w-none ${compact ? "px-2 py-1" : "px-3 py-2"} outline-none focus:ring-2 focus:ring-sky-300/60`}
      />
    </div>
  );
}
