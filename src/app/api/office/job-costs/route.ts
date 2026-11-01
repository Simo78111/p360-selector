// The job's Cost Report as a CSV: /api/office/job-costs?job=<job id>&scope=job|project&ref=PTSL-3000[&from=&to=]
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { costRange, costsCsv, filterCosts, loadJobCosts } from "@/lib/job-costs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "jobs")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const job = req.nextUrl.searchParams.get("job") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(job)) return NextResponse.json({ error: "job needed" }, { status: 400 });
  const scope = req.nextUrl.searchParams.get("scope") === "job" ? "job" : "project";
  const ref = (req.nextUrl.searchParams.get("ref") ?? "job").replace(/[^A-Za-z0-9-]/g, "");
  try {
    const range = costRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
    const c = filterCosts(await loadJobCosts(session, job, scope), range);
    const dates = range ? `-${range.from ?? "start"}-to-${range.to ?? "now"}` : "";
    return new NextResponse(costsCsv(c), {
      headers: { "Content-Type": "text/csv; charset=utf-8",
                 "Content-Disposition": `attachment; filename="${ref}-cost-report${scope === "project" ? "-project" : ""}${dates}.csv"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 403 });
  }
}
