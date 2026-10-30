import "server-only";
// Job management Phase 2b: quotes, favourites, per-person permissions and the job's money, through the engine's
// office_* / public_* functions (engine repo, migrations 20261030000800–1000). Every office call passes the
// signed-in staff member's id; the database checks what that person may see and change, and leaves cost prices
// out for people without "see costs".
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
import type { AppearsAs } from "./quote-shared";
export * from "./quote-shared";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession) => s.staffId; // null = owner backup password

// ── Permissions per person ─────────────────────────────────────────────────
export type Perm = "send_quotes" | "see_costs" | "edit_favourites";
export const PERM_LABEL: Record<Perm, string> = {
  send_quotes: "Can publish and send quotes",
  see_costs: "Can see costs and margins",
  edit_favourites: "Can edit favourites",
};
export type PermState = { on: boolean; set: boolean | null; role_default: boolean | null };
export type StaffPerms = Record<Perm, PermState> & { office: boolean };
export const loadStaffPermissions = () => rpc<Record<string, StaffPerms>>("office_staff_permissions", {});
export const setStaffPermissions = (staffId: string, perms: Partial<Record<Perm, "default" | "on" | "off">>) =>
  rpc<StaffPerms>("office_set_staff_permissions", { p_staff_id: staffId, p_perms: perms });

// ── Quotes ─────────────────────────────────────────────────────────────────
export type QuoteLine = {
  id: string; position: number; source: "price_book" | "favourite" | "typed"; code: string | null;
  price_book_item_id: string | null; favourite_id: string | null; description: string; unit: string | null;
  quantity: number; unit_sell: number; price_source: string; discount_pct: number; total: number;
  unit_cost?: number; total_cost?: number; markup_pct?: number | null;
};
export type QuoteSection = {
  id: string; position: number; name: string; description: string | null; appears_as: AppearsAs;
  fixed_price: number | null; from_favourite_id: string | null; sell: number; lines_sell: number; cost?: number;
  lines: QuoteLine[];
};
export type QuoteTotals = {
  subtotal: number; discount_pct: number; discount: number; net: number; gst: number; total: number;
  deposit: number | null; cost?: number; profit?: number; margin_pct?: number | null; markup_pct?: number | null;
};
export type QuoteDoc = {
  version_id: string; quote_id: string; job_id: string; phase_id: string | null; number: string; job_ref: string;
  phase_ref: string | null; phase_name: string | null; option_letter: string; option_name: string | null;
  quote_status: "open" | "accepted" | "declined" | "closed"; version_no: number;
  status: "draft" | "published" | "superseded"; heading: string; description: string | null; exclusions: string | null;
  note: string | null; terms: string | null; valid_days: number; valid_until: string | null; deadline: string | null;
  deposit_kind: "none" | "percent" | "amount"; deposit_value: number | null; discount_pct: number;
  published_at: string | null; published_by: string | null; sent_at: string | null; sent_to: { name: string; email: string }[] | null;
  updated_at: string; updated_by: string | null; accepted_at: string | null; accepted_by: string | null;
  accepted_order_number: string | null; accepted_via: "link" | "office" | null; expired: boolean; order_number: string | null;
  company: {
    id: string; code: string; name: string; legal_name: string; phone: string | null; email: string | null; website: string | null;
    address_line: string | null; suburb: string | null; city: string | null; postcode: string | null; gst_number: string | null;
    logo_url: string | null;
  };
  customer: { id: string; name: string; full_name: string; billing_address: string | null; email: string | null };
  site: { site_name: string | null; address_line: string | null; suburb: string | null; city: string | null; postcode: string | null };
  sections: QuoteSection[];
  totals: QuoteTotals;
};
export type Recipient = { name: string; email: string; kind: "contact" | "customer" };
export type OfficeQuote = QuoteDoc & {
  job_title: string | null; job_state: string; pricing_tier: string;
  can: { edit: boolean; new_version: boolean; send: boolean; costs: boolean; favourites: boolean };
  versions: { version_id: string; version_no: number; status: string; accepted: boolean }[];
  other_options: { option_letter: string; name: string | null; status: string; version_id: string }[];
  recipients: Recipient[];
  phases: { id: string; ref: string; name: string }[];
};
export type PublicQuote = QuoteDoc & { can_accept: boolean; superseded: boolean; latest_token: string | null };
export type JobQuoteRow = {
  quote_id: string; option_letter: string; name: string | null; status: string; phase_id: string | null;
  phase_ref: string | null; phase_name: string | null; accepted_at: string | null; accepted_by: string | null;
  accepted_via: string | null; status_note: string | null;
  versions: {
    version_id: string; version_no: number; status: string; number: string; net: number; total: number;
    valid_until: string | null; deadline: string | null; sent_at: string | null; published_at: string | null;
    updated_at: string; accepted: boolean; expired: boolean; cost?: number; margin_pct?: number | null;
  }[];
};
export type JobQuotes = { can: { edit: boolean; send: boolean; costs: boolean }; quotes: JobQuoteRow[] };

