"use server";
// Tool register actions (8 Nov). The page posts here; the engine checks who can do what (office: add, edit, repair,
// retire, move any tool; everyone: take a free tool, hand on or bring back what they hold) and comes back with ?ok= or ?err=.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import { ASSET_PHOTO_PREFIX, assetAction, saveAsset } from "@/lib/assets";
import { fileUploadUrl } from "@/lib/jobs";

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
const backTo = (form: FormData) => {
  const b = text(form, "back", 300);
  return b.startsWith("/dashboard/office/tools") || b.startsWith("/dashboard/office/job/") || b === "/dashboard/office"
    ? b : "/dashboard/office/tools";
};

async function run(path: string, work: () => Promise<string | { go: string; message: string }>) {
  let target: string;
  try {
    await assertOffice("jobs");
    const r = await work();
    target = typeof r === "string" ? back(path, "ok", r) : back(r.go, "ok", r.message);
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

const FIELDS = ["company_id", "asset_no", "name", "category", "make", "model", "serial_no", "purchase_date", "purchase_price",
  "hire_rate_day", "test_tag_due", "service_due", "notes"] as const;

export async function saveAssetAction(form: FormData) {
  const id = text(form, "assetId", 40);
  await run(id ? `/dashboard/office/tools/${id}` : "/dashboard/office/tools/new", async () => {
    const s = await assertOffice("jobs");
    const data: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = text(form, f, f === "notes" ? 2000 : 120);
      data[f] = f === "purchase_price" || f === "hire_rate_day" ? v.replace(/[$,\s]/g, "") : v;
    }
    const r = await saveAsset(s, isId(id) ? id : null, data);
    return { go: `/dashboard/office/tools/${r.id}`, message: r.message };
  });
}

/** take · give · return · repaired · needs_repair · retire · unretire */
export async function assetActionAction(form: FormData) {
  const id = text(form, "assetId", 40);
  const action = text(form, "action", 20);
  await run(backTo(form), async () => {
    const s = await assertOffice("jobs");
    if (!isId(id)) throw new Error("Which tool?");
    if (!["take", "give", "return", "repaired", "needs_repair", "retire", "unretire"].includes(action)) throw new Error("Unknown action.");
    const keep = form.get("keep_job") === "on";
    const job = text(form, "job", 30);
    return (await assetAction(s, id, action, {
      to_staff_id: text(form, "to_staff_id", 40), job, keep_job: String(keep && !job),
      condition: text(form, "condition", 20), note: text(form, "note", 1000), test_tag_due: text(form, "test_tag_due", 10),
    })).message;
  });
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** A tool's photo goes straight from the browser to storage (assets/<asset id>/...), then is linked to the tool. */
export async function startAssetPhotoAction(assetId: string, fileName: string): Promise<Result<{ path: string; url: string }>> {
  try {
    await assertOffice("jobs");
    if (!isId(assetId)) throw new Error("Something's missing: reload the page.");
    const ext = (fileName.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "jpg").toLowerCase();
    if (!["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext)) throw new Error("Use a photo (JPG, PNG or HEIC).");
    const path = `${ASSET_PHOTO_PREFIX}${assetId}/${crypto.randomUUID()}.${ext}`;
    return { ok: true, data: { path, url: await fileUploadUrl(path) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function finishAssetPhotoAction(assetId: string, path: string): Promise<Result<null>> {
  try {
    const s = await assertOffice("jobs");
    if (!isId(assetId) || !path.startsWith(`${ASSET_PHOTO_PREFIX}${assetId}/`)) throw new Error("Something's missing: reload the page.");
    await assetAction(s, assetId, "photo", { path });
    revalidatePath(`/dashboard/office/tools/${assetId}`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
