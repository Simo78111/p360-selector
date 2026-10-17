import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { trackedEvents } from "@/lib/track";

const eventSchema = z.object({
  name: z.enum(trackedEvents),
  session: z.string().min(1).max(64),
  path: z.string().max(200).default(""),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).default({}),
});

const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse/i;

export async function POST(req: NextRequest) {
  if (BOTS.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) return new NextResponse(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const db = getSupabase();
  if (db) {
    const { name, session, path, props } = parsed.data;
    const { error } = await db.from("events").insert({ name, session_id: session, path, props });
    if (error) console.error("[events] insert failed", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