export const loadJobQuotes = (s: OfficeSession, jobId: string) =>
  rpc<JobQuotes>("office_job_quotes", { p_staff_id: who(s), p_job_id: jobId });
export const loadQuote = (s: OfficeSession, versionId: string) =>
  rpc<OfficeQuote>("office_quote", { p_staff_id: who(s), p_version_id: versionId });
export const newQuote = (s: OfficeSession, jobId: string, phaseId: string | null, name: string | null) =>
  rpc<{ version_id: string; number: string }>("office_new_quote", { p_staff_id: who(s), p_job_id: jobId, p_phase_id: phaseId, p_name: name });
export const saveQuote = (s: OfficeSession, versionId: string, changes: Record<string, unknown>) =>
  rpc<OfficeQuote>("office_save_quote", { p_staff_id: who(s), p_version_id: versionId, p_changes: changes });
export const saveSection = (s: OfficeSession, versionId: string, sectionId: string | null, changes: Record<string, unknown>) =>
  rpc<OfficeQuote>("office_save_quote_section", { p_staff_id: who(s), p_version_id: versionId, p_section_id: sectionId, p_changes: changes });
export const addLine = (s: OfficeSession, versionId: string, sectionId: string, line: Record<string, unknown>) =>
  rpc<OfficeQuote>("office_add_quote_line", { p_staff_id: who(s), p_version_id: versionId, p_section_id: sectionId, p_line: line });
export const saveLine = (s: OfficeSession, versionId: string, lineId: string, changes: Record<string, unknown>) =>
  rpc<OfficeQuote>("office_save_quote_line", { p_staff_id: who(s), p_version_id: versionId, p_line_id: lineId, p_changes: changes });
export const addFavouriteSection = (s: OfficeSession, versionId: string, favouriteId: string) =>
  rpc<OfficeQuote>("office_add_favourite_section", { p_staff_id: who(s), p_version_id: versionId, p_favourite_id: favouriteId });
export const saveSectionAsFavourite = (s: OfficeSession, sectionId: string, folderId: string | null, name: string | null) =>
  rpc<FavouriteDetail>("office_save_section_as_favourite", { p_staff_id: who(s), p_section_id: sectionId, p_folder_id: folderId, p_name: name });
export const newVersion = (s: OfficeSession, versionId: string) =>
  rpc<{ version_id: string; number: string }>("office_new_quote_version", { p_staff_id: who(s), p_version_id: versionId });
export const deleteDraft = (s: OfficeSession, versionId: string) =>
  rpc<{ job_ref: string; version_id: string | null }>("office_delete_quote_draft", { p_staff_id: who(s), p_version_id: versionId });
export const publishQuote = (s: OfficeSession, versionId: string) =>
  rpc<OfficeQuote>("office_publish_quote", { p_staff_id: who(s), p_version_id: versionId });
export const quoteSendInfo = (s: OfficeSession, versionId: string) =>
  rpc<{ doc: QuoteDoc; recipients: Recipient[]; token: string; sender: string; sender_email: string | null }>(
    "office_quote_send_info", { p_staff_id: who(s), p_version_id: versionId });
export const quoteSent = (s: OfficeSession, versionId: string, to: Recipient[]) =>
  rpc<{ sent_at: string }>("office_quote_sent", { p_staff_id: who(s), p_version_id: versionId, p_to: to });
export const acceptQuote = (s: OfficeSession, versionId: string, name: string | null, order: string | null) =>
  rpc<OfficeQuote>("office_accept_quote", { p_staff_id: who(s), p_version_id: versionId, p_name: name, p_order_number: order });
export const quoteStatus = (s: OfficeSession, versionId: string, action: "decline" | "reopen", reason: string | null) =>
  rpc<OfficeQuote>("office_quote_status", { p_staff_id: who(s), p_version_id: versionId, p_action: action, p_reason: reason });

// The customer's page (no sign-in: the token in the link is the key)
export const publicQuote = (token: string, countView = true) =>
  rpc<PublicQuote | null>("public_quote", { p_token: token, p_count_view: countView });
export const publicAccept = (token: string, name: string, order: string | null, terms: boolean) =>
  rpc<{ accepted?: boolean; already?: boolean; number: string }>("public_accept_quote", {
    p_token: token, p_name: name, p_order_number: order, p_terms_ticked: terms,
  });

