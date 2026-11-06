"use client";
// The job page's Health & Safety tab (Phase 5a). One SWMS + JSA pack per job:
//   site details → (AI) task list → confirm tasks → (AI) full draft → hold points → approve → mark sent.
// An AI draft is only ever a draft: it can't be marked sent until someone with "Can approve H&S documents" approves it.
// While the AI is working the tab checks back every 10 seconds.
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  hsApproveAction,
  hsConfirmTasksAction,
  hsHoldPointAction,
  hsMarkSentAction,
  hsRedraftAction,
  hsSiteAction,
  hsStartAction,
} from "@/app/dashboard/hs-actions";
import {
  CONTROL_LABEL,
  LIKELIHOOD,
  RISK_LABEL,
  SEVERITY,
  SITE_FIELDS,
  SITE_REQUIRED,
  STATUS_LABEL,
  type HsContent,
  type HsDocument,
  type HsJob,
  type HsTask,
  type HoldPoint,
  type Risk,
  type SiteDetails,
} from "@/lib/hs-shared";

const RISK_STYLE: Record<Risk, string> = {
  N: "bg-emerald-100 text-emerald-900", L: "bg-lime-100 text-lime-900", M: "bg-amber-100 text-amber-900",
  H: "bg-orange-200 text-orange-950", E: "bg-red-600 text-white",
};
const SUMMARY_LABEL = { applicable: "Applicable", by_others: "Applicable – by others", hold: "HOLD POINT", na: "N/A – not applicable to this scope" };

