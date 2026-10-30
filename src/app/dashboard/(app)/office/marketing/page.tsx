import Link from "next/link";
import {
  approveDraftAction,
  askAgentAction,
  pageStatusAction,
  rejectDraftAction,
  retryPublishAction,
  saveDraftAction,
  saveMarketingSettingsAction,
  saveRuleAction,
} from "@/app/dashboard/marketing-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadMarketing, type Draft, type Marketing } from "@/lib/marketing";
import { gbpEnabled } from "@/lib/gbp";
import { metaAdsEnabled, metaInstagramEnabled, metaPageEnabled } from "@/lib/meta";
import { officeEnabled } from "@/lib/office";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const field = "w-full rounded-xl border border-black/10 px-3 py-2 text-sm";
const label = "block text-sm font-medium";
const hint = "mt-1 text-xs text-slate";
const btn = "rounded-full px-4 py-2 text-sm font-semibold";
const money = (n: number) => `$${Number(n).toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;

const KIND: Record<Draft["kind"], string> = {
  campaign: "Reminder", social_post: "Post", seo_page: "Area page", meta_ad: "Meta ad",
};
const STATUS: Record<Draft["status"], { label: string; tone: string }> = {
  draft: { label: "Waiting for you", tone: "bg-amber-100 text-amber-900" },
  approved: { label: "Approved", tone: "bg-aqua-pale text-aqua-deep" },
  sending: { label: "Sending", tone: "bg-aqua-pale text-aqua-deep" },
  sent: { label: "Sent", tone: "bg-emerald-100 text-emerald-900" },
  publishing: { label: "Publishing", tone: "bg-aqua-pale text-aqua-deep" },
  published: { label: "Published", tone: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "Rejected", tone: "bg-black/5 text-slate" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-800" },
  expired: { label: "Expired", tone: "bg-black/5 text-slate" },
};

function Badge({ status }: { status: Draft["status"] }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-slate">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function MarketingPage({ searchParams }: Props) {
  await requireOffice("bookings");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let m: Marketing;
  try {
    m = await loadMarketing();
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const s = m.settings;
  const channels = [
    ["Facebook page", metaPageEnabled()], ["Instagram", metaInstagramEnabled()], ["Google listing", gbpEnabled()], ["Meta ads", metaAdsEnabled()],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            The marketing agent drafts reminder texts and emails, posts from finished jobs, area pages for the website and Meta
            ads when the diary has room. Nothing goes out until you approve it here.
          </p>
        </div>
        <p className="text-sm text-slate">
          Agent: <strong className={m.connected.agent ? "text-emerald-700" : "text-amber-700"}>{m.connected.agent ? "connected" : "not connected"}</strong>
          {" · "}Texts: <strong>{m.connected.sms_mode}</strong> · Emails: <strong>{m.connected.email_mode}</strong>
          {s.mode === "off" && <> · <strong className="text-red-700">marketing off</strong></>}
        </p>
      </div>
      <Flash ok={ok} err={err} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Waiting for you", String(m.waiting.filter((d) => d.status === "draft").length)],
          ["Reminders sent (90 days)", `${m.results_90_days.messages} to ${m.results_90_days.customers}`],
          ["Booked from reminders", `${m.results_90_days.booked} · ${money(m.results_90_days.revenue)}`],
          ["Customers who said yes", `${m.consented} (${m.opted_out} opted out)`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{k}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <Section title="Ask the agent now"
               intro="It runs by itself every week (and checks for reminders daily). Use these to get drafts sooner.">
        <form action={askAgentAction} className="flex flex-wrap gap-2">
          {[
            ["campaigns", "Reminders due now"], ["social", "Posts from recent jobs"], ["seo", "Area pages"], ["ad", "An ad, if there's room"],
            ["weekly", "The whole weekly run"],
          ].map(([task, text]) => (
            <button key={task} name="task" value={task} className={`${btn} bg-mist hover:bg-aqua-pale`}>{text}</button>
          ))}
        </form>
        <p className={hint}>
          Publishing to: {channels.map(([n, on], i) => (
            <span key={n}>{i ? ", " : ""}{n} <strong className={on ? "text-emerald-700" : "text-slate"}>{on ? "on" : "by hand"}</strong></span>
          ))}. Channels &ldquo;by hand&rdquo; have no keys yet: approved wording waits below for you to copy.
        </p>
      </Section>

      <Section title="Waiting for you"
               intro="Edit anything, then approve. Approving a reminder sends it (9am–7pm, Mon–Sat); an area page goes live; posts and ads are published.">
        {m.waiting.length === 0 ? (
          <p className="text-sm text-slate">Nothing waiting.</p>
        ) : (
          <div className="space-y-5">{m.waiting.map((d) => <DraftCard key={d.id} d={d} settings={s} />)}</div>
        )}
      </Section>

      <Section title="Recent">
        {m.recent.length === 0 ? <p className="text-sm text-slate">Nothing yet.</p> : (
          <div className="divide-y divide-black/5">
            {m.recent.some((d) => d.status === "approved" || d.status === "publishing") && (
              <form action={retryPublishAction} className="pb-3">
                <button className={`${btn} bg-mist`}>Publish approved posts and ads now</button>
              </form>
            )}
            {m.recent.map((d) => <RecentRow key={d.id} d={d} />)}
          </div>
        )}
      </Section>

      <Section id="pages" title="Area pages on the website"
               intro={<>Live at <code>/areas/…</code> and in the sitemap. <Link className="underline" href="/areas" target="_blank">See them</Link>.</>}>
        {m.pages.length === 0 ? <p className="text-sm text-slate">None published yet.</p> : (
          <ul className="divide-y divide-black/5">
            {m.pages.map((p) => (
              <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/areas/${p.slug}`} target="_blank" className="font-semibold hover:underline">{p.h1}</Link>{" "}
                  <span className="text-slate">/areas/{p.slug} · {p.status === "published" ? `live since ${p.published}` : "taken down"}</span>
                </span>
                <form action={pageStatusAction}>
                  <input type="hidden" name="slug" value={p.slug} />
                  <input type="hidden" name="publish" value={p.status === "published" ? "0" : "1"} />
                  <button className={`${btn} bg-mist`}>{p.status === "published" ? "Take down" : "Put back"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="rules" title="Reminder rules"
               intro="Who gets a reminder, and when. A customer's last finished job sets the clock; they get one reminder per job, and no more than one marketing message every few weeks (Settings below).">
        <div className="space-y-3">
          {m.rules.map((r) => (
            <form key={r.code} action={saveRuleAction} className="grid items-end gap-3 rounded-xl bg-mist p-3 sm:grid-cols-6">
              <input type="hidden" name="code" value={r.code} />
              <input type="hidden" name="name" value={r.name} />
              <div className="sm:col-span-2">
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-slate">{r.why}</p>
                <p className="mt-1 text-xs"><strong>{r.due_now}</strong> due now</p>
              </div>
              <div>
                <label className={label} htmlFor={`ad-${r.code}`}>After (days)</label>
                <input id={`ad-${r.code}`} name="after_days" type="number" min={7} defaultValue={r.after_days} className={field} />
              </div>
              <div>
                <label className={label} htmlFor={`wd-${r.code}`}>for (days)</label>
                <input id={`wd-${r.code}`} name="window_days" type="number" min={1} defaultValue={r.window_days} className={field} />
              </div>
              <div>
                <label className={label} htmlFor={`ch-${r.code}`}>By</label>
                <select id={`ch-${r.code}`} name="channel" defaultValue={r.channel} className={field}>
                  <option value="both">Text and email</option><option value="sms">Text</option><option value="email">Email</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} className="h-4 w-4" /> On</label>
                <button className={`${btn} bg-ink text-white`}>Save</button>
              </div>
            </form>
          ))}
        </div>
      </Section>

      <Section id="settings" title="Settings">
        <form action={saveMarketingSettingsAction} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={label} htmlFor="mode">Marketing agent</label>
              <select id="mode" name="mode" defaultValue={s.mode} className={field}>
                <option value="suggest">On: drafts for me to approve</option>
                <option value="off">Off</option>
              </select>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className={label}>What it drafts</legend>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {([["campaigns_on", "Reminders", s.campaigns_on], ["social_on", "Posts", s.social_on], ["seo_on", "Area pages", s.seo_on],
                   ["ads_on", "Meta ads", s.ads_on]] as const).map(([k, t, v]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="hidden" name={`${k}_present`} value="1" />
                    <input type="checkbox" name={k} defaultChecked={v} className="h-4 w-4" /> {t}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={label} htmlFor="max_contact_days">At most one marketing message every (days)</label>
              <input id="max_contact_days" name="max_contact_days" type="number" min={7} max={365} defaultValue={s.max_contact_days} className={field} />
            </div>
            <div className="sm:col-span-2">
              <input type="hidden" name="inferred_consent_present" value="1" />
              <label className="flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" name="inferred_consent" defaultChecked={s.inferred_consent} className="mt-0.5 h-4 w-4" />
                <span>Also remind past customers who didn&apos;t tick the box (a finished job in the last 2 years)</span>
              </label>
              <p className={hint}>
                Off by default: reminders only go to customers who ticked &ldquo;send me maintenance reminders&rdquo; when booking.
                NZ law allows consent inferred from a business relationship in some cases — check with your lawyer before turning this on.
              </p>
            </div>
            <div>
              <label className={label} htmlFor="social_per_week">Posts a week</label>
              <input id="social_per_week" name="social_per_week" type="number" min={0} max={14} defaultValue={s.social_per_week} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="seo_per_week">Area pages a week</label>
              <input id="seo_per_week" name="seo_per_week" type="number" min={0} max={10} defaultValue={s.seo_per_week} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ad_min_spare_hours">Suggest an ad when next 7 days have (spare hours)</label>
              <input id="ad_min_spare_hours" name="ad_min_spare_hours" type="number" min={0} step={1} defaultValue={s.ad_min_spare_hours} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ad_daily_budget_max">Ads: most per day ($)</label>
              <input id="ad_daily_budget_max" name="ad_daily_budget_max" type="number" min={1} defaultValue={s.ad_daily_budget_max} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ad_monthly_budget_max">Ads: most per month ($)</label>
              <input id="ad_monthly_budget_max" name="ad_monthly_budget_max" type="number" min={0} defaultValue={s.ad_monthly_budget_max} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ad_max_days">Ads: longest run (days)</label>
              <input id="ad_max_days" name="ad_max_days" type="number" min={1} max={60} defaultValue={s.ad_max_days} className={field} />
            </div>
            <div className="sm:col-span-2">
              <input type="hidden" name="ads_live_present" value="1" />
              <label className="flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" name="ads_live" defaultChecked={s.ads_live} className="mt-0.5 h-4 w-4" />
                <span>Approved ads start straight away</span>
              </label>
              <p className={hint}>Off: approved ads are created paused in Meta Ads Manager, and you press Publish there.</p>
            </div>
            <div className="sm:col-span-3">
              <label className={label} htmlFor="brand_voice">How it should sound</label>
              <textarea id="brand_voice" name="brand_voice" rows={2} defaultValue={s.brand_voice} className={field} />
            </div>
            <div className="sm:col-span-3">
              <label className={label} htmlFor="seo_suburbs">Suburbs for area pages (in order)</label>
              <textarea id="seo_suburbs" name="seo_suburbs" rows={3} defaultValue={s.seo_suburbs.join(", ")} className={field} />
              <p className={hint}>A general &ldquo;Plumber in …&rdquo; page for each, then drains, hot water, leaks and gas pages for suburbs we&apos;ve done 3+ jobs in.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white">Save settings</button>
          </div>
        </form>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function DraftCard({ d, settings }: { d: Draft; settings: Marketing["settings"] }) {
  const c = d.content as Record<string, unknown>;
  const t = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  return (
    <form className="rounded-2xl border border-black/10 p-4">
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="kind" value={d.kind} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-aqua-deep">{KIND[d.kind]}</span>
        <h3 className="font-bold">{d.title}</h3>
        <Badge status={d.status} />
        <span className="text-xs text-slate">
          {d.created_local} · written by {d.written_by === "claude" ? "the agent" : d.written_by === "rule" ? "the rule (agent not connected yet)" : "you"}
          {d.job_number ? <> · from <Link className="underline" href={`/dashboard/office/jobs/${d.job_number}`}>job #{d.job_number}</Link></> : null}
        </span>
      </div>
      {d.ai_notes && <p className="mt-1 text-sm text-slate">Agent: {d.ai_notes}</p>}
      {d.error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{d.error}</p>}

      <div className="mt-4 space-y-3">
        {d.kind === "campaign" && <CampaignFields d={d} t={t} />}
        {d.kind === "social_post" && <SocialFields d={d} t={t} />}
        {d.kind === "seo_page" && <PageFields t={t} faqs={(c.faqs as { q: string; a: string }[]) ?? []} />}
        {d.kind === "meta_ad" && <AdFields d={d} t={t} settings={settings} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button formAction={approveDraftAction} className={`${btn} bg-ink text-white`}>
          {d.kind === "campaign" ? "Approve and send" : d.kind === "seo_page" ? "Approve and publish" : "Approve and post"}
        </button>
        <button formAction={saveDraftAction} className={`${btn} bg-mist`}>Save changes</button>
        <span className="flex-1" />
        <input name="note" placeholder="Why not? (optional)" className="w-48 rounded-full border border-black/10 px-3 py-2 text-sm" />
        <button formAction={rejectDraftAction} className={`${btn} text-red-700 hover:bg-red-50`}>Reject</button>
      </div>
    </form>
  );
}

function CampaignFields({ d, t }: { d: Draft; t: (k: string) => string }) {
  const who = d.audience ?? [];
  return (
    <>
      <p className="text-sm">
        Goes to <strong>{who.length}</strong> customer{who.length === 1 ? "" : "s"}
        {who.length > 0 && <>: {who.slice(0, 12).map((a) => `${a.first_name}${a.suburb ? ` (${a.suburb})` : ""}`).join(", ")}{who.length > 12 ? "…" : ""}</>}
        {" "}— {who.filter((a) => a.has_email).length} with email.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div>
          <label className={label} htmlFor={`sms-${d.id}`}>Text</label>
          <textarea id={`sms-${d.id}`} name="sms" rows={3} defaultValue={t("sms")} className={field} />
          <p className={hint}>{"{business}"}, {"{first_name}"} and {"{link}"} are filled in per customer. Must end with &ldquo;Reply STOP to opt out&rdquo;.</p>
        </div>
        <div>
          <label className={label} htmlFor={`ch-${d.id}`}>Send by</label>
          <select id={`ch-${d.id}`} name="channel" defaultValue={t("channel") || "both"} className={field}>
            <option value="both">Text and email</option><option value="sms">Text only</option><option value="email">Email only</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor={`es-${d.id}`}>Email subject</label>
        <input id={`es-${d.id}`} name="email_subject" defaultValue={t("email_subject")} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`eb-${d.id}`}>Email</label>
        <textarea id={`eb-${d.id}`} name="email_body" rows={7} defaultValue={t("email_body")} className={field} />
        <p className={hint}>An unsubscribe link is added at the bottom.</p>
      </div>
    </>
  );
}

function Photos({ d, name, chosen, single }: { d: Draft; name: string; chosen: string[]; single?: boolean }) {
  if (!d.photos.length) return <p className="text-sm text-slate">No photo.</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {d.photos.map((p) => (
        <label key={p.id} className="block w-40 text-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.url && <img src={p.url} alt={`${p.stage} photo`} className="aspect-[4/3] w-full rounded-lg object-cover" />}
          <span className="mt-1 flex items-center gap-1">
            <input type={single ? "radio" : "checkbox"} name={name} value={p.id} defaultChecked={chosen.includes(p.id)} /> Use ({p.stage})
          </span>
        </label>
      ))}
    </div>
  );
}

function SocialFields({ d, t }: { d: Draft; t: (k: string) => string }) {
  return (
    <>
      <Photos d={d} name="photo_ids" chosen={(d.content.photo_ids as string[]) ?? []} />
      <p className={hint}>Check the photos show no house numbers, faces or number plates.</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {([["facebook", "Facebook"], ["instagram", "Instagram"], ["google", "Google listing"]] as const).map(([k, n]) => (
          <div key={k}>
            <label className={label} htmlFor={`${k}-${d.id}`}>{n}</label>
            <textarea id={`${k}-${d.id}`} name={k} rows={6} defaultValue={t(k)} className={field} />
          </div>
        ))}
      </div>
    </>
  );
}

function PageFields({ t, faqs }: { t: (k: string) => string; faqs: { q: string; a: string }[] }) {
  return (
    <>
      <p className="text-sm">Address: <code>/areas/{t("slug")}</code></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Search title <input name="title" defaultValue={t("title")} className={field} /></label>
        </div>
        <div>
          <label className={label}>Heading <input name="h1" defaultValue={t("h1")} className={field} /></label>
        </div>
      </div>
      <label className={label}>Search description <input name="meta_description" defaultValue={t("meta_description")} className={field} /></label>
      <label className={label}>Intro <textarea name="intro" rows={2} defaultValue={t("intro")} className={field} /></label>
      <label className={label}>Page (## for headings, - for lists, [text](/link) for links)
        <textarea name="body_md" rows={16} defaultValue={t("body_md")} className={`${field} font-mono text-xs`} />
      </label>
      <label className={label}>Questions (Q: … then A: …, a blank line between each)
        <textarea name="faqs" rows={8} defaultValue={faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")} className={field} />
      </label>
    </>
  );
}

function AdFields({ d, t, settings }: { d: Draft; t: (k: string) => string; settings: Marketing["settings"] }) {
  const c = d.content as Record<string, unknown>;
  const locs = (c.locations as { name?: string; lat: number; lng: number; radius_km: number }[]) ?? [];
  const total = Number(c.daily_budget ?? 0) * Number(c.days ?? 0);
  return (
    <>
      <Photos d={d} name="photo_id" chosen={[String(c.photo_id ?? "")]} single />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Headline (40) <input name="headline" maxLength={40} defaultValue={t("headline")} className={field} /></label>
        <label className={label}>Button
          <select name="cta" defaultValue={t("cta")} className={field}>
            <option value="BOOK_NOW">Book now</option><option value="LEARN_MORE">Learn more</option>
            <option value="GET_QUOTE">Get quote</option><option value="CONTACT_US">Contact us</option>
          </select>
        </label>
      </div>
      <label className={label}>Ad text <textarea name="primary_text" rows={3} defaultValue={t("primary_text")} className={field} /></label>
      <label className={label}>Line under the headline (optional) <input name="description" defaultValue={t("description")} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>$ per day (max {settings.ad_daily_budget_max})
          <input name="daily_budget" type="number" min={5} max={settings.ad_daily_budget_max} defaultValue={String(c.daily_budget ?? "")} className={field} />
        </label>
        <label className={label}>Days (max {settings.ad_max_days})
          <input name="days" type="number" min={1} max={settings.ad_max_days} defaultValue={String(c.days ?? "")} className={field} />
        </label>
        <p className="self-end pb-2 text-sm">Up to <strong>{money(total)}</strong> in total (month limit {money(settings.ad_monthly_budget_max)}).</p>
      </div>
      <p className="text-sm text-slate">
        Shown to people aged {String(c.age_min ?? 25)}–65+ living in: {locs.map((l) => `${l.name ?? `${l.lat}, ${l.lng}`} (${l.radius_km} km)`).join("; ")}.
        Links to <code>{t("link")}</code>. {settings.ads_live ? "Starts as soon as you approve." : "Created paused in Meta Ads Manager."}
      </p>
    </>
  );
}

function RecentRow({ d }: { d: Draft }) {
  const r = (d.result ?? {}) as Record<string, { ok?: boolean; manual?: boolean; id?: string; error?: string } | number | string>;
  const NAMES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", google: "Google listing", meta_ad: "Meta ad" };
  const manual = Object.keys(NAMES).filter((k) => { const v = r[k]; return typeof v === "object" && v?.manual; });
  const c = d.content as Record<string, string>;
  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-aqua-deep">{KIND[d.kind]}</span>
        <span className="font-semibold">{d.title}</span>
        <Badge status={d.status} />
        <span className="text-xs text-slate">{d.decided_local ?? d.created_local}</span>
        {d.kind === "campaign" && d.status === "sent" && (
          <span className="text-xs">
            {String(r.texts ?? 0)} texts, {String(r.emails ?? 0)} emails · <strong>{d.booked}</strong> booked{d.revenue ? ` · ${money(d.revenue)}` : ""}
            {r.sms_mode === "test" ? " · (texts in test mode)" : ""}
          </span>
        )}
        {d.kind === "seo_page" && typeof r.url === "string" && <a className="text-xs underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}
      </div>
      {d.decided_note && <p className="text-xs text-slate">Note: {d.decided_note}</p>}
      {d.error && <p className="text-xs text-red-700">{d.error}</p>}
      {manual.length > 0 && (
        <details className="mt-2 rounded-xl bg-mist p-3">
          <summary className="cursor-pointer text-xs font-semibold">Post by hand: {manual.map((k) => NAMES[k]).join(", ")} (no keys yet)</summary>
          {d.kind === "meta_ad" ? (
            <p className="mt-2 text-xs">Create it in Meta Ads Manager: &ldquo;{c.headline}&rdquo; — {c.primary_text}</p>
          ) : manual.map((k) => (
            <label key={k} className="mt-2 block text-xs font-semibold">{NAMES[k]}
              <textarea readOnly rows={4} defaultValue={c[k] ?? ""} className="mt-1 w-full rounded-lg border border-black/10 p-2 text-xs font-normal" />
            </label>
          ))}
          {d.photos.map((p) => p.url && <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="mr-3 text-xs underline">Photo</a>)}
        </details>
      )}
    </div>
  );
}
