// 17 Nov 2026: formatted quote wording (lib/rich-text.ts), the quote PDF with it, and the Google address
// mapping (lib/places.ts). Run: npm run test:rich-text  (writes the PDF to $OUT if set)
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { blocksToText, inlineRuns, plainText, richBlocks, toEditorHtml } from "../src/lib/rich-text";
import { quotePdf } from "../src/lib/quote-pdf";
import { toSiteAddress } from "../src/lib/places";
import type { QuoteDoc } from "../src/lib/quotes";

// ── inline marks ──────────────────────────────────────────────────────────
assert.deepEqual(inlineRuns("Fit **new** cylinder"), [{ text: "Fit " }, { text: "new", b: true }, { text: " cylinder" }]);
assert.deepEqual(inlineRuns("__under__ and *it*"), [{ text: "under", u: true }, { text: " and " }, { text: "it", i: true }]);
assert.deepEqual(inlineRuns("**bold __both__**"), [{ text: "bold ", b: true }, { text: "both", b: true, u: true }]);
assert.deepEqual(inlineRuns("***both*** then **b __bu *bui*__**"), [{ text: "both", b: true, i: true }, { text: " then " }, { text: "b ", b: true }, { text: "bu ", b: true, u: true }, { text: "bui", b: true, u: true, i: true }]);
for (const r of [{ b: true, i: true }, { b: true, u: true, i: true }, { u: true, i: true }, { b: true, u: true }]) {
  const t = blocksToText([{ kind: "para", runs: [{ text: "x " }, { text: "styled", ...r }, { text: " y" }] }]);
  assert.deepEqual(richBlocks(t)[0].runs[1], { text: "styled", ...r }, t);
}
// things that only look like marks stay as typed
assert.deepEqual(inlineRuns("2 * 3 * 4 and a lone ** here"), [{ text: "2 * 3 * 4 and a lone ** here" }]);
assert.deepEqual(inlineRuns("file_name_here"), [{ text: "file_name_here" }]);

// ── blocks: old quotes read the same ──────────────────────────────────────
const old = "## Kitchen\n- Remove old sink\n• Fit new mixer\n* Test\nSupply and install.";
assert.deepEqual(richBlocks(old).map((b) => b.kind), ["h2", "bullet", "bullet", "bullet", "para"]);
assert.deepEqual(richBlocks("# Big\n1. one\n2. two\n\n1. again").map((b) => [b.kind, b.n]),
  [["h1", undefined], ["number", 1], ["number", 2], ["number", 1]]);
// exclusions: every line is a bullet, "~ " is a plain line
assert.deepEqual(richBlocks("Builders work\nPainting\n~ Note: see plans", "bullet").map((b) => b.kind), ["bullet", "bullet", "para"]);
assert.equal(plainText("## **Bold** heading\n- __a__ bullet"), "Bold heading\na bullet");

// ── round trip through the editor's blocks ────────────────────────────────
const text = "# Scope\n## Kitchen\n- Remove **old** sink\n- Fit __new__ *mixer*\n1. First\n2. Second\nSupply and install.";
assert.equal(blocksToText(richBlocks(text)), text);
assert.equal(blocksToText(richBlocks("A\nB", "bullet"), "bullet"), "A\nB");
assert.equal(blocksToText([{ kind: "para", runs: [{ text: "Fit " }, { text: "new ", b: true }, { text: "valve" }] }]), "Fit **new** valve");
const html = toEditorHtml(text);
assert.ok(html.startsWith("<h2>Scope</h2><h3>Kitchen</h3><ul><li>Remove <b>old</b> sink</li>"), html);
assert.ok(html.includes("<ol><li>First</li><li>Second</li></ol><p>Supply and install.</p>"), html);
assert.equal(toEditorHtml("a < b & c"), "<p>a &lt; b &amp; c</p>");
assert.equal(toEditorHtml("", "bullet"), "<ul><li><br></li></ul>");

