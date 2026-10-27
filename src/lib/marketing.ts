import "server-only";
// The marketing agent's side of the booking engine (engine migration 38, marketing_agent):
// drafts waiting for approval, settings and rules for the office, and the published area pages.
import { engine } from "./engine";
import { PHOTO_BUCKET } from "./office";

function db() {
  const client = engine();
  if (!client) throw new Error("The booking engine isn't connected. Add the ENGINE_ keys in Vercel.");
  return client;
}
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type DraftKind = "campaign" | "social_post" | "seo_page" | "meta_ad";
export type DraftStatus =
  | "draft" | "approved" | "sending" | "sent" | "publishing" | "published" | "rejected" | "failed" | "expired";

export type CampaignContent = { channel: "sms" | "email" | "both"; sms: string; email_subject: string; email_body: string };
export type SocialContent = { title?: string; facebook?: string; instagram?: string; google?: string; photo_ids?: string[] };
export type PageContent = {
  slug: string; suburb: string; service_group: string; title: string; meta_description: string; h1: string; intro: string;
  body_md: string; faqs: { q: string; a: string }[];
};
export type AdLocation = { name?: string; lat: number; lng: number; radius_km: number };
export type AdContent = {
  headline: string; primary_text: string; description?: string; cta: "BOOK_NOW" | "LEARN_MORE" | "GET_QUOTE" | "CONTACT_US";
  link: string; daily_budget: number; days: number; age_min?: number; locations: AdLocation[]; photo_id?: string;
};

export type Draft = {
  id: string;
  kind: DraftKind;
  status: DraftStatus;
  title: string;
  content: Record<string, unknown>;
  refs: { rule_code?: string; audience?: number; job_id?: string; seo_page_id?: string };
  written_by: "rule" | "claude" | "office";
  ai_notes: string | null;
  created_local: string;
  decided_local: string | null;
  decided_note: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  audience: { first_name: string; suburb: string | null; has_email: boolean; finished: string }[] | null;
  photos: { id: string; path: string; stage: string; url?: string }[];
  job_number: number | null;
  booked: number;
  revenue: number;
};

export type Rule = {
  code: string; name: string; why: string; after_services: string[]; after_days: number; window_days: number;
  offer: string | null; channel: "sms" | "email" | "both"; active: boolean; due_now: number;
};

export type MarketingSettings = {
  mode: "suggest" | "off"; campaigns_on: boolean; social_on: boolean; seo_on: boolean; ads_on: boolean;
  inferred_consent: boolean; max_contact_days: number; send_start: string; send_end: string;
  social_per_week: number; seo_per_week: number; ad_min_spare_hours: number; ad_daily_budget_max: number;
  ad_monthly_budget_max: number; ad_max_days: number; ads_live: boolean; brand_voice: string; seo_suburbs: string[];
  last_weekly_run_at: string | null;
};

export type Marketing = {
  settings: MarketingSettings;
  connected: { agent: boolean; sms_mode: string; email_mode: string; site_url: string };
  rules: Rule[];
  waiting: Draft[];
  recent: Draft[];
  pages: { slug: string; h1: string; status: "published" | "unpublished"; published: string | null }[];
  results_90_days: { messages: number; customers: number; booked: number; revenue: number };
  consented: number;
  opted_out: number;
};

/** Signs the drafts' photos so the page can show them (an hour). */
async function withPhotoUrls(drafts: Draft[]) {
  const paths = [...new Set(drafts.flatMap((d) => d.photos.map((p) => p.path)))];
  if (!paths.length) return drafts;
  const { data } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return drafts.map((d) => ({ ...d, photos: d.photos.map((p) => ({ ...p, url: byPath.get(p.path) ?? undefined })) }));
}

export async function loadMarketing(): Promise<Marketing> {
  const m = await rpc<Marketing>("office_marketing");
  return { ...m, waiting: await withPhotoUrls(m.waiting), recent: await withPhotoUrls(m.recent) };
}

export const editDraft = (id: string, content: Record<string, unknown>) =>
  rpc<Draft>("office_marketing_edit", { p_id: id, p_content: content });
export const approveDraft = (id: string, content: Record<string, unknown> | null) =>
  rpc<{ status: string; send?: { skipped?: string; texts?: number; emails?: number }; slug?: string }>(
    "office_marketing_approve", { p_id: id, p_content: content });
export const rejectDraft = (id: string, note: string | null) => rpc<null>("office_marketing_reject", { p_id: id, p_note: note });
export const saveMarketingSettings = (p: Record<string, unknown>) => rpc<Marketing>("office_marketing_save_settings", { p });
export const saveRule = (code: string, p: Record<string, unknown>) => rpc<null>("office_marketing_save_rule", { p_code: code, p });
export const askAgent = (task: "social" | "seo" | "ad" | "weekly" | "campaigns") =>
  rpc<Record<string, unknown>>("office_marketing_request", { p_task: task });
export const setPagePublished = (slug: string, published: boolean) =>
  rpc<null>("office_seo_page_status", { p_slug: slug, p_published: published });

// ---------- public area pages (read on the server, cached) ----------
export type AreaPage = {
  slug: string; suburb: string; service_group: string; title: string; meta_description: string; h1: string; intro: string;
  body_md: string; faqs: { q: string; a: string }[]; published_at: string; updated_at: string;
  related: { slug: string; h1: string }[];
};
export type AreaPageLink = { slug: string; suburb: string; service_group: string; h1: string; updated: string };

export async function loadAreaPage(slug: string): Promise<AreaPage | null> {
  const client = engine();
  if (!client || !/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const { data, error } = await client.rpc("site_seo_page", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data as AreaPage | null) ?? null;
}

export async function loadAreaPages(): Promise<AreaPageLink[]> {
  const client = engine();
  if (!client) return [];
  const { data, error } = await client.rpc("site_seo_pages");
  if (error) return [];
  return (data as AreaPageLink[]) ?? [];
}

// ---------- unsubscribe ----------
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function unsubscribeInfo(token: string) {
  const client = engine();
  if (!client || !TOKEN.test(token)) return null;
  const { data } = await client.rpc("marketing_unsubscribe_info", { p_token: token });
  return (data as { first_name: string; opted_out: boolean } | null) ?? null;
}
export async function unsubscribe(token: string) {
  const client = engine();
  if (!client || !TOKEN.test(token)) return false;
  const { data } = await client.rpc("marketing_unsubscribe", { p_token: token });
  return data === true;
}
