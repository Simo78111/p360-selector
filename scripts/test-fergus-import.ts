// Checks reading the fake Fergus sample exports (scripts/fixtures/fergus). Run: npx tsx scripts/test-fergus-import.ts
// The same rows are imported into the database by supabase/tests/jm_phase1_test.sql in the engine repo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessKind, readFergusCsv, type ImportKind } from "../src/lib/fergus-import";
import { parseCsv } from "../src/lib/csv";

const file = (k: ImportKind) => readFileSync(new URL(`./fixtures/fergus/${k}.csv`, import.meta.url), "utf8");

for (const k of ["customers", "sites", "contacts", "tier_prices"] as ImportKind[]) {
  assert.equal(guessKind(parseCsv(file(k))[0]), k, `guessed ${k}`);
}

const c = readFergusCsv("customers", file("customers"));
assert.deepEqual(c.missing, []);
assert.equal(c.rows.length, 4);
assert.deepEqual(c.rows[0], {
  fergus_id: "FC-1001", name: "Kowhai Construction Ltd", first_name: "Maria", last_name: "Tane", kind: "Builder",
  phone: "09 555 1001", mobile: "021 555 1001", email: "maria@kowhai-construction.example",
  billing_address: "PO Box 101 Avondale", payment_terms_days: "20", tier: "Cost + 60", notes: "Fake test customer",
});
assert.equal(c.rows[3].name, "Totara Cafe, Ponsonby", "quoted comma kept");
assert.equal(c.rows[2].phone, undefined, "empty cells left out");

const s = readFergusCsv("sites", file("sites"));
assert.deepEqual(s.missing, []);
assert.equal(s.rows[0].address_line, "12 Rimu Grove");
assert.equal(s.rows[0].customer_fergus_id, "FC-1001");
assert.equal(s.rows[1].access_notes, "Key in lockbox by lift");

const k = readFergusCsv("contacts", file("contacts"));
assert.deepEqual(k.missing, []);
assert.equal(k.rows[0].site_address, "12 Rimu Grove");
assert.equal(k.rows[1].gets_invoices, "Yes");

const t = readFergusCsv("tier_prices", file("tier_prices"));
assert.deepEqual(t.missing, []);
assert.deepEqual(t.rows[2], { tier: "Default tier (cost +40)", code: "PB", markup_pct: "35" });

// a file without the needed columns says what's missing
const bad = readFergusCsv("sites", "Foo,Bar\n1,2\n");
assert.deepEqual(bad.missing, ["customer_fergus_id or customer_name", "address_line"]);

console.log("fergus-import: ALL CHECKS PASSED");
