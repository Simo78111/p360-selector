import "server-only";
import { relationships, timesOfDay } from "./booking";
import type { Booking, Photo } from "./bookings-store";
import { formatPrice, site } from "./site";
import { isTestSite, testInbox } from "./test-mode";

// Email through Resend (resend.com). Switched on by RESEND_API_KEY.
// EMAIL_FROM must use a domain you've verified in Resend.
const from = () => process.env.EMAIL_FROM || `${site.name} <bookings@plumbing360.nz>`;
const officeTo = () => process.env.OFFICE_EMAIL || site.email;

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
  headers?: Record<string, string>;
};

/** Returns false when skipped because email isn't set up; throws if Resend rejects it. */
async function send(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info("[email] skipped (no RESEND_API_KEY):", email.subject, "→", email.to);
    return false;
  }
  if (isTestSite()) {
    // test site: never email a real customer or supplier
    const inbox = testInbox();
    if (!inbox) {
      console.info("[email] test site, no TEST_EMAIL_TO: skipped", email.subject, "→", email.to);
      return false;
    }
    email = { ...email, subject: `[TEST for ${email.to}] ${email.subject}`, to: inbox };
  }
  const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: from(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo,
      attachments: email.attachments,
      headers: email.headers,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return true;
}

/** An email the booking engine queued (supplier order, gas certificate, daily summary). */
export async function sendEngineEmail(e: { to: string; to_name?: string | null; subject: string; text: string; html?: string | null; reply_to?: string | null;
                                        list_unsubscribe?: string | null }) {
  return send({
    // marketing emails: one-click unsubscribe in Gmail/Outlook (the link opens our unsubscribe page)
    headers: e.list_unsubscribe ? { "List-Unsubscribe": `<${e.list_unsubscribe}>` } : undefined,
    to: e.to_name ? `${e.to_name.replace(/[<>"]/g, "")} <${e.to}>` : e.to,
    subject: e.subject,
    text: e.text,
    html: e.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${esc(e.text)}</pre>`,
    replyTo: e.reply_to ?? undefined,
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

function rows(booking: Booking): [string, string][] {
  return [
    ["Reference", booking.reference],
    ["Job", `${booking.outcome.title} (${booking.outcome.service})`],
    ["Urgency", booking.urgency],
    ["Finder answers", booking.answers.replaceAll(".", " → ")],
    ["Price shown", booking.priceLabel],
    ["Deposit", booking.status === "paid" ? `${formatPrice(booking.depositAmount)} paid` : booking.status === "pending_payment" ? "Not yet paid" : "None"],
    ["Name", booking.name],
    ["Phone", booking.phone],
    ["Email", booking.email],
    ["Address", `${booking.street}, ${booking.suburb} ${booking.postcode}`],
    ["Property", label(relationships, booking.relationship)],
    ["Access notes", booking.access || "None"],
    ["Preferred days", booking.days.join(", ") || "Not needed for this booking type"],
    ["Preferred time", label(timesOfDay, booking.time)],
    ["Scheduling", engineLine(booking)],
    ["Description", booking.description],
  ];
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#eef9fd;font-family:Arial,Helvetica,sans-serif;color:#0e0e0e">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#49c7eb;padding:20px 28px;font-size:20px;font-weight:bold">${esc(site.name)}</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;background:#f6f6f6;font-size:12px;color:#4c5159">${esc(site.name)} · ${esc(site.phone)} · ${esc(site.hours)}</td></tr>
</table></td></tr></table></body></html>`;
}

const table = (r: [string, string][]) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">${r
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#4c5159;vertical-align:top;white-space:nowrap;border-bottom:1px solid #eee">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;

export async function sendOfficeEmail(booking: Booking, photos: Photo[]) {
  const urgent = booking.urgency === "urgent" || booking.urgency === "emergency";
  const subject = `${urgent ? "URGENT: " : ""}New booking ${booking.reference}: ${booking.outcome.title}, ${booking.suburb}`;
  const r = rows(booking);
  return send({
    to: officeTo(),
    replyTo: booking.email,
    subject,
    html: layout(
      "New website booking",
      `${table(r)}<p style="margin-top:16px;font-size:14px;color:#4c5159">${photos.length} photo${photos.length === 1 ? "" : "s"} attached.</p>`,
    ),
    text: r.map(([k, v]) => `${k}: ${v}`).join("\n"),
    attachments: photos.map((p) => ({ filename: p.name, content: p.data.toString("base64") })),
  });
}

export async function sendCustomerEmail(booking: Booking) {
  const first = booking.name.split(" ")[0];
  const paidLine =
    booking.status === "paid" ? `<p>We've received your deposit of ${formatPrice(booking.depositAmount)}.</p>` : "";
  return send({
    to: booking.email,
    replyTo: officeTo(),
    subject: `We've got your booking (${booking.reference})`,
    html: layout(
      `Thanks, ${first}`,
      `<p>We've received your booking for <strong>${esc(booking.outcome.title.toLowerCase())}</strong> at ${esc(booking.street)}, ${esc(booking.suburb)}.</p>
${paidLine}
<p>Your reference is <strong>${esc(booking.reference)}</strong>.</p>
<p><strong>What happens next:</strong> we'll review your details and photos, then call or text you to confirm a time, usually within one working day.</p>
<p>Questions? Just reply to this email or call us on ${esc(site.phone)}.</p>`,
    ),
    text: `Thanks, ${first}. We've received your booking (${booking.reference}) for ${booking.outcome.title.toLowerCase()} at ${booking.street}, ${booking.suburb}. We'll call or text you to confirm a time, usually within one working day. Questions? Call ${site.phone}.`,
  });
}

/** The address booking emails go to, for showing on the dashboard. */
export const officeAddress = () => officeTo();
export const fromAddress = () => from();

/** A plain test email from the dashboard's Status page. No booking, no Fergus. */
export async function sendTestEmail(to: string) {
  const when = new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" });
  return send({
    to,
    subject: `Test email from ${site.name} (${when})`,
    html: layout(
      "Email is working",
      `<p>This is a test sent from the Status page of your ${esc(site.name)} dashboard at ${esc(when)}.</p>
<p>If you're reading this, booking emails from the website will reach this inbox too. Check it didn't land in spam.</p>`,
    ),
    text: `Email is working. This is a test sent from the Status page of your ${site.name} dashboard at ${when}.`,
  });
}

/** What the booking engine did, in words for the office. */
function engineLine(b: Booking) {
  const e = b.engine;
  if (!e || e.status === "skipped") return "Not sent to the booking engine: please book a time by hand";
  if (e.status === "outside_area") return "Outside the service area: please call the customer";
  if (e.status === "failed") return "The booking engine had an error: please book a time by hand";
  const job = e.jobNumber ? `Job #${e.jobNumber}` : "Job";
  if (b.tier === "flexi") return `${job} is in the Flexi standby pool`;
  return e.when ? `${job} booked for ${e.when}; customer texted` : `${job} saved; the scheduler will find a time`;
}


/** Photos of a job, to the customer. Throws if email isn't set up, so the office knows. */
export async function sendJobPhotos(p: {
  to: string;
  customerName: string;
  jobNumber: number;
  service: string;
  message: string;
  photos: { filename: string; data: Buffer }[];
}) {
  if (!emailEnabled()) throw new Error("Email isn't set up yet: add RESEND_API_KEY (and EMAIL_FROM) in Vercel.");
  const first = p.customerName.split(" ")[0] || "there";
  const note = p.message.trim();
  const intro = `Here ${p.photos.length === 1 ? "is the photo" : `are the ${p.photos.length} photos`} from job #${p.jobNumber} (${p.service}).`;
  await send({
    to: p.to,
    replyTo: officeTo(),
    subject: `Photos from your job #${p.jobNumber} — ${site.name}`,
    text: `Hi ${first},\n\n${note ? `${note}\n\n` : ""}${intro}\n\nThanks,\n${site.name}`,
    html: `<p>Hi ${esc(first)},</p>${note ? `<p>${esc(note).replace(/\n/g, "<br>")}</p>` : ""}<p>${esc(intro)}</p><p>Thanks,<br>${esc(site.name)}</p>`,
    attachments: p.photos.map((ph) => ({ filename: ph.filename, content: ph.data.toString("base64") })),
  });
}

/** A quote, to one of the customer's "gets quotes" contacts: the PDF attached and the Accept link.
 *  Sent from the company's name (Project 360 or Plumbing 360); replies go to the staff member who sent it. */
export async function sendQuoteEmail(p: {
  to: string;
  toName: string;
  companyName: string;
  number: string;
  heading: string;
  total: string;
  validUntil: string;
  acceptUrl: string;
  message: string;
  sender: string;
  replyTo: string | null;
  pdf: { filename: string; data: Uint8Array };
}) {
  if (!emailEnabled()) throw new Error("Email isn't set up yet: add RESEND_API_KEY (and EMAIL_FROM) in Vercel.");
  const first = p.toName.split(" ")[0] || "there";
  const note = p.message.trim();
  const text =
    `Hi ${first},\n\n${note ? `${note}\n\n` : ""}Please find attached our quote ${p.number} for ${p.heading}: ${p.total} incl GST, ` +
    `valid until ${p.validUntil}.\n\nTo accept it online: ${p.acceptUrl}\n\nThanks,\n${p.sender}\n${p.companyName}`;
  const html =
    `<p>Hi ${esc(first)},</p>${note ? `<p>${esc(note).replace(/\n/g, "<br>")}</p>` : ""}` +
    `<p>Please find attached our quote <strong>${esc(p.number)}</strong> for ${esc(p.heading)}: <strong>${esc(p.total)} incl GST</strong>, valid until ${esc(p.validUntil)}.</p>` +
    `<p><a href="${esc(p.acceptUrl)}" style="display:inline-block;background:#219e54;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">View and accept the quote</a></p>` +
    `<p>Thanks,<br>${esc(p.sender)}<br>${esc(p.companyName)}</p>`;
  return send({
    to: `${p.toName.replace(/[<>"]/g, "")} <${p.to}>`,
    replyTo: p.replyTo ?? officeTo(),
    subject: `Quote ${p.number} — ${p.heading} — ${p.companyName}`,
    text,
    html,
    attachments: [{ filename: p.pdf.filename, content: Buffer.from(p.pdf.data).toString("base64") }],
  });
}
