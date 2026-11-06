"use client";
// Phase 5c: Settings → Health & safety → the hazard and controls library. PTSL's own standard tasks, saved from approved
// SWMSs (job tab → task → "Save to library"). The AI starts from these when a new job has a matching task. Rename, say when
// it applies, drop a row, or remove an entry. Changing it needs "Can approve H&S documents".
import { useState, useTransition } from "react";
import { hsLibraryUpdateAction } from "@/app/dashboard/hs-actions";
import { LICENCE_KINDS } from "@/lib/jm-kinds";
import type { HsLibraryTask } from "@/lib/hs-shared";

const CHIP = { N: "bg-emerald-100", L: "bg-lime-100", M: "bg-amber-100", H: "bg-orange-200", E: "bg-red-600 text-white" } as const;

export function HsLibrary({ tasks: initial, canEdit }: { tasks: HsLibraryTask[]; canEdit: boolean }) {
  const [tasks, setTasks] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, start] = useTransition();
  const update = (id: string, changes: Parameters<typeof hsLibraryUpdateAction>[1], ok: string) => start(async () => {
    const r = await hsLibraryUpdateAction(id, changes);
    if (!r.ok) return setMsg({ err: r.error });
    setTasks(r.data.active ? tasks.map((t) => (t.id === id ? r.data : t)) : tasks.filter((t) => t.id !== id));
    setMsg({ ok });
  });
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5" data-testid="hs-library">
      <div>
        <h2 className="text-lg font-bold">Hazard and controls library</h2>
        <p className="max-w-3xl text-sm text-slate">
          Your standard tasks with their hazards and controls. The AI uses these first for a matching task, so the wording and ratings
          stay the same job to job. Add to it from an approved SWMS: job → Health &amp; Safety → a task → <b>Save to library</b>.
        </p>
      </div>
      {(msg.ok || msg.err) && (
        <p className={`rounded-xl px-3 py-2 text-sm ${msg.err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`} role="status">{msg.err ?? msg.ok}</p>
      )}
      {tasks.length === 0 && <p className="text-sm text-slate">Nothing in the library yet.</p>}
      <ul className="divide-y divide-black/5">
        {tasks.map((t) => <Entry key={t.id} t={t} canEdit={canEdit} busy={busy} update={update} />)}
      </ul>
    </section>
  );
}

function Entry({ t, canEdit, busy, update }: {
  t: HsLibraryTask; canEdit: boolean; busy: boolean;
  update: (id: string, changes: Parameters<typeof hsLibraryUpdateAction>[1], ok: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [when, setWhen] = useState(t.applies_when ?? "");
  const [sure, setSure] = useState(false);
  return (
    <li className="py-3" data-testid="hs-lib-entry">
      <details>
        <summary className="cursor-pointer">
          <span className="font-semibold">{t.name}</span>
          <span className="text-sm text-slate"> · {t.hazards.length} row{t.hazards.length === 1 ? "" : "s"}
            {t.applies_when ? ` · ${t.applies_when}` : ""}</span>
        </summary>
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-xs text-slate">
            {t.source && <>From {t.source}. </>}Saved by {t.updated_by_name ?? t.created_by_name ?? "–"} ·{" "}
            {new Date(t.updated_at).toLocaleDateString("en-NZ")}
            {t.tickets.length > 0 && <> · Tickets: {t.tickets.map((k) => LICENCE_KINDS[k] ?? k).join(", ")}</>}
            {t.permits.length > 0 && <> · Permits: {t.permits.join(", ")}</>}
          </p>
          <table className="w-full text-sm"><tbody>
            {t.hazards.map((h, i) => (
              <tr key={i} className="border-t border-mist align-top">
                <td className="w-1/4 py-1 pr-2">{h.hazard}<span className="block text-xs text-slate">{h.harm}</span></td>
                <td className="w-8"><span className={`rounded px-1.5 text-xs font-bold ${CHIP[h.initial]}`}>{h.initial}</span></td>
                <td className="pr-2"><ul>{h.controls.map((c, j) => <li key={j}><span className="font-mono text-xs font-bold">{c.type}</span> {c.text}</li>)}</ul></td>
                <td className="w-8"><span className={`rounded px-1.5 text-xs font-bold ${CHIP[h.residual]}`}>{h.residual}</span></td>
                {canEdit && t.hazards.length > 1 && (
                  <td className="w-16 text-right">
                    <button disabled={busy} onClick={() => update(t.id, { remove_row: i + 1 }, "Row removed")}
                      className="text-xs text-red-700 underline disabled:opacity-50">Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody></table>
          {canEdit && (editing ? (
            <div className="space-y-2 rounded-xl bg-mist/40 p-3">
              <label className="block text-xs font-semibold text-slate">Name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="mt-1 block w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm" />
              </label>
              <label className="block text-xs font-semibold text-slate">When it applies
                <input value={when} onChange={(e) => setWhen(e.target.value)} maxLength={1000} className="mt-1 block w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm" />
              </label>
              <button disabled={busy} onClick={() => { update(t.id, { name, applies_when: when }, "Saved"); setEditing(false); }}
                className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>{" "}
              <button onClick={() => setEditing(false)} className="text-xs text-slate underline">Cancel</button>
            </div>
          ) : (
            <p className="flex gap-3 text-xs">
              <button onClick={() => setEditing(true)} className="font-semibold text-aqua-deep underline">Rename / when it applies</button>
              <button disabled={busy} onClick={() => (sure ? update(t.id, { active: false }, `"${t.name}" removed from the library`) : setSure(true))}
                className="font-semibold text-red-700 underline disabled:opacity-50">{sure ? "Yes, remove it" : "Remove from the library"}</button>
            </p>
          ))}
        </div>
      </details>
    </li>
  );
}
