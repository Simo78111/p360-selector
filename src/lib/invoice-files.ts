import "server-only";
// The finished invoice PDF: the customer's copy (no costs), the hours breakdown on claims that include it, and the
// files picked from the job added as extra pages. Used by the office download and by every email.
import type { OfficeSession } from "./auth";
import { engine } from "./engine";
import { attachInvoiceFiles, invoicePdf } from "./invoice-pdf";
import { customerCopy, invoiceDoc, invoiceFileName, loadBreakdown, loadInvoice, type Invoice } from "./invoices";
import { JOB_FILES_BUCKET } from "./jobs";

export async function buildInvoicePdf(s: OfficeSession | null, id: string): Promise<{ pdf: Uint8Array; name: string; doc: Invoice; skipped: string[] }> {
  const full = s ? await loadInvoice(s, id) : await invoiceDoc(id);
  if (!full) throw new Error("Invoice not found.");
  const doc = customerCopy(full);
  const breakdown = doc.with_breakdown && s ? await loadBreakdown(s, id) : null;
  const pdf = await invoicePdf(doc, { breakdown });
  let skipped: string[] = [];
  if (doc.attachments.length) {
    const db = engine();
    const files: { name: string; type: string | null; bytes: Uint8Array }[] = [];
    for (const a of doc.attachments) {
      const r = db ? await db.storage.from(JOB_FILES_BUCKET).download(a.path) : null;
      if (r && !r.error && r.data) files.push({ name: a.file_name, type: a.mime_type, bytes: new Uint8Array(await r.data.arrayBuffer()) });
      else skipped.push(a.file_name);
    }
    skipped = skipped.concat(await attachInvoiceFiles(pdf, files));
  }
  return { pdf: await pdf.save(), name: invoiceFileName(doc), doc, skipped };
}
