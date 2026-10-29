import "server-only";
import { liveServiceAllowed } from "./test-mode";
// Facebook page posts, Instagram posts and Facebook/Instagram ads, through Meta's Graph API.
// Each part switches on when its keys are set (see .env.example):
//   Page posts:  META_PAGE_ID + META_PAGE_TOKEN (a long-lived Page access token)
//   Instagram:   META_IG_USER_ID (the Instagram business account linked to the page) + META_PAGE_TOKEN
//   Ads:         META_AD_ACCOUNT_ID (digits, without "act_") + META_ADS_TOKEN (system user token, ads_management)
// Ads are created PAUSED unless the office has switched on "ads go live when approved".

type Fetch = typeof fetch;
export type AdInput = {
  name: string;
  headline: string;
  primaryText: string;
  description?: string;
  cta: "BOOK_NOW" | "LEARN_MORE" | "GET_QUOTE" | "CONTACT_US";
  link: string;
  dailyBudgetNzd: number;
  days: number;
  ageMin?: number;
  locations: { lat: number; lng: number; radius_km: number }[];
  imageUrl?: string;
  live: boolean;
  start?: Date;
};

const version = () => process.env.META_GRAPH_VERSION || "v23.0";
const graph = (path: string) => `https://graph.facebook.com/${version()}/${path}`;

export const metaPageEnabled = () => liveServiceAllowed() && Boolean(process.env.META_PAGE_ID && process.env.META_PAGE_TOKEN);
export const metaInstagramEnabled = () => liveServiceAllowed() && Boolean(process.env.META_IG_USER_ID && process.env.META_PAGE_TOKEN);
export const metaAdsEnabled = () => liveServiceAllowed() && Boolean(process.env.META_AD_ACCOUNT_ID && process.env.META_ADS_TOKEN && process.env.META_PAGE_ID);

async function post(f: Fetch, path: string, params: Record<string, unknown>, token: string) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  body.set("access_token", token);
  const res = await f(graph(path), { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; hash?: string; images?: Record<string, { hash: string }>;
                                                         error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || data.error) {
    throw new Error(`Meta: ${data.error?.error_user_msg || data.error?.message || res.status}`);
  }
  return data;
}

/** A post on the Facebook page, with a photo if there is one. */
export async function postToFacebook(message: string, imageUrl: string | undefined, f: Fetch = fetch) {
  if (!liveServiceAllowed()) throw new Error("Not on the test site");
  const page = process.env.META_PAGE_ID!, token = process.env.META_PAGE_TOKEN!;
  const r = imageUrl
    ? await post(f, `${page}/photos`, { url: imageUrl, caption: message }, token)
    : await post(f, `${page}/feed`, { message }, token);
  return r.post_id ?? r.id ?? "";
}

/** An Instagram post (Instagram needs a photo). */
export async function postToInstagram(caption: string, imageUrl: string, f: Fetch = fetch) {
  if (!liveServiceAllowed()) throw new Error("Not on the test site");
  const ig = process.env.META_IG_USER_ID!, token = process.env.META_PAGE_TOKEN!;
  const media = await post(f, `${ig}/media`, { image_url: imageUrl, caption }, token);
  const done = await post(f, `${ig}/media_publish`, { creation_id: media.id }, token);
  return done.id ?? "";
}

/** Campaign → (photo) → ad set → creative → ad. Returns Meta's ids. */
export async function createAd(ad: AdInput, f: Fetch = fetch) {
  if (!liveServiceAllowed()) throw new Error("Not on the test site");
  const account = `act_${process.env.META_AD_ACCOUNT_ID!.replace(/^act_/, "")}`;
  const token = process.env.META_ADS_TOKEN!, page = process.env.META_PAGE_ID!;
  const status = ad.live ? "ACTIVE" : "PAUSED";
  const start = ad.start ?? new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + ad.days * 24 * 60 * 60 * 1000);

  const campaign = await post(f, `${account}/campaigns`, {
    name: ad.name, objective: "OUTCOME_TRAFFIC", status, special_ad_categories: [], is_adset_budget_sharing_enabled: false,
  }, token);

  let imageHash: string | undefined;
  if (ad.imageUrl) {
    const img = await f(ad.imageUrl);
    if (!img.ok) throw new Error(`Couldn't fetch the ad photo (${img.status})`);
    const bytes = Buffer.from(await img.arrayBuffer()).toString("base64");
    const up = await post(f, `${account}/adimages`, { bytes }, token);
    imageHash = Object.values(up.images ?? {})[0]?.hash;
  }

  const adset = await post(f, `${account}/adsets`, {
    name: `${ad.name} — Auckland`,
    campaign_id: campaign.id,
    daily_budget: Math.round(ad.dailyBudgetNzd * 100),               // cents, in the ad account's currency (NZD)
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status,
    targeting: {
      geo_locations: {
        custom_locations: ad.locations.map((l) => ({
          latitude: l.lat, longitude: l.lng, radius: Math.round(l.radius_km), distance_unit: "kilometer",
        })),
        location_types: ["home"],
      },
      age_min: Math.max(18, ad.ageMin ?? 25),
      age_max: 65,
      targeting_automation: { advantage_audience: 0 },
    },
  }, token);

  const creative = await post(f, `${account}/adcreatives`, {
    name: ad.name,
    object_story_spec: {
      page_id: page,
      link_data: {
        link: ad.link, message: ad.primaryText, name: ad.headline, description: ad.description || undefined,
        image_hash: imageHash, call_to_action: { type: ad.cta, value: { link: ad.link } },
      },
    },
  }, token);

  const created = await post(f, `${account}/ads`, { name: ad.name, adset_id: adset.id, creative: { creative_id: creative.id }, status }, token);
  return { campaign_id: campaign.id, adset_id: adset.id, creative_id: creative.id, ad_id: created.id, status, ends: end.toISOString() };
}
