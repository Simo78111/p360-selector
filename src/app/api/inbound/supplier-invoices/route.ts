// Supplier invoice emails → the Supplier invoices screen (Phase 3b).
// An inbound-email service (e.g. Postmark Inbound, or a forwarding rule that posts the email here) sends each email as
// JSON with its attachments. Every .csv attachment from Reece or Chesters is read and brought in; invoices already in
// are skipped. Needs SUPPLIER_INBOUND_SECRET, passed as ?key=… or the x-inbound-key header.
// Accepts Postmark's shape ({ From, Attachments: [{ Name, Content (base64) }] }) or { from, attachments: [{ filename, content }] }.
import { NextResponse, type NextRequest } from "next/server";
import { parseSupplierCsv } from "@/lib/supplier-csv";
import { importDocs } from "@/lib/supplier-docs";

export const dynamic = "force-dynamic";

type Att = { Name?: string; filename?: string; Content?: string; content?: string };

export async function POST(req: NextRequest) {
  const secret = process.env.SUPPLIER_INBOUND_SECRET;
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-inbound-key");
  if (!secret || key !== secret) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  let body: { From?: string; from?: string; Attachments?: Att[]; attachments?: Att[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const atts = (body.Attachments ?? body.attachments ?? []).filter((a) => /\.csv$/i.test(a.Name ?? a.filename ?? ""));
  const results: { file: string; supplier?: string; new?: number; seen?: number; problems?: number; error?: string }[] = [];
  for (const a of atts) {
    const file = a.Name ?? a.filename ?? "attachment.csv";
    try {
      const text = Buffer.from(a.Content ?? a.content ?? "", "base64").toString("utf8");
      const parsed = parseSupplierCsv(text);
      const r = await importDocs(null, "email", file, parsed.supplier, parsed.docs);
      results.push({ file, supplier: r.supplier, new: r.new, seen: r.seen, problems: r.problems.length + parsed.problems.length });
    } catch (e) {
      results.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Always 200 so the email service doesn't keep retrying a file we can't read; the result says what happened.
  return NextResponse.json({ from: body.From ?? body.from ?? null, files: results });
}
