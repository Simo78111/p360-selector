import "server-only";
// Invoice PDFs (Phase 3d). Two layouts:
//   * Standard tax invoice, like Fergus INV-21296: logo top left and the company block top right; the customer on the
//     left and a grey box with the site address, invoice number, job number, invoice date, due date, GST number and
//     order number; "Tax Invoice | INV-…"; the thank-you line; columns Quantity / Price / Total; each phase heading
//     with its Labour lines (one per person per day, no names, the day's notes in italics) and Materials, each with a
//     subtotal; Subtotal / GST / Total; the company's footer (payment terms, bank account, licence line). No Pay button.
//   * Construction Contracts Act 2002 payment claim, like the PayApps claim: page 1 the claim (gross claimed, net
//     claimed incl GST, claimant / respondent / project, claim number, date, period, payment due date), then the
//     Claimed Contract Summary (rows A–J), then the line items (contract works, approved and unapproved variations,
//     previously approved / claimed to date / this period), then the hours and labour breakdown pages.
// Built from the customer's copy: never a cost price. Files picked from the job are added after (attachInvoiceFiles).
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PLUMBING360_LOGO_PNG, PROJECT360_LOGO_PNG } from "./quote-logos";
import { A4, BOX, clean, GREY, M, nzDay, qty, RULE, W, Writer, type Fonts } from "./quote-pdf";
import { groupLines, invoiceTitle, type Breakdown, type Invoice, type InvoiceLine, type SummaryRow } from "./invoices";

