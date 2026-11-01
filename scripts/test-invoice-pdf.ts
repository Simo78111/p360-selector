// Phase 3d: renders the invoice and payment-claim PDFs from real documents captured from the engine's SQL test
// (scripts/fixtures/invoices) and checks the basics. Run: npm run test:invoice-pdf  (writes PDFs to $OUT if set)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { attachInvoiceFiles, invoicePdf } from "../src/lib/invoice-pdf";
import { customerCopy, groupLines, invoiceFileName, invoiceTitle, type Breakdown, type Invoice } from "../src/lib/invoices";

const load = <T>(n: string) => JSON.parse(readFileSync(new URL(`./fixtures/invoices/${n}.json`, import.meta.url), "utf8")) as T;
const out = process.env.OUT;

async function main() {
  const breakdown = load<Breakdown>("breakdown");
  for (const name of ["chargeup", "deposit", "progress", "claim"]) {
    const doc = load<Invoice>(name);
    // costs never reach the PDF, even if the office copy had them
    const withCost = { ...doc, cost_total: 99, lines: doc.lines.map((l) => ({ ...l, unit_cost: 1, cost_total: 1 })) };
    const cc = customerCopy(withCost);
    assert.ok(!("cost_total" in cc) && cc.lines.every((l) => !("unit_cost" in l)), `${name}: cost fields removed`);
    const pdf = await invoicePdf(cc, { breakdown });
    const pages = pdf.getPageCount();
    if (name === "claim") {
      assert.ok(pages >= 3, `claim: page 1, the summary and line items, and the breakdown (${pages} pages)`);
      assert.equal(invoiceTitle(doc).startsWith("Payment Claim #1"), true);
    } else assert.ok(pages >= 1, `${name}: ${pages} pages`);
    // a PDF attachment adds its pages
    if (name === "claim") {
      const extra = await PDFDocument.create();
      extra.addPage();
      extra.addPage();
      const skipped = await attachInvoiceFiles(pdf, [
        { name: "Insurance certificate.pdf", type: "application/pdf", bytes: await extra.save() },
        { name: "notes.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: new Uint8Array([1, 2]) },
      ]);
      assert.equal(pdf.getPageCount(), pages + 2, "two attached pages");
      assert.deepEqual(skipped, ["notes.docx"], "files that aren't PDFs or photos are listed, not added");
    }
    const bytes = await pdf.save();
    assert.ok(bytes.length > 2000);
    if (out) writeFileSync(`${out}/${invoiceFileName(doc)}`, bytes);
    console.log(`ok ${name}: ${invoiceFileName(doc)} (${pdf.getPageCount()} pages, ${bytes.length} bytes)`);
  }
  // grouping: phase heading, then Labour before Materials
  const g = groupLines(load<Invoice>("chargeup").lines);
  assert.ok(g[0].parts[0].kind === "labour" && g[0].parts.some((p) => p.kind === "materials"), "labour first, then materials");
  console.log("ok grouping");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
