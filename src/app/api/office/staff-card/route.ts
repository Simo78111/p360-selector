// A licence or ticket card photo (Phase 5c): office people who can open Settings → Staff get a fresh five-minute link.
// ?id=<licence id>
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { engine } from "@/lib/engine";
import { JOB_FILES_BUCKET } from "@/lib/jobs";
import { licenceCard } from "@/lib/jm";

export const dynamic = "force-dynamic";
const isId = (s: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "staff")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const db = engine();
  if (!db) return NextResponse.json({ error: "Not connected" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!isId(id)) return NextResponse.json({ error: "Which card?" }, { status: 400 });
  try {
    const card = await licenceCard(id as string);
    if (!card?.path) return NextResponse.json({ error: "No card photo on file" }, { status: 404 });
    const { data, error } = await db.storage.from(JOB_FILES_BUCKET).createSignedUrl(card.path, 300);
    if (error || !data) throw new Error(error?.message ?? "missing");
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
