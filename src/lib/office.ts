import "server-only";
// The office console's view of the booking engine. Everything goes through the
// engine's office_* functions (see the engine repo, migration office_console),
// using the service role key on the server only.
import { engine } from "./engine";

export type JobCard = {
  job_id: string;
  job_number: number;
  status: JobStatus;
  tier: "priority" | "standard" | "flexi";
  source: string;
  web_reference: string | null;
  service: string;
  price_incl_gst: number;
  customer: string;
  phone: string;
  address: string;
  suburb: string | null;
  lat: number | null;
  lng: number | null;
  preferred: string | null;
  flexi_latest: string | null;
  duration_min: number | null;
  plumber_id: string | null;
  plumber: string | null;
  work_date: string | null;
  sequence_no: number | null;
  time_window: "morning" | "afternoon" | null;
  /** The day's route is worked out and customers have exact times */
  day_planned: boolean | null;
  /** Drive + park from the previous job, in minutes */
  drive_min: number | null;
  planned_start: string | null;
  eta: string | null;
  arrived: string | null;
  finished: string | null;
  when_local: string | null;
  from_pool: boolean;
  created_local: string;
  /** Booked for a past day and not done */
  overdue: boolean;
  /** This job is a callback (rework) for that job number */
  callback_of: number | null;
  /** How many callbacks this job has had */
  callbacks: number;
  couldnt_finish: boolean;
};

export type JobStatus =
  | "requested" | "pooled" | "offered" | "scheduled" | "en_route" | "on_site"
  | "completed" | "invoiced" | "paid" | "cancelled";

export type PlumberDay = {
  id: string;
  name: string;
  phone: string;
  shift: string;
  jobs: JobCard[];
  booked_min: number;
  drive_min: number;
  home: { address: string | null; to_first: number; from_last: number } | null;
  last_seen: { lat: number; lng: number; at: string; today: boolean } | null;
};

export type OfficeDay = {
  date: string;
  date_local: string;
  planned: boolean;
  plan_time: string;
  route_from_home: boolean;
  plumbers: PlumberDay[];
  waiting: JobCard[];
  attention: number;
};

export type TimelineEntry = { at: string; kind: "status" | "text_in" | "text_out" | "system"; text: string; by: string | null };

export type JobDetail = JobCard & {
  description: string | null;
  access_notes: string | null;
  email: string | null;
  postcode: string | null;
  pool_consent: boolean;
  sms_opt_out: boolean;
  other_jobs: number;
  timeline: TimelineEntry[];
  invoices: {
    number: string | null;
    status: string;
    total: number;
    paid: number;
    due: string | null;
    lines: { description: string; quantity: number; unit_price_incl_gst: number }[];
  }[];
  plumbers: { id: string; name: string }[];
  office_notes: string | null;
  callback_reason: string | null;
  callback_plumber: string | null;
  service_code: string | null;
  invoiced: boolean;
  callback_jobs: { job_number: number; status: JobStatus; reason: string; when_local: string | null }[];
  customer_jobs: { job_number: number; service: string; status: JobStatus; created: string }[];
  services: { code: string; name: string; minutes: number; price_incl_gst: number }[];
};

export type AttentionItem = {
  source: "alert" | "review";
  id: string;
  severity: string;
  kind: string;
  message: string;
  job_number: number | null;
  raised_local: string;
  waiting_min: number;
};

export const officeEnabled = () => engine() !== null;

