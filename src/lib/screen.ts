import "server-only";
// The office screen (the TV): read-only data from the engine's screen_data(), opened with a secret link
// (engine migration 39, office_screen). Customers come through as first name and suburb only.
import { engine } from "./engine";

export type ScreenData = {
  now_local: string;
  date_local: string;
  test_mode: { texts: boolean; emails: boolean };
  chime: boolean;
  today: { revenue_excl_gst: number; invoices: number; paid: number; target: number | null;
           jobs_booked: number; jobs_done: number; jobs_on_now: number };
  week: { revenue_excl_gst: number; last_week_same_point: number; target: number | null };
  attention: { total: number; urgent: number;
               items: { id: string; severity: "urgent" | "warning" | "info"; kind: string; job_number: number | null;
                        waiting_min: number; message: string }[] };
  plumbers: {
    name: string; gasfitter: boolean; off: boolean; jobs_total: number; jobs_done: number; alerts: number;
    last_seen_min: number | null;
    now: { job_number: number; service: string; suburb: string | null; state: "en_route" | "on_site"; since: string | null;
           eta: string | null; expected_finish: string | null; over_min: number | null } | null;
    next: { job_number: number; service: string; suburb: string | null; tier: string; at: string | null; late_min: number } | null;
  }[];
  new_jobs: { job_number: number; service: string; tier: "priority" | "standard" | "flexi"; suburb: string | null; customer: string;
              booked_min_ago: number; callback: boolean; status: string; when: string | null; plumber: string | null }[];
  waiting_for_time: number;
  flexi_pool: number;
  gaps: { plumber: string; from: string; minutes: number; offers_out: number }[];
  money: { owed: number; owed_count: number; overdue: number; overdue_count: number; overdue_14: number };
  pipeline: { quotes: number; quotes_value: number; extra_work: number; extra_work_value: number;
              reviews_asked_week: number; marketing_waiting: number };
};

const TOKEN = /^[0-9a-f]{64}$/;

/** The screen's data, or null if the link isn't (or is no longer) valid. */
export async function loadScreen(token: string): Promise<ScreenData | null> {
  const db = engine();
  if (!db || !TOKEN.test(token)) return null;
  const { data: ok } = await db.rpc("screen_token_ok", { p_token: token });
  if (ok !== true) return null;
  const { data, error } = await db.rpc("screen_data");
  if (error) throw new Error(error.message);
  return data as ScreenData;
}

// ---------- Settings page ----------
export type ScreenSettings = { token: string | null; chime: boolean; target_day: number | null; target_week: number | null };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected. Add the ENGINE_ keys in Vercel.");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const loadScreenSettings = () => rpc<ScreenSettings>("office_screen_settings");
export const setScreenLink = (on: boolean) => rpc<ScreenSettings>("office_screen_link", { p_on: on });
export const saveScreenSettings = (p: Record<string, unknown>) => rpc<ScreenSettings>("office_screen_save", { p });
