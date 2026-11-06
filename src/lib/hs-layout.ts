// SWMS and JSA layouts in PTSL house style (Phase 5b). Builds one description of each document — headings, paragraphs
// and tables with column widths, fills and bold — that the Word renderer (hs-docx.ts) and the PDF renderer (hs-pdf.ts)
// both draw, so the two files always match. The style follows Simon's finished documents (engine repo docs/hs/examples,
// Friendship House SWMS-PTSL-19628-01 and its JSA): landscape A4, logo header, orange management approval block,
// PTSL risk matrix with colour key, hold point tick boxes, sign-on sheet, amendment log, principal contractor acceptance
// to sign by hand. No server-only imports: tested by scripts/test-hs-docs.ts.
import { LIKELIHOOD, RISK_LABEL, SEVERITY, type HoldPoint, type HsContent, type HsDocument, type HsTickets, type Risk, type SiteDetails } from "./hs-shared";

// ── The description ─────────────────────────────────────────────────────────────────────────────
export type Run = { t: string; b?: boolean; i?: boolean; color?: string; size?: number };
/** A paragraph. `box` draws an empty tick box before it; `bullet` a bullet. */
export type Para = { runs: Run[]; bullet?: boolean; box?: boolean; align?: "left" | "center" };
/** `sig` = a signature drawn in the plumber app (SVG path on a 300×100 box); the PDF draws it, Word says it was signed. */
export type Cell = { paras: Para[]; fill?: string; span?: number; sig?: string | null; minH?: number };
export type Row = { cells: Cell[]; header?: boolean };
export type Table = { kind: "table"; widths: number[]; rows: Row[]; repeatHeader?: number; size?: number };
export type Block =
  | { kind: "title"; text: string; sub?: string; note?: string }
  | { kind: "h"; text: string; color?: string }
  | { kind: "p"; para: Para; size?: number }
  | Table
  | { kind: "gap"; pt: number }
  | { kind: "break" };
export type Layout = {
  name: string;                // file name without extension
  title: string;               // document properties
  header: string;              // beside the logo on every page
  footer: string;              // left of "Page x of y"
  draft: boolean;              // not approved yet: a red DRAFT line in the header
  blocks: Block[];
  /** a different header logo (base64 PNG); default the Project 360 + Master Plumbers one */
  logo?: { png: string; w: number; h: number };
};

// ── House colours (from the example documents) ──────────────────────────────────────────────────
export const C = {
  ink: "1F2328", head: "3B4650", label: "F2F2F2", aqua: "1B9AAA", task: "DDEBF7",
  orange: "ED7D31", orangeDark: "C55A11", peach: "FCE4D6", red: "C00000", redFill: "FF7C80", grey: "6B7280", white: "FFFFFF",
};
export const RISK_FILL: Record<Risk, string> = { N: "C6E0B4", L: "E2EFDA", M: "FFE699", H: "F4B183", E: "FF7C80" };

// ── What a document is drawn from ───────────────────────────────────────────────────────────────
export type HsSignoff = { staff_id: string; name: string; signed_at: string; version_no?: number; signature_svg?: string | null };
export type HsPrint = {
  job: { ref: string; title: string | null; site: string; customer: string };
  company: { name: string; legal_name: string; address: string | null; phone: string | null };
  document: HsDocument & { content: HsContent };
  site: SiteDetails;
  crew: { staff_id: string; name: string; trade?: string | null; apprentice?: boolean }[];
  signoffs: HsSignoff[];      // for this version
  /** 5c: the booked crew's licences and tickets against what the tasks need (office_hs_print → hs_crew_tickets) */
  tickets?: HsTickets | null;
  approved_role?: string | null;
  printed_at: string;         // ISO
};

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
const r = (t: string | null | undefined, o: Omit<Run, "t"> = {}): Run => ({ t: String(t ?? ""), ...o });
const p = (t: string | null | undefined, o: Omit<Run, "t"> = {}, extra: Omit<Para, "runs"> = {}): Para => ({ runs: [r(t, o)], ...extra });
const cell = (t: string | null | undefined, o: Partial<Cell> & { run?: Omit<Run, "t"> } = {}): Cell => {
  const { run, ...rest } = o;
  return { paras: String(t ?? "").split(/\n/).map((x) => p(x, run)), ...rest };
};
const label = (t: string, o: Partial<Cell> = {}) => cell(t, { fill: C.label, run: { b: true }, ...o });
const head = (cols: string[], fill = C.head) => ({ header: true, cells: cols.map((c) => cell(c, { fill, run: { b: true, color: C.white } })) });
const table = (widths: number[], rows: Row[], repeatHeader = 0, size?: number): Table => ({ kind: "table", widths, rows, repeatHeader, size });
const bullets = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && !!x.trim()).map((x) => p(x, {}, { bullet: true }));
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : Array.isArray(v) ? v.map((x) => s(x)).join(", ") : JSON.stringify(v));