// ── Google address → site fields ──────────────────────────────────────────
const comp = (longText: string, ...types: string[]) => ({ longText, shortText: longText, types });
const a = toSiteAddress({
  id: "x", formattedAddress: "2/14 Rosebank Road, Avondale, Auckland 1026, New Zealand",
  addressComponents: [comp("2", "subpremise"), comp("14", "street_number"), comp("Rosebank Road", "route"),
    comp("Avondale", "sublocality_level_1", "sublocality"), comp("Auckland", "locality"), comp("1026", "postal_code")],
  location: { latitude: -36.89, longitude: 174.69 }, types: ["subpremise"],
});
assert.deepEqual([a.address_line, a.suburb, a.city, a.postcode, a.lat, a.site_name], ["2/14 Rosebank Road", "Avondale", "Auckland", "1026", -36.89, ""]);
const shop = toSiteAddress({
  id: "y", displayName: { text: "New World Eastridge" }, formattedAddress: "Eastridge Shopping Centre, 215 Kepa Road, Mission Bay, Auckland 1071",
  addressComponents: [comp("215", "street_number"), comp("Kepa Road", "route"), comp("Mission Bay", "sublocality_level_1"),
    comp("Auckland", "locality"), comp("1071", "postal_code")],
  location: { latitude: -36.86, longitude: 174.83 }, types: ["supermarket", "establishment", "point_of_interest"],
});
assert.deepEqual([shop.address_line, shop.suburb, shop.site_name], ["215 Kepa Road", "Mission Bay", "New World Eastridge"]);
const town = toSiteAddress({
  id: "z", formattedAddress: "12 Queen Street, Pukekohe 2120, New Zealand",
  addressComponents: [comp("12", "street_number"), comp("Queen Street", "route"), comp("Pukekohe", "locality"), comp("2120", "postal_code")],
});
assert.deepEqual([town.address_line, town.suburb, town.city], ["12 Queen Street", "", "Pukekohe"]);

// ── the quote PDF with formatting ─────────────────────────────────────────
async function pdf() {
  const long = "Supply and install a new 180L mains pressure **electric hot water cylinder** with __seismic restraints__, valves and tempering valve. ".repeat(4);
  const q = {
    version_id: "v", quote_id: "q", job_id: "j", phase_id: null, number: "PTSL-3001-A1", job_ref: "PTSL-3001", phase_ref: "PTSL-3001a",
    phase_name: null, option_letter: "A", option_name: null, quote_status: "open", version_no: 1, status: "draft",
    heading: "Hot water cylinder replacement",
    description: `# Scope of works\n${long}\n## Kitchen\n- Remove **old** sink\n- Fit __new__ *mixer* — ***both***\n1. Isolate\n2. Drain down\nāēīōū and a verylongwordthatkeepsgoing${"x".repeat(150)}`,
    exclusions: "Builders work\n**Painting** and __making good__\n~ Note: anything not listed",
    note: "**NOTE** - as discussed with Sam on site", terms: "Payment within 20 days.\n\nThanks.", valid_days: 30,
    valid_until: "2026-12-17", deadline: null, deposit_kind: "none", deposit_value: null, discount_pct: 0,
    published_at: null, published_by: null, sent_at: null, sent_to: null, updated_at: "2026-11-17", updated_by: null,
    accepted_at: null, accepted_by: null, accepted_order_number: null, accepted_via: null, expired: false, order_number: null,
    company: { id: "c", code: "PTSL", name: "Project 360", legal_name: "Project Three Sixty Limited", phone: null, email: null,
      website: null, address_line: null, suburb: null, city: null, postcode: null, gst_number: null, logo_url: null },
    customer: { id: "u", name: "Test Customer", full_name: "Test Customer", billing_address: null, email: null },
    site: { site_name: null, address_line: "14 Rosebank Road", suburb: "Avondale", city: "Auckland", postcode: "1026" },
    sections: [{ id: "s", position: 1, name: "Hot water", description: "**Labour** and *materials*", appears_as: "fixed",
      fixed_price: 3000, from_favourite_id: null, sell: 3000, lines_sell: 3000, lines: [] }],
    totals: { subtotal: 3000, discount_pct: 0, discount: 0, net: 3000, gst: 450, total: 3450, deposit: null },
  } as unknown as QuoteDoc;
  const bytes = await quotePdf(q, { draft: true });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
  assert.ok(bytes.length > 3000);
  if (process.env.OUT) writeFileSync(`${process.env.OUT}/quote-formatting.pdf`, bytes);
}

pdf().then(() => console.log("rich text, address and quote PDF tests passed"), (e) => {
  console.error(e);
  process.exit(1);
});
