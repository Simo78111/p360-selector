import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Owner login for the dashboard: one password, set as DASHBOARD_PASSWORD.
// The session cookie is signed with the password itself, so changing the
// password signs everyone out.
const COOKIE = "p360_owner";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const password = () => process.env.DASHBOARD_PASSWORD ?? "";

/** No password set and running locally: let the owner in to preview. */
export const devBypass = () => !password() && process.env.NODE_ENV !== "production";

const sign = (exp: number) => createHmac("sha256", password()).update(`owner:${exp}`).digest("base64url");

const sameText = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export async function isOwner() {
  if (devBypass()) return true;
  if (!password()) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [expText, sig] = value.split(".");
  const exp = Number(expText);
  return Number.isFinite(exp) && exp > Date.now() / 1000 && Boolean(sig) && sameText(sig, sign(exp));
}

export async function requireOwner() {
  if (!(await isOwner())) redirect("/dashboard/login");
}

export async function checkPasswordAndSignIn(attempt: string) {
  if (!password() || !sameText(attempt, password())) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return false;
  }
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

export const passwordConfigured = () => Boolean(password());
