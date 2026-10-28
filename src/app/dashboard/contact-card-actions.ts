"use server";
// Settings → Save us in your phone.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { saveContactCardSettings } from "@/lib/contact-card";

const PAGE = "/dashboard/office/settings";

export async function contactCardAction(form: FormData) {
  await requireOwner();
  let target: string;
  try {
    await saveContactCardSettings(String(form.get("text_number") ?? ""), form.get("on") === "on");
    target = `${PAGE}?ok=${encodeURIComponent("Saved.")}#save-contact`;
  } catch (err) {
    target = `${PAGE}?err=${encodeURIComponent(err instanceof Error ? err.message : String(err))}#save-contact`;
  }
  revalidatePath(PAGE);
  redirect(target);
}
