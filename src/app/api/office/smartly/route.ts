// The Smartly timesheet import file for a pay week: /api/office/smartly?week=2026-10-28
// Approved days only; marks those days as exported. No header row (Smartly's format), CRLF line ends.
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { smartlyFile } from "@/lib/timesheets";
import { validDate } from "@/lib/office";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "staff")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const week = validDate(req.nextUrl.searchParams.get("week") ?? undefined);
  if (!week) return NextResponse.json({ error: "week (YYYY-MM-DD) needed" }, { status: 400 });
  try {
    const f = await smartlyFile(session, week, true);
    return new NextResponse(f.rows.length ? f.rows.join("\r\n") + "\r\n" : "", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${f.file_name}"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 403 });
  }
}
