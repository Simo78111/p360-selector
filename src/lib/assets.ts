import "server-only";
// The tool register (8 Nov): tools and equipment, who has each one and on which job, repairs, test & tag / service
// dates and hire charges. The engine's office_asset* functions do the work (engine repo, migration jm_assets); the
// plumber app uses app_asset* with the same rules.
import type { OfficeSession } from "./auth";
import { engine } from "./engine";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** The register needs a person: the owner backup password isn't anyone, so it can't hold a tool. */
function me(s: OfficeSession) {
  if (!s.staffId) throw new Error("Sign in with your own staff login to use the tool register.");
  return s.staffId;
}

export type AssetStatus = "available" | "out" | "needs_repair" | "retired";
export type Asset = {
  id: string; asset_no: string; name: string; category: string | null; make: string | null; model: string | null;
  serial_no: string | null; purchase_date: string | null; purchase_price: number | null; hire_rate_day: number | null;
  has_photo: boolean; photo_path: string | null; test_tag_due: string | null; service_due: string | null; notes: string | null;
  state: "in_service" | "needs_repair" | "retired"; repair_note: string | null; company_id: string; company: string;
  status: AssetStatus; due_soon: boolean | null; overdue: boolean | null;
  holder: null | {
    staff_id: string; name: string; phone: string | null; mine: boolean; since: string; given_by: string | null;
    job_ref: string | null; job_label: string | null; site: string | null;
  };
};
export type AssetHistory = {
  id: string; holder: string; given_by: string | null; taken_at: string; ended_at: string | null;
  ended_reason: "returned" | "handed_over" | null; condition: "good" | "needs_repair" | null; note: string | null;
  ended_by: string | null; job_ref: string | null; job_label: string | null; hire_days: number | null; hire: number | null;
};
export type AssetDetail = Asset & { can_edit: boolean; history: AssetHistory[] };
export type AssetFilter = "all" | "available" | "out" | "needs_repair" | "due" | "retired";
export type AssetList = {
  assets: Asset[];
  counts: Record<AssetFilter, number>;
  companies: { id: string; code: string; name: string }[];
};
export type AssetAlerts = {
  needs_repair: number; repair_names: string[]; due: number; overdue: number;
  with_me: { id: string; name: string; given_by: string | null; since: string }[];
};
export type JobTool = {
  asset_id: string; asset_no: string; name: string; holder: string; phase_ref: string | null; taken_at: string;
  ended_at: string | null; ended_reason: "returned" | "handed_over" | null; condition: "good" | "needs_repair" | null;
  hire_days: number | null; hire: number | null;
};

export const loadAssets = (s: OfficeSession, q: string, filter: AssetFilter) =>
  rpc<AssetList>("office_assets", { p_staff_id: me(s), p_query: q || null, p_filter: filter });
export const loadAsset = (s: OfficeSession, id: string) => rpc<AssetDetail | null>("office_asset", { p_staff_id: me(s), p_asset_id: id });
export const saveAsset = (s: OfficeSession, id: string | null, data: Record<string, string>) =>
  rpc<{ id: string; asset_no: string; message: string }>("office_save_asset", { p_staff_id: me(s), p_asset_id: id, p_data: data });
export const assetAction = (s: OfficeSession, id: string, action: string, data: Record<string, string> = {}) =>
  rpc<{ message: string; asset: Asset }>("office_asset_action", { p_staff_id: me(s), p_asset_id: id, p_action: action, p_data: data });
export const loadAssetPeople = (s: OfficeSession) => rpc<{ id: string; name: string }[]>("office_asset_people", { p_staff_id: me(s) });
export const loadAssetAlerts = (s: OfficeSession) =>
  s.staffId ? rpc<AssetAlerts>("office_asset_alerts", { p_staff_id: s.staffId }) : Promise.resolve(null);
export const loadJobTools = (s: OfficeSession, jobId: string) =>
  rpc<JobTool[]>("office_job_tools", { p_staff_id: s.staffId, p_job_id: jobId });

/** Photos go in the job-files bucket under assets/<asset id>/. */
export const ASSET_PHOTO_PREFIX = "assets/";
