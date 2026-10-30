import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { engine } from "./engine";
import { publicEngine } from "./public-db";

// Office console sign-in.
//
// Staff sign in with their own email and password (the same Supabase login the plumber app uses). What they
// can open depends on their role in each company (Office → Staff):
//   owner/admin     everything
//   office manager  jobs, customers, pricing; the booking screens if they're in Plumbing 360; can see the
//                   staff list but not change staff, pay rates or system settings
//   supervisor      jobs (notes, files, tasks) and customers for their companies
//   tradesperson / apprentice   the plumber app only, not the office console
//
// The old single owner password (DASHBOARD_PASSWORD) still works as a backup way in, with owner access.
//
// Sessions are a signed cookie holding the staff id; the person's roles are looked up on every request, so a
// role change or deactivation takes effect straight away.

export type Role = "owner_admin" | "office_manager" | "supervisor" | "tradesperson" | "apprentice";
export type SessionCompany = { id: string; code: string; name: string; role: Role };
export type OfficeSession = {
  kind: "staff" | "owner_password" | "dev";
  staffId: string | null;
  name: string;
  email: string | null;
  companies: SessionCompany[];
};

/** Parts of the office console. */
export type Area =
  | "jobs"       // jobs list, job pages, notes/files/tasks (any office role)
  | "customers"  // customers (any office role; editing needs owner/admin or office manager in that company)
  | "pricing"    // price books, pricing tiers (owner/admin, office manager)
  | "bookings"   // the booking engine's screens: Today, Needs attention, Jobs board, Plumbers, Timesheets,
                 // Orders, Gas certs, Marketing, website figures (owner/admin, office manager in Plumbing 360)
  | "staff"      // see the staff list (owner/admin, office manager)
  | "owner";     // change staff, companies, settings, Xero, Fergus import, status (owner/admin)

const OWNER_COOKIE = "p360_owner";
const STAFF_COOKIE = "p360_staff";
const OWNER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const STAFF_MAX_AGE = 60 * 60 * 24 * 14; // 14 days
export const P360_ID = "c0000000-0000-4000-8000-000000000001";
const OFFICE_ROLES: Role[] = ["owner_admin", "office_manager", "supervisor"];

const password = () => process.env.DASHBOARD_PASSWORD ?? "";

/** No owner password set and running locally: let the owner in to preview. */
export const devBypass = () => !password() && process.env.NODE_ENV !== "production";
export const passwordConfigured = () => Boolean(password());

const sameText = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

// ── Owner backup password ──────────────────────────────────────────────────
// Signed with the password itself, so changing the password signs everyone out.
const signOwner = (exp: number) => createHmac("sha256", password()).update(`owner:${exp}`).digest("base64url");

async function ownerCookieValid() {
  if (!password()) return false;
  const value = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!value) return false;
  const [expText, sig] = value.split(".");
  const exp = Number(expText);
  return Number.isFinite(exp) && exp > Date.now() / 1000 && Boolean(sig) && sameText(sig, signOwner(exp));
}

export async function checkPasswordAndSignIn(attempt: string) {
  if (!password() || !sameText(attempt, password())) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return false;
  }
  const exp = Math.floor(Date.now() / 1000) + OWNER_MAX_AGE;
  (await cookies()).set(OWNER_COOKIE, `${exp}.${signOwner(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_MAX_AGE,
  });
  return true;
}

// ── Staff logins ───────────────────────────────────────────────────────────
function staffSecret() {
  const base = process.env.OFFICE_SESSION_SECRET || process.env.ENGINE_SUPABASE_SERVICE_ROLE_KEY || "";
  return base ? createHmac("sha256", base).update("p360-office-session-v1").digest() : null;
}
const signStaff = (secret: Buffer, staffId: string, exp: number) =>
  createHmac("sha256", secret).update(`staff:${staffId}:${exp}`).digest("base64url");

async function staffIdFromCookie(): Promise<string | null> {
  const secret = staffSecret();
  const value = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!secret || !value) return null;
  const [staffId, expText, sig] = value.split(".");
  const exp = Number(expText);
  if (!/^[0-9a-f-]{36}$/.test(staffId ?? "") || !Number.isFinite(exp) || exp <= Date.now() / 1000 || !sig) return null;
  return sameText(sig, signStaff(secret, staffId, exp)) ? staffId : null;
}

type StaffSessionRow = { staff_id: string; name: string; email: string | null; companies: SessionCompany[] } | null;

async function loadStaff(args: { p_staff_id?: string; p_auth_user_id?: string }): Promise<StaffSessionRow> {
  const db = engine();
  if (!db) return null;
  const { data, error } = await db.rpc("office_staff_session", { p_staff_id: null, p_auth_user_id: null, ...args });
  if (error) throw new Error(error.message);
  return data as StaffSessionRow;
}

const officeCompanies = (row: NonNullable<StaffSessionRow>) => row.companies.filter((c) => OFFICE_ROLES.includes(c.role));

export const staffLoginAvailable = () => Boolean(staffSecret() && publicEngine() && engine());

/** Email + password sign-in. Returns an error message, or null when signed in. */
export async function staffSignIn(email: string, pass: string): Promise<string | null> {
  const pub = publicEngine();
  const secret = staffSecret();
  if (!pub || !secret || !engine()) return "Staff sign-in isn't set up on this site yet. Use the owner password.";
  const auth = createClient(pub.url, pub.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
  if (error || !data.user) {
    await new Promise((r) => setTimeout(r, 1000));
    return "That email and password don't match.";
  }
  const row = await loadStaff({ p_auth_user_id: data.user.id });
  if (!row) return "This login isn't set up for staff. Ask the office to add you.";
  if (officeCompanies(row).length === 0) return "Your role uses the plumber app, not the office console.";
  const exp = Math.floor(Date.now() / 1000) + STAFF_MAX_AGE;
  (await cookies()).set(STAFF_COOKIE, `${row.staff_id}.${exp}.${signStaff(secret, row.staff_id, exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_MAX_AGE,
  });
  return null;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
  jar.delete(STAFF_COOKIE);
}

