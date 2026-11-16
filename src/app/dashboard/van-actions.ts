"use server";
// Van tracking actions (17 Nov). The engine checks the role (vans: owner/admin and office manager; the Traccar
// connection: owner/admin) and comes back with ?ok= or ?err=.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import { saveTracking, saveVan } from "@/lib/vans";

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

async function run(path: string, work: () => Promise<string | { go: string; message: string }>) {
  let target: string;
  try {
    await assertOffice("jobs");
    const r = await work();
    target = typeof r === "string" ? back(path, "ok", r) : back(r.go, "ok", r.message);
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office/vans", "layout");
  redirect(target);
}

export async function saveVanAction(form: FormData) {
  const id = text(form, "vanId", 40);
  const path = isId(id) ? `/dashboard/office/vans/${id}?edit=1` : "/dashboard/office/vans/new";
  await run(path, async () => {
    const s = await assertOffice("jobs");
    const r = await saveVan(s, isId(id) ? id : null, {
      company_id: text(form, "company_id", 40),
      name: text(form, "name", 60),
      rego: text(form, "rego", 12),
      device_id: text(form, "device_id", 20),
      driver_staff_id: text(form, "driver_staff_id", 40),
      active: form.get("active") === "on" || !isId(id) ? "true" : "false",
      notes: text(form, "notes", 1000),
    });
    return { go: `/dashboard/office/vans/${r.id}`, message: r.message };
  });
}

export async function saveTrackingAction(form: FormData) {
  await run("/dashboard/office/vans?setup=1", async () => {
    const s = await assertOffice("jobs");
    const r = await saveTracking(s, {
      traccar_url: text(form, "traccar_url", 200),
      enabled: form.get("enabled") === "on" ? "true" : "false",
    });
    return { go: "/dashboard/office/vans", message: r.message };
  });
}
