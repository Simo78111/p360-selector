// "Connect Xero" in the office console: off to Xero to sign in and pick an organisation.
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { can, getOfficeSession } from "@/lib/auth";
import { authorizeUrl, callbackUrl, xeroConfigured } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOfficeSession();
  if (!session || !can(session, "owner")) return NextResponse.redirect(new URL("/dashboard/login", req.url));
  if (!xeroConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/office/xero?err=Add+XERO_CLIENT_ID+and+XERO_CLIENT_SECRET+in+Vercel+first.", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(callbackUrl(req.nextUrl.origin), state));
  res.cookies.set("xero_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/xero",
    maxAge: 600,
  });
  return res;
}