// ── The current session ────────────────────────────────────────────────────
/** Who is signed in to the office console (once per request). */
export const getOfficeSession = cache(async (): Promise<OfficeSession | null> => {
  const staffId = await staffIdFromCookie();
  if (staffId) {
    const row = await loadStaff({ p_staff_id: staffId }).catch(() => null);
    if (row && officeCompanies(row).length > 0) {
      return { kind: "staff", staffId: row.staff_id, name: row.name, email: row.email, companies: officeCompanies(row) };
    }
  }
  if (await ownerCookieValid()) return { kind: "owner_password", staffId: null, name: "Owner (backup password)", email: null, companies: [] };
  if (devBypass()) return { kind: "dev", staffId: null, name: "Owner (local preview)", email: null, companies: [] };
  return null;
});

/** Full access: the owner password, or an owner/admin. */
const superuser = (s: OfficeSession) => s.kind !== "staff";

export function roleIn(s: OfficeSession, companyId: string): Role | null {
  if (superuser(s)) return "owner_admin";
  return s.companies.find((c) => c.id === companyId)?.role ?? null;
}

/** May this person open this part of the console (optionally: for this company)? */
export function can(s: OfficeSession, area: Area, companyId?: string): boolean {
  if (superuser(s)) return true;
  const roles = companyId ? s.companies.filter((c) => c.id === companyId).map((c) => c.role) : s.companies.map((c) => c.role);
  switch (area) {
    case "jobs":
    case "customers":
      return roles.some((r) => OFFICE_ROLES.includes(r));
    case "pricing":
    case "staff":
      return roles.some((r) => r === "owner_admin" || r === "office_manager");
    case "bookings":
      return s.companies.some((c) => c.id === P360_ID && (c.role === "owner_admin" || c.role === "office_manager"));
    case "owner":
      return roles.includes("owner_admin");
  }
}

/** Customers and sites: change them only as owner/admin or office manager of that company. */
export const canEditCompany = (s: OfficeSession, companyId: string) => {
  const r = roleIn(s, companyId);
  return r === "owner_admin" || r === "office_manager";
};

/** The page someone lands on after signing in. */
export function homeFor(s: OfficeSession) {
  return can(s, "bookings") ? "/dashboard/office" : "/dashboard/office/all-jobs";
}

/** Pages: signed in (and allowed into this area), or off to the login / their home page. */
export async function requireOffice(area?: Area): Promise<OfficeSession> {
  const s = await getOfficeSession();
  if (!s) redirect("/dashboard/login");
  if (area && !can(s, area)) redirect(`${homeFor(s)}?err=${encodeURIComponent("Your role can't open that page.")}`);
  return s;
}

/** Server actions and API routes: throws instead of redirecting. */
export async function assertOffice(area: Area, companyId?: string): Promise<OfficeSession> {
  const s = await getOfficeSession();
  if (!s) throw new Error("You're signed out. Sign in again.");
  if (!can(s, area, companyId)) throw new Error("Your role can't do that.");
  return s;
}

export const isSignedIn = async () => (await getOfficeSession()) !== null;

export const ROLE_NAMES: Record<Role, string> = {
  owner_admin: "Owner / admin",
  office_manager: "Office / manager",
  supervisor: "Supervisor",
  tradesperson: "Tradesperson",
  apprentice: "Apprentice",
};
