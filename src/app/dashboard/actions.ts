"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPasswordAndSignIn, requireOwner, signOut } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const ok = await checkPasswordAndSignIn(String(form.get("password") ?? ""));
  if (!ok) return "That password isn't right.";
  redirect("/dashboard");
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
