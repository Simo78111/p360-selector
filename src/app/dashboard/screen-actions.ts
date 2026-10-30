"use server";
// Settings → Office screen: make / replace / switch off the TV link, targets and the chime.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import { saveScreenSettings, setScreenLink } from "@/lib/screen";

const PAGE = "/dashboard/office/settings";

async function run(work: () => Promise<string>) {
  let target: string;
  try {
    await assertOffice("owner");
    target = `${PAGE}?ok=${encodeURIComponent(await work())}#screen`;
  } catch (err) {
    target = `${PAGE}?err=${encodeURIComponent(err instanceof Error ? err.message : String(err))}#screen`;
  }
  revalidatePath(PAGE);
  redirect(target);
}

export async function screenLinkAction(form: FormData) {
  await run(async () => {
    const on = String(form.get("on") ?? "1") === "1";
    await setScreenLink(on);
    return on ? "New screen link made. Any screen using the old link stops updating." : "Office screen switched off.";
  });
}

export async function screenSettingsAction(form: FormData) {
  await run(async () => {
    const amount = (k: string) => {
      const v = String(form.get(k) ?? "").replace(/[$,\s]/g, "");
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error("Targets are dollar amounts, e.g. 2500");
      return n || null;
    };
    await saveScreenSettings({ target_day: amount("target_day"), target_week: amount("target_week"), chime: form.get("chime") === "on" });
    return "Office screen settings saved.";
  });
}
