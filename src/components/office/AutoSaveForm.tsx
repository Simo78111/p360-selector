"use client";
// Auto-save (17 Nov 2026): a form that saves itself. Dropdowns, ticks and dates save as soon as they change;
// typing saves a moment after you stop (and when you leave the box). No Save button. One save runs at a time;
// changes made while one is running are saved straight after it, so the last change always wins.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type AutoSaveResult = { ok: true; message?: string } | { ok: false; error: string };
type Ctx = { saveNow: () => void };
const AutoSaveCtx = createContext<Ctx | null>(null);
/** Inside an AutoSaveForm: save straight away (for fields filled in by code, e.g. Google address search). */
export const useAutoSave = () => useContext(AutoSaveCtx);

export function AutoSaveForm({ action, children, className, delay = 1200, testId, statusClassName }: {
  action: (form: FormData) => Promise<AutoSaveResult>;
  children: React.ReactNode;
  className?: string;
  delay?: number;
  testId?: string;
  statusClassName?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const form = ref.current;
    if (!form) return;
    if (running.current) {
      again.current = true;
      return;
    }
    // A required box left empty: don't save yet (the browser shows what's missing on leaving it).
    if (!form.checkValidity()) return;
    running.current = true;
    setState({ kind: "saving" });
    try {
      const r = await action(new FormData(form));
      setState(r.ok ? { kind: "saved", text: r.message } : { kind: "error", text: r.error });
    } catch (e) {
      setState({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save. Check your connection." });
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void save();
      }
    }
  }, [action]);

  // Long text (descriptions, notes) waits longer so a pause mid-sentence doesn't save half a thought;
  // it always saves when you click out of the box.
  const later = useCallback((long: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), long ? Math.max(delay, 4000) : delay);
  }, [save, delay]);

  // Leaving the page with a save waiting: send it now.
  useEffect(() => {
    const flush = () => timer.current && void save();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [save]);

  const isTyping = (t: EventTarget) =>
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && !["checkbox", "radio", "date", "file", "hidden"].includes(t.type)) ||
    (t instanceof HTMLElement && t.isContentEditable);

  return (
    <AutoSaveCtx.Provider value={{ saveNow: () => void save() }}>
      <form
        ref={ref}
        className={className}
        data-testid={testId}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onInput={(e) => isTyping(e.target) && (e.target as HTMLElement).dataset.noAutosave === undefined && later(e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable)}
        onChange={(e) => {
          const t = e.target as HTMLElement;
          if (t.dataset.noAutosave !== undefined) return;
          if (!isTyping(t)) void save();
        }}
        onBlur={(e) => isTyping(e.target) && timer.current && void save()}
      >
        {children}
        <SaveState state={state} className={statusClassName} />
      </form>
    </AutoSaveCtx.Provider>
  );
}

function SaveState({ state, className }: { state: { kind: string; text?: string }; className?: string }) {
  return (
    <p aria-live="polite" className={className ?? "text-xs sm:col-span-2 lg:col-span-3"} data-testid="autosave-state">
      {state.kind === "saving" && <span className="text-slate">Saving…</span>}
      {state.kind === "saved" && <span className="text-emerald-700">✓ Saved{state.text ? ` · ${state.text}` : ""}</span>}
      {state.kind === "error" && <span className="font-semibold text-red-700">Not saved: {state.text}</span>}
      {state.kind === "idle" && <span className="text-slate-400">Changes save automatically</span>}
    </p>
  );
}
