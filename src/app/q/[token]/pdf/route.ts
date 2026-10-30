// The customer's PDF of their quote (from the link). Same document the email attaches.
import { NextResponse } from "next/server";
import { quoteFileName, quotePdf } from "@/lib/quote-pdf";
import { publicQuote } from "@/lib/quotes";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const q = await publicQuote(token, false).catch(() => null);
  if (!q) return new NextResponse("Not found", { status: 404 });
  const origin = new URL(req.url).origin;
  const pdf = await quotePdf(q, { acceptUrl: q.can_accept ? `${origin}/q/${token}` : null });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quoteFileName(q)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
