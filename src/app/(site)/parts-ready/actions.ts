"use server";
// The supplier's trade counter presses "Ready for pickup" (or "Can't supply") from the link in the urgent
// order email. The token in the link is the only key; the engine checks it and books the courier.
import { redirect } from "next/navigation";
import { partsReady } from "@/lib/automation";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

async function answer(form: FormData, ok: boolean) {
  const token = s(form, "token");
  if (!/^[a-f0-9]{64}$/.test(token)) redirect("/");
  let msg: string;
  try {
    const r = await partsReady(token, ok, s(form, "note").slice(0, 500) || null);
    msg = r.ok ? `ok=${ok ? "ready" : "cant"}` : `err=${encodeURIComponent(r.reason === "already" ? "Already answered — thanks." : "Link not found.")}`;
  } catch (e) {
    msg = `err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(`/parts-ready/${token}?${msg}`);
}

export async function readyAction(form: FormData) {
  await answer(form, true);
}
export async function cantSupplyAction(form: FormData) {
  await answer(form, false);
}
