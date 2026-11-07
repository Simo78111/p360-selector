// A tool's photo (tool register): anyone signed in to the office console gets a fresh five-minute link. ?id=<asset id>
import { NextResponse, type NextRequest } from "next/server";
import { getOfficeSession } from "@/lib/auth";
import { loadAsset } from "@/lib/assets";
import { engine } from "@/lib/engine";
import { JOB_FILES_BUCKET } from "@/lib/jobs";

export const dynamic = "force-dynamic";
const isId = (s: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const db = engine();
  if (!db) return NextResponse.json({ error: "Not connected" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!isId(id)) return NextResponse.json({ error: "Which tool?" }, { status: 400 });
  try {
    const a = await loadAsset(session, id as string);
    if (!a?.photo_path) return NextResponse.json({ error: "No photo" }, { status: 404 });
    const { data, error } = await db.storage.from(JOB_FILES_BUCKET).createSignedUrl(a.photo_path, 300);
    if (error || !data) throw new Error(error?.message ?? "missing");
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
