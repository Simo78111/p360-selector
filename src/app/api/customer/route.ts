// "Booked with us before?": text a code, check it, or sign out.
import { NextResponse, type NextRequest } from "next/server";
import { signInAvailable, signOutCustomer, startSignIn, verifySignIn } from "@/lib/customer";

export async function POST(req: NextRequest) {
  if (!signInAvailable()) return NextResponse.json({ error: "Signing in isn't available right now." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; phone?: string; code?: string };
  const phone = String(body.phone ?? "").slice(0, 30);
  try {
    if (body.action === "start") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      return NextResponse.json(await startSignIn(phone, ip));
    }
    if (body.action === "verify") {
      const code = String(body.code ?? "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) return NextResponse.json({ ok: false, reason: "wrong" });
      // slow down guessing
      const r = await verifySignIn(phone, code);
      if (!r.ok) await new Promise((res) => setTimeout(res, 600));
      return NextResponse.json(r);
    }
    if (body.action === "signout") {
      await signOutCustomer();
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error("[customer]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
