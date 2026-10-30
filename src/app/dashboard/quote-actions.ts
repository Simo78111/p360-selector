"use server";
// Job management Phase 2b office actions: the quote builder (each change saves straight away and returns the updated
// quote), publishing, sending, accepting/declining, favourites and per-person permissions. Each checks the person is
// signed in to the office console; the database then checks their role and permissions (lib/quotes.ts).
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice, type OfficeSession } from "@/lib/auth";
import { emailEnabled, sendQuoteEmail } from "@/lib/email";
import { quoteFileName, quotePdf } from "@/lib/quote-pdf";
import {
  acceptQuote,
  addFavouriteSection,
  addLine,
  copyFavourite,
  deleteDraft,
  importFavourites,
  loadFavourite,
  loadFavourites,
  loadQuote,
  newQuote,
  newVersion,
  publishQuote,
  quoteSendInfo,
  quoteSent,
  quoteStatus,
  saveFavourite,
  saveFavouriteLine,
  saveFolder,
  saveLine,
  saveQuote,
  saveQuoteDefaults,
  saveSection,
  saveSectionAsFavourite,
  searchItems,
  setStaffPermissions,
  type FavouriteDetail,
  type FavouriteLibrary,
  type ImportReport,
  type ItemHit,
  type OfficeQuote,
  type Perm,
} from "@/lib/quotes";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
const jobPage = (ref: string, tab?: string) => `/dashboard/office/job/${encodeURIComponent(ref)}${tab ? `?tab=${tab}` : ""}`;
export const quotePage = async (ref: string, versionId: string) => `/dashboard/office/job/${encodeURIComponent(ref)}/quote/${versionId}`;
const nzMoney = (n: number) => `$${Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nzDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

/** This site's own address (preview or live), for the customer's link. */
async function siteBase() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "plumbing360.nz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
export const quoteLink = async (token: string) => `${await siteBase()}/q/${token}`;

// ── The builder: one action for every change; returns the updated quote or a message ─────────────────
export type BuilderResult =
  | { ok: true; quote: OfficeQuote; message?: string }
  | { ok: true; go: string; message?: string }
  | { ok: false; error: string };

export type BuilderOp =
  | { op: "save"; changes: Record<string, unknown> }
  | { op: "section"; sectionId: string | null; changes: Record<string, unknown> }
  | { op: "addLine"; sectionId: string; line: Record<string, unknown> }
  | { op: "line"; lineId: string; changes: Record<string, unknown> }
  | { op: "favSection"; favouriteId: string }
  | { op: "saveSectionFav"; sectionId: string; folderId: string | null; name: string | null }
  | { op: "publish" }
  | { op: "newVersion" }
  | { op: "deleteDraft" }
  | { op: "send"; to: string[]; message: string }
  | { op: "accept"; name: string | null; order: string | null }
  | { op: "decline"; reason: string | null }
  | { op: "reopen" }
  | { op: "reload" };

export async function builderAction(versionId: string, o: BuilderOp): Promise<BuilderResult> {
  try {
    if (!isId(versionId)) throw new Error("Quote not found.");
    const s = await assertOffice("jobs");
    let r: BuilderResult;
    switch (o.op) {
      case "save":
        r = { ok: true, quote: await saveQuote(s, versionId, o.changes) };
        break;
      case "section":
        r = { ok: true, quote: await saveSection(s, versionId, o.sectionId, o.changes) };
        break;
      case "addLine":
        r = { ok: true, quote: await addLine(s, versionId, o.sectionId, o.line) };
        break;
      case "line":
        r = { ok: true, quote: await saveLine(s, versionId, o.lineId, o.changes) };
        break;
      case "favSection":
        r = { ok: true, quote: await addFavouriteSection(s, versionId, o.favouriteId) };
        break;
      case "saveSectionFav": {
        const f = await saveSectionAsFavourite(s, o.sectionId, isId(o.folderId) ? o.folderId : null, o.name);
        r = { ok: true, quote: await loadQuote(s, versionId), message: `Saved to favourites as "${f.name}"${f.folder_path ? ` in ${f.folder_path}` : ""}.` };
        break;
      }
      case "publish": {
        const q = await publishQuote(s, versionId);
        r = { ok: true, quote: q, message: `${q.number} published: valid until ${nzDay(q.valid_until)}. Now send it to the customer.` };
        break;
      }
      case "newVersion": {
        const n = await newVersion(s, versionId);
        const q = await loadQuote(s, n.version_id);
        r = { ok: true, go: await quotePage(q.job_ref, n.version_id), message: `${n.number} started as a draft copy.` };
        break;
      }
      case "deleteDraft": {
        const d = await deleteDraft(s, versionId);
        r = d.version_id
          ? { ok: true, go: await quotePage(d.job_ref, d.version_id), message: "Draft deleted." }
          : { ok: true, go: jobPage(d.job_ref, "quotes"), message: "Draft deleted." };
        break;
      }
      case "send":
        r = await sendQuote(s, versionId, o.to, o.message);
        break;
      case "accept": {
        const q = await acceptQuote(s, versionId, o.name, o.order);
        r = { ok: true, quote: q, message: `${q.number} marked as accepted. It's now the job's budget.` };
        break;
      }
      case "decline":
        r = { ok: true, quote: await quoteStatus(s, versionId, "decline", o.reason), message: "Marked as declined." };
        break;
      case "reopen":
        r = { ok: true, quote: await quoteStatus(s, versionId, "reopen", null), message: "Reopened." };
        break;
      case "reload":
        r = { ok: true, quote: await loadQuote(s, versionId) };
        break;
    }
    revalidatePath("/dashboard/office/job", "layout");
    return r;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendQuote(s: OfficeSession, versionId: string, to: string[], message: string): Promise<BuilderResult> {
  const info = await quoteSendInfo(s, versionId);
  const picked = info.recipients.filter((r) => to.includes(r.email));
  if (picked.length === 0) {
    throw new Error(info.recipients.length === 0
      ? "Nobody to send it to: tick \"Gets quotes\" on a contact with an email (on the customer's page), or add the customer's email."
      : "Tick at least one person to send it to.");
  }
  if (!emailEnabled()) throw new Error("Email isn't set up on this site yet (RESEND_API_KEY).");
  const url = await quoteLink(info.token);
  const pdf = await quotePdf(info.doc, { acceptUrl: url });
  for (const p of picked) {
    await sendQuoteEmail({
      to: p.email, toName: p.name, companyName: info.doc.company.name, number: info.doc.number, heading: info.doc.heading,
      total: nzMoney(info.doc.totals.total), validUntil: nzDay(info.doc.valid_until), acceptUrl: url, message,
      sender: info.sender, replyTo: info.sender_email, pdf: { filename: quoteFileName(info.doc), data: pdf },
    });
  }
  await quoteSent(s, versionId, picked);
  return { ok: true, quote: await loadQuote(s, versionId), message: `Sent to ${picked.map((p) => p.email).join(", ")}.` };
}

// ── Lookups for the builder and the favourites screen ──────────────────────
export async function itemSearchAction(q: string): Promise<ItemHit[]> {
  const s = await assertOffice("jobs");
  return searchItems(s, q.slice(0, 80));
}
export async function favouriteLibraryAction(): Promise<FavouriteLibrary> {
  const s = await assertOffice("jobs");
  return loadFavourites(s);
}
export async function favouritePreviewAction(id: string, companyId: string | null): Promise<FavouriteDetail | null> {
  if (!isId(id)) return null;
  const s = await assertOffice("jobs");
  return loadFavourite(s, id, isId(companyId) ? companyId : null);
}

// ── Starting a quote (job page) ────────────────────────────────────────────
export async function newQuoteAction(form: FormData) {
  const ref = text(form, "jobRef", 40);
  let target: string;
  try {
    const s = await assertOffice("jobs");
    const jobId = text(form, "jobId", 40);
    const phaseId = text(form, "phaseId", 40);
    if (!isId(jobId)) throw new Error("Job not found.");
    const r = await newQuote(s, jobId, isId(phaseId) ? phaseId : null, text(form, "name", 120) || null);
    target = await quotePage(ref, r.version_id);
  } catch (err) {
    target = back(jobPage(ref, "quotes"), "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

// ── Favourites screen (forms; each goes back to the favourites page) ───────
const favPath = (form: FormData) => {
  const b = text(form, "back", 400);
  return b.startsWith("/dashboard/office/favourites") ? b : "/dashboard/office/favourites";
};
async function runFav(form: FormData, work: (s: OfficeSession) => Promise<string | { go: string; message: string }>) {
  const path = favPath(form);
  let target: string;
  try {
    const s = await assertOffice("jobs");
    const r = await work(s);
    target = typeof r === "string" ? back(path, "ok", r) : back(r.go, "ok", r.message);
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office/favourites");
  redirect(target);
}
const favUrl = (folder: string | null, fav?: string | null, extra = "") =>
  `/dashboard/office/favourites?${new URLSearchParams({ ...(folder ? { f: folder } : {}), ...(fav ? { fav } : {}) })}${extra}`;

export async function saveFolderAction(form: FormData) {
  await runFav(form, async (s) => {
    const id = text(form, "folderId", 40);
    const parent = text(form, "parentId", 40);
    if (form.get("remove") === "1") {
      const r = await saveFolder(s, id, { remove: true });
      return { go: favUrl(r.parent_id ?? null), message: "Folder removed." };
    }
    const r = await saveFolder(s, isId(id) ? id : null, {
      name: text(form, "name", 120),
      ...(form.has("parentId") ? { parent_id: isId(parent) ? parent : "" } : {}),
    });
    return { go: favUrl(r.id), message: isId(id) ? "Folder saved." : `Folder "${r.name}" added.` };
  });
}

export async function saveFavouriteAction(form: FormData) {
  await runFav(form, async (s) => {
    const id = text(form, "favouriteId", 40);
    const changes: Record<string, unknown> = {};
    for (const k of ["name", "code", "description"]) if (form.has(k)) changes[k] = text(form, k, k === "description" ? 5000 : 200);
    if (form.has("folder_id")) changes.folder_id = isId(text(form, "folder_id", 40)) ? text(form, "folder_id", 40) : "";
    if (form.has("fixed_price")) changes.fixed_price = text(form, "fixed_price", 20).replace(/[$,\s]/g, "");
    if (form.get("active") === "false") changes.active = false;
    if (form.get("active") === "true") changes.active = true;
    const f = await saveFavourite(s, isId(id) ? id : null, changes);
    if (changes.active === false) return { go: favUrl(f.folder_id), message: `"${f.name}" deleted (restore it from Deleted favourites).` };
    return { go: favUrl(f.folder_id, f.id), message: isId(id) ? "Saved." : `Favourite "${f.name}" added.` };
  });
}

export async function saveFavouriteLineAction(form: FormData) {
  await runFav(form, async (s) => {
    const favId = text(form, "favouriteId", 40);
    const lineId = text(form, "lineId", 40);
    const changes: Record<string, unknown> = {};
    if (form.get("remove") === "1") changes.remove = true;
    else {
      const item = text(form, "price_book_item_id", 40);
      if (isId(item)) changes.price_book_item_id = item;
      for (const k of ["description", "unit"]) if (form.has(k)) changes[k] = text(form, k, 500);
      for (const k of ["quantity", "unit_cost", "line_price"]) if (form.has(k)) changes[k] = text(form, k, 20).replace(/[$,\s]/g, "");
    }
    const f = await saveFavouriteLine(s, isId(lineId) ? lineId : null, isId(favId) ? favId : null, changes);
    return { go: favUrl(f.folder_id, f.id), message: changes.remove ? "Line removed." : isId(lineId) ? "Line saved." : "Line added." };
  });
}

export async function copyFavouriteAction(form: FormData) {
  await runFav(form, async (s) => {
    const f = await copyFavourite(s, text(form, "favouriteId", 40));
    return { go: favUrl(f.folder_id, f.id), message: `Copied as "${f.name}".` };
  });
}

/** Fergus favourites CSV (rows already read on the page). Check first, then import. */
export async function importFavouritesAction(rows: Record<string, string>[], dryRun: boolean): Promise<{ ok: true; report: ImportReport } | { ok: false; error: string }> {
  try {
    const s = await assertOffice("jobs");
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("The file has no rows.");
    if (rows.length > 5000) throw new Error("That's more than 5,000 rows: split the file.");
    const report = await importFavourites(s, rows, dryRun);
    if (!dryRun) revalidatePath("/dashboard/office/favourites");
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Staff permissions (owner/admin) and company quote defaults (owner/admin) ──
export async function staffPermissionsAction(form: FormData) {
  let target = "/dashboard/office/staff";
  try {
    await assertOffice("owner");
    const id = text(form, "staffId", 40);
    if (!isId(id)) throw new Error("Staff member not found.");
    const perms: Partial<Record<Perm, "default" | "on" | "off">> = {};
    for (const k of ["send_quotes", "see_costs", "edit_favourites", "book_diary"] as Perm[]) {
      const v = text(form, k, 10);
      if (v === "default" || v === "on" || v === "off") perms[k] = v;
    }
    await setStaffPermissions(id, perms);
    target = back(target, "ok", `Permissions saved for ${text(form, "name", 120) || "them"}.`);
  } catch (err) {
    target = back(target, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office/staff");
  redirect(target);
}

export async function quoteDefaultsAction(form: FormData) {
  let target = "/dashboard/office/companies";
  try {
    await assertOffice("owner");
    const id = text(form, "companyId", 40);
    if (!isId(id)) throw new Error("Company not found.");
    await saveQuoteDefaults(id, {
      quote_valid_days: text(form, "quote_valid_days", 5),
      quote_exclusions: text(form, "quote_exclusions", 10000),
      quote_terms: text(form, "quote_terms", 10000),
    });
    target = back(target, "ok", "Quote defaults saved. New quotes start with them.");
  } catch (err) {
    target = back(target, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office/companies");
  redirect(target);
}
