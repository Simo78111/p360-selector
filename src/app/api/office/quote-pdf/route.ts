// The quote PDF for the office: a draft shows "DRAFT"; a published version has the Accept button when the person
// may send quotes (it carries the customer's link).
import { NextResponse } from "next/server";
import { getOfficeSession, can } from "@/lib/auth";
import { quoteLink } from "@/app/dashboard/quote-actions";
import { quoteFileName, quotePdf } from "@/lib/quote-pdf";
import { loadQuote, quoteSendInfo, type QuoteDoc } from "@/lib/quotes";

export async function GET(req: Request) {
  const s = await getOfficeSession();
  if (!s || !can(s, "jobs")) return new NextResponse("Sign in to the office console first.", { status: 401 });
  const v = new URL(req.url).searchParams.get("v") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(v)) return new NextResponse("Quote not found.", { status: 404 });
  try {
    const q = await loadQuote(s, v);
    let doc: QuoteDoc = q;
    let acceptUrl: string | null = null;
    if (q.status === "published" && q.can.send) {
      const info = await quoteSendInfo(s, v);
      doc = info.doc;                       // the customer's copy (no costs)
      acceptUrl = await quoteLink(info.token);
    }
    const pdf = await quotePdf(doc, { acceptUrl, draft: q.status === "draft" });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quoteFileName(q)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return new NextResponse(m, { status: /not found/i.test(m) ? 404 : 500 });
  }
}
