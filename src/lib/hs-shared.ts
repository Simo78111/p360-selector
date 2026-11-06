// Health and safety (Phase 5a) shapes shared by the server and the browser. The pack's content is what the
// draft-safety-docs function writes (engine repo, supabase/functions/draft-safety-docs/prompt.ts DOCS_TOOL).

export type Risk = "N" | "L" | "M" | "H" | "E";
export type ControlType = "E" | "S" | "I" | "EC" | "A" | "PPE";

export const SEVERITY = ["Insignificant", "Minor", "Moderate", "Major", "Catastrophic"] as const;
export const LIKELIHOOD = ["Very rare", "Unlikely", "Possible", "Likely", "Almost certain"] as const;
/** PTSL matrix (H&S manual): severity 1–5 rows × likelihood 1–5. Same as hs_risk in the database. */
const MATRIX = ["NNLLM", "NLLMM", "LLMHH", "MMHHE", "HHHEE"];
export const riskOf = (s: number, l: number): Risk | null =>
  Number.isInteger(s) && Number.isInteger(l) && s >= 1 && s <= 5 && l >= 1 && l <= 5 ? (MATRIX[s - 1][l - 1] as Risk) : null;
export const RISK_LABEL: Record<Risk, string> = { N: "Negligible", L: "Low", M: "Medium", H: "High", E: "Extreme" };
export const CONTROL_LABEL: Record<ControlType, string> = {
  E: "Eliminate", S: "Substitute", I: "Isolate", EC: "Engineering", A: "Administrative", PPE: "PPE",
};

export type HsTask = { n: number; title: string; quote_wording?: string; steps?: string[] };
export type Control = { type: ControlType; text: string };
export type Hazard = {
  hazard: string; harm: string; severity: number; likelihood: number; initial: Risk; controls: Control[];
  res_severity: number; res_likelihood: number; residual: Risk; responsible: string; hold_point?: string;
};
export type HoldPoint = {
  id: string; text: string; who: string; tasks?: number[]; why?: string;
  status?: "open" | "answered" | "confirm_on_site"; answer?: string | null; answered_by?: string; answered_at?: string;
};
export type HsContent = {
  document: { title: string; scope_plain: string; site_type?: string; drawings_basis?: string; planned_dates?: string;
              principal_contractor?: string; pc_contacts?: string; prepared_by?: string; occupancy_note?: string };
  hold_points: HoldPoint[];
  hazard_summary: { category: string; status: "applicable" | "by_others" | "hold" | "na"; where?: string; reason?: string }[];
  legislation: string[];
  roles: { role: string; name?: string; responsibilities: string }[];
  plant: { item: string; use?: string; checks?: string }[];
  /** 5c: tickets someone doing the task must hold (codes, see TICKET_LABEL), and the library entry it started from */
  tasks: (HsTask & { hazards: Hazard[]; tickets?: string[]; library?: string })[];
  ppe: { item: string; when: string }[];
  emergency: { emergency_number?: string; hospital?: string; urgent_care?: string; assembly_point?: string;
               first_aider?: string; site_contact?: string; office?: string; procedures?: string[] };
  training: { requirement: string; who?: string; note?: string }[];
  permits: { permit: string; tasks?: number[]; issued_by?: string }[];
  legal_flags: { kind: string; reason: string; confirm_with?: string }[];
  jsa: { rows: { task: number; step: string; hazards: string; controls: string; risk: Risk }[]; pre_start?: string[] };
  questions?: string[];
};

export type HsStatus = "queued" | "drafting" | "tasks_to_confirm" | "to_approve" | "approved" | "sent" | "failed" | "superseded";
export const STATUS_LABEL: Record<HsStatus, string> = {
  queued: "Being drafted", drafting: "Being drafted", tasks_to_confirm: "Task list to confirm", to_approve: "To check and approve",
  approved: "Approved", sent: "Sent", failed: "Draft failed", superseded: "Replaced",
};

export type HsDocument = {
  id: string; version_no: number; stage: "tasks" | "full"; status: HsStatus; trigger: "quote_accepted" | "one_click" | "scope_change";
  quote_version_id: string | null; quote_number: string | null;
  tasks: HsTask[] | null; simple: boolean | null; simple_reason: string | null; missing: { field: string; question: string }[] | null;
  hold_points: HoldPoint[]; open_hold_points: number; word_count: number | null; draft_count: number;
  redraft_note: string | null; error: string | null; scope_changed_at: string | null;
  /** 5c: scope changes since this version (the tab asks whether to update), and what this version was updated for */
  scope_changes?: ScopeChange[]; update_of_version?: number | null; update_changes?: ScopeChange[] | null;
  change_summary?: string | null;
  edited_at: string | null; edited_by: string | null; approved_at: string | null; approved_by: string | null;
  sent_at: string | null; sent_by: string | null; sent_note: string | null;
  created_at: string; created_by: string; finished_at: string | null; model: string | null;
  content?: HsContent | null;
  changes?: { version_no: number; summary: string; by: string; at: string }[];
  signoffs?: { staff_id: string; name: string; signed_at: string }[];
  files?: { file_id: string; kind: "swms" | "jsa"; format: "pdf" | "docx"; name: string; at: string }[];
};

