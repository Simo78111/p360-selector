// Sends waiting invoices to Xero and brings payments back.
//   POST: the booking engine's 5-minute nudge (header x-sync-secret, a secret only the engine holds)
//   GET:  Vercel's daily backup run (Authorization: Bearer CRON_SECRET)
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { engine } from "@/lib/engine";
import { runXeroSync, xeroConfigured } from "@/lib/xero";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function run() {
  if (!xeroConfigured()) return NextResponse.json({ skipped: "Xero keys not set" });
  try {
    return NextResponse.json(await runXeroSync());
  } catch (err) {
    console.error("[xero] sync failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const given = req.headers.get("x-sync-secret") ?? "";
  const db = engine();
  if (!db || !given) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const { data } = await db.rpc("xero_sync_secret");
  if (typeof data !== "string" || !same(given, data)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  return run();
}
