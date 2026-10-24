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
  planned_start: string | null;
  eta: string | null;
  arrived: string | null;
  finished: string | null;
  when_local: string | null;
  from_pool: boolean;
  created_local: string;
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
  last_seen: { lat: number; lng: number; at: string; today: boolean } | null;
};

export type OfficeDay = {
  date: string;
  date_local: string;
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
  rpc<{ moved: boolean; reason?: string; start_local?: string; plumber?: string }>("office_move_job", {
    p_job_id: jobId,
    p_plumber_id: plumberId,
    p_work_date: date,
  });

export const cancelJob = (jobId: string, reason: string, notify: boolean) =>
  rpc<{ cancelled: boolean }>("office_cancel_job", { p_job_id: jobId, p_reason: reason, p_notify: notify });

export const bookNow = (jobId: string) =>
  rpc<{ scheduled: boolean; start_local?: string; reason?: string }>("office_book_now", { p_job_id: jobId });

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
