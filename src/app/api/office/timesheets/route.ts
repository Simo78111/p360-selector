// Timesheets as CSV for payroll: /api/office/timesheets?from=2026-11-02&to=2026-11-08 (owner login only)
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/auth";
import { timesheetRows } from "@/lib/automation";
import { validDate } from "@/lib/office";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const from = validDate(req.nextUrl.searchParams.get("from") ?? undefined);
  const to = validDate(req.nextUrl.searchParams.get("to") ?? undefined);
  if (!from || !to) return NextResponse.json({ error: "from and to (YYYY-MM-DD) needed" }, { status: 400 });
  const rows = await timesheetRows(from, to);
  const head = ["Plumber", "Email", "Date", "Start", "Finish", "Unpaid break (min)", "Paid hours", "Jobs", "Status", "Note"];
  const csv = [head, ...rows.map((r) => [r.plumber, r.email, r.date, r.start, r.finish, r.break_min, r.hours, r.jobs, r.status, r.note])]
    .map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timesheets-${from}-to-${to}.csv"` },
  });
}
