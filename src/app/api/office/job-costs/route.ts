// The job's Cost Report as a CSV: /api/office/job-costs?job=<job id>&scope=job|project&ref=PTSL-3000
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { costsCsv, loadJobCosts } from "@/lib/job-costs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "jobs")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const job = req.nextUrl.searchParams.get("job") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(job)) return NextResponse.json({ error: "job needed" }, { status: 400 });
  const scope = req.nextUrl.searchParams.get("scope") === "job" ? "job" : "project";
  const ref = (req.nextUrl.searchParams.get("ref") ?? "job").replace(/[^A-Za-z0-9-]/g, "");
  try {
    const c = await loadJobCosts(session, job, scope);
    return new NextResponse(costsCsv(c), {
      headers: { "Content-Type": "text/csv; charset=utf-8",
                 "Content-Disposition": `attachment; filename="${ref}-cost-report${scope === "project" ? "-project" : ""}.csv"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 403 });
  }
}