function db() {
  const client = engine();
  if (!client) throw new Error("The booking engine isn't connected. Add the ENGINE_ keys in Vercel.");
  return client;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Today's date in Auckland, as YYYY-MM-DD. */
export const aucklandToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

export const loadDay = (date: string) => rpc<OfficeDay>("office_day", { p_date: date });

export const loadJobs = (search: string, filter: string) =>
  rpc<JobCard[]>("office_jobs", { p_search: search || null, p_filter: filter, p_limit: 200 });

export const loadJob = (jobNumber: number) => rpc<JobDetail | null>("office_job", { p_job_number: jobNumber });

export async function loadAttention(): Promise<AttentionItem[]> {
  const { data, error } = await db()
    .from("needs_attention")
    .select("source, id, severity, kind, message, job_number, raised_local, waiting_min");
  if (error) throw new Error(error.message);
  return (data ?? []) as AttentionItem[];
}

export const moveJob = (jobId: string, plumberId: string, date: string) =>
  rpc<{ moved: boolean; reason?: string; start_local?: string; plumber?: string; exact?: boolean }>("office_move_job", {
    p_job_id: jobId,
    p_plumber_id: plumberId,
    p_work_date: date,
  });

export const cancelJob = (jobId: string, reason: string, notify: boolean) =>
  rpc<{ cancelled: boolean }>("office_cancel_job", { p_job_id: jobId, p_reason: reason, p_notify: notify });

export const bookNow = (jobId: string) =>
  rpc<{ scheduled: boolean; start_local?: string; reason?: string; exact?: boolean }>("office_book_now", { p_job_id: jobId });

export type PlanResult = {
  date: string;
  status: "planned" | "planned_and_texted" | "already_planned";
  plumbers?: { plumber: string; stops?: number; travel_before?: number; travel?: number; ok?: boolean; skipped?: string }[];
};
export const planDay = (date: string) => rpc<PlanResult>("office_plan_day", { p_date: date });

export type PlumbersInfo = {
  route_from_home: boolean;
  park_buffer_min: number;
  plan_lock_time: string;
  cached_drive_times: number;
  plumbers: {
    id: string;
    name: string;
    phone: string;
    active: boolean;
    shift: string;
    shift_start: string;
    shift_end: string;
    email: string | null;
    pgdb_licence_no: string | null;
    app_linked: boolean;
    booked_ahead: number;
    home_address: string | null;
    home_set: boolean;
    jobs_90d: number;
    callbacks_90d: number;
  }[];
};
export const loadPlumbers = () => rpc<PlumbersInfo>("office_plumbers", {});
export const setPlumberHome = (id: string, address: string | null, lat: number | null, lng: number | null) =>
  rpc<null>("office_set_plumber_home", { p_plumber_id: id, p_address: address, p_lat: lat, p_lng: lng });
export type PlumberChanges = Partial<{
  full_name: string;
  phone: string;
  email: string | null;
  pgdb_licence_no: string | null;
  shift_start: string;
  shift_end: string;
  active: boolean;
}>;
export const savePlumber = (id: string | null, changes: PlumberChanges) =>
  rpc<{ plumber_id: string; created: boolean }>("office_save_plumber", { p_plumber_id: id, p_changes: changes });
/** Makes (or resets the password of) the plumber's login for the plumber app. */
export async function setAppLogin(email: string, password: string) {
  const auth = db().auth.admin;
  const made = await auth.createUser({ email, password, email_confirm: true });
  if (!made.error) return "created" as const;
  if (!/already|registered|exists/i.test(made.error.message)) throw new Error(`App login: ${made.error.message}`);
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`App login: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      const upd = await auth.updateUserById(user.id, { password, email_confirm: true });
      if (upd.error) throw new Error(`App login: ${upd.error.message}`);
      return "reset" as const;
    }
    if (data.users.length < 200) break;
  }
  throw new Error("App login: couldn't create it or find it");
}
export const setRouteFromHome = (on: boolean) => rpc<null>("office_set_route_from_home", { p_on: on });

export const resolveItem = (id: string, note: string, approve: boolean) =>
  rpc<string>("resolve_item", { p_id: id, p_note: note || null, p_approve: approve });

// ── Display helpers ──────────────────────────────────────────────────────

export const statusLabel: Record<JobStatus, { label: string; tone: string }> = {
  requested: { label: "Needs a time", tone: "bg-amber-100 text-amber-900" },
  pooled: { label: "Flexi pool", tone: "bg-violet-100 text-violet-900" },
  offered: { label: "Offer sent", tone: "bg-violet-100 text-violet-900" },
  scheduled: { label: "Booked", tone: "bg-aqua-pale text-aqua-deep" },
  en_route: { label: "On the way", tone: "bg-sky-100 text-sky-900" },
  on_site: { label: "On site", tone: "bg-sky-200 text-sky-950" },
  completed: { label: "Done", tone: "bg-emerald-100 text-emerald-900" },
  invoiced: { label: "Invoiced", tone: "bg-emerald-100 text-emerald-900" },
  paid: { label: "Paid", tone: "bg-emerald-200 text-emerald-950" },
  cancelled: { label: "Cancelled", tone: "bg-black/5 text-slate" },
};

export const tierTone = { priority: "text-red-700", standard: "text-ink", flexi: "text-violet-700" } as const;

/** Adds days to a YYYY-MM-DD date. */
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const validDate = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

// ── Xero ─────────────────────────────────────────────────────────────────

export type XeroStatus = {
  connected: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  connected_at: string | null;
  enabled: boolean;
  active: boolean;
  account_code: string;
  tracking_name: string | null;
  tracking_option: string | null;
  site_url: string | null;
  last_push: string | null;
  last_poll: string | null;
  last_error: string | null;
  last_error_at: string | null;
  pending: number;
  failed: number;
  synced: number;
  invoices: {
    invoice_id: string;
    number: string;
    job_number: number;
    customer: string;
    total: number;
    paid: number;
    status: string;
    xero_status: "not_configured" | "pending" | "synced" | "failed";
    xero_error: string | null;
    url: string | null;
    issued: string;
  }[];
};
export const loadXeroStatus = () => rpc<XeroStatus>("xero_status", {});
export const saveXeroSettings = (enabled: boolean, account: string, trackingName: string | null, trackingOption: string | null) =>
  rpc<null>("xero_settings", {
    p_enabled: enabled,
    p_account_code: account,
    p_tracking_name: trackingName,
    p_tracking_option: trackingOption,
  });
export const disconnectXero = () => rpc<null>("xero_disconnect", {});
export const queueXeroInvoice = (invoiceId: string) => rpc<null>("xero_queue_invoice", { p_invoice_id: invoiceId });

// ── Editing, bulk actions, return visits, callbacks ──────────────────────

export type BulkResult = { job_id: string; job_number: number; ok: boolean; error?: string; start_local?: string; plumber?: string }[];

export const bulkMove = (jobIds: string[], plumberId: string | null, date: string) =>
  rpc<BulkResult>("office_bulk_move", { p_job_ids: jobIds, p_plumber_id: plumberId, p_work_date: date });

export const bulkCancel = (jobIds: string[], reason: string, notify: boolean) =>
  rpc<BulkResult>("office_bulk_cancel", { p_job_ids: jobIds, p_reason: reason, p_notify: notify });

export type JobChanges = Partial<{
  full_name: string;
  phone: string;
  email: string;
  address_line: string;
  suburb: string;
  postcode: string;
  lat: number;
  lng: number;
  description: string;
  access_notes: string;
  duration_min: number;
  service_code: string;
  office_notes: string;
}>;
export const updateJob = (jobId: string, changes: JobChanges) =>
  rpc<{ changed: string[] }>("office_update_job", { p_job_id: jobId, p_changes: changes });

export const returnVisit = (jobId: string, plumberId: string, date: string) =>
  rpc<{ moved: boolean; start_local?: string; plumber?: string; exact?: boolean }>("office_return_visit", {
    p_job_id: jobId,
    p_plumber_id: plumberId,
    p_work_date: date,
  });

export const bookCallback = (jobId: string, reason: string, plumberId: string | null, date: string | null) =>
  rpc<{ job_number: number; scheduled?: boolean; moved?: boolean; start_local?: string; reason?: string }>(
    "office_book_callback",
    { p_job_id: jobId, p_reason: reason, p_plumber_id: plumberId, p_work_date: date },
  );

// ── Price books and materials ────────────────────────────────────────────

export type Material = {
  id: string;
  code: string;
  description: string;
  unit: string | null;
  brand: string | null;
  supplier: string;
  cost: number;
  sell: number;
  sell_incl_gst: number;
  previous_cost: number | null;
};

export type UploadSummary = {
  file: string | null;
  rows: number;
  added: number;
  changed: number;
  went_up: number;
  removed: number;
};

export type PriceBooks = {
  default_markup_pct: number;
  suppliers: {
    id: string;
    name: string;
    markup_pct: number | null;
    active: boolean;
    items: number;
    last_upload: (UploadSummary & { at: string; days_ago: number }) | null;
  }[];
  uploads: (UploadSummary & { supplier: string; at: string })[];
};

export type PriceBookRow = { code: string; description: string; unit?: string; brand?: string; cost: number };

export type JobMaterialLine = {
  quote_status: "sent" | "accepted" | "declined" | "no_reply" | string;
  sent: string;
  description: string;
  quantity: number;
  kind: string;
  unit_price: number;
  line_total: number;
  code: string | null;
  supplier: string | null;
  cost_total: number | null;
};

export type ExtraLine =
  | { price_book_item_id: string; quantity: number; unit_price?: number }
  | { description: string; quantity: number; unit_price: number; kind: "labour" | "materials" | "other" };

export const loadPriceBooks = () => rpc<PriceBooks>("office_price_books", {});
export const searchMaterials = (q: string, limit = 30) =>
  rpc<Material[]>("materials_search", { p_query: q, p_limit: limit, p_supplier_id: null });
export const priceBookBegin = (supplier: string, file: string) =>
  rpc<{ upload_id: string; supplier_id: string; supplier: string }>("office_price_book_begin", {
    p_supplier: supplier,
    p_file_name: file,
  });
export const priceBookRows = (uploadId: string, rows: PriceBookRow[]) =>
  rpc<{ rows: number; skipped: number }>("office_price_book_rows", { p_upload_id: uploadId, p_rows: rows });
export const priceBookFinish = (uploadId: string) =>
  rpc<UploadSummary & { rows_in: number; supplier: string }>("office_price_book_finish", { p_upload_id: uploadId });
export const setMarkup = (supplierId: string | null, pct: number | null) =>
  rpc<null>("office_set_markup", { p_supplier_id: supplierId, p_markup_pct: pct });
export const proposeExtra = (jobId: string, lines: ExtraLine[], note: string | null) =>
  rpc<{ total_incl_gst: number; items: string }>("office_propose_extra", { p_job_id: jobId, p_lines: lines, p_note: note });
export const loadJobMaterials = (jobId: string) => rpc<JobMaterialLine[]>("office_job_materials", { p_job_id: jobId });
