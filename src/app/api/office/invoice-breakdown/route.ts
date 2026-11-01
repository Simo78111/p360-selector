// The hours/labour breakdown behind a claim as a CSV (charge-out and sell only, never cost).
import { NextResponse } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { breakdownCsv, loadBreakdown, loadInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getOfficeSession();
  if (!s || !can(s, "staff")) return new NextResponse("Sign in to the office console first.", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Invoice not found.", { status: 404 });
  try {
    const [i, b] = await Promise.all([loadInvoice(s, id), loadBreakdown(s, id)]);
    const name = `Breakdown ${i.kind === "claim" ? `claim ${i.claim_no} ` : ""}${i.job_ref}.csv`.replace(/[^\w .-]/g, "");
    return new NextResponse(breakdownCsv(b), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return new NextResponse(m, { status: /not found/i.test(m) ? 404 : 500 });
  }
}
