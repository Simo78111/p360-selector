// An invoice or payment claim as a PDF for the office (owner/admin, office manager). A draft says DRAFT. Always the
// customer's copy: no costs. Files picked from the job are added as extra pages.
import { NextResponse } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { buildInvoicePdf } from "@/lib/invoice-files";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getOfficeSession();
  if (!s || !can(s, "staff")) return new NextResponse("Sign in to the office console first.", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Invoice not found.", { status: 404 });
  try {
    const { pdf, name } = await buildInvoicePdf(s, id);
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return new NextResponse(m, { status: /not found/i.test(m) ? 404 : 500 });
  }
}