function RiskChip({ r, s, l }: { r: Risk; s?: number; l?: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${RISK_STYLE[r]}`}
      title={s && l ? `${RISK_LABEL[r]} – ${SEVERITY[s - 1]} × ${LIKELIHOOD[l - 1]}` : RISK_LABEL[r]}>
      {r}
    </span>
  );
}

const asText = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : Array.isArray(v)
  ? v.map((x) => (typeof x === "object" && x ? Object.values(x).filter(Boolean).join(" – ") : String(x))).join("; ")
  : JSON.stringify(v));

export function HealthSafetyTab({ hs: initial }: { hs: HsJob }) {
  const router = useRouter();
  const [hs, setHs] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, start] = useTransition();
  useEffect(() => setHs(initial), [initial]);
  const d = hs.document;
  const working = !!d && (d.status === "queued" || d.status === "drafting") && !(d as HsDocument & { stuck?: boolean }).stuck;

  // check back while the AI works
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [working, router]);

  const act = (fn: () => Promise<{ ok: true; data: HsJob } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setHs(r.data);
        setMsg({ ok });
        router.refresh();
      } else setMsg({ err: r.error });
    });

  return (
    <section className="space-y-4" data-testid="hs-tab">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Health &amp; Safety</h2>
          <p className="text-sm text-slate">
            SWMS and JSA drafted by AI from the accepted quote, in PTSL house style.
            {hs.auto ? " Project 360 jobs are drafted automatically when the quote is accepted." : " Plumbing 360 jobs: draft with one click."}
            {" "}Nothing goes out until it&apos;s approved.
          </p>
          {d && (
            <p className="mt-1 text-sm">
              <span className="font-semibold">v{d.version_no} · {STATUS_LABEL[d.status]}</span>
              {d.quote_number && <span className="text-slate"> · from {d.quote_number}</span>}
              {d.word_count ? <span className="text-slate"> · about {d.word_count.toLocaleString()} words</span> : null}
              {d.approved_by && <span className="text-slate"> · approved by {d.approved_by}</span>}
              {d.sent_at && <span className="text-slate"> · sent {new Date(d.sent_at).toLocaleDateString("en-NZ")}</span>}
            </p>
          )}
        </div>
        {hs.can_edit && (!d || ["failed", "sent", "approved", "to_approve"].includes(d.status) || (d as { stuck?: boolean }).stuck) && (
          <button disabled={busy} onClick={() => {
            if (d && !confirm(d.status === "sent" ? "Start a new version (v" + (d.version_no + 1) + ")? The sent one is kept." : "Start again from the quote as a new version?")) return;
            act(() => hsStartAction(hs.job_id), "Drafting started");
          }} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-start">
            {d ? "New version" : "Draft SWMS and JSA"}
          </button>
        )}
      </div>

      {(msg.ok || msg.err) && (
        <p className={`rounded-xl px-4 py-2 text-sm ${msg.err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`} role="status">
          {msg.err ?? msg.ok}
        </p>
      )}
      {d?.scope_changed_at && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Scope changed since this was drafted (a quote or variation was accepted). Check whether the SWMS and JSA need updating:
          redraft with a note, or start a new version.
        </p>
      )}
      {working && (
        <p className="rounded-xl bg-aqua-pale/60 px-4 py-3 text-sm" data-testid="hs-working">
          {d!.stage === "tasks" ? "Reading the quote and listing the work tasks…" : "Drafting the SWMS and JSA… (usually 2–5 minutes)"} This page checks back by itself.
        </p>
      )}
      {d?.status === "failed" && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">The draft didn&apos;t finish: {d.error}</p>
      )}

      <SiteForm hs={hs} busy={busy} onSave={(det) => act(() => hsSiteAction(hs.job_id, det), "Site details saved")} />

      {d?.status === "tasks_to_confirm" && d.tasks && (
        <TaskConfirm doc={d} canEdit={hs.can_edit} busy={busy}
          onConfirm={(tasks) => act(() => hsConfirmTasksAction(d.id, tasks), "Task list confirmed – drafting the documents")} />
      )}

      {d?.content && ["to_approve", "approved", "sent"].includes(d.status) && (
        <Draft doc={d} content={d.content} hs={hs} busy={busy}
          onHold={(id, status, answer) => act(() => hsHoldPointAction(d.id, id, status, answer), "Hold point updated")}
          onApprove={() => act(() => hsApproveAction(d.id), "Approved")}
          onSent={(note) => act(() => hsMarkSentAction(d.id, note), "Marked sent")} />
      )}

      {d && hs.can_edit && ["to_approve", "approved", "failed", "tasks_to_confirm"].includes(d.status) && (
        <Redraft busy={busy} onRedraft={(note) => act(() => hsRedraftAction(d.id, note), "Redraft started")} />
      )}

      {d?.changes && d.changes.length > 0 && (
        <div className="rounded-2xl bg-white p-4">
          <h3 className="font-semibold">Review and amendment log</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {d.changes.map((c, i) => <li key={i}>v{c.version_no} · {new Date(c.at).toLocaleDateString("en-NZ")} · {c.by}: {c.summary}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function SiteForm({ hs, busy, onSave }: { hs: HsJob; busy: boolean; onSave: (d: SiteDetails) => void }) {
  const missing = SITE_REQUIRED.filter((f) => !asText(hs.site[f]).trim());
  const asked = new Map((hs.document?.missing ?? []).map((m) => [m.field, m.question]));
  const [open, setOpen] = useState(missing.length > 0 && hs.document?.status !== "sent");
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(SITE_FIELDS.map(([k]) => [k, asText(hs.site[k])])));
  const fill = () => setVals((v) => ({
    ...v,
    principal_contractor: v.principal_contractor || hs.site_defaults.principal_contractor || "",
    site_address: v.site_address || hs.site_defaults.site_address || "",
    crew: v.crew || (hs.site_defaults.crew ?? []).map((c) => `${c.name}${c.trade ? ` (${c.trade.replace(/_/g, " ")})` : ""}${c.apprentice ? " – apprentice" : ""}`).join(", "),
  }));
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="hs-site">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="font-semibold">Site details</span>
        <span className="text-sm text-slate">
          {missing.length ? `${missing.length} needed before the full draft` : "All needed details answered"} {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(vals); }}>
          <p className="text-sm text-slate">
            What the AI would otherwise have to ask. &ldquo;Unknown&rdquo; is a fine answer – it becomes a hold point on the document.
            {hs.can_edit && <> <button type="button" className="font-semibold text-aqua-deep" onClick={fill}>Fill from the job</button></>}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {SITE_FIELDS.map(([k, label, help, req]) => (
              <label key={k} className="block text-sm">
                <span className="font-medium">{label}{req && <span className="text-red-700"> *</span>}</span>
                {asked.get(k) && <span className="block text-xs text-amber-800">AI asks: {asked.get(k)}</span>}
                <textarea rows={k === "notes" || k === "crew" ? 3 : 1} value={vals[k]} disabled={!hs.can_edit}
                  onChange={(e) => setVals({ ...vals, [k]: e.target.value })} placeholder={help}
                  className="mt-1 w-full rounded-lg border border-mist px-2 py-1" />
              </label>
            ))}
          </div>
          {hs.can_edit && <button disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save site details</button>}
        </form>
      )}
    </div>
  );
}

function TaskConfirm({ doc, canEdit, busy, onConfirm }: { doc: HsDocument; canEdit: boolean; busy: boolean; onConfirm: (t: HsTask[]) => void }) {
  const [tasks, setTasks] = useState<HsTask[]>(doc.tasks ?? []);
  const set = (i: number, title: string) => setTasks(tasks.map((t, j) => (j === i ? { ...t, title } : t)));
  const move = (i: number, by: number) => {
    const t = [...tasks];
    const [x] = t.splice(i, 1);
    t.splice(Math.max(0, Math.min(t.length, i + by)), 0, x);
    setTasks(t);
  };
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-white p-4" data-testid="hs-tasks">
      <h3 className="font-semibold">Confirm the task list</h3>
      <p className="text-sm text-slate">
        The physical work activities the AI found in the quote. Rename, reorder, add or remove, then confirm – the SWMS and JSA are
        drafted task by task from this list. Fill in the site details above first.
      </p>
      <ol className="mt-3 space-y-2">
        {tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 w-6 text-right text-sm font-semibold">{i + 1}.</span>
            <div className="flex-1">
              <input value={t.title} onChange={(e) => set(i, e.target.value)} disabled={!canEdit}
                className="w-full rounded-lg border border-mist px-2 py-1 text-sm" />
              {t.quote_wording && <p className="mt-0.5 text-xs text-slate">Quote: {t.quote_wording}</p>}
            </div>
            {canEdit && (
              <span className="flex gap-1 text-sm">
                <button type="button" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} aria-label="Remove" className="text-red-700">✕</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => setTasks([...tasks, { n: tasks.length + 1, title: "" }])} className="text-sm font-semibold text-aqua-deep">+ Add a task</button>
          <button disabled={busy} onClick={() => onConfirm(tasks)} className="ml-auto rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-confirm">
            Confirm and draft the documents
          </button>
        </div>
      )}
    </div>
  );
}

function Draft({ doc, content: c, hs, busy, onHold, onApprove, onSent }: {
  doc: HsDocument; content: HsContent; hs: HsJob; busy: boolean;
  onHold: (id: string, status: "open" | "answered" | "confirm_on_site", answer: string | null) => void;
  onApprove: () => void; onSent: (note: string | null) => void;
}) {
  const [view, setView] = useState<"swms" | "jsa">("swms");
  const open = doc.hold_points.filter((h) => h.status === "open").length;
  const highest = useMemo(() => c.tasks.flatMap((t) => t.hazards.map((h) => h.initial)), [c]);
  return (
    <div className="space-y-4" data-testid="hs-draft">
      <HoldPoints doc={doc} canEdit={hs.can_edit && doc.status !== "sent"} busy={busy} onHold={onHold} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4">
        {doc.status === "to_approve" && (hs.can_approve ? (
          <button disabled={busy || open > 0} onClick={onApprove} title={open ? "Deal with every hold point first" : ""}
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-approve">
            Approve (management approval)
          </button>
        ) : <span className="text-sm text-slate">Waiting for someone with &ldquo;Can approve H&amp;S documents&rdquo;.</span>)}
        {doc.status === "approved" && hs.can_edit && (
          <button disabled={busy} onClick={() => onSent(prompt("Sent to whom / how? (optional)") || null)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-sent">
            Mark as sent to the principal contractor
          </button>
        )}
        {open > 0 && doc.status === "to_approve" && <span className="text-sm text-amber-800">{open} hold point{open === 1 ? "" : "s"} to answer or keep for site first.</span>}
        <span className="ml-auto text-xs text-slate">
          Word and PDF in house style come in 5b. Highest risk before controls: {["E", "H", "M", "L", "N"].find((r) => highest.includes(r as Risk))}
        </span>
      </div>

      <div className="flex gap-2">
        {(["swms", "jsa"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "bg-white"}`}>
            {v === "swms" ? "SWMS" : "JSA (toolbox talk)"}
          </button>
        ))}
      </div>
      {view === "swms" ? <Swms c={c} /> : <Jsa c={c} doc={doc} />}
    </div>
  );
}

