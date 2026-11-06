// Copies of licence and ticket cards at the back of the staff compliance schedule PDF: photos two to a landscape page
// with a caption, PDF scans as their own pages (first 4 pages), anything else (HEIC, unreadable) listed as held on file.
// No server-only imports: tested by scripts/test-hs-docs.ts.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type CardFile = { caption: string; ext: string; bytes: Uint8Array | null };

/** Plain text Helvetica can draw (macrons and the like simplified). */
const plain = (t: string) => t.replace(/[–—]/g, "-").replace(/→/g, ">").replace(/[✓✔]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function appendCards(pdf: Uint8Array, items: CardFile[], footer: string): Promise<Uint8Array> {
  if (!items.length) return pdf;
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.16), grey = rgb(0.42, 0.45, 0.5);
  const [PW, PH] = [841.89, 595.28];
  const skipped: string[] = [];
  let page: ReturnType<typeof doc.addPage> | null = null;
  let slot = 0;
  const newPage = () => {
    const pg = doc.addPage([PW, PH]);
    pg.drawText("Copies of licences and tickets", { x: 36, y: PH - 40, size: 12, font: bold, color: ink });
    pg.drawText(plain(footer), { x: 36, y: PH - 56, size: 8, font, color: grey });
    return pg;
  };
  for (const it of items) {
    try {
      if (!it.bytes) throw new Error("unreadable");
      if (it.ext === "pdf") {
        const src = await PDFDocument.load(it.bytes, { ignoreEncryption: true });
        for (const pg of await doc.copyPages(src, src.getPageIndices().slice(0, 4))) {
          doc.addPage(pg);
          pg.drawText(plain(it.caption), { x: 24, y: 14, size: 8, font: bold, color: ink });
        }
        page = null;
        continue;
      }
      const img = it.ext === "png" ? await doc.embedPng(it.bytes)
        : ["jpg", "jpeg"].includes(it.ext) ? await doc.embedJpg(it.bytes) : null;
      if (!img) {
        skipped.push(`${it.caption} (${(it.ext || "unknown").toUpperCase()} photo – open it from Settings → Staff)`);
        continue;
      }
      if (!page || slot === 2) {
        page = newPage();
        slot = 0;
      }
      const boxW = (PW - 72 - 24) / 2, boxH = PH - 76 - 40;
      const scale = Math.min(boxW / img.width, boxH / img.height, 1);
      const [w, h] = [img.width * scale, img.height * scale];
      const x0 = 36 + slot * (boxW + 24);
      const top = PH - 76;   // photos sit under the page title, the caption right under the photo
      page.drawImage(img, { x: x0 + (boxW - w) / 2, y: top - h, width: w, height: h });
      page.drawText(plain(it.caption), { x: x0, y: top - h - 14, size: 8.5, font: bold, color: ink, maxWidth: boxW });
      slot++;
    } catch {
      skipped.push(`${it.caption} (couldn't be read)`);
    }
  }
  if (skipped.length) {
    const pg = newPage();
    pg.drawText("Not attached here (held on file):", { x: 36, y: PH - 84, size: 9, font: bold, color: ink });
    skipped.slice(0, 30).forEach((t, i) => pg.drawText(plain(`- ${t}`), { x: 36, y: PH - 100 - i * 13, size: 8.5, font, color: ink }));
  }
  return doc.save();
}
