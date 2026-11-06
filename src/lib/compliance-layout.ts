// Staff compliance schedule (Simon, 6 Nov): every licence, ticket and training record with expiry dates for the
// people chosen, as one document to send to a customer or principal contractor. Same house style and renderers as the
// SWMS (hs-layout.ts → hs-pdf.ts / hs-docx.ts), on the chosen company's letterhead. Card photos are added to the PDF
// afterwards (compliance-files.ts). No server-only imports: tested by scripts/test-hs-docs.ts.
import { C, LX, nzDate, type Block, type Cell, type Layout, type Row } from "./hs-layout";
import { LICENCE_KINDS } from "./jm-kinds";

export type CompliancePerson = {
  name: string;
  role: string;                 // "Plumber · apprentice", "Gas fitter"
  tickets: { id: string; kind: string; number: string | null; expires_on: string | null; card: boolean }[];
};
export type ComplianceData = {
  company: { name: string; legal_name: string; phone: string | null; email: string | null; address: string | null };
  logo?: Layout["logo"];
  prepared_for: string | null;  // customer / site / job, as typed
  job_ref: string | null;
  people: CompliancePerson[];
  cards: boolean;               // copies of the cards are attached at the back (PDF)
  prepared_by: string | null;
  today: string;                // YYYY-MM-DD (Auckland)
};

// Licences first, then tickets, in the order of the Staff page list
const ORDER = Object.keys(LICENCE_KINDS);
const rank = (k: string) => (ORDER.indexOf(k) === -1 ? 99 : ORDER.indexOf(k));
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type TicketStatus = { text: string; fill?: string; bold?: boolean };
export function ticketStatus(expires: string | null, today: string): TicketStatus {
  if (!expires) return { text: "Current – no expiry" };
  const d = days(today, expires);
  if (d < 0) return { text: `EXPIRED ${nzDate(expires)}`, fill: C.redFill, bold: true };
  if (d <= 30) return { text: `Current – expires in ${d} day${d === 1 ? "" : "s"}`, fill: C.peach, bold: true };
  if (d <= 60) return { text: `Current – expires in ${d} days`, fill: C.peach };
  return { text: "Current" };
}

