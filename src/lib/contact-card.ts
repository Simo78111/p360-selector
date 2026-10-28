import "server-only";
// "Save us in your phone": the contact card customers add after their first job, and its setting.
import { engine } from "./engine";
import { site } from "./site";

export type ContactCard = { business: string; text_number: string | null; site_url: string | null };
export type ContactCardSettings = { text_number: string | null; on: boolean; site_url: string | null; sent: number };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected.");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** The engine's details, or the website's own if the engine isn't there. Never throws. */
export async function loadContactCard(): Promise<ContactCard> {
  try {
    if (engine()) return await rpc<ContactCard>("site_contact_card");
  } catch (e) {
    console.error("[contact-card]", e);
  }
  return { business: "Plumbing 360", text_number: null, site_url: null };
}

export const loadContactCardSettings = () => rpc<ContactCardSettings>("office_contact_card_settings");
export const saveContactCardSettings = (textNumber: string, on: boolean) =>
  rpc<ContactCardSettings>("office_save_contact_card", { p_text_number: textNumber, p_on: on });

/** +64220000360 → 022 000 0360 */
export function localNumber(e164: string) {
  const d = e164.startsWith("+64") ? `0${e164.slice(3)}` : e164;
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\;").replace(/\n/g, "\\n");
/** vCard lines are folded at 75 characters (long photo data). */
const fold = (line: string) => line.match(/.{1,74}/g)!.join("\r\n ");

export function vcard(card: ContactCard, siteUrl: string, photoBase64: string | null) {
  const name = card.business || "Plumbing 360";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${esc(name)};;;`,
    `FN:${esc(name)}`,
    `ORG:${esc(name)}`,
    ...(card.text_number ? [`TEL;TYPE=CELL,VOICE,MSG:${card.text_number}`] : []),
    `TEL;TYPE=WORK,VOICE:${site.phone.replace(/\s/g, "")}`,
    `EMAIL;TYPE=WORK:${site.email}`,
    `URL:${siteUrl}`,
    `NOTE:${esc(card.text_number ? `Text "new job" to ${localNumber(card.text_number)} and we'll send you a booking link. Or book at ${siteUrl}` : `Book at ${siteUrl}`)}`,
    ...(photoBase64 ? [`PHOTO;ENCODING=b;TYPE=PNG:${photoBase64}`] : []),
    "END:VCARD",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