// ── Favourites ─────────────────────────────────────────────────────────────
export type Folder = { id: string; parent_id: string | null; name: string; path: string };
export type FavouriteRow = { id: string; folder_id: string | null; name: string; code: string | null; fixed_price: number | null; active: boolean; lines: number };
export type FavouriteLibrary = { can_edit: boolean; can_see_costs: boolean; folders: Folder[]; favourites: FavouriteRow[] };
export type FavouriteLine = {
  id: string; position: number; price_book_item_id: string | null; code: string | null; kind: string; description: string;
  unit: string | null; quantity: number; unit_sell: number; total_sell: number; line_price: number | null; source: string;
  item_missing: boolean; unit_cost?: number; total_cost?: number; typed_cost?: number | null; markup_pct?: number | null;
};
export type FavouriteDetail = {
  id: string; name: string; code: string | null; description: string | null; folder_id: string | null; folder_path: string | null;
  fixed_price: number | null; active: boolean; updated_at: string; updated_by: string | null; lines: FavouriteLine[];
  lines_sell: number; sell: number; cost?: number; priced_for: string; priced_for_id: string;
};
export const loadFavourites = (s: OfficeSession, includeDeleted = false) =>
  rpc<FavouriteLibrary>("office_favourites", { p_staff_id: who(s), p_include_deleted: includeDeleted });
export const loadFavourite = (s: OfficeSession, id: string, companyId: string | null) =>
  rpc<FavouriteDetail>("office_favourite", { p_staff_id: who(s), p_favourite_id: id, p_company_id: companyId });
export const saveFolder = (s: OfficeSession, id: string | null, changes: Record<string, unknown>) =>
  rpc<Folder & { removed?: string }>("office_save_favourite_folder", { p_staff_id: who(s), p_folder_id: id, p_changes: changes });
export const saveFavourite = (s: OfficeSession, id: string | null, changes: Record<string, unknown>) =>
  rpc<FavouriteDetail>("office_save_favourite", { p_staff_id: who(s), p_favourite_id: id, p_changes: changes });
export const saveFavouriteLine = (s: OfficeSession, lineId: string | null, favouriteId: string | null, changes: Record<string, unknown>) =>
  rpc<FavouriteDetail>("office_save_favourite_line", { p_staff_id: who(s), p_line_id: lineId, p_favourite_id: favouriteId, p_changes: changes });
export const copyFavourite = (s: OfficeSession, id: string) =>
  rpc<FavouriteDetail>("office_copy_favourite", { p_staff_id: who(s), p_favourite_id: id });
export type ImportReport = { rows: number; folders: number; favourites: number; lines: number; problems: { row: number; problem: string; warning?: boolean }[]; dry_run: boolean };
export const importFavourites = (s: OfficeSession, rows: Record<string, string>[], dryRun: boolean) =>
  dryRun
    ? rpc<ImportReport>("office_import_favourites_check", { p_staff_id: who(s), p_rows: rows })
    : rpc<ImportReport>("office_import_favourites", { p_staff_id: who(s), p_rows: rows, p_dry_run: false });

export type ItemHit = { id: string; code: string; description: string; unit: string | null; brand: string | null; kind: string; supplier: string; cost?: number };
export const searchItems = (s: OfficeSession, q: string) =>
  rpc<ItemHit[]>("office_item_search", { p_staff_id: who(s), p_query: q, p_limit: 20 });

// ── The job's money (accepted quotes are the budget) ───────────────────────
export type Money = {
  jobs: number; job_refs: string[]; phases: number; quoted_ex_gst: number | null; quoted_cost?: number | null;
  quotes_accepted: number; quotes_open: number; invoiced_ex_gst: number; draft_invoices_ex_gst: number; paid: number;
  costs: { labour: number; supplier_documents: number; purchase_orders: number; stock_other: number };
};
export type JobMoney = {
  job: Money; project: Money; job_level_quoted: number | null;
  phases: Record<string, { quoted: number | null; quotes_open: number }>; can_costs: boolean;
};
export const loadJobMoney = (s: OfficeSession, jobId: string) => rpc<JobMoney>("office_job_money", { p_staff_id: who(s), p_job_id: jobId });

// ── Company quote defaults ─────────────────────────────────────────────────
export const saveQuoteDefaults = (companyId: string, changes: Record<string, unknown>) =>
  rpc<{ quote_valid_days: number; quote_exclusions: string | null; quote_terms: string | null }>(
    "office_save_company_quote_defaults", { p_company_id: companyId, p_changes: changes });