export const nzDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: iso.length === 10 ? "UTC" : "Pacific/Auckland" });
};
export const nzDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });

/** "SWMS-PTSL-3027-01", Rev 0 = version 1. */
export function docRefs(x: HsPrint) {
  const base = `${x.job.ref}-${String(x.document.version_no).padStart(2, "0")}`;
  return { swms: `SWMS-${base}`, jsa: `JSA-${base}`, rev: `Rev ${x.document.version_no - 1}` };
}
const issueState = (d: HsDocument) =>
  d.status === "sent" ? "issued" : d.status === "approved" ? "approved for issue" : "DRAFT – not approved";
const safeName = (t: string) => t.normalize("NFKD").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

function riskCell(risk: Risk, sev?: number, like?: number): Cell {
  const sub = sev && like ? `${SEVERITY[sev - 1]} × ${LIKELIHOOD[like - 1]}` : RISK_LABEL[risk];
  return { fill: RISK_FILL[risk], paras: [p(risk, { b: true, size: 11 }, { align: "center" }), p(sub, { size: 6.5 }, { align: "center" })] };
}

function holdState(h: HoldPoint): Cell {
  if (h.status === "answered") return cell(`Closed: ${h.answer ?? ""}\n${h.answered_by ?? ""} ${nzDate(h.answered_at)}`, { run: { size: 7.5 } });
  if (h.status === "confirm_on_site") return { paras: [p("Confirm on site", { b: true, size: 7.5 }, { box: true }), p("Sign / date:", { size: 7.5 })] };
  return { paras: [p("OPEN", { b: true, color: C.red, size: 7.5 })] };
}

function approvalBlock(x: HsPrint): Block[] {
  const d = x.document;
  const c = d.content.document;
  return [
    table([22, 26, 22, 18, 12], [
      { cells: [cell("PTSL MANAGEMENT APPROVAL – required before issue to principal contractor", { span: 5, fill: C.orange, run: { b: true, color: C.white } })] },
      { header: true, cells: ["", "Name", "Role", "Signature", "Date"].map((t) => cell(t, { fill: C.orangeDark, run: { b: true, color: C.white } })) },
      { cells: [label("Prepared by", { fill: C.peach }), cell(c.prepared_by || d.created_by), cell("Drafted with AI from the quote; checked in the job system"), cell(""), cell(nzDate(d.finished_at ?? d.created_at))] },
      { cells: [label("Reviewed and approved by", { fill: C.peach }), cell(d.approved_by ?? ""), cell(x.approved_role ?? (d.approved_by ? "Management approval" : "")),
        cell(d.approved_at ? "Approved in the job system" : "", { minH: 22 }), cell(nzDate(d.approved_at))] },
    ]),
  ];
}

function pcAcceptance(x: HsPrint, n: number): Block {
  const pc = s(x.site.principal_contractor) || x.document.content.document.principal_contractor || "Principal contractor";
  return table([22, 26, 22, 18, 12], [
    { cells: [cell(`${n}. PRINCIPAL CONTRACTOR REVIEW AND ACCEPTANCE – ${pc}`, { span: 5, fill: C.orange, run: { b: true, color: C.white } })] },
    { header: true, cells: ["", "Name", "Position", "Signature", "Date"].map((t) => cell(t, { fill: C.orangeDark, run: { b: true, color: C.white } })) },
    { cells: [label("Reviewed and accepted by", { fill: C.peach }), cell("", { minH: 30 }), cell(""), cell(""), cell("")] },
    { cells: [label("Comments / conditions", { fill: C.peach }), cell("", { span: 4, minH: 40 })] },
  ]);
}

