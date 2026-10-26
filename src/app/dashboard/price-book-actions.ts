"use server";
// Price book upload and materials. Called from client components, so these return
// results (or throw) instead of redirecting. Each one checks the owner login.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import {
  priceBookBegin,
  priceBookFinish,
  priceBookRows,
  proposeExtra,
  searchMaterials,
  setMarkup,
  type ExtraLine,
  type Material,
  type PriceBookRow,
} from "@/lib/office";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  await requireOwner();
  try {
    return { ok: true, data: await work() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function beginUploadAction(supplier: string, file: string) {
  return attempt(() => priceBookBegin(supplier.trim().slice(0, 80), file.slice(0, 200)));
}

export async function uploadRowsAction(uploadId: string, rows: PriceBookRow[]) {
  if (rows.length > 5000) return { ok: false as const, error: "Too many rows in one go" };
  return attempt(() => priceBookRows(uploadId, rows));
}

export async function finishUploadAction(uploadId: string) {
  const r = await attempt(() => priceBookFinish(uploadId));
  revalidatePath("/dashboard/office/price-books");
  return r;
}

export async function searchMaterialsAction(q: string): Promise<Result<Material[]>> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return { ok: true, data: [] };
  return attempt(() => searchMaterials(query, 30));
}

export async function sendExtraWorkAction(jobId: string, lines: ExtraLine[], note: string) {
  const r = await attempt(() => proposeExtra(jobId, lines, note.trim() || null));
  revalidatePath("/dashboard/office", "layout");
  return r;
}

/** Form action: the default markup (no supplierId) or one supplier's (blank = use the default). */
export async function markupAction(form: FormData) {
  await requireOwner();
  const supplierId = String(form.get("supplierId") ?? "") || null;
  const raw = String(form.get("markup") ?? "").trim().replace("%", "");
  const pct = raw === "" ? null : Number(raw);
  let msg: string;
  try {
    if (pct !== null && !Number.isFinite(pct)) throw new Error(`"${raw}" isn't a number`);
    await setMarkup(supplierId, pct);
    msg = `ok=${encodeURIComponent(
      supplierId
        ? pct === null
          ? "Saved. That supplier now uses the default markup."
          : `Saved. That supplier's items are now cost + ${pct}%.`
        : `Saved. Default markup is now ${pct}%.`,
    )}`;
  } catch (e) {
    msg = `err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  revalidatePath("/dashboard/office/price-books");
  redirect(`/dashboard/office/price-books?${msg}`);
}
