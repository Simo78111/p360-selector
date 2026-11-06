// Phase 5b: build the SWMS and JSA (PDF and Word) from a sample pack and check them.
//   npm run test:hs-docs            (writes the files to $HS_OUT if set, for looking at)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { jsaLayout, swmsLayout, docRefs, type HsPrint } from "../src/lib/hs-layout";
import { layoutPdf } from "../src/lib/hs-pdf";
import { layoutDocx } from "../src/lib/hs-docx";

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