/** Everyone who has to sign (signed first, then the booked crew still to sign), plus blank rows. */
function signRows(x: HsPrint, blanks: number) {
  const signed = new Map(x.signoffs.map((o) => [o.staff_id, o]));
  const rows: { name: string; sig: string | null; when: string; signed: boolean }[] = x.signoffs.map((o) => ({
    name: o.name, sig: o.signature_svg ?? null, when: nzDateTime(o.signed_at), signed: true,
  }));
  for (const c of x.crew) if (!signed.has(c.staff_id)) rows.push({ name: c.name, sig: null, when: "", signed: false });
  for (let i = 0; i < blanks; i++) rows.push({ name: "", sig: null, when: "", signed: false });
  return rows;
}

// ── SWMS ────────────────────────────────────────────────────────────────────────────────────────
export function swmsLayout(x: HsPrint): Layout {
  const d = x.document;
  const c = d.content;
  const doc = c.document;
  const ref = docRefs(x);
  const site = s(x.site.site_address) || x.job.site;
  const pc = s(x.site.principal_contractor) || doc.principal_contractor || "";
  const B: Block[] = [];
  let n = 0;
  const h = (t: string) => B.push({ kind: "h", text: `${++n}. ${t}` });

  B.push({ kind: "title", text: "SAFE WORK METHOD STATEMENT", sub: doc.title });
  h("Document and project details");
  B.push(table([16, 34, 16, 34], [
    { cells: [label("Company"), cell(x.company.name), label("SWMS reference"), cell(`${ref.swms} – ${ref.rev} (${issueState(d)})`)] },
    { cells: [label("Address / phone"), cell([x.company.address, x.company.phone].filter(Boolean).join("  |  ")), label("Job / quote ref"),
      cell([x.job.ref, d.quote_number ? `quote ${d.quote_number}` : null].filter(Boolean).join(" – "))] },
    { cells: [label("Principal contractor"), cell(pc), label("Date issued"), cell(nzDate(d.sent_at ?? d.approved_at) || "Not issued yet")] },
    { cells: [label("PC contacts"), cell(s(x.site.pc_contact) || doc.pc_contacts || "TBC"), label("Planned work dates"), cell(s(x.site.work_dates) || doc.planned_dates || "TBC")] },
    { cells: [label("Site"), cell(site), label("Drawings basis"), cell(s(x.site.drawings) || doc.drawings_basis || "–")] },
    { cells: [label("Site type"), cell(s(x.site.site_type) || doc.site_type || "", { span: 3 })] },
  ]));
  B.push({ kind: "gap", pt: 8 }, ...approvalBlock(x));

  h("Scope of works");
  B.push({ kind: "p", para: p(doc.scope_plain) });
  B.push(table([6, 40, 54], [
    head(["#", "Task (SWMS Section " + (n + 7) + ")", "From the quote"]),
    ...c.tasks.map((t) => ({ cells: [cell(String(t.n)), cell(t.title), cell(t.quote_wording || "", { run: { i: true } })] })),
  ], 1));
  if (doc.occupancy_note) {
    h("Site occupancy and the public");
    B.push({ kind: "p", para: p(doc.occupancy_note) });
  }

  h("Hold points – work must not start until each is closed");
  B.push({ kind: "p", para: p("These items carry legal or safety-critical weight and could not be confirmed from the information provided. They are flagged for confirmation, not assumed compliant.", { i: true }) });
  if (d.hold_points.length) {
    B.push(table([6, 30, 24, 14, 8, 18], [
      head(["#", "Hold point", "Why it matters", "Responsible", "Before task", "Closed – sign / date"]),
      ...d.hold_points.map((hp) => ({ cells: [
        cell(hp.id, { run: { b: true }, fill: hp.status === "answered" ? undefined : C.peach }), cell(hp.text), cell(hp.why ?? ""),
        cell(hp.who), cell((hp.tasks ?? []).join(", ")), holdState(hp),
      ] })),
    ], 1));
  } else B.push({ kind: "p", para: p("None – nothing safety-critical was left unconfirmed.") });

  h("Legislation, codes and standards");
  B.push(...c.legislation.map((l) => ({ kind: "p" as const, para: p(l, {}, { bullet: true }) })));

  h("Roles and responsibilities");
  B.push(table([24, 22, 54], [head(["Role", "Name", "Responsibilities"]), ...c.roles.map((x2) => ({ cells: [cell(x2.role, { run: { b: true } }), cell(x2.name ?? ""), cell(x2.responsibilities)] }))], 1));

  h("Plant, tools and equipment register");
  if (c.plant.length) B.push(table([34, 22, 44], [head(["Item", "Tasks / use", "Pre-use check"]), ...c.plant.map((x2) => ({ cells: [cell(x2.item), cell(x2.use ?? ""), cell(x2.checks ?? "")] }))], 1));
  else B.push({ kind: "p", para: p("No plant beyond hand tools.") });

  h("Hazard applicability summary and risk matrix");
  const STATUS = { applicable: "Applicable", by_others: "Applicable – by others", hold: "Applicable – HOLD POINT", na: "N/A – not applicable to this scope" };
  B.push(table([24, 22, 54], [
    head(["Hazard category", "Status", "Where it applies / reason"]),
    ...c.hazard_summary.map((x2) => ({ cells: [
      cell(x2.category, { run: { b: true } }),
      cell(STATUS[x2.status] ?? x2.status, { fill: x2.status === "hold" ? C.peach : x2.status === "na" ? C.label : undefined }),
      cell((x2.where || x2.reason || "").replace(/^N\/A\s*[–-]\s*not applicable to this scope[:.]?\s*/i, "")),
    ] })),
  ], 1));
  B.push({ kind: "gap", pt: 6 }, ...riskMatrix());

  h("Task-by-task hazard, risk and control table");
  B.push({ kind: "p", para: { runs: [r("Control codes (hierarchy, most to least effective): ", { b: true, size: 8 }),
    r("E = Eliminate · S = Substitute · I = Isolate · EC = Engineering · A = Administrative · PPE = Personal protective equipment", { size: 8 })] } });
  const rows: Row[] = [head(["#", "Hazard / what could go wrong", "Initial risk", "Controls (hierarchy-first)", "Residual risk", "Responsible"])];
  for (const t of c.tasks) {
    rows.push({ cells: [{ span: 6, fill: C.task, paras: [p(`Task ${t.n} – ${t.title}`, { b: true }), ...(t.quote_wording ? [p(`Quote line: ${t.quote_wording}`, { i: true, size: 7.5 })] : [])] }] });
    t.hazards.forEach((hz, i) => rows.push({ cells: [
      cell(`${t.n}.${i + 1}`),
      { paras: [p(hz.hazard), ...(hz.harm ? [p(hz.harm, { i: true, size: 7.5, color: C.grey })] : []), ...(hz.hold_point ? [p(hz.hold_point, { b: true, size: 7.5, color: C.orangeDark })] : [])] },
      riskCell(hz.initial, hz.severity, hz.likelihood),
      { paras: hz.controls.map((k) => ({ runs: [r(`${k.type}  `, { b: true, color: C.aqua }), r(k.text)], bullet: true })) },
      riskCell(hz.residual, hz.res_severity, hz.res_likelihood),
      cell(hz.responsible),
    ] }));
  }
  B.push(table([5, 22, 9, 44, 9, 11], rows, 1));

  h("PPE requirements (task-specific)");
  B.push(table([30, 70], [head(["PPE", "When / tasks"]), ...c.ppe.map((x2) => ({ cells: [cell(x2.item, { run: { b: true } }), cell(x2.when)] }))], 1));

  h("Emergency procedures and contacts");
  const e = c.emergency;
  const contacts: [string, string | undefined][] = [
    ["Emergency services", e.emergency_number || "111"], ["Nearest hospital", s(x.site.hospital) || e.hospital], ["Urgent care", e.urgent_care],
    ["Assembly point", s(x.site.assembly_point) || e.assembly_point], ["First aider", s(x.site.first_aider) || e.first_aider],
    ["Site contact", e.site_contact], ["PTSL office", e.office || "Project Three Sixty Ltd – 0800 776 360"], ["WorkSafe NZ", "0800 030 040"],
  ];
  B.push(table([26, 74], [head(["Contact", "Details"]), ...contacts.filter(([, v]) => v).map(([k, v]) => ({ cells: [label(k), cell(v)] }))], 1));
  if (e.procedures?.length) B.push({ kind: "gap", pt: 4 }, ...e.procedures.map((x2) => ({ kind: "p" as const, para: p(x2, {}, { bullet: true }) })));

  h("Training and competency");
  B.push(table([44, 22, 34], [head(["Requirement", "Who", "Evidence / note"]), ...c.training.map((x2) => ({ cells: [cell(x2.requirement), cell(x2.who ?? ""), cell(x2.note ?? "")] }))], 1));
  // 5c: the crew booked and their licences / tickets (from Settings → Staff), with anything missing or expired flagged
  const tk = x.tickets;
  if (tk && tk.crew.length) {
    B.push({ kind: "gap", pt: 4 });
    const fmt = (t: HsTickets["crew"][number]["tickets"][number]) =>
      `${t.label}${t.number ? ` ${t.number}` : ""}${t.expires_on ? ` – ${t.state === "expired" ? "EXPIRED" : "exp."} ${nzDate(t.expires_on)}` : ""}`;
    const rows: Row[] = tk.crew.map((m) => {
      const bad = m.problems.map((q) => `${q.label} ${q.state === "expired" ? "expired" : "missing"}${q.tasks.length ? ` (task ${q.tasks.join(", ")})` : ""}`);
      return { cells: [label(m.name), cell(m.tickets.map(fmt).join("\n") || "None on file"),
        cell(bad.length ? bad.join("\n") : "All current", { fill: bad.length ? C.peach : undefined, run: bad.length ? { b: true } : undefined })] };
    });
    for (const q of tk.crew_problems) {
      rows.push({ cells: [label("Crew"), cell(`At least one person needs ${q.label}${q.tasks.length ? ` (task ${q.tasks.join(", ")})` : ""}`),
        cell(q.state === "expired" ? "Held but expired" : "Nobody booked holds it", { fill: C.peach, run: { b: true } })] });
    }
    B.push(table([24, 50, 26], [head(["Crew booked", "Licences and tickets held", "To sort before work"]), ...rows], 1));
  }

  if (c.permits.length || c.legal_flags.length) {
    h("Permits and matters to confirm");
    if (c.permits.length) B.push(table([44, 22, 34], [head(["Permit", "Tasks", "Issued by"]), ...c.permits.map((x2) => ({ cells: [cell(x2.permit), cell((x2.tasks ?? []).join(", ")), cell(x2.issued_by ?? "")] }))], 1));
    if (c.legal_flags.length) {
      B.push({ kind: "gap", pt: 4 }, { kind: "p", para: p("Legal determinations flagged for confirmation (not asserted):", { b: true }) });
      B.push(table([24, 50, 26], [head(["Matter", "Why", "Confirm with"]), ...c.legal_flags.map((x2) => ({ cells: [cell(x2.kind.replace(/_/g, " ")), cell(x2.reason), cell(x2.confirm_with ?? "")] }))], 1));
    }
  }

  h("Worker consultation and sign-on");
  B.push({ kind: "p", para: p("By signing, I confirm I have read (or been taken through) this SWMS, understand the hazards and controls, and will follow it. Signatures made in the plumber app are shown with the time signed.") });
  B.push(table([34, 40, 26], [head(["Name", "Signature", "Date / time"]),
    ...signRows(x, 3).map((o) => ({ cells: [cell(o.name), { paras: [p(o.signed && !o.sig ? "Signed in the plumber app" : "", { size: 7.5, i: true })], sig: o.sig, minH: 26 }, cell(o.when)] }))], 1));

  h("Review and amendment log");
  const log: Row[] = [head(["Rev", "Date", "Description of change", "By", "Approved"]),
    { cells: [cell(ref.rev), cell(nzDate(d.finished_at ?? d.created_at)), cell(`Issued for review – drafted from ${d.quote_number ? `quote ${d.quote_number}` : "the job"}${d.redraft_note ? `; redrafted: ${d.redraft_note.slice(0, 200)}` : ""}`), cell(d.created_by), cell(d.approved_by ? `${d.approved_by} ${nzDate(d.approved_at)}` : "")] },
    ...(d.changes ?? []).filter((ch) => ch.version_no === d.version_no).map((ch) => ({ cells: [cell(ref.rev), cell(nzDate(ch.at)), cell(ch.summary), cell(ch.by), cell("")] })),
  ];
  for (let i = 0; i < 2; i++) log.push({ cells: [cell(""), cell(""), cell("", { minH: 18 }), cell(""), cell("")] });
  B.push(table([8, 12, 50, 16, 14], log, 1));
  B.push({ kind: "gap", pt: 10 }, pcAcceptance(x, ++n));

  return {
    name: `${ref.swms}_${safeName(x.job.title || x.job.site)}`, title: `${ref.swms} ${doc.title}`,
    header: `SWMS  |  ${x.job.ref}  |  ${site}`, footer: `${ref.swms} ${ref.rev} (${issueState(d)})  ·  Uncontrolled when printed  ·  ${x.company.legal_name}`,
    draft: !["approved", "sent"].includes(d.status), blocks: B,
  };
}

