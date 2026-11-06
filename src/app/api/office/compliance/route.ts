// Staff compliance schedule download (Simon, 6 Nov): ?staff=<id>,<id>&co=<company id>&for=<customer/site>&job=<ref>
// &kinds=<kind>,<kind>&cards=1&fmt=pdf|docx. Office people who can open Settings → Staff (owner, office manager).
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { buildCompliance } from "@/lib/compliance-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "staff")) {
    return NextResponse.json({ error: "Only the owner and office manager can export staff licences." }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const list = (k: string) => q.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const staffIds = list("staff").filter(isId).slice(0, 100);
  const co = q.get("co") ?? "";
  try {
    const f = await buildCompliance({
      staffIds, companyId: isId(co) ? co : null,
      preparedFor: (q.get("for") ?? "").slice(0, 160) || null, jobRef: (q.get("job") ?? "").slice(0, 40) || null,
      kinds: list("kinds").filter((k) => /^[a-z_]{2,40}$/.test(k)), cards: q.get("cards") === "1",
      format: q.get("fmt") === "docx" ? "docx" : "pdf", preparedBy: session.kind === "staff" ? session.name ?? null : null,
    });
    return new NextResponse(Buffer.from(f.bytes), { headers: {
      "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${f.name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
