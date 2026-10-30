import { savePlumberGasAction, saveSettingsAction, saveSupplierAction } from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadSettings, type Settings } from "@/lib/automation";
import { officeEnabled } from "@/lib/office";
import { loadScreenSettings, type ScreenSettings } from "@/lib/screen";
import { screenLinkAction, screenSettingsAction } from "@/app/dashboard/screen-actions";
import { headers } from "next/headers";
import { contactCardAction } from "@/app/dashboard/contact-card-actions";
import { loadContactCardSettings, localNumber, type ContactCardSettings } from "@/lib/contact-card";
import { requireOffice } from "@/lib/auth";

export const metadata = { title: "Settings" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const field = "w-full rounded-xl border border-black/10 px-3 py-2 text-sm";
const label = "block text-sm font-medium";
const hint = "mt-1 text-xs text-slate";

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate">{intro}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: Props) {
  await requireOffice("owner");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let s: Settings;
  let screen: ScreenSettings;
  let card: ContactCardSettings;
  try {
    [s, screen, card] = await Promise.all([loadSettings(), loadScreenSettings(), loadContactCardSettings()]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const gasfitters = s.plumbers.filter((p) => p.is_gasfitter);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || `https://${h.get("host") ?? "www.plumbing360.nz"}`;
  const screenUrl = screen.token ? `${origin}/screen/${screen.token}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-slate">How much the system does on its own, and the details it needs to do it.</p>
      </div>
      <Flash ok={ok} err={err} />

      <form action={saveSettingsAction} className="space-y-6">
        <Section title="You and emails"
                 intro="The daily summary and every email go out from here. In test mode, every email (supplier orders, certificates, customer copies) goes to you instead, with the real address in the subject.">
          <div>
            <label className={label} htmlFor="owner_email">Your email</label>
            <input id="owner_email" name="owner_email" type="email" defaultValue={s.owner_email ?? ""} className={field} />
            <p className={hint}>Gets the daily summary, and replies from suppliers.</p>
          </div>
          <div>
            <label className={label} htmlFor="company_name">Company name on orders</label>
            <input id="company_name" name="company_name" defaultValue={s.company_name ?? ""} placeholder={s.business_name} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="email_mode">Emails</label>
            <select id="email_mode" name="email_mode" defaultValue={s.email_mode} className={field}>
              <option value="test">Test mode: all to me</option>
              <option value="live">Live: to suppliers, certifiers and customers</option>
            </select>
          </div>
          <div>
            <input type="hidden" name="daily_summary_present" value="1" />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="daily_summary" defaultChecked={s.daily_summary} className="h-4 w-4" /> Email me a daily summary
            </label>
            <label className={`${label} mt-2`} htmlFor="daily_summary_time">at</label>
            <input id="daily_summary_time" name="daily_summary_time" type="time" defaultValue={s.daily_summary_time} className={field} />
          </div>
        </Section>

        <Section title="Customer texts"
                 intro="The text assistant moves bookings, cancels and books free callbacks itself within these limits; anything outside them comes to Needs attention. (The assistant's on/off switch is on Needs attention.)">
          <div>
            <label className={label} htmlFor="cancel_notice_hours">Cancel by text if at least (hours ahead)</label>
            <input id="cancel_notice_hours" name="cancel_notice_hours" type="number" min={0} defaultValue={s.cancel_notice_hours} className={field} />
            <p className={hint}>Later than this, the office decides (late fee or not).</p>
          </div>
          <div>
            <label className={label} htmlFor="reschedule_days_ahead">Offer new times up to (days ahead)</label>
            <input id="reschedule_days_ahead" name="reschedule_days_ahead" type="number" min={1} max={60} defaultValue={s.reschedule_days_ahead} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="callback_warranty_days">Free callback within (days of the job)</label>
            <input id="callback_warranty_days" name="callback_warranty_days" type="number" min={0} defaultValue={s.callback_warranty_days} className={field} />
          </div>
        </Section>

        <Section title="Quotes for follow-up work"
                 intro="When a plumber recommends more work, Claude prices it from the price books and the plumber's rates. Quotes where every line has a price and the total is under the limit go straight to the customer; the rest wait for you in Needs attention.">
          <div>
            <label className={label} htmlFor="quotes_mode">Quotes</label>
            <select id="quotes_mode" name="quotes_mode" defaultValue={s.quotes_mode} className={field}>
              <option value="auto">Send automatically under the limit</option>
              <option value="suggest">Draft them; I&apos;ll check and send</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="quote_auto_send_max">Send automatically up to ($ incl GST)</label>
            <input id="quote_auto_send_max" name="quote_auto_send_max" type="number" min={0} step={50} defaultValue={s.quote_auto_send_max} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="quote_valid_days">Quotes valid for (days)</label>
            <input id="quote_valid_days" name="quote_valid_days" type="number" min={1} defaultValue={s.quote_valid_days} className={field} />
          </div>
        </Section>

        <Section title="Google reviews"
                 intro="A couple of hours after a job, one text asks for a review. Not sent after callbacks, complaints or urgent problems, or more than once every 6 months per customer.">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="google_review_url">Your Google review link</label>
            <input id="google_review_url" name="google_review_url" type="url" defaultValue={s.google_review_url ?? ""} placeholder="https://g.page/r/…/review" className={field} />
            <p className={hint}>Google Business Profile → Ask for reviews → copy the link. No link, no review texts.</p>
          </div>
          <div>
            <input type="hidden" name="review_requests_present" value="1" />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="review_requests" defaultChecked={s.review_requests} className="h-4 w-4" /> Ask for reviews
            </label>
            <label className={`${label} mt-2`} htmlFor="review_delay_hours">hours after the job</label>
            <input id="review_delay_hours" name="review_delay_hours" type="number" min={0} max={72} defaultValue={s.review_delay_hours} className={field} />
          </div>
        </Section>

        <Section title="Gas certificates"
                 intro="Finished gas jobs get a Certificate of Compliance filled in from the job. It's emailed to the gasfitter who did the work if they certify (ticked below), otherwise to this certifier, to check, complete and sign. The customer then gets their copy.">
          <div>
            <label className={label} htmlFor="certifier_plumber_id">Certifying gasfitter</label>
            <select id="certifier_plumber_id" name="certifier_plumber_id" defaultValue={s.certifier_plumber_id ?? ""} className={field}>
              <option value="">Someone outside the business (below)</option>
              {gasfitters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="certifier_name">Outside certifier: name</label>
            <input id="certifier_name" name="certifier_name" defaultValue={s.certifier_name ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="certifier_email">email</label>
            <input id="certifier_email" name="certifier_email" type="email" defaultValue={s.certifier_email ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="certifier_reg">registration number</label>
            <input id="certifier_reg" name="certifier_reg" defaultValue={s.certifier_reg ?? ""} className={field} />
          </div>
        </Section>

        <Section title="Timesheets and parts"
                 intro="Timesheets are built from the plumber app (first On my way to last Job done). Parts not in a price book are ordered from the default supplier.">
          <div>
            <label className={label} htmlFor="timesheet_break_min">Unpaid break (minutes)</label>
            <input id="timesheet_break_min" name="timesheet_break_min" type="number" min={0} max={120} defaultValue={s.timesheet_break_min} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="timesheet_break_after_h">when the day is longer than (hours)</label>
            <input id="timesheet_break_after_h" name="timesheet_break_after_h" type="number" min={0} step={0.5} defaultValue={s.timesheet_break_after_min / 60} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="default_supplier_id">Default supplier</label>
            <select id="default_supplier_id" name="default_supplier_id" defaultValue={s.default_supplier_id ?? ""} className={field}>
              <option value="">None</option>
              {s.suppliers.map((su) => <option key={su.id} value={su.id}>{su.name}</option>)}
            </select>
          </div>
        </Section>

        <div className="flex justify-end">
          <button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white">Save settings</button>
        </div>
      </form>

      <section id="screen" className="scroll-mt-24 rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Office screen</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          A big-screen view for the TV in the office: what needs attention, each plumber&apos;s day, new jobs and the money.
          Open the link on the computer connected to the TV and click once (full screen, and the chime for urgent items).
          The link is the only key — anyone with it can see the screen (customers show as first name and suburb only),
          so make a new one if it gets out.
        </p>
        {screenUrl ? (
          <div className="mt-4 space-y-3">
            <input readOnly value={screenUrl} aria-label="Office screen link" className={`${field} font-mono text-xs`} />
            <div className="flex flex-wrap gap-2">
              <a href={screenUrl} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Open the screen</a>
              <form action={screenLinkAction}><input type="hidden" name="on" value="1" />
                <button className="rounded-full bg-mist px-4 py-2 text-sm font-semibold">Make a new link</button></form>
              <form action={screenLinkAction}><input type="hidden" name="on" value="0" />
                <button className="rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Switch off</button></form>
            </div>
          </div>
        ) : (
          <form action={screenLinkAction} className="mt-4"><input type="hidden" name="on" value="1" />
            <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Make the screen link</button></form>
        )}
        <form action={screenSettingsAction} className="mt-5 grid items-end gap-4 sm:grid-cols-4">
          <div>
            <label className={label} htmlFor="target_day">Daily revenue target ($ excl GST)</label>
            <input id="target_day" name="target_day" inputMode="decimal" defaultValue={screen.target_day ?? ""} placeholder="Not set" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="target_week">Weekly revenue target ($ excl GST)</label>
            <input id="target_week" name="target_week" inputMode="decimal" defaultValue={screen.target_week ?? ""} placeholder="Not set" className={field} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" name="chime" defaultChecked={screen.chime} className="h-4 w-4" /> Chime for new urgent items
          </label>
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Save</button>
          <p className={`${hint} sm:col-span-4`}>Leave the targets empty until you know them: the screen then shows the number of invoices and how this week compares with last week instead.</p>
        </form>
      </section>

      <section id="save-contact" className="scroll-mt-24 rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Save us in your phone</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          The morning after a customer&apos;s first job, one text with a link that adds you to their contacts (name, logo
          and this number), and tells them to text &ldquo;new job&rdquo; next time — the text assistant replies with a
          booking link. Once per customer; not after callbacks, complaints or urgent problems.{" "}
          <a href="/save" target="_blank" className="font-medium text-aqua-deep underline">See the page</a>
        </p>
        <form action={contactCardAction} className="mt-4 grid items-end gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="text_number">The number customers text</label>
            <input id="text_number" name="text_number" type="tel" defaultValue={card.text_number ? localNumber(card.text_number) : ""} placeholder="e.g. 022 000 0360" className={field} />
            <p className={hint}>Your texting number from the SMS provider. No number, no texts.</p>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" name="on" defaultChecked={card.on} className="h-4 w-4" /> Send after the first job
          </label>
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white sm:justify-self-start">Save</button>
          <p className={`${hint} sm:col-span-3`}>Sent so far: {card.sent}</p>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Ordering from suppliers</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          When a plumber can&apos;t finish because they need a part, the order is emailed to the supplier&apos;s trade desk
          with your account number and the job, and the customer is texted times to finish. Untick &ldquo;Send
          automatically&rdquo; to check orders first. Suppliers come from Price books.
        </p>
        {s.suppliers.length === 0 ? (
          <p className="mt-4 text-sm text-slate">No suppliers yet — upload a price book first.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {s.suppliers.map((su) => (
              <form key={su.id} action={saveSupplierAction} className="grid items-end gap-3 rounded-xl bg-mist p-3 sm:grid-cols-6">
                <input type="hidden" name="id" value={su.id} />
                <input type="hidden" name="name" value={su.name} />
                <p className="font-semibold sm:col-span-6">{su.name}</p>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor={`oe-${su.id}`}>Order email</label>
                  <input id={`oe-${su.id}`} name="order_email" type="email" defaultValue={su.order_email ?? ""} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`ac-${su.id}`}>Account no.</label>
                  <input id={`ac-${su.id}`} name="account_number" defaultValue={su.account_number ?? ""} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`br-${su.id}`}>Pick-up branch</label>
                  <input id={`br-${su.id}`} name="branch" defaultValue={su.branch ?? ""} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`ld-${su.id}`}>Ready in (work days)</label>
                  <input id={`ld-${su.id}`} name="lead_days" type="number" min={0} max={30} defaultValue={su.lead_days} className={field} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="auto_order" defaultChecked={su.auto_order} className="h-4 w-4" /> Send automatically
                  </label>
                  <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Save</button>
                </div>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Gasfitters</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Registration numbers go on the certificates. Tick &ldquo;Certifies&rdquo; for gasfitters who can sign their own
          Certificates of Compliance.
        </p>
        {gasfitters.length === 0 ? (
          <p className="mt-4 text-sm text-slate">No gasfitters yet — tick &ldquo;Also a gas fitter&rdquo; on the Plumbers page.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {gasfitters.map((p) => (
              <form key={p.id} action={savePlumberGasAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-mist p-3">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="name" value={p.name} />
                <p className="w-40 font-semibold">{p.name}</p>
                <div>
                  <label className={label} htmlFor={`reg-${p.id}`}>Registration no.</label>
                  <input id={`reg-${p.id}`} name="gas_reg_number" defaultValue={p.gas_reg_number ?? ""} className={field} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="certifying" defaultChecked={p.certifying} className="h-4 w-4" /> Certifies
                </label>
                <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Save</button>
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
