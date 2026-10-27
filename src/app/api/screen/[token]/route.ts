// The office screen refreshes from here every 30 seconds. The secret link is the only key; a wrong or
// retired link gets 404, which the screen shows as "link no longer works".
import { NextResponse } from "next/server";
import { loadScreen } from "@/lib/screen";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const data = await loadScreen(token);
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
