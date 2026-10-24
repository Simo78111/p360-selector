// Daily, early afternoon (vercel.json): real drive times for today and the next
// few days, ready for the engine's 3pm planning. Vercel calls it with
// "Authorization: Bearer <CRON_SECRET>".
import { NextResponse, type NextRequest } from "next/server";
import { fetchDriveTimes } from "@/lib/drive-times";
import { engineEnabled } from "@/lib/engine";
import { aucklandToday, shiftDate } from "@/lib/office";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  if (!engineEnabled()) return NextResponse.json({ skipped: "engine not connected" });

  const today = aucklandToday();
  const results = [];
  for (const offset of [0, 1, 2, 3]) {
    const date = shiftDate(today, offset);
    try {
      results.push(await fetchDriveTimes(date));
    } catch (err) {
      console.error("[drive-times]", date, err);
      results.push({ date, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ results });
}
