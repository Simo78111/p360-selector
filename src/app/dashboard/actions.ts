"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPasswordAndSignIn, requireOwner, signOut } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";
import { officeEnabled } from "@/lib/office";
import { getSupabase } from "@/lib/supabase";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const ok = await checkPasswordAndSignIn(String(form.get("password") ?? ""));
  if (!ok) return "That password isn't right.";
  // Straight to the day board once the booking engine is connected
  redirect(officeEnabled() ? "/dashboard/office" : "/dashboard");
}

export async function logout() {
  await signOut();
  redirect("/dashboard/login");
}

const statuses = ["new", "pending_payment", "paid", "completed", "cancelled"] as const;

export async function setBookingStatus(reference: string, status: string) {
  await requireOwner();
  if (!statuses.includes(status as (typeof statuses)[number])) return;
  const db = getSupabase();
  if (!db) return;
  await db.from("bookings").update({ status }).eq("reference", reference);
  revalidatePath("/dashboard", "layout");
}

export type TestEmailResult = { ok: boolean; message: string } | null;

export async function testEmail(_prev: TestEmailResult, form: FormData): Promise<TestEmailResult> {
  await requireOwner();
  const to = String(form.get("to") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: "Enter a valid email address." };
  try {
    const sent = await sendTestEmail(to);
    return sent
      ? { ok: true, message: `Sent to ${to}. It should arrive within a minute; check spam if not.` }
      : { ok: false, message: "Email isn't set up: RESEND_API_KEY is missing in Vercel." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
