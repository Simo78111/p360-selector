import "server-only";
// Returning customers: "Booked with us before?" signs them in with a code texted to their mobile
// (or a one-time link the text assistant sends), so the booking form fills in their details and
// saved addresses. The engine keeps the codes and sessions (hashed); we keep the session token in
// an httpOnly cookie for 30 days.
import { cookies } from "next/headers";
import { engine } from "./engine";

export const CUSTOMER_COOKIE = "p360_customer";
const MAX_AGE = 30 * 24 * 60 * 60;

export type SavedNote = { kind: string; label: string; body: string };
export type SavedAddress = { id: string; street: string; suburb: string; postcode: string | null; last_visit: string | null; notes: SavedNote[] };
export type CustomerProfile = {
  first_name: string;
  name: string;
  phone: string;
  email: string | null;
  addresses: SavedAddress[];
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("not_configured");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const signInAvailable = () => engine() !== null;

async function keep(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** The signed-in customer, or null. Never throws (the booking form works without it). */
export async function currentCustomer(): Promise<CustomerProfile | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token || !engine()) return null;
  try {
    return await rpc<CustomerProfile | null>("customer_session", { p_token: token });
  } catch (e) {
    console.error("[customer] session check failed", e);
    return null;
  }
}

export type StartResult = { status: "sent" | "bad_phone" | "wait"; retry_after_s?: number; test_code?: string };
export const startSignIn = (phone: string, ip: string | null) =>
  rpc<StartResult>("customer_login_start", { p_phone: phone, p_ip: ip });

export type VerifyResult =
  | { ok: true; profile: CustomerProfile }
  | { ok: false; reason: "wrong" | "expired" | "too_many"; tries_left?: number };
export async function verifySignIn(phone: string, code: string): Promise<VerifyResult> {
  type Raw = { ok: boolean; token?: string; profile?: CustomerProfile; reason?: "wrong" | "expired" | "too_many"; tries_left?: number };
  const r = await rpc<Raw>("customer_login_verify", { p_phone: phone, p_code: code });
  if (r.ok && r.token && r.profile) {
    await keep(r.token);
    return { ok: true, profile: r.profile };
  }
  return { ok: false, reason: r.reason ?? "wrong", tries_left: r.tries_left };
}

export async function redeemLink(token: string): Promise<{ ok: true; profile: CustomerProfile } | { ok: false; reason: string }> {
  const r = await rpc<{ ok: boolean; token?: string; profile?: CustomerProfile; reason?: string }>("customer_link_redeem", { p_token: token });
  if (r.ok && r.token && r.profile) {
    await keep(r.token);
    return { ok: true, profile: r.profile };
  }
  return { ok: false, reason: r.reason ?? "expired" };
}

export async function signOutCustomer() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  jar.delete(CUSTOMER_COOKIE);
  if (token && engine()) await rpc("customer_session_end", { p_token: token }).catch(() => {});
}