const R = A4[0] - M;                     // right edge
const RED = rgb(0.75, 0.2, 0.15);
const money = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${Number(n).toFixed(1).replace(/\.0$/, "")}%`);
/** "+6495550931" → "09 555 0931"-style local number for the claim's contact details. */
const localPhone = (p: string | null | undefined) => (p ? p.replace(/^\+64\s?/, "0") : p);
const lineTotal = (l: Pick<InvoiceLine, "quantity" | "unit_price">) => Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100;

async function start(i: Invoice) {
  const doc = await PDFDocument.create();
  doc.setTitle(invoiceTitle(i));
  doc.setAuthor(i.company.legal_name);
  doc.setCreator("Project Three Sixty job management");
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const w = new Writer(doc, f);
  // Letterhead: logo left, company block right
  const logo = await doc.embedPng(Buffer.from(i.company.code === "PTSL" ? PROJECT360_LOGO_PNG : PLUMBING360_LOGO_PNG, "base64"));
  const lh = 52;
  const lw = (logo.width / logo.height) * lh;
  w.page.drawImage(logo, { x: M, y: w.y - lh, width: Math.min(lw, 230), height: lh * (Math.min(lw, 230) / lw) });
  const co = i.company;
  const coLines = [co.address_line, co.suburb, [co.city, co.postcode].filter(Boolean).join(" "), co.phone ? co.phone : null]
    .filter((x): x is string => Boolean(x && x.trim()));
  let cy = w.y - 9;
  w.right(co.legal_name, R, cy, 9.5, f.bold);
  for (const l of coLines) {
    cy -= 12;
    w.right(l, R, cy, 9);
  }
  w.y = Math.min(w.y - lh, cy) - 26;
  return { doc, f, w };
}

function draftBanner(w: Writer, i: Invoice) {
  if (i.status === "draft") {
    w.para("DRAFT: not approved yet. Numbers and prices may change.", { font: w.f.bold, size: 9, color: RED, gap: 6 });
  } else if (i.status === "void") {
    w.para(`VOID${i.void_reason ? `: ${i.void_reason}` : ""}`, { font: w.f.bold, size: 11, color: RED, gap: 6 });
  }
}

function footerText(w: Writer, i: Invoice) {
  if (!i.footer) return;
  w.rule(10, 8);
  for (const p of i.footer.split(/\r?\n/)) {
    if (p.trim()) w.para(p, { font: w.f.ital, size: 8, gap: 1, color: GREY });
    else w.y -= 6;
  }
}

function pageNumbers(w: Writer, label: string) {
  w.pages.forEach((p, n) => {
    const t = `${label} · Page ${n + 1}/${w.pages.length}`;
    p.drawText(clean(w.f.reg, t), { x: R - w.f.reg.widthOfTextAtSize(clean(w.f.reg, t), 7.5), y: M - 14, size: 7.5, font: w.f.reg, color: GREY });
  });
}

// ── The standard tax invoice ───────────────────────────────────────────────────────────────────────────
function standardInvoice(w: Writer, i: Invoice) {
  const f = w.f;
  // customer (left) and the grey box (right)
  const top = w.y;
  const cust = [i.customer.name, ...(i.customer.billing_address ?? "").split(/\r?\n|,\s*/).filter(Boolean)];
  let ly = top;
  for (const l of cust.slice(0, 6)) {
    ly -= 12;
    w.text(l, M, ly, 9, l === i.customer.name ? f.bold : f.reg);
  }
  const boxX = M + W * 0.42;
  const boxW = R - boxX;
  const facts: [string, string][] = [
    ["Invoice Number", i.invoice_number ?? "Draft"],
    ["Job Number", i.phase_ref ?? i.job_ref],
    ["Invoice Date", nzDay(i.invoice_date)],
    ["Due Date", nzDay(i.due_date)],
    ["GST Number", i.company.gst_number ?? ""],
    ...(i.reference ? [["Order Number", i.reference] as [string, string]] : []),
  ];
  const site = [i.site.site_name, i.site.address_line, i.site.suburb, [i.site.city, i.site.postcode].filter(Boolean).join(" ")]
    .filter((x): x is string => Boolean(x && x.trim()));
  const boxH = Math.max(facts.length, site.length + 1) * 12 + 16;
  w.page.drawRectangle({ x: boxX, y: top - boxH, width: boxW, height: boxH, color: BOX });
  let by = top - 16;
  w.text("Site Address", boxX + 10, by, 9, f.bold);
  for (const l of site) {
    by -= 12;
    w.text(l, boxX + 10, by, 9);
  }
  let fy = top - 16;
  for (const [k, v] of facts) {
    w.right(`${k}: ${v}`, R - 10, fy, 9);
    fy -= 12;
  }
  w.y = Math.min(ly, top - boxH) - 20;
  draftBanner(w, i);

  w.need(40);
  w.y -= 6;
  w.text(`${i.kind === "deposit" ? "Tax Invoice (Deposit)" : "Tax Invoice"} | ${i.invoice_number ?? "Draft"}`, M, w.y, 13, f.bold);
  w.y -= 8;
  w.para(`Thank You for choosing ${i.company.name} for your Plumbing, Gasfitting and Drainlaying Requirements.`, { size: 9, gap: 4 });
  if (i.heading && i.heading !== i.phase_name) w.para(i.heading, { font: f.bold, size: 9.5, gap: 2 });
  if (i.note) w.para(i.note, { gap: 4 });

  // columns
  const xQty = R - 170, xPrice = R - 80;
  w.need(30);
  w.y -= 12;
  w.right("Quantity", xQty, w.y, 8.5, f.bold);
  w.right("Price", xPrice, w.y, 8.5, f.bold);
  w.right("Total", R, w.y, 8.5, f.bold);
  w.y -= 2;

  const groups = groupLines(i.lines);
  for (const g of groups) {
    if (g.heading) {
      w.need(40);
      w.y -= 18;
      w.text(g.heading, M, w.y, 10.5, f.bold);
      w.y -= 2;
    }
    for (const part of g.parts) {
      if (part.label) {
        w.need(30);
        w.y -= 14;
        w.text(part.label, M, w.y, 9.5, f.bold);
      }
      let sub = 0;
      part.lines.forEach((l, li) => {
        const progress = l.kind === "contract" || l.kind === "variation";
        const name = progress
          ? `${l.description}: ${pct(l.pct_to_date)} complete to date${Number(l.prev_to_date) > 0 ? ` (previously ${pct(l.pct_prev)})` : ""} of ${money(l.contract_value)}`
          : l.description + (l.unit && l.kind === "materials" ? ` (${l.unit})` : "");
        const ls = w.wrap(name, f.reg, 8.5, xQty - M - 60);
        const notes = l.note ? w.wrap(l.note, f.ital, 8, xQty - M - 60) : [];
        w.need((ls.length + notes.length) * 11 + 8 + (li === part.lines.length - 1 ? 20 : 0));
        w.y -= 6;
        ls.forEach((t, k) => {
          w.y -= k === 0 ? 8.5 : 11;
          w.text(t, M + 8, w.y, 8.5);
          if (k === 0) {
            w.right(qty(Number(l.quantity)), xQty, w.y, 8.5);
            w.right(money(l.unit_price), xPrice, w.y, 8.5);
            w.right(money(lineTotal(l)), R, w.y, 8.5);
          }
        });
        for (const t of notes) {
          w.y -= 10.5;
          w.text(t, M + 16, w.y, 8, f.ital, GREY);
        }
        sub += lineTotal(l);
      });
      if (part.label || g.parts.length > 1) {
        w.need(16);
        w.y -= 13;
        w.right(money(sub), R, w.y, 9, f.bold);
      }
    }
  }
  totals(w, i);
  footerText(w, i);
  pageNumbers(w, i.invoice_number ?? "Draft invoice");
}

function totals(w: Writer, i: Invoice) {
  const f = w.f;
  w.rule(14, 6);
  const rows: [string, string, boolean][] = [["Subtotal", money(i.subtotal), false], ["GST", money(i.gst), false],
                                              ["Total", money(i.total), true]];
  if (Number(i.amount_paid) > 0) {
    rows.push(["Paid", money(i.amount_paid), false], ["Balance due", money(Number(i.total) - Number(i.amount_paid)), true]);
  }
  for (const [k, v, b] of rows) {
    w.need(16);
    w.y -= 15;
    w.right(k, R - 90, w.y, 9.5, b ? f.bold : f.reg);
    w.right(v, R, w.y, 9.5, b ? f.bold : f.reg);
  }
}

// ── The payment claim ──────────────────────────────────────────────────────────────────────────────────
function claimPages(w: Writer, i: Invoice, b: Breakdown | null) {
  const f = w.f;
  const s = i.summary;
  const sumRow = (r: SummaryRow | null) =>
    r ? { value: Number(r.value), prev: Number(r.prev), to: Number(r.to_date) } : { value: 0, prev: 0, to: 0 };
  const A = sumRow(s?.A ?? null), B = sumRow(s?.B ?? null), D = sumRow(s?.D ?? null);
  const Cv = { value: A.value + B.value, prev: A.prev + B.prev, to: A.to + B.to };
  const E = { value: Cv.value + D.value, prev: Cv.prev + D.prev, to: Cv.to + D.to };
  const Fr = { prev: Number(s?.retention_prev ?? 0), to: Number(s?.retention_prev ?? 0) + Number(s?.retention_this ?? 0) };
  const G = { prev: Number(s?.released_prev ?? 0), to: Number(s?.released_prev ?? 0) + Number(s?.released_this ?? 0) };
  const H = { prev: E.prev - Fr.prev + G.prev, to: E.to - Fr.to + G.to };
  const gross = E.to - E.prev;

  w.y -= 2;
  w.text(`Payment Claim #${i.claim_no ?? ""}`, M, w.y, 16, f.bold);
  w.y -= 6;
  w.para("This is a Payment Claim made under the Construction Contracts Act 2002", { font: f.bold, size: 9.5, gap: 6 });
  draftBanner(w, i);

  // the two big numbers
  const bw = (W - 12) / 2, bh = 46, top = w.y;
  const big = (x: number, label: string, v: string) => {
    w.page.drawRectangle({ x, y: top - bh, width: bw, height: bh, color: BOX });
    w.text(label, x + 10, top - 16, 9, f.bold, GREY);
    w.text(v, x + 10, top - 36, 15, f.bold);
  };
  big(M, "Gross Amount Claimed this period (excl GST)", money(gross));
  big(M + bw + 12, "Net Payment Claimed (incl GST)", money(i.total));
  w.y = top - bh - 16;

  // claimant / respondent / project / claim
  const block = (title: string, rows: [string, string | null | undefined][]) => {
    const r = rows.filter((x): x is [string, string] => Boolean(x[1] && String(x[1]).trim()));
    w.need(r.length * 12 + 26);
    w.y -= 6;
    w.text(title, M, w.y, 10, f.bold);
    w.y -= 4;
    for (const [k, v] of r) {
      const ls = w.wrap(v, f.reg, 9, W - 150);
      ls.forEach((t, n) => {
        w.y -= 12;
        if (n === 0) w.text(k, M, w.y, 9, f.reg, GREY);
        w.text(t, M + 150, w.y, 9);
      });
    }
    w.y -= 8;
  };
  const co = i.company;
  block("Claimant's details", [
    ["Entity", co.legal_name], ["GST number", co.gst_number],
    ["Address", [co.address_line, co.suburb, [co.city, co.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
    ["Representative", i.approved_by_name ?? i.created_by_name], ["Email", co.email], ["Phone", co.phone],
  ]);
  block("Respondent's details", [
    ["Entity", i.customer.name], ["Address", (i.customer.billing_address ?? "").replace(/\r?\n/g, ", ")],
    ["Representative", i.contact?.name ?? i.customer.full_name], ["Email", i.contact?.email ?? i.customer.email],
    ["Phone", localPhone(i.contact?.phone ?? i.customer.phone)],
  ]);
  block("Project details", [
    ["Project", i.project.name],
    ["Address", [i.site.site_name, i.site.address_line, i.site.suburb, i.site.city].filter(Boolean).join(", ")],
    ["Contract reference", i.project.contract_ref], ["Our job number", i.top_job_ref], ["Order number", i.reference],
  ]);
  block("Payment claim", [
    ["Payment claim number", String(i.claim_no ?? "")], ["Tax invoice number", i.invoice_number ?? "Draft"],
    ["Claim date", nzDay(i.invoice_date)],
    ["Claim period", i.period_from || i.period_to ? `${nzDay(i.period_from)} to ${nzDay(i.period_to)}` : null],
    ["Payment due date", nzDay(i.due_date)],
  ]);
  if (i.note) w.para(i.note, { gap: 6 });

  // ── Claimed Contract Summary ─────────────────────────────────────────────────────────────────────────
  w.newPage();
  w.text("Claimed Contract Summary", M, w.y - 4, 13, f.bold);
  w.y -= 22;
  const cols = [M + 215, M + 290, M + 365, M + 440, R];       // right edges
  const heads = ["When Complete", "Previously Approved", "Claimed to Date", "This Period", "Remaining"];
  heads.forEach((h, n) => {
    const ls = w.wrap(h, f.bold, 7.5, 70);
    ls.forEach((t, k) => w.right(t, cols[n], w.y - k * 9, 7.5, f.bold));
  });
  w.y -= 22;
  const row = (label: string, v: (number | null)[], bold = false, shade = false) => {
    w.need(18);
    if (shade) w.page.drawRectangle({ x: M - 4, y: w.y - 5, width: W + 8, height: 15, color: BOX });
    const ls = w.wrap(label, bold ? f.bold : f.reg, 8.5, 205);
    w.text(ls[0], M, w.y, 8.5, bold ? f.bold : f.reg);
    v.forEach((x, n) => { if (x !== null) w.right(money(x), cols[n], w.y, 8.5, bold ? f.bold : f.reg); });
    w.y -= 16;
  };
  row("A  Original Contract Works", [A.value, A.prev, A.to, A.to - A.prev, A.value - A.to]);
  row("B  Approved Variations", [B.value, B.prev, B.to, B.to - B.prev, B.value - B.to]);
  row("C = A + B  Revised Contract Value", [Cv.value, Cv.prev, Cv.to, Cv.to - Cv.prev, Cv.value - Cv.to], true, true);
  row("D  Unapproved Variations", [D.value, D.prev, D.to, D.to - D.prev, D.value - D.to]);
  row("E = C + D", [E.value, E.prev, E.to, E.to - E.prev, E.value - E.to], true, true);
  row("F  Cash Retention Withheld", [null, -Fr.prev, -Fr.to, -(Fr.to - Fr.prev), null]);
  row("G  Retention Released", [null, G.prev, G.to, G.to - G.prev, null]);
  row("H = E - F + G  Amount Due excl GST", [null, H.prev, H.to, Number(i.subtotal), null], true, true);
  row("I  GST", [null, null, null, Number(i.gst), null]);
  row("J  Amount Due incl GST", [null, null, null, Number(i.total), null], true, true);
  if (i.project.retention_bands?.length) {
    w.y -= 4;
    const bands = i.project.retention_bands.map((b, n) =>
      `${b.pct}% ${b.upto === null ? (n === 0 ? "of the contract" : "above that") : `${n === 0 ? "on the first" : "up to"} ${money(b.upto)}`}`).join(", ");
    w.para(`Retentions: ${bands}${i.project.retention_cap ? `, capped at ${money(i.project.retention_cap)}` : ""}. Half is released at practical completion${i.project.practical_completion ? ` (${nzDay(i.project.practical_completion)})` : ""}, the rest at the end of the defects period${i.project.retention_final_date ? ` (${nzDay(i.project.retention_final_date)})` : ""}.`,
           { size: 8, color: GREY, gap: 4 });
  }

  // ── Line items ───────────────────────────────────────────────────────────────────────────────────────
  const items = i.lines.filter((l) => l.kind === "contract" || l.kind === "variation");
  const sections: [string, InvoiceLine[]][] = [
    ["Original contract works", items.filter((l) => l.kind === "contract")],
    ["Approved variations", items.filter((l) => l.kind === "variation" && l.approved_variation)],
    ["Unapproved variations (work done, substantiated by the breakdown attached)", items.filter((l) => l.kind === "variation" && !l.approved_variation)],
  ];
  w.y -= 22;
  w.need(60);
  w.text("Line items", M, w.y, 13, f.bold);
  w.y -= 18;
  const lc = [M + 250, M + 320, M + 400, R];
  const lh = ["Value", "Previously approved", "Claimed to date", "This period"];
  lh.forEach((h, n) => {
    const ls = w.wrap(h, f.bold, 7.5, 55);
    ls.forEach((t, k) => w.right(t, lc[n], w.y - k * 9, 7.5, f.bold));
  });
  w.y -= 20;
  for (const [title, ls] of sections) {
    if (!ls.length) continue;
    w.need(36);
    w.text(title, M, w.y, 9.5, f.bold);
    w.y -= 14;
    for (const l of ls) {
      const name = w.wrap(l.description, f.reg, 8.5, 235);
      w.need(name.length * 11 + 16);
      name.forEach((t, k) => {
        w.text(t, M + 6, w.y - k * 11, 8.5);
      });
      w.right(money(l.contract_value), lc[0], w.y, 8.5);
      w.right(`${pct(l.pct_prev)}  ${money(l.prev_to_date)}`, lc[1], w.y, 8.5);
      w.right(`${pct(l.pct_to_date)}  ${money(l.to_date)}`, lc[2], w.y, 8.5);
      w.right(money(Number(l.to_date) - Number(l.prev_to_date)), lc[3], w.y, 8.5, f.bold);
      w.y -= Math.max(1, name.length) * 11 + 4;
      if (l.note) w.para(l.note, { font: f.ital, size: 8, x: M + 14, color: GREY, gap: 2 });
    }
    w.y -= 6;
  }
  // anything else on the claim (retention lines are in the summary)
  const others = i.lines.filter((l) => !["contract", "variation", "retention"].includes(l.kind));
  if (others.length) {
    w.need(30);
    w.text("Other items", M, w.y, 9.5, f.bold);
    w.y -= 14;
    for (const l of others) {
      w.need(14);
      w.text(clean(f.reg, l.description).slice(0, 90), M + 6, w.y, 8.5);
      w.right(money(lineTotal(l)), lc[3], w.y, 8.5);
      w.y -= 13;
    }
  }
  totals(w, i);
  footerText(w, i);
  if (b) breakdownPages(w, i, b);
  pageNumbers(w, `Payment Claim #${i.claim_no ?? ""}${i.invoice_number ? ` · ${i.invoice_number}` : ""}`);
}

// ── Hours and labour breakdown (charge-out and sell only) ───────────────────────────────────────────────
function breakdownPages(w: Writer, i: Invoice, b: Breakdown) {
  const f = w.f;
  w.newPage();
  w.text("Hours and labour breakdown", M, w.y - 4, 13, f.bold);
  w.y -= 20;
  w.para(`${i.project.name} · ${b.period_from ? `${nzDay(b.period_from)} to ` : "up to "}${nzDay(b.period_to)} · at charge-out rates and sell prices, excl GST`,
         { size: 8.5, color: GREY, gap: 8 });
  // per person
  w.y -= 12;
  w.text("Hours by person", M, w.y, 9.5, f.bold);
  w.y -= 14;
  for (const p of b.people) {
    w.need(14);
    w.text(p.who ?? "", M + 6, w.y, 8.5);
    w.right(`${qty(Number(p.hours))} h`, M + 330, w.y, 8.5);
    w.right(money(p.charge), R, w.y, 8.5);
    w.y -= 13;
  }
  w.need(30);
  w.page.drawLine({ start: { x: M, y: w.y + 6 }, end: { x: R, y: w.y + 6 }, thickness: 0.5, color: RULE });
  w.text("Labour", M + 6, w.y - 4, 8.5, f.bold);
  w.right(`${qty(Number(b.labour_hours))} h`, M + 330, w.y - 4, 8.5, f.bold);
  w.right(money(b.labour_charge), R, w.y - 4, 8.5, f.bold);
  w.y -= 17;
  w.text("Materials and hire at sell", M + 6, w.y, 8.5, f.bold);
  w.right(money(b.materials_sell), R, w.y, 8.5, f.bold);
  w.y -= 22;
  // every line
  w.need(30);
  w.text("Every entry", M, w.y, 9.5, f.bold);
  w.y -= 14;
  const xs = { date: M, who: M + 52, job: M + 150, what: M + 215, q: R - 70, sell: R };
  w.text("Date", xs.date, w.y, 7.5, f.bold);
  w.text("Who / supplier", xs.who, w.y, 7.5, f.bold);
  w.text("Phase", xs.job, w.y, 7.5, f.bold);
  w.text("Description", xs.what, w.y, 7.5, f.bold);
  w.right("Qty", xs.q, w.y, 7.5, f.bold);
  w.right("Charge / sell", xs.sell, w.y, 7.5, f.bold);
  w.y -= 12;
  for (const l of b.lines) {
    const what = w.wrap(l.description, f.reg, 7.5, xs.q - xs.what - 40);
    w.need(what.length * 9.5 + 4);
    w.text(nzDay(l.date), xs.date, w.y, 7.5);
    w.text(clean(f.reg, l.who ?? "").slice(0, 22), xs.who, w.y, 7.5);
    w.text(l.phase_ref ?? l.job_ref, xs.job, w.y, 7.5);
    what.forEach((t, k) => w.text(t, xs.what, w.y - k * 9.5, 7.5));
    w.right(`${qty(Number(l.qty))}${l.unit ? ` ${l.unit}` : ""}`, xs.q, w.y, 7.5);
    w.right(money(l.sell), xs.sell, w.y, 7.5);
    w.y -= what.length * 9.5 + 2.5;
  }
}

/** Builds the invoice or payment claim. For a claim with "include breakdown", pass the breakdown. */
export async function invoicePdf(i: Invoice, opts: { breakdown?: Breakdown | null } = {}): Promise<PDFDocument> {
  const { doc, w } = await start(i);
  if (i.kind === "claim") claimPages(w, i, i.with_breakdown ? opts.breakdown ?? null : null);
  else {
    standardInvoice(w, i);
    if (i.with_breakdown && opts.breakdown) {
      breakdownPages(w, i, opts.breakdown);
      pageNumbers(w, i.invoice_number ?? "Draft invoice");
    }
  }
  return doc;
}

/** Adds the files picked from the job: PDFs page by page, photos (JPEG/PNG) one per page. Others are listed only. */
export async function attachInvoiceFiles(doc: PDFDocument, files: { name: string; type: string | null; bytes: Uint8Array }[]) {
  const skipped: string[] = [];
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const f of files) {
    try {
      const t = (f.type ?? "").toLowerCase();
      if (t === "application/pdf" || /\.pdf$/i.test(f.name)) {
        const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else if (/jpe?g/.test(t) || /\.jpe?g$/i.test(f.name) || /png/.test(t) || /\.png$/i.test(f.name)) {
        const img = /png/.test(t) || /\.png$/i.test(f.name) ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes);
        const page = doc.addPage(A4);
        const maxW = W, maxH = A4[1] - 2 * M - 30;
        const k = Math.min(maxW / img.width, maxH / img.height, 1);
        page.drawText(clean(font, `Attachment: ${f.name}`), { x: M, y: A4[1] - M - 10, size: 9, font });
        page.drawImage(img, { x: M, y: A4[1] - M - 24 - img.height * k, width: img.width * k, height: img.height * k });
      } else skipped.push(f.name);
    } catch {
      skipped.push(f.name);
    }
  }
  return skipped;
}
