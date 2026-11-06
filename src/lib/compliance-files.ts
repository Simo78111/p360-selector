import "server-only";
// Staff compliance schedule (Simon, 6 Nov): builds the PDF or Word file from Settings → Staff (licences and tickets,
// staff_licences in the engine) for the people chosen, on the chosen company's letterhead. With "attach card copies"
// the PDF gets the card photos at the back, two to a page (JPG/PNG photos, and PDF scans as their own pages; other
// formats such as HEIC are listed as "not attached"). Driver licences are never included.
import { appendCards, type CardFile } from "./compliance-cards";
import { complianceLayout, type ComplianceData } from "./compliance-layout";
import { engine } from "./engine";
import { layoutDocx } from "./hs-docx";
import { layoutPdf } from "./hs-pdf";
import { JOB_FILES_BUCKET } from "./jobs";
import { LICENCE_KINDS } from "./jm-kinds";
import { licenceCard, loadCompanies, loadStaff, TRADES } from "./jm";
import { PLUMBING360_LOGO_PNG } from "./quote-logos";
import { nzDate } from "./hs-layout";

export const COMPLIANCE_KINDS = Object.keys(LICENCE_KINDS).filter((k) => k !== "drivers");

export type ComplianceRequest = {
  staffIds: string[]; companyId: string | null; preparedFor: string | null; jobRef: string | null;
  kinds: string[] | null; cards: boolean; format: "pdf" | "docx"; preparedBy: string | null;
};

/** Width and height from a PNG's header. */
function pngSize(b64: string) {
  const b = Buffer.from(b64.slice(0, 64), "base64");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const todayNZ = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

export async function buildCompliance(q: ComplianceRequest) {
  const [staff, companies] = await Promise.all([loadStaff(), loadCompanies()]);
  const co = companies.find((c) => c.id === q.companyId) ?? companies.find((c) => c.code === "PTSL") ?? companies[0];
  if (!co) throw new Error("No company set up.");
  const kinds = new Set((q.kinds?.length ? q.kinds : COMPLIANCE_KINDS).filter((k) => COMPLIANCE_KINDS.includes(k)));
  const chosen = q.staffIds.map((id) => staff.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  if (!chosen.length) throw new Error("Choose at least one person.");

  const data: ComplianceData = {
    company: {
      name: co.name, legal_name: co.legal_name.replace(/\bLtd\b/, "Limited"), phone: co.phone, email: co.email,
      address: [co.address_line, co.suburb, [co.city, co.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    },
    // Project 360 uses the Project 360 + Master Plumbers header (the SWMS one); Plumbing 360 its own logo
    logo: co.code === "PTSL" ? undefined : { png: PLUMBING360_LOGO_PNG, ...pngSize(PLUMBING360_LOGO_PNG) },
    prepared_for: q.preparedFor?.trim() || null,
    job_ref: q.jobRef?.trim() || null,
    people: chosen.map((s) => ({
      name: s.full_name,
      role: [s.trade ? TRADES[s.trade] ?? s.trade : null, s.is_apprentice ? "apprentice" : null].filter(Boolean).join(" · ") || "–",
      tickets: s.licences.filter((l) => kinds.has(l.kind))
        .map((l) => ({ id: l.id, kind: l.kind, number: l.number, expires_on: l.expires_on, card: !!l.card })),
    })),
    cards: q.cards && q.format === "pdf",
    prepared_by: q.preparedBy,
    today: todayNZ(),
  };
  const layout = complianceLayout(data);
  if (q.format === "docx") {
    return { bytes: await layoutDocx(layout), name: `${layout.name}.docx`,
             mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  let bytes = await layoutPdf(layout);
  if (data.cards) bytes = await attachCards(bytes, data);
  return { bytes, name: `${layout.name}.pdf`, mime: "application/pdf" };
}

/** The card photos at the back of the PDF (downloaded from storage, then drawn by appendCards). */
async function attachCards(pdf: Uint8Array, data: ComplianceData): Promise<Uint8Array> {
  const db = engine();
  if (!db) return pdf;
  const items: CardFile[] = [];
  for (const m of data.people) {
    for (const t of m.tickets.filter((x) => x.card)) {
      const caption = `${m.name} – ${LICENCE_KINDS[t.kind] ?? t.kind}${t.number ? ` ${t.number}` : ""}` +
        (t.expires_on ? ` – expires ${nzDate(t.expires_on)}` : "");
      try {
        const card = await licenceCard(t.id);
        if (!card?.path) continue;
        const { data: blob, error } = await db.storage.from(JOB_FILES_BUCKET).download(card.path);
        if (error || !blob) throw new Error(error?.message ?? "missing");
        items.push({ caption, ext: card.path.split(".").pop()?.toLowerCase() ?? "", bytes: new Uint8Array(await blob.arrayBuffer()) });
      } catch {
        items.push({ caption, ext: "", bytes: null });
      }
    }
  }
  return appendCards(pdf, items, `${data.company.legal_name} – staff compliance schedule – ${nzDate(data.today)}`);
}
