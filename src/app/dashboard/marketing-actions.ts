"use server";
// Marketing page actions: approve (with any edits), reject, settings, rules, "ask the agent now",
// and area pages on/off. Each checks the owner login and returns with ?ok= or ?err=.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import {
  approveDraft,
  askAgent,
  editDraft,
  rejectDraft,
  saveMarketingSettings,
  saveRule,
  setPagePublished,
  type DraftKind,
} from "@/lib/marketing";
import { publishApproved } from "@/lib/marketing-publish";

const PAGE = "/dashboard/office/marketing";
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const num = (form: FormData, k: string) => {
  const v = str(form, k);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k.replaceAll("_", " ")} must be a number`);
  return n;
};

async function run(work: () => Promise<string>, hash = "") {
  let target: string;
  try {
    await assertOffice("bookings");
    target = `${PAGE}?ok=${encodeURIComponent(await work())}${hash}`;
  } catch (err) {
    target = `${PAGE}?err=${encodeURIComponent(err instanceof Error ? err.message : String(err))}${hash}`;
  }
  revalidatePath(PAGE);
  redirect(target);
}

/** "Q: … / A: …" blocks, one blank line apart, to [{q, a}]. */
async function parseFaqs(raw: string) {
  return raw.split(/\n\s*\n/).map((block) => {
    const q = block.match(/^\s*Q:\s*([\s\S]*?)(?:\n\s*A:|$)/i)?.[1]?.trim() ?? "";
    const a = block.match(/\n\s*A:\s*([\s\S]*)$/i)?.[1]?.trim() ?? "";
    return { q, a };
  }).filter((f) => f.q && f.a);
}

/** The edited wording from the draft's form, by kind. */
async function contentFrom(form: FormData, kind: DraftKind): Promise<Record<string, unknown>> {
  if (kind === "campaign") {
    return { channel: str(form, "channel") || "both", sms: str(form, "sms"), email_subject: str(form, "email_subject"),
             email_body: String(form.get("email_body") ?? "").replace(/\r\n/g, "\n").trim() };
  }
  if (kind === "social_post") {
    const photos = form.getAll("photo_ids").map(String);
    return { facebook: str(form, "facebook"), instagram: str(form, "instagram"), google: str(form, "google"), photo_ids: photos };
  }
  if (kind === "seo_page") {
    return { title: str(form, "title"), meta_description: str(form, "meta_description"), h1: str(form, "h1"),
             intro: str(form, "intro"), body_md: String(form.get("body_md") ?? "").replace(/\r\n/g, "\n").trim(),
             faqs: await parseFaqs(String(form.get("faqs") ?? "").replace(/\r\n/g, "\n")) };
  }
  return { headline: str(form, "headline"), primary_text: str(form, "primary_text"), description: str(form, "description") || null,
           cta: str(form, "cta"), daily_budget: num(form, "daily_budget"), days: num(form, "days"),
           photo_id: str(form, "photo_id") || null };
}

export async function approveDraftAction(form: FormData) {
  await run(async () => {
    const id = str(form, "id");
    const kind = str(form, "kind") as DraftKind;
    const r = await approveDraft(id, await contentFrom(form, kind));
    if (kind === "campaign") {
      const s = r.send ?? {};
      return s.skipped === "outside sending hours"
        ? "Approved. It goes out at 9am (texts and emails are only sent 9am–7pm, Monday to Saturday)."
        : `Sent: ${s.texts ?? 0} text${s.texts === 1 ? "" : "s"} and ${s.emails ?? 0} email${s.emails === 1 ? "" : "s"}.`;
    }
    if (kind === "seo_page") {
      revalidatePath(`/areas/${r.slug}`);
      revalidatePath("/areas");
      revalidatePath("/sitemap.xml");
      return `Published at /areas/${r.slug}.`;
    }
    const p = await publishApproved();
    return p.failed ? "Approved, but publishing failed — see the error on it below." : "Approved and published (anything without keys is marked to post by hand).";
  });
}

export async function saveDraftAction(form: FormData) {
  await run(async () => {
    await editDraft(str(form, "id"), await contentFrom(form, str(form, "kind") as DraftKind));
    return "Changes saved. It's still waiting for your approval.";
  });
}

export async function rejectDraftAction(form: FormData) {
  await run(async () => {
    await rejectDraft(str(form, "id"), str(form, "note") || null);
    return "Rejected.";
  });
}

export async function retryPublishAction() {
  await run(async () => {
    const p = await publishApproved();
    return `Tried again: ${p.published ?? 0} published, ${p.failed ?? 0} failed.`;
  });
}

export async function askAgentAction(form: FormData) {
  await run(async () => {
    const task = str(form, "task") as "social" | "seo" | "ad" | "weekly" | "campaigns";
    const r = await askAgent(task);
    if (task === "campaigns") {
      const n = Number(r.campaigns ?? 0);
      return n ? `${n} reminder campaign${n === 1 ? "" : "s"} drafted.` : "Nobody new is due for a reminder right now.";
    }
    return "Asked. New drafts appear here in a minute or two — refresh the page.";
  });
}

export async function saveMarketingSettingsAction(form: FormData) {
  await run(async () => {
    const p: Record<string, unknown> = {};
    for (const k of ["mode", "brand_voice"]) if (form.has(k)) p[k] = str(form, k);
    for (const k of ["max_contact_days", "social_per_week", "seo_per_week", "ad_min_spare_hours", "ad_daily_budget_max",
                     "ad_monthly_budget_max", "ad_max_days"]) {
      if (form.has(k)) {
        const n = num(form, k);
        if (n !== null) p[k] = n;
      }
    }
    for (const k of ["campaigns_on", "social_on", "seo_on", "ads_on", "inferred_consent", "ads_live"]) {
      if (form.has(`${k}_present`)) p[k] = form.get(k) === "on";
    }
    if (form.has("seo_suburbs")) p.seo_suburbs = str(form, "seo_suburbs").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    await saveMarketingSettings(p);
    return "Marketing settings saved.";
  }, "#settings");
}

export async function saveRuleAction(form: FormData) {
  await run(async () => {
    await saveRule(str(form, "code"), {
      active: form.get("active") === "on",
      after_days: num(form, "after_days"),
      window_days: num(form, "window_days"),
      channel: str(form, "channel"),
    });
    return `Saved "${str(form, "name")}".`;
  }, "#rules");
}

export async function pageStatusAction(form: FormData) {
  await run(async () => {
    const slug = str(form, "slug");
    const on = str(form, "publish") === "1";
    await setPagePublished(slug, on);
    revalidatePath(`/areas/${slug}`);
    revalidatePath("/areas");
    return on ? `/areas/${slug} is back online.` : `/areas/${slug} is taken down.`;
  }, "#pages");
}
