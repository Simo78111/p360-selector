// Publishes approved marketing posts and ads (Facebook, Instagram, Google, Meta ads).
//   POST: header x-ai-secret (the engine's secret) — for a nudge from the engine
//   GET:  Vercel cron backup (Authorization: Bearer CRON_SECRET) — retries anything left half-done
// Approving in the console publishes straight away; this only catches what that missed.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { engine } from "@/lib/engine";
import { publishApproved } from "@/lib/marketing-publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function run() {
  try {
    return NextResponse.json(await publishApproved());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const given = req.headers.get("x-ai-secret") ?? "";
  const db = engine();
  if (!db || !given) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const { data } = await db.rpc("ai_secret_ok", { p_secret: given });
  if (data !== true) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  return run();
}
