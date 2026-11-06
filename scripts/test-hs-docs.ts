// Phase 5b: build the SWMS and JSA (PDF and Word) from a sample pack and check them.
//   npm run test:hs-docs            (writes the files to $HS_OUT if set, for looking at)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { jsaLayout, swmsLayout, docRefs, type HsPrint } from "../src/lib/hs-layout";
import { layoutPdf } from "../src/lib/hs-pdf";
import { layoutDocx } from "../src/lib/hs-docx";
import { complianceLayout, ticketStatus } from "../src/lib/compliance-layout";
import { appendCards } from "../src/lib/compliance-cards";

const sample = JSON.parse(readFileSync(new URL("./fixtures/hs-sample.json", import.meta.url), "utf8")) as HsPrint;
const out = process.env.HS_OUT;
if (out) mkdirSync(out, { recursive: true });

async function main() {
  const refs = docRefs(sample);
  assert.equal(refs.swms, "SWMS-PTSL-3027-01");
  assert.equal(refs.rev, "Rev 0");

  for (const [kind, make] of [["swms", swmsLayout], ["jsa", jsaLayout]] as const) {
    const l = make(sample);
    assert.equal(l.draft, false, "approved pack is not a draft");
    const text = JSON.stringify(l.blocks);
    for (const hp of sample.document.hold_points) assert.ok(text.includes(hp.id), `${kind} lists ${hp.id}`);
    assert.ok(text.includes("James Hall"), `${kind} has the signed worker`);
    assert.ok(text.includes("Alex Burnett"), `${kind} lists crew still to sign`);
    const pdf = await layoutPdf(l);
    const pd = await PDFDocument.load(pdf);
    const [w, h] = [pd.getPage(0).getWidth(), pd.getPage(0).getHeight()];
    assert.ok(w > h, `${kind} PDF is landscape`);
    const docx = await layoutDocx(l);
    assert.equal(Buffer.from(docx.slice(0, 2)).toString(), "PK", `${kind} Word file is a zip`);
    console.log(`${kind}: PDF ${pd.getPageCount()} pages, ${Math.round(pdf.length / 1024)} KB; Word ${Math.round(docx.length / 1024)} KB`);
    if (out) {
      writeFileSync(`${out}/${l.name}.pdf`, pdf);
      writeFileSync(`${out}/${l.name}.docx`, docx);
    }
  }

  // a pack that isn't approved is marked DRAFT
  const draft = { ...sample, document: { ...sample.document, status: "to_approve" as const, approved_at: null, approved_by: null } };
  assert.equal(swmsLayout(draft).draft, true);
  assert.ok(!JSON.stringify(swmsLayout(draft).blocks).includes("Approved in the job system"));

  // 5c: the crew's tickets on the SWMS training table, with what's missing or expired flagged
  const withTickets: HsPrint = { ...sample, tickets: {
    needed: [{ kind: "ewp", label: "EWP / scissor lift", scope: "one", tasks: [3] }, { kind: "airside", label: "Airside / ASIC", scope: "each", tasks: [1] }],
    crew: [
      { staff_id: "a", name: "James Hall", next_start: null, problems: [],
        tickets: [{ kind: "airside", label: "Airside / ASIC", number: "A123", expires_on: "2030-01-01", state: "ok", card: true }] },
      { staff_id: "b", name: "Alex Burnett", next_start: null, tickets: [],
        problems: [{ kind: "airside", label: "Airside / ASIC", state: "missing", tasks: [1] }] },
    ],
    crew_problems: [{ kind: "ewp", label: "EWP / scissor lift", state: "missing", tasks: [3] }],
    warnings: 2,
  } };
  const tl = JSON.stringify(swmsLayout(withTickets).blocks);
  for (const want of ["Crew booked", "Airside / ASIC A123", "All current", "Airside / ASIC missing (task 1)", "At least one person needs EWP / scissor lift (task 3)", "Nobody booked holds it"]) {
    assert.ok(tl.includes(want), `training table has "${want}"`);
  }
  assert.ok(!JSON.stringify(swmsLayout(sample).blocks).includes("Crew booked"), "no tickets table without ticket data");
  await layoutPdf(swmsLayout(withTickets));
  await layoutDocx(swmsLayout(withTickets));

  // staff compliance schedule: status per ticket, at-a-glance grid, card copies column, people with nothing recorded
  assert.equal(ticketStatus(null, "2026-11-06").text, "Current – no expiry");
  assert.equal(ticketStatus("2026-11-01", "2026-11-06").text, "EXPIRED 01/11/2026");
  assert.equal(ticketStatus("2026-11-20", "2026-11-06").text, "Current – expires in 14 days");
  assert.equal(ticketStatus("2027-11-20", "2026-11-06").text, "Current");
  const comp = complianceLayout({
    company: { name: "Project 360", legal_name: "Project Three Sixty Limited", phone: "0800 776 360", email: "office@project360.co.nz", address: "Avondale, Auckland" },
    prepared_for: "Trust Projects – NEEDO AIAL", job_ref: "PTSL-19764", cards: true, prepared_by: "Simon", today: "2026-11-06",
    people: [
      { name: "James Hall", role: "Plumber", tickets: [
        { id: "1", kind: "site_safe", number: "SS123", expires_on: "2027-03-01", card: true },
        { id: "2", kind: "certifying_plumber", number: "12345", expires_on: null, card: false },
        { id: "3", kind: "first_aid", number: null, expires_on: "2026-11-01", card: true }] },
      { name: "Alex Burnett", role: "Plumber · apprentice", tickets: [] },
    ],
  });
  const ct = JSON.stringify(comp.blocks);
  for (const want of ["STAFF COMPLIANCE SCHEDULE", "Prepared for Trust Projects – NEEDO AIAL – PTSL-19764", "At a glance",
                      "EXPIRED 01/11/2026", "Certifying plumber", "Current – no expiry", "Attached", "No licences or tickets recorded",
                      "1 expired", "Verified by"]) {
    assert.ok(ct.includes(want), `compliance schedule has "${want}"`);
  }
  assert.ok(comp.name.startsWith("Staff-compliance-Trust-Projects"));
  const cpdf = await layoutPdf(comp);
  await layoutDocx(comp);
  console.log(`compliance: PDF ${(await PDFDocument.load(cpdf)).getPageCount()} page(s)`);
  // card copies: two photos to a page, a PDF scan as its own page, a HEIC listed as on file
  const png = Buffer.from(readFileSync(new URL("../src/lib/hs-logo.ts", import.meta.url), "utf8").match(/"([A-Za-z0-9+/=]{200,})"/)![1], "base64");
  const scan = await layoutPdf({ ...comp, blocks: comp.blocks.slice(0, 1), name: "scan" });
  const withCards = await appendCards(cpdf, [
    { caption: "James Hall – Site Safe passport SS123 – expires 01/03/2027", ext: "png", bytes: png },
    { caption: "James Hall – First aid – Ōtāhuhu ✓", ext: "png", bytes: png },
    { caption: "James Hall – EWP / scissor lift", ext: "pdf", bytes: scan },
    { caption: "Alex Burnett – Airside / ASIC", ext: "heic", bytes: new Uint8Array([1, 2, 3]) },
    { caption: "Alex Burnett – broken", ext: "jpg", bytes: new Uint8Array([1, 2, 3]) },
  ], "Project Three Sixty Limited – staff compliance schedule");
  const wc = await PDFDocument.load(withCards);
  const base = (await PDFDocument.load(cpdf)).getPageCount();
  assert.equal(wc.getPageCount(), base + 1 + 1 + 1, "one page of two photos, the scan, and the 'not attached' list");
  console.log(`compliance with cards: PDF ${wc.getPageCount()} pages`);
  if (out) writeFileSync(`${out}/${comp.name}.pdf`, withCards);

  // odd characters and a long unbroken word don't break the PDF
  const odd = structuredClone(sample);
  odd.document.content.tasks[0].hazards[0].hazard = "≤4 m → ☐ ✓ Ōtāhuhu " + "x".repeat(400);
  odd.signoffs[0].signature_svg = "not a path";
  await layoutPdf(swmsLayout(odd));
  console.log("All H&S document tests passed.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
