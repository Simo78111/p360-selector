import "server-only";
import { relationships, timesOfDay } from "./booking";
import type { Booking, Photo } from "./bookings-store";
import { formatPrice, site } from "./site";

// Email through Resend (resend.com). Switched on by RESEND_API_KEY.
// EMAIL_FROM must use a domain you've verified in Resend.
const from = () => process.env.EMAIL_FROM || `${site.name} <bookings@plumbing360.co.nz>`;
const officeTo = () => process.env.OFFICE_EMAIL || site.email;

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
};

/** Returns false when skipped because email isn't set up; throws if Resend rejects it. */
async function send(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info("[email] skipped (no RESEND_API_KEY):", email.subject, "→", email.to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
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
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return true;
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
    ["Deposit", booking.status === "paid" ? `${formatPrice(booking.depositAmount)} paid` : booking.status === "pending_payment" ? "Not yet paid" : "None (payments off)"],
    ["Name", booking.name],
    ["Phone", booking.phone],
    ["Email", booking.email],
    ["Address", `${booking.street}, ${booking.suburb} ${booking.postcode}`],
    ["Property", label(relationships, booking.relationship)],
    ["Access notes", booking.access || "None"],
    ["Preferred days", booking.days.join(", ")],
    ["Preferred time", label(timesOfDay, booking.time)],
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