export function riskMatrix(): Block[] {
  const M = ["NNLLM", "NLLMM", "LLMHH", "MMHHE", "HHHEE"];
  const rows: Row[] = [head(["Severity / Likelihood", ...LIKELIHOOD])];
  for (let sv = 5; sv >= 1; sv--) {
    rows.push({ cells: [label(SEVERITY[sv - 1]),
      ...M[sv - 1].split("").map((k): Cell => ({ fill: RISK_FILL[k as Risk], paras: [p(k, { b: true }, { align: "center" })] }))] });
  }
  const KEY: [Risk, string][] = [
    ["N", "Negligible – acceptable, OK to proceed."], ["L", "Low – acceptable; improve through continuous improvement."],
    ["M", "Medium – tolerable; manage by method statement, supervision and monitoring."],
    ["H", "High – high priority; manage by specialist knowledge, planning and supervision. Must be addressed before work proceeds."],
    ["E", "Extreme – unacceptable. DO NOT PROCEED."],
  ];
  return [
    { kind: "p", para: p("PTSL risk matrix (Project 360 H&S Policy) – rating = Severity × Likelihood", { b: true }) },
    table([20, 16, 16, 16, 16, 16], rows),
    { kind: "gap", pt: 6 },
    table([8, 92], KEY.map(([k, t]) => ({ cells: [{ fill: RISK_FILL[k], paras: [p(k, { b: true }, { align: "center" })] }, cell(t)] }))),
    { kind: "p", para: p("Initial rating = no controls in place. Residual rating = with all listed controls in place; both severity and likelihood are reassessed.", { i: true, size: 7.5 }) },
  ];
}

