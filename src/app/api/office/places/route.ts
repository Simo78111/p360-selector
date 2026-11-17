// Google address search for the office console. ?q=<what's typed>&s=<session> → suggestions;
// ?id=<place id>&s=<session> → the address split into our site fields. Office sign-in needed.
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { placeAddress, suggestPlaces } from "@/lib/places";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !(can(session, "customers") || can(session, "jobs"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const p = req.nextUrl.searchParams;
  const token = (p.get("s") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  try {
    const id = p.get("id");
    if (id) return NextResponse.json({ address: await placeAddress(id, token) });
    return NextResponse.json({ suggestions: await suggestPlaces(p.get("q") ?? "", token) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
