import "server-only";
// Emailing invoices (Phase 3d). The office's "Email the invoice" and the automatic deposit invoice made when a quote
// with a deposit is accepted. On the test site every email goes to the test inbox, marked [TEST] (lib/email.ts).
import { emailEnabled, sendInvoiceEmail } from "./email";
import { buildInvoicePdf } from "./invoice-files";
import { invoiceAutoSent, invoicesToEmail, invoiceTitle } from "./invoices";
import { nzDay } from "./quote-pdf";
import { sendJobInvoices } from "./xero";

const nzMoney = (n: number) => `$${Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Deposit invoices made by a quote being accepted: email each to the customer's "gets invoices" contacts, and send to
 *  Xero (test site: marked "not sent"). Never throws: problems are written on the job's history. */
export async function sendAutoInvoices(): Promise<number> {
  let sent = 0;
  try {
    const list = await invoicesToEmail();
    for (const item of list) {
      const to = item.recipients.filter((r) => r.email);
      try {
        if (!to.length) throw new Error("the customer has no email address or contact who gets invoices");
        if (!emailEnabled()) throw new Error("email isn't set up (RESEND_API_KEY)");
        const { pdf, name, doc } = await buildInvoicePdf(null, item.id);
        for (const r of to) {
          await sendInvoiceEmail({
            to: r.email, toName: r.name ?? doc.customer.name, companyName: doc.company.name, title: invoiceTitle(doc),
            heading: doc.heading, total: nzMoney(doc.total), dueDate: nzDay(doc.due_date), message: "",
            sender: doc.company.name, replyTo: doc.company.email, pdf: { filename: name, data: pdf },
          });
        }
        await invoiceAutoSent(item.id, to.map((r) => r.email), null);
        sent++;
      } catch (e) {
        await invoiceAutoSent(item.id, [], e instanceof Error ? e.message : String(e));
      }
    }
    await sendJobInvoices();
  } catch (e) {
    console.error("[invoices] automatic invoices", e);
  }
  return sent;
}
