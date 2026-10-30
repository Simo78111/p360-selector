// A job's file or plumber-app photo: checks the signed-in person may see that job, then sends them to a
// fresh five-minute link. ?id=<file id> (add &dl=1 to download) or ?photo=<plumber-app photo id>.
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { engine } from "@/lib/engine";
import { APP_PHOTOS_BUCKET, JOB_FILES_BUCKET, appPhotoPath, fileAction } from "@/lib/jobs";

export const dynamic = "force-dynamic";
const isId = (s: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "jobs")) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const db = engine();
  if (!db) return NextResponse.json({ error: "Not connected" }, { status: 503 });
  const fileId = req.nextUrl.searchParams.get("id");
  const photoId = req.nextUrl.searchParams.get("photo");
  try {
    if (isId(fileId)) {
      const f = await fileAction(session, fileId as string, "get");
      const download = req.nextUrl.searchParams.get("dl") === "1";
      const { data, error } = await db.storage.from(JOB_FILES_BUCKET)
        .createSignedUrl(f.path, 300, download ? { download: f.file_name } : undefined);
      if (error || !data) throw new Error(error?.message ?? "missing");
      return NextResponse.redirect(data.signedUrl);
    }
    if (isId(photoId)) {
      const path = await appPhotoPath(session, photoId as string);
      const { data, error } = await db.storage.from(APP_PHOTOS_BUCKET).createSignedUrl(path, 300);
      if (error || !data) throw new Error(error?.message ?? "missing");
      return NextResponse.redirect(data.signedUrl);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
  return NextResponse.json({ error: "Which file?" }, { status: 400 });
}