export function complianceLayout(x: ComplianceData): Layout {
  const { r, p, cell, label, head, table } = LX;
  const B: Block[] = [];
  const people = x.people.map((m) => ({ ...m, tickets: [...m.tickets].sort((a, b) => rank(a.kind) - rank(b.kind)) }));
  const all = people.flatMap((m) => m.tickets);
  const expired = all.filter((t) => t.expires_on && days(x.today, t.expires_on) < 0).length;
  const soon = all.filter((t) => t.expires_on && days(x.today, t.expires_on) >= 0 && days(x.today, t.expires_on) <= 30).length;
  const forWhom = [x.prepared_for, x.job_ref].filter(Boolean).join(" – ");

  B.push({ kind: "title", text: "STAFF COMPLIANCE SCHEDULE", sub: forWhom ? `Prepared for ${forWhom}` : x.company.name,
    note: `Licences, tickets and training held by ${people.length === 1 ? "this person" : `these ${people.length} people`}, ` +
      `with expiry dates, as recorded on ${nzDate(x.today)}.${x.cards ? " Copies of the cards we hold are attached at the back." : ""}` });

  B.push(table([16, 34, 16, 34], [
    { cells: [label("Company"), cell(x.company.legal_name), label("Prepared for"), cell(forWhom || "–")] },
    { cells: [label("Address"), cell(x.company.address ?? ""), label("Date"), cell(nzDate(x.today))] },
    { cells: [label("Contact"), cell([x.company.phone, x.company.email].filter(Boolean).join("  |  ")), label("Summary"),
      cell(`${people.length} ${people.length === 1 ? "person" : "people"}, ${all.length} licences and tickets` +
        (expired ? ` – ${expired} expired` : "") + (soon ? ` – ${soon} expiring within 30 days` : ""),
        { fill: expired ? C.redFill : soon ? C.peach : undefined, run: expired || soon ? { b: true } : undefined })] },
  ]));

  // At a glance: people × the licences/tickets anyone here holds (only when it fits across the page)
  const kinds = [...new Set(all.map((t) => t.kind))].sort((a, b) => rank(a) - rank(b));
  if (people.length > 1 && kinds.length > 0 && kinds.length <= 9) {
    B.push({ kind: "h", text: "At a glance" });
    const w = Math.min(14, Math.floor(78 / kinds.length));
    const rows: Row[] = people.map((m) => ({
      cells: [label(m.name), ...kinds.map((k): Cell => {
        const held = m.tickets.filter((t) => t.kind === k);
        if (!held.length) return cell("–", { run: { color: C.grey } });
        const best = held.reduce((a, b) => (!a.expires_on ? a : !b.expires_on ? b : a.expires_on > b.expires_on ? a : b));
        const st = ticketStatus(best.expires_on, x.today);
        return cell(best.expires_on ? nzDate(best.expires_on) : "Held", { fill: st.fill, run: { b: st.bold, size: 7.5 } });
      })],
    }));
    B.push(table([100 - w * kinds.length, ...kinds.map(() => w)], [head(["Name", ...kinds.map((k) => LICENCE_KINDS[k] ?? k)]), ...rows], 1, 7.5));
    B.push({ kind: "p", para: p("Dates are expiry dates. Shaded: expires within 60 days; red: expired. – = not held.", { i: true, size: 7 }) });
  }

  B.push({ kind: "h", text: "Licences, tickets and training" });
  const rows: Row[] = [];
  for (const m of people) {
    if (!m.tickets.length) {
      rows.push({ cells: [cell(m.name, { run: { b: true } }), cell(m.role), cell("No licences or tickets recorded", { span: 5, run: { i: true, color: C.grey } })] });
      continue;
    }
    m.tickets.forEach((t, i) => {
      const st = ticketStatus(t.expires_on, x.today);
      rows.push({ cells: [
        cell(i === 0 ? m.name : "", { run: { b: true } }), cell(i === 0 ? m.role : ""),
        cell(LICENCE_KINDS[t.kind] ?? t.kind), cell(t.number ?? "–"), cell(t.expires_on ? nzDate(t.expires_on) : "No expiry"),
        cell(st.text, { fill: st.fill, run: st.bold ? { b: true } : undefined }),
        cell(t.card ? (x.cards ? "Attached" : "On file") : "–"),
      ] });
    });
  }
  B.push(table([17, 14, 21, 13, 10, 15, 10], [head(["Name", "Trade / role", "Licence or ticket", "Number", "Expiry", "Status", "Card copy"]), ...rows], 1));
  B.push({ kind: "p", para: { runs: [r("Plumbing, gasfitting and drainlaying licences can be checked on the Plumbers, Gasfitters and Drainlayers Board public register.", { i: true, size: 7 })] } });

  B.push({ kind: "h", text: "Verified by" });
  B.push(table([22, 26, 22, 18, 12], [
    { cells: [cell("Checked against the records and cards held", { span: 5, fill: C.orange, run: { b: true, color: C.white } })] },
    { header: true, cells: ["", "Name", "Role", "Signature", "Date"].map((t) => cell(t, { fill: C.orangeDark, run: { b: true, color: C.white } })) },
    { cells: [label("Verified by", { fill: C.peach }), cell(x.prepared_by ?? "", { minH: 26 }), cell(""), cell(""), cell(nzDate(x.today))] },
  ]));

  const slug = (forWhom || "staff").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "staff";
  return {
    name: `Staff-compliance-${slug}-${x.today}`,
    title: `Staff compliance schedule${forWhom ? ` – ${forWhom}` : ""}`,
    header: `Staff compliance schedule${forWhom ? ` – ${forWhom}` : ""}`,
    footer: `${x.company.legal_name} – staff compliance schedule – ${nzDate(x.today)} – licences and tickets as recorded on this date`,
    draft: false,
    blocks: B,
    logo: x.logo,
  };
}
