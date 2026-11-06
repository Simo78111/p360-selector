// A SWMS or JSA as PDF or Word for the office (Phase 5b): ?id=<pack id>&kind=swms|jsa&fmt=pdf|docx. Built fresh from
// the pack, so it shows the latest sign-ons; a pack that isn't approved says DRAFT on every page. The database checks
// the signed-in person can see the job.
import { NextResponse } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { buildHsFile } from "@/lib/hs-files";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getOfficeSession();
  if (!s || !can(s, "jobs")) return new NextResponse("Sign in to the office console first.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const kind = q.get("kind") === "jsa" ? "jsa" : "swms";
  const fmt = q.get("fmt") === "docx" ? "docx" : "pdf";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found.", { status: 404 });
  try {
    const f = await buildHsFile(s, id, kind, fmt);
    return new NextResponse(Buffer.from(f.bytes), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${fmt === "pdf" && q.get("dl") !== "1" ? "inline" : "attachment"}; filename="${f.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return new NextResponse(m, { status: /not found|no finished draft/i.test(m) ? 404 : 500 });
  }
}