export type ScopeChange = {
  kind: "quote" | "variation"; job_id: string; job_ref: string; title: string | null; at: string;
  quote_id?: string; version_id?: string; number?: string;
};

/** Phase 5c: licences and tickets. Same codes as Settings → Staff and hs_ticket_kinds in the engine. */
export type TicketState = "ok" | "expiring" | "expired" | "missing";
export type HsTickets = {
  needed: { kind: string; label: string; scope: "each" | "one"; tasks: number[] }[];
  crew: { staff_id: string; name: string; next_start: string | null;
          tickets: { kind: string; label: string; number: string | null; expires_on: string | null; state: TicketState; card: boolean }[];
          problems: { kind: string; label: string; state: TicketState; tasks: number[] }[] }[];
  crew_problems: { kind: string; label: string; state: TicketState; tasks: number[] }[];
  warnings: number;
};
export type HsLibraryTask = {
  id: string; name: string; applies_when: string | null; hazards: Omit<Hazard, "hold_point">[]; permits: string[];
  tickets: string[]; active: boolean; source: string | null; updated_by_name: string | null; updated_at: string;
  created_by_name: string | null; created_at: string;
};

export type SiteDetails = Partial<Record<SiteField, string | unknown>>;
export type HsJob = {
  job_id: string; auto: boolean; can_edit: boolean; can_approve: boolean; accepted_quote: string | null;
  site: SiteDetails; site_defaults: { principal_contractor?: string; site_address?: string;
    crew?: { staff_id: string; name: string; trade: string | null; apprentice: boolean }[] };
  document: HsDocument | null;
  /** Phase 5b: everyone booked on the job and when they signed this version (null = not yet) */
  booked?: { staff_id: string; name: string; next_start: string | null; signed_at: string | null }[];
  older: { id: string; version_no: number; approved_at: string | null; sent_at: string | null; has_content?: boolean }[];
  /** Phase 5c: the booked crew's tickets against what the pack needs (warnings only), and the library's names */
  tickets?: HsTickets | null;
  library?: { id: string; name: string }[];
  /** set by the approve action when the documents couldn't be filed on the job (approval still stands) */
  filing_error?: string;
};

export type HsSettings = {
  version: number; instructions: string; reference: Record<string, unknown>; note: string | null;
  saved_by: string; saved_at: string; can_edit: boolean;
  history: { version: number; note: string | null; by: string; at: string }[];
  library: HsLibraryTask[];
};
export type HsRegisterRow = {
  job_id: string; job_ref: string; title: string | null; company: string; customer: string; document: HsDocument;
  signed: number; booked: number; unsigned: string[]; next_start: string | null;
  /** 5c: missing or expired tickets among the people booked */
  ticket_warnings?: number;
};
/** Today's H&S cards (Phase 5b, office_hs_today). */
export type HsToday = {
  to_approve: number; to_check: number; can_approve: boolean;
  start_soon: { job_ref: string; starts: string }[];
  to_sign: { job_ref: string; name: string; starts: string }[];
  /** 5c */
  scope_changed?: { job_ref: string; changes: number }[];
  ticket_gaps?: { job_ref: string; starts: string; warnings: number }[];
  tickets_expiring?: { staff_id: string; name: string; kind: string; label: string; expires_on: string; expired: boolean }[];
};

/** The site details form: label, help, and whether the full draft needs it (hs_site_required in the database). */
export const SITE_FIELDS = [
  ["principal_contractor", "Principal contractor", "Company and address", true],
  ["pc_contact", "PC contacts", "Site manager, H&S contact", false],
  ["site_address", "Site", "Address and where on site", true],
  ["site_type", "Site type", "Occupied building, live retail, new build, residential, industrial, airside…", true],
  ["occupied", "Occupied while we work?", "Public / occupants near the work", false],
  ["site_hs_plan", "Site H&S plan / induction to follow", "Or \"none\"", true],
  ["induction", "Induction details", "When and where", false],
  ["asbestos_register", "Asbestos register", "Sighted / not sighted / unknown (unknown becomes a hold point)", true],
  ["live_services", "Live services", "Power, water, gas, BHS… or \"none\"", true],
  ["confined_space", "Confined spaces", "Yes / no / maybe", true],
  ["height", "Work at height", "None, ladder, scaffold, EWP / scissor lift and height", true],
  ["excavation", "Excavation / trenching", "Depth", false],
  ["hot_works", "Hot works", "Brazing, welding, electrofusion…", false],
  ["traffic_management", "Traffic management", "Who holds the plan", false],
  ["after_hours", "After hours", "Shift window", false],
  ["airside", "Airside / security", "Clearances needed", false],
  ["other_trades", "Other trades", "Working alongside", false],
  ["crew", "Crew and competency", "Names, licences, who's site lead", true],
  ["crew_size", "Crew size", "", false],
  ["first_aider", "First aider", "", false],
  ["assembly_point", "Assembly point", "", false],
  ["hospital", "Nearest hospital / urgent care", "", false],
  ["work_dates", "Work dates", "", false],
  ["drawings", "Drawings basis", "Drawing set and revision", false],
  ["notes", "Anything else", "", false],
] as const;
export type SiteField = (typeof SITE_FIELDS)[number][0];
export const SITE_REQUIRED = SITE_FIELDS.filter((f) => f[3]).map((f) => f[0]);
