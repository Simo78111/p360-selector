// Phase 3e: a report as a CSV. /api/office/reports?r=sales|profit|work-on-hand|unbilled&from=&to=&co=&days=
// Same checks as the report pages (the database decides what this person can see).
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import {
  loadJobProfit, loadSales, loadUnbilled, loadWorkOnHand, profitCsv, resolveRange, salesCsv, unbilledCsv, workCsv,
  type ReportCompany,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "staff")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const report = q.get("r");
  const code = q.get("co") ?? "";
  const pick = (cs: ReportCompany[]) => cs.find((c) => c.code === code)?.id ?? null;
  const r = resolveRange(q.get("from") && q.get("to") ? "custom" : undefined, q.get("from") ?? undefined, q.get("to") ?? undefined);
  const tag = code ? `-${code.replace(/[^A-Za-z0-9]/g, "")}` : "";
  try {
    let body: string;
    let name: string;
    switch (report) {
      case "sales": {
        let rep = await loadSales(session, r.from, r.to, null);
        if (pick(rep.companies)) rep = await loadSales(session, r.from, r.to, pick(rep.companies));
        body = salesCsv(rep); name = `sales${tag}-${r.from}-to-${r.to}`;
        break;
      }
      case "profit": {
        let rep = await loadJobProfit(session, r.from, r.to, null);
        if (pick(rep.companies)) rep = await loadJobProfit(session, r.from, r.to, pick(rep.companies));
        body = profitCsv(rep); name = `job-profitability${tag}-${r.from}-to-${r.to}`;
        break;
      }
      case "work-on-hand": {
        let rep = await loadWorkOnHand(session, null);
        if (pick(rep.companies)) rep = await loadWorkOnHand(session, pick(rep.companies));
        body = workCsv(rep); name = `work-on-hand${tag}-${r.to}`;
        break;
      }
      case "unbilled": {
        const days = [0, 7, 14, 30].includes(Number(q.get("days"))) ? Number(q.get("days")) : 0;
        let rep = await loadUnbilled(session, null, days);
        if (pick(rep.companies)) rep = await loadUnbilled(session, pick(rep.companies), days);
        body = unbilledCsv(rep); name = `unbilled-work${tag}-${r.to}`;
        break;
      }
      default:
        return NextResponse.json({ error: "Which report?" }, { status: 400 });
    }
    return new NextResponse(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 403 });
  }
}