// ── JSA (toolbox talk) ──────────────────────────────────────────────────────────────────────────
export function jsaLayout(x: HsPrint): Layout {
  const d = x.document;
  const c = d.content;
  const ref = docRefs(x);
  const site = s(x.site.site_address) || x.job.site;
  const pc = s(x.site.principal_contractor) || c.document.principal_contractor || "";
  const e = c.emergency;
  const B: Block[] = [];
  B.push({ kind: "title", text: "JOB SAFETY ANALYSIS – TOOLBOX TALK",
    note: `Read with ${ref.swms} (full controls, hold points and emergency procedures). Go through every step with the crew before work starts.` });
  B.push(table([12, 22, 10, 22, 12, 22], [
    { cells: [label("Job / quote"), cell(`${x.job.ref}${d.quote_number ? ` – quote ${d.quote_number}` : ""}`), label("Site"), cell(site), label("Principal contractor"), cell(pc)] },
    { cells: [label("JSA ref"), cell(`${ref.jsa} ${ref.rev}`), label("Date"), cell(""), label("PC site manager"), cell(s(x.site.pc_contact) || c.document.pc_contacts || "")] },
    { cells: [label("PTSL Site Lead"), cell(""), label("First aider"), cell(s(x.site.first_aider) || e.first_aider || ""), label("Assembly point"), cell(s(x.site.assembly_point) || e.assembly_point || "")] },
    { cells: [cell("EMERGENCY", { fill: C.redFill, run: { b: true } }),
      cell([e.emergency_number || "111", s(x.site.hospital) || e.hospital, e.urgent_care, e.office || "PTSL office 0800 776 360"].filter(Boolean).join("  ·  "), { span: 5, run: { b: true } })] },
  ]));

  if (d.hold_points.length) {
    B.push({ kind: "gap", pt: 6 }, { kind: "p", para: p("PRE-START HOLD POINTS – tick when confirmed. Any box not ticked = do not start that work.", { b: true, color: C.orangeDark }) });
    const hps = d.hold_points;
    const rows: Row[] = [];
    for (let i = 0; i < hps.length; i += 2) {
      const one = (hp?: HoldPoint): Cell[] => (hp
        ? [{ paras: [p(hp.id, { b: true }, { box: true })] }, cell(hp.status === "answered" ? `${hp.text} – confirmed: ${hp.answer ?? ""}` : hp.text, { run: { size: 7.5 } })]
        : [cell(""), cell("")]);
      rows.push({ cells: [...one(hps[i]), ...one(hps[i + 1])] });
    }
    B.push(table([7, 43, 7, 43], rows));
  }

  B.push({ kind: "gap", pt: 6 });
  const pre = c.jsa.pre_start ?? [];
  const ppe = c.ppe.map((x2) => `${x2.item} – ${x2.when}`);
  B.push(table([50, 50], [
    { header: true, cells: [cell("BEFORE WE START – CHECK", { fill: C.orange, run: { b: true, color: C.white } }), cell("PPE FOR THIS JOB", { fill: C.orange, run: { b: true, color: C.white } })] },
    { cells: [{ paras: pre.length ? bullets(pre) : [p("Hold points above ticked; SWMS read")] }, { paras: bullets(ppe) }] },
  ]));

  B.push({ kind: "gap", pt: 6 }, { kind: "p", para: p("CREW SIGN-ON – I took part in this toolbox talk, understand the hazards and controls, and will follow them.", { b: true }) });
  const people = signRows(x, 0);
  while (people.length < 8 || people.length % 2) people.push({ name: "", sig: null, when: "", signed: false });
  const sr: Row[] = [head(["Name", "Signature", "Date", "Name", "Signature", "Date"])];
  for (let i = 0; i < people.length; i += 2) {
    const one = (o: (typeof people)[number]): Cell[] => [cell(o.name), { paras: [p(o.signed && !o.sig ? "Signed in app" : "", { size: 7, i: true })], sig: o.sig, minH: 22 }, cell(o.when, { run: { size: 7 } })];
    sr.push({ cells: [...one(people[i]), ...one(people[i + 1])] });
  }
  B.push(table([18, 18, 14, 18, 18, 14], sr, 1));
  B.push({ kind: "gap", pt: 6 }, table([20, 30, 20, 30], [{ cells: [label("Talk delivered by (Site Lead)"), cell("", { minH: 22 }), label("Signature / date"), cell("")] }]));
  B.push({ kind: "p", para: p(`Risk ratings use the PTSL matrix (Severity × Likelihood). Full breakdown in ${ref.swms}.${c.hazard_summary.some((h) => h.status === "na")
    ? ` N/A to this job: ${c.hazard_summary.filter((h) => h.status === "na").map((h) => h.category.toLowerCase()).join(", ")}.` : ""}`, { i: true, size: 7.5 }) });

  B.push({ kind: "break" });
  const titles = new Map(c.tasks.map((t) => [t.n, t]));
  const rows: Row[] = [head(["#", "Task", "Step", "Hazards", "Key controls", "Risk"])];
  let last = -1;
  for (const row of c.jsa.rows) {
    const t = titles.get(row.task);
    const first = row.task !== last;
    last = row.task;
    rows.push({ cells: [
      cell(first ? String(row.task) : "", { run: { b: true } }),
      first && t ? { paras: [p(t.title, { b: true }), ...(t.quote_wording ? [p(t.quote_wording, { i: true, size: 7, color: C.grey })] : [])] } : cell(""),
      cell(row.step), { paras: bullets(row.hazards.split(/;\s*/)) }, { paras: bullets(row.controls.split(/;\s*/)) }, riskCell(row.risk),
    ] });
  }
  B.push(table([4, 20, 18, 22, 29, 7], rows, 1));

  return {
    name: `${ref.jsa}_${safeName(x.job.title || x.job.site)}`, title: `${ref.jsa} ${c.document.title}`,
    header: `JSA  |  ${x.job.ref}  |  ${site}`, footer: `${ref.jsa} ${ref.rev}  ·  Companion to ${ref.swms}  ·  ${x.company.legal_name}`,
    draft: !["approved", "sent"].includes(d.status), blocks: B,
  };
}

/** The building blocks, for other documents in the same house style (the staff compliance schedule). */
export const LX = { r, p, cell, label, head, table };
