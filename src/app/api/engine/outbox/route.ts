// Sends the emails the booking engine has queued (supplier orders, gas certificates, the daily summary).
//   POST: the engine's nudge when an email is queued (header x-ai-secret, a secret only the engine holds)
//   GET:  Vercel's daily backup run (Authorization: Bearer CRON_SECRET)
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { engine } from "@/lib/engine";
import { emailEnabled, sendEngineEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

type Queued = { id: string; to: string; to_name: string | null; subject: string; text: string; html: string | null; reply_to: string | null;
                list_unsubscribe: string | null };

async function run() {
  const db = engine();
  if (!db) return NextResponse.json({ skipped: "engine not connected" });
  if (!emailEnabled()) return NextResponse.json({ skipped: "RESEND_API_KEY not set" });
  let sent = 0, failed = 0;
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc("outbox_claim", { p_limit: 20 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as Queued[];
    if (!batch.length) break;
    for (const e of batch) {
      try {
        await sendEngineEmail(e);
        await db.rpc("outbox_done", { p_id: e.id, p_ok: true });
        sent++;
      } catch (err) {
        failed++;
        await db.rpc("outbox_done", { p_id: e.id, p_ok: false, p_error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return NextResponse.json({ sent, failed });
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
