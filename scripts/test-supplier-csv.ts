// npm run test:supplier-csv — reads the sample Reece and Chesters files Simon sent (scripts/fixtures/suppliers).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseSupplierCsv } from "../src/lib/supplier-csv";

const f = (n: string) => readFileSync(new URL(`./fixtures/suppliers/${n}`, import.meta.url), "utf8");

const rd = parseSupplierCsv(f("reece-detail.csv"));
assert.equal(rd.supplier, "Reece");
assert.equal(rd.docs.length, 1);
assert.deepEqual({ ...rd.docs[0], lines: undefined }, {
  number: "591769272", date: "2026-10-31", type: "TAX INVOICE", branch: "1001-Plumbing Auckland", order_no: "JH-19678A",
  receiver: "James Hall", job_name: null, subtotal: 45.6, gst: 6.84, total: 52.44, lines: undefined,
});
assert.deepEqual(rd.docs[0].lines, [{ code: "1456358", description: 'Rehau Rautitan LF BR Lug Elb 16mmx1/2"fi', quantity: 6, unit: "EA", total: 45.6 }]);

const rs = parseSupplierCsv(f("reece-summary.csv"));
assert.equal(rs.docs[0].lines.length, 0);
assert.equal(rs.docs[0].subtotal, 45.6);

const ch = parseSupplierCsv(f("chesters.csv"));
assert.equal(ch.supplier, "Chesters");
assert.equal(ch.docs.length, 3);
assert.deepEqual(ch.docs.map((d) => [d.number, d.date, d.order_no, d.subtotal, d.gst, d.total, d.lines.length]), [
  ["35631445", "2026-10-30", "18849C", 101.29, 15.19, 116.48, 6],
  ["35631420", "2026-10-30", "18586", 37.54, 5.63, 43.17, 7],
  ["35626943", "2026-10-30", "18586", 106.33, 15.95, 122.28, 7],
]);
for (const d of ch.docs) {
  const sum = Math.round(d.lines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  assert.equal(sum, d.subtotal, `${d.number}: lines ${sum} vs ${d.subtotal}`);
}
assert.equal(ch.docs[0].lines[2].description, "PVC DWV 4 Way Riser, 100x50x40x40x40mm");
assert.equal(ch.docs[2].lines[0].description, 'Spartan Pex Crimp Coupler Male SPCMSC3232, 32mmx1-1/4"');
assert.throws(() => parseSupplierCsv("hello,world\n1,2"), /Reece or Chesters/);
console.log("supplier CSV: Reece lines, Reece totals, Chesters (3 invoices, lines add up) — all pass");
