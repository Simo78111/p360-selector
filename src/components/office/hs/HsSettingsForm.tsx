"use client";
// Phase 5b: edit the SWMS drafting settings — instructions, each reference section and the example documents — and
// save them as a new version with a note. Read-only without "Can approve H&S documents".
import { useState, useTransition } from "react";
import { hsSettingsSaveAction } from "@/app/dashboard/hs-actions";
import type { HsSettings } from "@/lib/hs-shared";

type Example = { name: string; note?: string; text: string };
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const label = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function HsSettingsForm({ settings: initial }: { settings: HsSettings }) {
  const [st, setSt] = useState(initial);
  const edit = st.can_edit;
  const ref = st.reference as Record<string, unknown>;
  const [instructions, setInstructions] = useState(st.instructions);
  const [sections, setSections] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(ref).filter(([k]) => k !== "examples").map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v, null, 2)])));
  const [examples, setExamples] = useState<Example[]>(() => (Array.isArray(ref.examples) ? (ref.examples as Example[]) : []));
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, start] = useTransition();

  const save = () => {
    const reference: Record<string, unknown> = {};
    try {
      for (const [k, v] of Object.entries(sections)) {
        const was = ref[k];
        if (typeof was === "string" || was === undefined) reference[k] = v;
        else {
          try {
            reference[k] = JSON.parse(v);
          } catch {
            throw new Error(`"${label(k)}" isn't valid any more (it's structured data – check the brackets and quotes).`);
          }
        }
      }
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : String(e) });
      return;
    }
    reference.examples = examples.filter((e) => e.name.trim() && e.text.trim());
    start(async () => {
      const r = await hsSettingsSaveAction(instructions, reference, note.trim() || null);
      if (r.ok) {
        setSt(r.data);
        setNote("");
        setMsg({ ok: `Saved as version ${r.data.version}. The next draft uses it.` });
      } else setMsg({ err: r.error });
    });
  };

  const box = (key: string, title: string, sub: string, body: React.ReactNode) => (
    <div className="rounded-2xl bg-white p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
        <span><span className="font-semibold">{title}</span><span className="block text-xs text-slate">{sub}</span></span>
        <span className="text-sm text-slate">{open === key ? "▲" : "▼"}</span>
      </button>
      {open === key && <div className="mt-3">{body}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">Version {st.version}</span>
        <span className="text-slate"> · saved by {st.saved_by} {new Date(st.saved_at).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}{st.note ? ` – ${st.note}` : ""}</span>
        {!edit && <span className="block text-amber-800">Read only: changing these needs &ldquo;Can approve H&amp;S documents&rdquo;.</span>}
      </p>
      {box("instructions", "Drafting instructions", `From the Claude Project · ${words(instructions).toLocaleString()} words`,
        <textarea rows={24} value={instructions} readOnly={!edit} onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-lg border border-mist px-2 py-1 font-mono text-xs" data-testid="hs-instructions" />)}
      {box("reference", "Reference", `${Object.keys(sections).length} sections: company, risk matrix, H&S manual extracts…`,
        <div className="space-y-3">
          {Object.entries(sections).map(([k, v]) => (
            <label key={k} className="block text-sm">
              <span className="font-medium">{label(k)}</span>{typeof ref[k] !== "string" && <span className="text-xs text-slate"> (structured – keep the brackets)</span>}
              <textarea rows={Math.min(14, Math.max(3, v.split("\n").length))} value={v} readOnly={!edit}
                onChange={(e) => setSections({ ...sections, [k]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-mist px-2 py-1 font-mono text-xs" />
            </label>
          ))}
        </div>)}
      {box("examples", "Finished documents to match", `${examples.length} example${examples.length === 1 ? "" : "s"}: the AI matches their style, not their content`,
        <div className="space-y-4">
          {examples.map((ex, i) => (
            <div key={i} className="space-y-1 rounded-xl border border-mist p-3 text-sm">
              <div className="flex gap-2">
                <input value={ex.name} readOnly={!edit} placeholder="Name, e.g. NEEDO AIAL SWMS"
                  onChange={(e) => setExamples(examples.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="flex-1 rounded border border-mist px-2 py-1 font-medium" />
                {edit && <button onClick={() => setExamples(examples.filter((_, j) => j !== i))} className="text-xs text-red-700 underline">Remove</button>}
              </div>
              <input value={ex.note ?? ""} readOnly={!edit} placeholder="Note for the AI (optional), e.g. a fair example of a JSA"
                onChange={(e) => setExamples(examples.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                className="w-full rounded border border-mist px-2 py-1 text-xs" />
              <textarea rows={8} value={ex.text} readOnly={!edit} placeholder="Paste the document's text"
                onChange={(e) => setExamples(examples.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                className="w-full rounded border border-mist px-2 py-1 font-mono text-xs" />
              <p className="text-xs text-slate">{words(ex.text).toLocaleString()} words</p>
            </div>
          ))}
          {edit && <button onClick={() => setExamples([...examples, { name: "", text: "" }])} className="text-sm font-semibold text-aqua-deep">+ Add an example</button>}
          <p className="text-xs text-slate">Keep examples short and good: long ones slow every draft down and cost more.</p>
        </div>)}
      {edit && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed (e.g. added the airport AVSEC rules)"
            className="min-w-64 flex-1 rounded-lg border border-mist px-2 py-1 text-sm" />
          <button disabled={busy} onClick={save} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-settings-save">
            Save as version {st.version + 1}
          </button>
        </div>
      )}
      {(msg.ok || msg.err) && (
        <p className={`rounded-xl px-4 py-2 text-sm ${msg.err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`} role="status">{msg.err ?? msg.ok}</p>
      )}
      <div className="rounded-2xl bg-white p-4 text-sm">
        <h2 className="font-semibold">Versions</h2>
        <ul className="mt-2 space-y-1">
          {st.history.map((h) => (
            <li key={h.version}>v{h.version} · {new Date(h.at).toLocaleDateString("en-NZ")} · {h.by}{h.note ? `: ${h.note}` : ""}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
