// Xero sends the owner back here after they've signed in and picked an organisation.
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/auth";
import { completeConnection } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (key: "ok" | "err", msg: string) => {
    const res = NextResponse.redirect(new URL(`/dashboard/office/xero?${key}=${encodeURIComponent(msg)}`, req.url));
    res.cookies.delete({ name: "xero_state", path: "/api/xero" });
    return res;
  };
  if (!(await isOwner())) return NextResponse.redirect(new URL("/dashboard/login", req.url));

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("err", `Xero said: ${q.get("error_description") ?? q.get("error")}`);
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state || state !== req.cookies.get("xero_state")?.value) {
    return back("err", "That sign-in link had expired. Click Connect Xero again.");
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  try {
    const { tenant, others } = await completeConnection(code, `${origin}/api/xero/callback`, origin);
    return back(
      "ok",
      `Connected to ${tenant.tenantName}.${others.length ? " You can switch organisation below." : ""} Choose the sales account, then switch sending on.`,
    );
  } catch (err) {
    console.error("[xero] connect failed", err);
    return back("err", err instanceof Error ? err.message : String(err));
  }
}
