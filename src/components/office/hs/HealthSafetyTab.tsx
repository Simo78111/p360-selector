"use client";
// The job page's Health & Safety tab (Phase 5a, 5b). One SWMS + JSA pack per job:
//   site details → (AI) task list → confirm tasks → (AI) full draft → hold points → approve → mark sent.
// 5b: Word / PDF downloads in house style (approving also files them on the job), who's booked and has signed on in
// the plumber app, older versions, and editing a single hazard or JSA row on screen.
// An AI draft is only ever a draft: it can't be marked sent until someone with "Can approve H&S documents" approves it.
// While the AI is working the tab checks back every 10 seconds.
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  hsApproveAction,
  hsConfirmTasksAction,
  hsFileAction,
  hsSaveAction,
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
  riskOf,
  SEVERITY,
  SITE_FIELDS,
  SITE_REQUIRED,
  STATUS_LABEL,
  type HsContent,
  type HsDocument,
  type HsJob,
  type HsTask,
  type Hazard,
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
  const [sure, setSure] = useState(false);
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
        setMsg(r.data.filing_error ? { err: `${ok}, but the documents weren't filed on the job: ${r.data.filing_error}. Use "File on the job again".` } : { ok });
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
            if (d && !sure) return setSure(true);
            setSure(false);
            act(() => hsStartAction(hs.job_id), "Drafting started");
          }} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-start">
            {!d ? "Draft SWMS and JSA" : sure ? `Yes – start v${d.version_no + 1} from the quote` : "New version"}
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
          onApprove={() => act(() => hsApproveAction(d.id), "Approved – the SWMS and JSA are filed on the job")}
          onSent={(note) => act(() => hsMarkSentAction(d.id, note), "Marked sent")}
          onFile={() => act(() => hsFileAction(d.id), "Filed on the job (Files tab)")}
          onSave={(content, change, ok) => act(() => hsSaveAction(d.id, content, change), ok)} />
      )}

      {d?.content && ["to_approve", "approved", "sent"].includes(d.status) && <SignOn hs={hs} />}

      {d && hs.can_edit && ["to_approve", "approved", "failed", "tasks_to_confirm"].includes(d.status) && (
        <Redraft busy={busy} onRedraft={(note) => act(() => hsRedraftAction(d.id, note), "Redraft started")} />
      )}

      {hs.older.some((o) => o.has_content) && (
        <div className="rounded-2xl bg-white p-4 text-sm">
          <h3 className="font-semibold">Older versions</h3>
          <ul className="mt-2 space-y-1">
            {hs.older.filter((o) => o.has_content).map((o) => (
              <li key={o.id}>
                v{o.version_no}{o.approved_at ? ` · approved ${new Date(o.approved_at).toLocaleDateString("en-NZ")}` : ""}
                {o.sent_at ? ` · sent ${new Date(o.sent_at).toLocaleDateString("en-NZ")}` : ""} ·{" "}
                <DocLinks id={o.id} />
              </li>
            ))}
          </ul>
        </div>
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

function Draft({ doc, content: c, hs, busy, onHold, onApprove, onSent, onFile, onSave }: {
  doc: HsDocument; content: HsContent; hs: HsJob; busy: boolean;
  onHold: (id: string, status: "open" | "answered" | "confirm_on_site", answer: string | null) => void;
  onApprove: () => void; onSent: (note: string | null) => void; onFile: () => void;
  onSave: (content: HsContent, change: string | null, ok: string) => void;
}) {
  const editable = hs.can_edit && (doc.status === "to_approve" || doc.status === "approved");
  const [view, setView] = useState<"swms" | "jsa">("swms");
  const [sentNote, setSentNote] = useState("");
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
          <span className="flex flex-wrap items-center gap-2">
            <input value={sentNote} onChange={(e) => setSentNote(e.target.value)} placeholder="Sent to whom / how (optional)"
              className="rounded-lg border border-mist px-2 py-1 text-sm" />
            <button disabled={busy} onClick={() => onSent(sentNote.trim() || null)}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="hs-sent">
              Mark as sent to the principal contractor
            </button>
          </span>
        )}
        {open > 0 && doc.status === "to_approve" && <span className="text-sm text-amber-800">{open} hold point{open === 1 ? "" : "s"} to answer or keep for site first.</span>}
        <span className="ml-auto text-xs text-slate">
          Highest risk before controls: {["E", "H", "M", "L", "N"].find((r) => highest.includes(r as Risk))}
        </span>
      </div>

      <div className="rounded-2xl bg-white p-4 text-sm" data-testid="hs-docs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold">Documents in house style:</span>
          <DocLinks id={doc.id} />
          {doc.status === "to_approve" && <span className="text-xs text-amber-800">Marked DRAFT until approved.</span>}
          {["approved", "sent"].includes(doc.status) && hs.can_edit && (
            <button disabled={busy} onClick={onFile} className="text-xs font-semibold text-aqua-deep disabled:opacity-50" data-testid="hs-file">
              File on the job again
            </button>
          )}
        </div>
        {doc.files && doc.files.length > 0 && (
          <p className="mt-2 text-xs text-slate">
            Filed on the job {new Date(doc.files[0].at).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}:{" "}
            {doc.files.map((f, i) => (
              <Fragment key={f.file_id}>{i ? " · " : ""}<a className="underline" href={`/api/office/job-file?id=${f.file_id}`} target="_blank" rel="noopener">{f.name}</a></Fragment>
            ))}
          </p>
        )}
        {editable && doc.status === "approved" && (
          <p className="mt-2 text-xs text-slate">Editing a row now takes it back to &ldquo;to approve&rdquo; and goes in the amendment log.</p>
        )}
      </div>

      <div className="flex gap-2">
        {(["swms", "jsa"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "bg-white"}`}>
            {v === "swms" ? "SWMS" : "JSA (toolbox talk)"}
          </button>
        ))}
      </div>
      {view === "swms"
        ? <Swms c={c} edit={editable ? { busy, approved: doc.status === "approved", onSave } : null} />
        : <Jsa c={c} doc={doc} edit={editable ? { busy, approved: doc.status === "approved", onSave } : null} />}
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

type Edit = { busy: boolean; approved: boolean; onSave: (content: HsContent, change: string | null, ok: string) => void } | null;

function Swms({ c, edit }: { c: HsContent; edit: Edit }) {
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
              <td className="py-1">{(h.where || h.reason || "").replace(/^N\/A\s*[–-]\s*not applicable to this scope[:.]?\s*/i, "")}</td>
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
                {edit && <th className="w-12" />}
              </tr></thead><tbody>
                {t.hazards.map((h, i) => (
                  <HazardRow key={i} c={c} task={t.n} index={i} h={h} edit={edit} />
                ))}
              </tbody></table>
              {edit && <AddHazard c={c} task={t.n} edit={edit} />}
            </div>
          ))}
        </div>
      </Box>
      <SwmsRest c={c} />
    </div>
  );
}

function HazardRowView({ h }: { h: Hazard }) {
  return (
    <>
                    <td className="py-1 pr-2">{h.hazard}<span className="block text-xs text-slate">{h.harm}</span>
                      {h.hold_point && <span className="text-xs font-bold text-amber-800">{h.hold_point}</span>}</td>
                    <td><RiskChip r={h.initial} s={h.severity} l={h.likelihood} /></td>
                    <td className="pr-2"><ul>{h.controls.map((x, j) => <li key={j}><span className="font-mono text-xs font-bold" title={CONTROL_LABEL[x.type]}>{x.type}</span> {x.text}</li>)}</ul></td>
                    <td><RiskChip r={h.residual} s={h.res_severity} l={h.res_likelihood} /></td>
                    <td className="text-xs">{h.responsible}</td>
    </>
  );
}

function SwmsRest({ c }: { c: HsContent }) {
  return (
    <>
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
    </>
  );
}

function Jsa({ c, doc, edit }: { c: HsContent; doc: HsDocument; edit: Edit }) {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4" data-testid="hs-jsa">
      <p className="text-sm"><span className="font-semibold">EMERGENCY:</span> {c.emergency.emergency_number ?? "111"} · {c.emergency.hospital ?? "Hospital TBC"} · {c.emergency.office ?? "PTSL office 0800 776 360"}</p>
      {doc.hold_points.length > 0 && (
        <div className="grid gap-1 text-sm md:grid-cols-2">
          {doc.hold_points.map((h) => <p key={h.id}>☐ <span className="font-bold">{h.id}</span> {h.text}</p>)}
        </div>
      )}
      <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate"><th className="w-8">#</th><th>Step</th><th>Hazards</th><th>Key controls</th><th className="w-10">Risk</th>{edit && <th className="w-12" />}</tr></thead>
        <tbody>{c.jsa.rows.map((r, i) => <JsaRow key={i} c={c} index={i} edit={edit} />)}</tbody></table>
      {c.jsa.pre_start?.length ? <ul className="list-disc pl-5 text-sm">{c.jsa.pre_start.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
      <p className="text-xs text-slate">The crew signs on in the plumber app before starting; signatures appear on the downloaded JSA and SWMS.</p>
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

// ── Phase 5b ────────────────────────────────────────────────────────────────────────────────────
function DocLinks({ id }: { id: string }) {
  const href = (kind: "swms" | "jsa", fmt: "pdf" | "docx") => `/api/office/hs-doc?id=${id}&kind=${kind}&fmt=${fmt}`;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {(["swms", "jsa"] as const).map((k) => (
        <span key={k} className="whitespace-nowrap">
          <span className="font-medium">{k.toUpperCase()}</span>{" "}
          <a className="font-semibold text-aqua-deep underline" href={href(k, "pdf")} target="_blank" rel="noopener" data-testid={`hs-${k}-pdf`}>PDF</a>{" · "}
          <a className="font-semibold text-aqua-deep underline" href={href(k, "docx")} data-testid={`hs-${k}-docx`}>Word</a>
        </span>
      ))}
    </span>
  );
}

/** Who's booked on the job and whether they've read and signed this version in the plumber app. */
function SignOn({ hs }: { hs: HsJob }) {
  const d = hs.document!;
  const people = hs.booked ?? [];
  const ready = d.status === "approved" || d.status === "sent";
  const signed = people.filter((p) => p.signed_at).length;
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="hs-signon">
      <h3 className="font-semibold">Worker sign-on {people.length > 0 && <span className="text-sm font-normal text-slate">· {signed} of {people.length} signed v{d.version_no}</span>}</h3>
      <p className="text-sm text-slate">
        {ready ? "Everyone booked on the job reads and signs the SWMS in the plumber app before they can start."
               : "Once approved, everyone booked on the job reads and signs it in the plumber app before they can start."}
      </p>
      {people.length ? (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.staff_id} className="flex justify-between gap-2 rounded-lg bg-mist/40 px-3 py-1.5">
              <span>{p.name}{p.next_start && <span className="text-xs text-slate"> · next {new Date(p.next_start).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "Pacific/Auckland" })}</span>}</span>
              {p.signed_at ? <span className="text-emerald-800">✓ {new Date(p.signed_at).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                           : <span className={ready ? "font-semibold text-amber-800" : "text-slate"}>{ready ? "Not signed" : "–"}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-slate">Nobody is booked on this job in the diary yet.</p>}
    </div>
  );
}

// Editing single rows: the change is checked by the database like a draft (matrix, PPE-only, hold points).
const CONTROL_TYPES = ["E", "S", "I", "EC", "A", "PPE"] as const;
const controlsText = (h: Hazard) => h.controls.map((x) => `${x.type}: ${x.text}`).join("\n");
function parseControls(t: string) {
  const out: Hazard["controls"] = [];
  for (const line of t.split(/\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(EC|PPE|E|S|I|A)\s*[:\-–]\s*(.+)$/i.exec(line);
    if (!m) throw new Error(`Start each control with its type, e.g. "A: Two-person lift" (${line.slice(0, 40)})`);
    out.push({ type: m[1].toUpperCase() as Hazard["controls"][number]["type"], text: m[2].trim() });
  }
  if (!out.length) throw new Error("Add at least one control.");
  return out;
}
const withTask = (c: HsContent, task: number, fn: (hz: Hazard[]) => Hazard[]): HsContent => ({
  ...c, tasks: c.tasks.map((t) => (t.n === task ? { ...t, hazards: fn([...t.hazards]) } : t)),
});

function HazardRow({ c, task, index, h, edit }: { c: HsContent; task: number; index: number; h: Hazard; edit: Edit }) {
  const [open, setOpen] = useState(false);
  if (!open || !edit) {
    return (
      <tr className="border-t border-mist align-top">
        <HazardRowView h={h} />
        {edit && <td><button className="text-xs font-semibold text-aqua-deep" onClick={() => setOpen(true)} data-testid="hs-edit-row">Edit</button></td>}
      </tr>
    );
  }
  const only = (c.tasks.find((t) => t.n === task)?.hazards.length ?? 0) <= 1;
  return (
    <tr className="border-t border-mist"><td colSpan={6} className="py-2">
      <HazardForm h={h} edit={edit} onCancel={() => setOpen(false)}
        onRemove={only ? undefined : (change) => edit.onSave(withTask(c, task, (hz) => hz.filter((_, i) => i !== index)), change, "Row removed")}
        onSave={(nh, change) => edit.onSave(withTask(c, task, (hz) => hz.map((x, i) => (i === index ? nh : x))), change, "Row saved")}
        what={`Task ${task} row ${index + 1}`} />
    </td></tr>
  );
}

function AddHazard({ c, task, edit }: { c: HsContent; task: number; edit: NonNullable<Edit> }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="mt-1 text-xs font-semibold text-aqua-deep" onClick={() => setOpen(true)}>+ Add a hazard to task {task}</button>;
  const blank: Hazard = { hazard: "", harm: "", severity: 2, likelihood: 2, initial: "L", controls: [], res_severity: 2, res_likelihood: 1, residual: "N", responsible: "Site Lead" };
  return (
    <div className="mt-2"><HazardForm h={blank} edit={edit} onCancel={() => setOpen(false)} what={`Task ${task} new row`}
      onSave={(nh, change) => edit.onSave(withTask(c, task, (hz) => [...hz, nh]), change, "Row added")} /></div>
  );
}

function HazardForm({ h, edit, onSave, onRemove, onCancel, what }: {
  h: Hazard; edit: NonNullable<Edit>; what: string; onCancel: () => void;
  onSave: (h: Hazard, change: string | null) => void; onRemove?: (change: string | null) => void;
}) {
  const [v, setV] = useState({ hazard: h.hazard, harm: h.harm, sev: h.severity, like: h.likelihood, rsev: h.res_severity, rlike: h.res_likelihood,
    controls: controlsText(h), responsible: h.responsible, hold: h.hold_point ?? "", change: "" });
  const [err, setErr] = useState("");
  const pick = (k: "sev" | "like" | "rsev" | "rlike", list: readonly string[]) => (
    <select value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="rounded border border-mist px-1 py-0.5 text-sm">
      {list.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
    </select>
  );
  const save = () => {
    try {
      if (!v.hazard.trim()) throw new Error("Describe the hazard.");
      const initial = riskOf(v.sev, v.like)!;
      const residual = riskOf(v.rsev, v.rlike)!;
      onSave({ ...h, hazard: v.hazard.trim(), harm: v.harm.trim(), severity: v.sev, likelihood: v.like, initial,
        controls: parseControls(v.controls), res_severity: v.rsev, res_likelihood: v.rlike, residual,
        responsible: v.responsible.trim() || "Site Lead", ...(v.hold.trim() ? { hold_point: v.hold.trim() } : { hold_point: undefined }) },
      edit.approved ? (v.change.trim() || `${what} edited`) : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-aqua/40 bg-aqua-pale/30 p-3 text-sm" data-testid="hs-row-form">
      <div className="grid gap-2 md:grid-cols-2">
        <label>Hazard / what could go wrong<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.hazard} onChange={(e) => setV({ ...v, hazard: e.target.value })} /></label>
        <label>Harm<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.harm} onChange={(e) => setV({ ...v, harm: e.target.value })} /></label>
      </div>
      <p className="flex flex-wrap items-center gap-2">Before controls: {pick("sev", SEVERITY)} × {pick("like", LIKELIHOOD)} = <RiskChip r={riskOf(v.sev, v.like)!} /></p>
      <label className="block">Controls – one per line, hierarchy first (types: {CONTROL_TYPES.join(", ")})
        <textarea rows={4} className="mt-0.5 w-full rounded border border-mist px-2 py-1 font-mono text-xs" value={v.controls}
          placeholder={"EC: Wet coring with slurry vac\nA: Exclusion zone below\nPPE: P2 mask"} onChange={(e) => setV({ ...v, controls: e.target.value })} /></label>
      <p className="flex flex-wrap items-center gap-2">With controls: {pick("rsev", SEVERITY)} × {pick("rlike", LIKELIHOOD)} = <RiskChip r={riskOf(v.rsev, v.rlike)!} /></p>
      <div className="grid gap-2 md:grid-cols-2">
        <label>Responsible<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.responsible} onChange={(e) => setV({ ...v, responsible: e.target.value })} /></label>
        <label>Hold point (if any)<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.hold} placeholder="HP1" onChange={(e) => setV({ ...v, hold: e.target.value })} /></label>
      </div>
      {edit.approved && <label className="block">What changed (amendment log)<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.change} onChange={(e) => setV({ ...v, change: e.target.value })} /></label>}
      {err && <p className="text-red-800">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={edit.busy} onClick={save} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50" data-testid="hs-row-save">Save row</button>
        <button onClick={onCancel} className="text-xs text-slate underline">Cancel</button>
        {onRemove && <button disabled={edit.busy} onClick={() => onRemove(edit.approved ? (v.change.trim() || `${what} removed`) : null)} className="ml-auto text-xs text-red-700 underline">Remove row</button>}
      </div>
    </div>
  );
}

function JsaRow({ c, index, edit }: { c: HsContent; index: number; edit: Edit }) {
  const r = c.jsa.rows[index];
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ step: r.step, hazards: r.hazards, controls: r.controls, risk: r.risk, change: "" });
  if (!open || !edit) {
    return (
      <tr className="border-t border-mist align-top">
        <td className="py-1 font-semibold">{r.task}</td><td className="pr-2">{r.step}</td><td className="pr-2">{r.hazards}</td><td className="pr-2">{r.controls}</td><td><RiskChip r={r.risk} /></td>
        {edit && <td><button className="text-xs font-semibold text-aqua-deep" onClick={() => setOpen(true)}>Edit</button></td>}
      </tr>
    );
  }
  const rows = (fn: (x: HsContent["jsa"]["rows"]) => HsContent["jsa"]["rows"]) => ({ ...c, jsa: { ...c.jsa, rows: fn([...c.jsa.rows]) } });
  const change = () => (edit.approved ? (v.change.trim() || `JSA row ${index + 1} edited`) : null);
  return (
    <tr className="border-t border-mist"><td colSpan={6} className="py-2">
      <div className="space-y-2 rounded-xl border border-aqua/40 bg-aqua-pale/30 p-3 text-sm">
        <label className="block">Step<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.step} onChange={(e) => setV({ ...v, step: e.target.value })} /></label>
        <label className="block">Hazards (separate with ;)<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.hazards} onChange={(e) => setV({ ...v, hazards: e.target.value })} /></label>
        <label className="block">Key controls (separate with ;)<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.controls} onChange={(e) => setV({ ...v, controls: e.target.value })} /></label>
        <label>Risk <select value={v.risk} onChange={(e) => setV({ ...v, risk: e.target.value as Risk })} className="rounded border border-mist px-1 py-0.5">
          {(["N", "L", "M", "H", "E"] as Risk[]).map((k) => <option key={k} value={k}>{k} – {RISK_LABEL[k]}</option>)}</select></label>
        {edit.approved && <label className="block">What changed (amendment log)<input className="mt-0.5 w-full rounded border border-mist px-2 py-1" value={v.change} onChange={(e) => setV({ ...v, change: e.target.value })} /></label>}
        <div className="flex gap-2">
          <button disabled={edit.busy || !v.step.trim()} onClick={() => edit.onSave(rows((x) => x.map((y, i) => (i === index ? { ...y, step: v.step.trim(), hazards: v.hazards.trim(), controls: v.controls.trim(), risk: v.risk } : y))), change(), "JSA row saved")}
            className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save row</button>
          <button onClick={() => setOpen(false)} className="text-xs text-slate underline">Cancel</button>
          {c.jsa.rows.length > 1 && <button disabled={edit.busy} onClick={() => edit.onSave(rows((x) => x.filter((_, i) => i !== index)), change(), "JSA row removed")} className="ml-auto text-xs text-red-700 underline">Remove row</button>}
        </div>
      </div>
    </td></tr>
  );
}
