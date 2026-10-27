import "server-only";
// Publishes approved social posts and Meta ads. Runs straight after the office approves one, and from
// /api/engine/marketing (Vercel cron backup). Channels without keys are marked "manual": the wording
// stays on the Marketing page, ready to copy and post by hand.
import { engine } from "./engine";
import { gbpEnabled, postToGoogle } from "./gbp";
import { createAd, metaAdsEnabled, metaInstagramEnabled, metaPageEnabled, postToFacebook, postToInstagram } from "./meta";
import { PHOTO_BUCKET } from "./office";

type Claimed = {
  id: string;
  kind: "social_post" | "meta_ad";
  content: Record<string, unknown>;
  refs: Record<string, unknown>;
  ads_live: boolean;
  photos: { id: string; path: string }[];
};
export type ChannelResult = { ok: boolean; id?: string; manual?: boolean; error?: string; [k: string]: unknown };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function publishApproved() {
  const db = engine();
  if (!db) return { skipped: "engine not connected" };
  const { data, error } = await db.rpc("marketing_publish_claim");
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Claimed[];
  let published = 0, failed = 0;

  for (const item of items) {
    // the photos, as links Meta and Google can fetch for the next hour (in the order chosen)
    const order = item.kind === "meta_ad" ? [String(item.content.photo_id ?? "")]
                                          : ((item.content.photo_ids as string[] | undefined) ?? []);
    const paths = order.map((id) => item.photos.find((p) => p.id === id)?.path).filter((p): p is string => Boolean(p));
    let urls: string[] = [];
    if (paths.length) {
      const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
      urls = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
    }
    const results: Record<string, ChannelResult> = {};
    try {
      if (item.kind === "social_post") {
        Object.assign(results, await publishPost(item.content, urls[0]));
      } else {
        results.meta_ad = await publishAd(item, urls[0]);
      }
      const failures = Object.entries(results).filter(([, r]) => !r.ok && !r.manual);
      const ok = failures.length === 0;
      await db.rpc("marketing_publish_done", {
        p_id: item.id, p_ok: ok, p_result: results,
        p_error: ok ? null : failures.map(([k, r]) => `${k}: ${r.error}`).join("; "),
      });
      if (ok) published++; else failed++;
    } catch (e) {
      failed++;
      await db.rpc("marketing_publish_done", {
        p_id: item.id, p_ok: false, p_result: results, p_error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { claimed: items.length, published, failed };
}

async function attempt(work: () => Promise<Record<string, unknown>>): Promise<ChannelResult> {
  try {
    return { ok: true, ...(await work()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function publishPost(c: Record<string, unknown>, imageUrl: string | undefined) {
  const out: Record<string, ChannelResult> = {};
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.plumbing360.nz").replace(/\/$/, "");
  if (text(c.facebook)) {
    out.facebook = metaPageEnabled()
      ? await attempt(async () => ({ id: await postToFacebook(text(c.facebook), imageUrl) }))
      : { ok: false, manual: true };
  }
  if (text(c.instagram)) {
    out.instagram = metaInstagramEnabled() && imageUrl
      ? await attempt(async () => ({ id: await postToInstagram(text(c.instagram), imageUrl) }))
      : { ok: false, manual: true };
  }
  if (text(c.google)) {
    out.google = gbpEnabled()
      ? await attempt(async () => ({ id: await postToGoogle(text(c.google), imageUrl, `${site}/get-started?utm_source=google&utm_medium=gbp-post`) }))
      : { ok: false, manual: true };
  }
  return out;
}

async function publishAd(item: Claimed, imageUrl: string | undefined): Promise<ChannelResult> {
  if (!metaAdsEnabled()) return { ok: false, manual: true };
  const c = item.content;
  return attempt(async () => createAd({
    name: `P360 ${text(c.headline)} ${new Date().toISOString().slice(0, 10)}`,
    headline: text(c.headline),
    primaryText: text(c.primary_text),
    description: text(c.description) || undefined,
    cta: c.cta as "BOOK_NOW",
    link: text(c.link),
    dailyBudgetNzd: Number(c.daily_budget),
    days: Number(c.days),
    ageMin: c.age_min ? Number(c.age_min) : undefined,
    locations: (c.locations as { lat: number; lng: number; radius_km: number }[]) ?? [],
    imageUrl,
    live: item.ads_live,
  }));
}
