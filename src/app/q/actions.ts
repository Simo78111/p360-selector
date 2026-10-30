"use server";
// The customer's Accept button on /q/<token>. The token in the link is the key (no sign-in); the database checks the
// quote is the current published version, not expired, and still open.
import { redirect } from "next/navigation";
import { publicAccept } from "@/lib/quotes";

export async function publicAcceptAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[0-9a-f]{40,80}$/.test(token)) redirect("/");
  const path = `/q/${token}`;
  let target: string;
  try {
    const r = await publicAccept(token, String(form.get("name") ?? "").slice(0, 120), String(form.get("order") ?? "").slice(0, 60) || null,
      form.get("terms") === "on");
    target = `${path}?accepted=${r.already ? "already" : "1"}`;
  } catch (e) {
    target = `${path}?err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(target);
}