function HoldPoints({ doc, canEdit, busy, onHold }: { doc: HsDocument; canEdit: boolean; busy: boolean;
  onHold: (id: string, status: "open" | "answered" | "confirm_on_site", answer: string | null) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (!doc.hold_points.length) return null;
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="hs-holds">
      <h3 className="font-semibold">Hold points – confirm before the work they hold</h3>
      <ul className="mt-2 space-y-3">
        {doc.hold_points.map((h: HoldPoint) => (
          <li key={h.id} className={`rounded-xl border p-3 text-sm ${h.status === "open" ? "border-amber-300 bg-amber-50" : "border-mist"}`}>
            <p><span className="font-bold">{h.id}</span> {h.text}</p>
            <p className="text-xs text-slate">Who: {h.who}{h.tasks?.length ? ` · before task ${h.tasks.join(", ")}` : ""}{h.why ? ` · ${h.why}` : ""}</p>
            {h.status === "answered" && <p className="mt-1 text-emerald-800">✓ {h.answer} <span className="text-xs text-slate">({h.answered_by})</span></p>}
            {h.status === "confirm_on_site" && <p className="mt-1 text-amber-900">Kept on the document – confirm on site <span className="text-xs text-slate">({h.answered_by})</span></p>}
            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={answers[h.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [h.id]: e.target.value })}
                  placeholder="Answer (e.g. register sighted 12/11, no ACM in kitchenettes)" className="min-w-64 flex-1 rounded-lg border border-mist px-2 py-1" />
                <button disabled={busy || !(answers[h.id] ?? "").trim()} onClick={() => onHold(h.id, "answered", answers[h.id])}
                  className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Answered</button>
                {h.status !== "confirm_on_site" && (
                  <button disabled={busy} onClick={() => onHold(h.id, "confirm_on_site", null)} className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold">
                    Keep – confirm on site
                  </button>
                )}
                {h.status !== "open" && <button disabled={busy} onClick={() => onHold(h.id, "open", null)} className="text-xs text-slate underline">Reopen</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Swms({ c }: { c: HsContent }) {
  const doc = c.document;
  return (
    <div className="space-y-4" data-testid="hs-swms">
      <Box title={doc.title}>
        <dl className="grid gap-x-4 gap-y-1 text-sm md:grid-cols-[12rem_1fr]">
          {([["Principal contractor", doc.principal_contractor], ["PC contacts", doc.pc_contacts], ["Site type", doc.site_type],
             ["Drawings basis", doc.drawings_basis], ["Planned dates", doc.planned_dates], ["Prepared by", doc.prepared_by]] as const)
            .filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt className="font-medium">{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>
        <p className="mt-3 text-sm">{doc.scope_plain}</p>
        {doc.occupancy_note && <p className="mt-2 text-sm"><span className="font-medium">Occupied site: </span>{doc.occupancy_note}</p>}
      </Box>
      <Box title="Hazard applicability">
        <table className="w-full text-sm"><tbody>
          {c.hazard_summary.map((h) => (
            <tr key={h.category} className="border-t border-mist align-top">
              <td className="py-1 pr-3 font-medium">{h.category}</td>
              <td className={`py-1 pr-3 ${h.status === "hold" ? "font-bold text-amber-800" : h.status === "na" ? "text-slate" : ""}`}>{SUMMARY_LABEL[h.status]}</td>
              <td className="py-1">{h.where || h.reason}</td>
            </tr>
          ))}
        </tbody></table>
      </Box>
      <Box title="Task-by-task hazards, risk and controls">
        <p className="mb-2 text-xs text-slate">PTSL matrix: severity × likelihood. Controls hierarchy-first: E eliminate · S substitute · I isolate · EC engineering · A administrative · PPE.</p>
        <div className="space-y-4">
          {c.tasks.map((t) => (
            <div key={t.n}>
              <p className="font-semibold">{t.n}. {t.title}</p>
              {t.quote_wording && <p className="text-xs text-slate">Quote: {t.quote_wording}</p>}
              <table className="mt-1 w-full text-sm"><thead><tr className="text-left text-xs text-slate">
                <th className="w-1/4 py-1">Hazard</th><th className="w-10">Before</th><th>Controls</th><th className="w-10">After</th><th className="w-28">Who</th>
              </tr></thead><tbody>
                {t.hazards.map((h, i) => (
                  <tr key={i} className="border-t border-mist align-top">
                    <td className="py-1 pr-2">{h.hazard}<span className="block text-xs text-slate">{h.harm}</span>
                      {h.hold_point && <span className="text-xs font-bold text-amber-800">{h.hold_point}</span>}</td>
                    <td><RiskChip r={h.initial} s={h.severity} l={h.likelihood} /></td>
                    <td className="pr-2"><ul>{h.controls.map((x, j) => <li key={j}><span className="font-mono text-xs font-bold" title={CONTROL_LABEL[x.type]}>{x.type}</span> {x.text}</li>)}</ul></td>
                    <td><RiskChip r={h.residual} s={h.res_severity} l={h.res_likelihood} /></td>
                    <td className="text-xs">{h.responsible}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      </Box>
      <div className="grid gap-4 md:grid-cols-2">
        <Box title="Plant, tools and equipment"><ul className="list-disc pl-5 text-sm">{c.plant.map((p, i) => <li key={i}>{p.item}{p.use ? ` – ${p.use}` : ""}{p.checks ? ` (${p.checks})` : ""}</li>)}</ul></Box>
        <Box title="PPE"><ul className="list-disc pl-5 text-sm">{c.ppe.map((p, i) => <li key={i}>{p.item} – {p.when}</li>)}</ul></Box>
        <Box title="Roles and responsibilities"><ul className="text-sm">{c.roles.map((r, i) => <li key={i}><span className="font-medium">{r.role}{r.name ? ` (${r.name})` : ""}</span>: {r.responsibilities}</li>)}</ul></Box>
        <Box title="Training and competency"><ul className="list-disc pl-5 text-sm">{c.training.map((t, i) => <li key={i}>{t.requirement}{t.who ? ` – ${t.who}` : ""}{t.note ? ` (${t.note})` : ""}</li>)}</ul></Box>
        <Box title="Permits"><ul className="list-disc pl-5 text-sm">{c.permits.map((p, i) => <li key={i}>{p.permit}{p.tasks?.length ? ` – task ${p.tasks.join(", ")}` : ""}{p.issued_by ? ` – ${p.issued_by}` : ""}</li>)}</ul></Box>
        <Box title="To confirm (legal weight – not asserted)"><ul className="list-disc pl-5 text-sm">{c.legal_flags.map((f, i) => <li key={i}><span className="font-medium">{f.kind.replace(/_/g, " ")}</span>: {f.reason}{f.confirm_with ? ` – confirm with ${f.confirm_with}` : ""}</li>)}</ul></Box>
        <Box title="Emergency">
          <dl className="text-sm">{Object.entries(c.emergency).filter(([k, v]) => k !== "procedures" && v).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k.replace(/_/g, " ")}: </dt><dd className="inline">{String(v)}</dd></div>)}</dl>
          {c.emergency.procedures?.length ? <ul className="mt-2 list-disc pl-5 text-sm">{c.emergency.procedures.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
        </Box>
        <Box title="Legislation and standards"><ul className="list-disc pl-5 text-sm">{c.legislation.map((l, i) => <li key={i}>{l}</li>)}</ul></Box>
      </div>
      {c.questions?.length ? <Box title="Still to answer"><ul className="list-disc pl-5 text-sm">{c.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></Box> : null}
    </div>
  );
}

function Jsa({ c, doc }: { c: HsContent; doc: HsDocument }) {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4" data-testid="hs-jsa">
      <p className="text-sm"><span className="font-semibold">EMERGENCY:</span> {c.emergency.emergency_number ?? "111"} · {c.emergency.hospital ?? "Hospital TBC"} · {c.emergency.office ?? "PTSL office 0800 776 360"}</p>
      {doc.hold_points.length > 0 && (
        <div className="grid gap-1 text-sm md:grid-cols-2">
          {doc.hold_points.map((h) => <p key={h.id}>☐ <span className="font-bold">{h.id}</span> {h.text}</p>)}
        </div>
      )}
      <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate"><th className="w-8">#</th><th>Step</th><th>Hazards</th><th>Key controls</th><th className="w-10">Risk</th></tr></thead>
        <tbody>{c.jsa.rows.map((r, i) => (
          <tr key={i} className="border-t border-mist align-top"><td className="py-1 font-semibold">{r.task}</td><td className="pr-2">{r.step}</td><td className="pr-2">{r.hazards}</td><td className="pr-2">{r.controls}</td><td><RiskChip r={r.risk} /></td></tr>
        ))}</tbody></table>
      {c.jsa.pre_start?.length ? <ul className="list-disc pl-5 text-sm">{c.jsa.pre_start.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
      <p className="text-xs text-slate">Crew sign-on happens in the plumber app (5b).</p>
    </div>
  );
}

function Redraft({ busy, onRedraft }: { busy: boolean; onRedraft: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="rounded-2xl bg-white p-4">
      <h3 className="font-semibold">Redraft</h3>
      <p className="text-sm text-slate">Tell the AI what to change (answers, corrections, things it missed). The hold point answers above go with it.</p>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-lg border border-mist px-2 py-1 text-sm"
        placeholder="e.g. Benchtop is laminate. Electrician is Sparky Ltd. Add a task for removing the old Zip filter." />
      <button disabled={busy} onClick={() => onRedraft(note)} className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-ink disabled:opacity-50">Redraft</button>
    </div>
  );
}
