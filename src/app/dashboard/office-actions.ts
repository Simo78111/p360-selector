"use server";
// Office console actions. Each one checks the owner login, calls the engine,
// then returns to the page with a message (?ok= or ?err=) to show.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { fetchDriveTimes } from "@/lib/drive-times";
import { geocodeAddress } from "@/lib/engine";
import {
  bookNow,
  cancelJob,
  disconnectXero,
  moveJob,
  planDay,
  queueXeroInvoice,
  resolveItem,
  saveXeroSettings,
  setPlumberHome,
  setRouteFromHome,
  validDate,
} from "@/lib/office";
import { chooseTenant, runXeroSync } from "@/lib/xero";

const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

async function run(path: string, work: () => Promise<string>) {
  await requireOwner();
  let target: string;
  try {
    target = back(path, "ok", await work());
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

const safePath = (p: FormDataEntryValue | null) => {
  const s = String(p ?? "");
  return s.startsWith("/dashboard/office") ? s : "/dashboard/office";
};

export async function moveJobAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const plumberId = String(form.get("plumberId") ?? "");
  const date = validDate(String(form.get("date") ?? ""));
  await run(safePath(form.get("back")), async () => {
    if (!jobId || !plumberId || !date) throw new Error("Pick a plumber and a day.");
    const r = await moveJob(jobId, plumberId, date);
    if (!r.moved) return "It's already booked there.";
    return r.exact
      ? `Moved to ${r.plumber}, ${r.start_local}. The customer has been texted the time.`
      : `Moved to ${r.plumber}, ${r.start_local}. The customer has been texted the day and window; they get the exact time the afternoon before.`;
  });
}

export async function cancelJobAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const notify = form.get("notify") === "on";
  const reason = String(form.get("reason") ?? "").slice(0, 300);
  await run(safePath(form.get("back")), async () => {
    await cancelJob(jobId, reason, notify);
    return notify ? "Cancelled. The customer has been texted." : "Cancelled. The customer wasn't texted.";
  });
}

export async function bookNowAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  await run(safePath(form.get("back")), async () => {
    const r = await bookNow(jobId);
    if (r.scheduled)
      return r.exact
        ? `Booked for ${r.start_local}. The customer has been texted the time.`
        : `Booked for ${r.start_local}. The customer has been texted the day and window.`;
    if (r.reason === "no_room") throw new Error("No room in the next two weeks. Move it to a plumber by hand, or call the customer.");
    throw new Error("That job isn't waiting for a time any more.");
  });
}

export async function resolveAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const note = String(form.get("note") ?? "").slice(0, 500);
  const approve = form.get("decision") !== "reject";
  await run(safePath(form.get("back")), async () => {
    await resolveItem(id, note, approve);
    return "Done. It's off the list.";
  });
}

export async function planRouteAction(form: FormData) {
  const date = validDate(String(form.get("date") ?? ""));
  await run(safePath(form.get("back")), async () => {
    if (!date) throw new Error("Pick a day.");
    let lookup = "";
    try {
      const d = await fetchDriveTimes(date);
      lookup = d.saved ? ` Looked up ${d.saved} drive time${d.saved === 1 ? "" : "s"} from Google.` : "";
    } catch (err) {
      lookup = ` Couldn't get Google drive times (${err instanceof Error ? err.message : String(err)}), so estimates were used.`;
    }
    const r = await planDay(date);
    if (r.status === "already_planned") throw new Error("That day is already planned and customers have their times.");
    const parts = (r.plumbers ?? [])
      .filter((p) => p.stops)
      .map((p) => `${p.plumber}: ${p.travel_before} → ${p.travel} min driving`);
    return `Route worked out (no texts sent).${lookup} ${parts.join("; ")}.`;
  });
}

export async function setHomeAction(form: FormData) {
  const id = String(form.get("plumberId") ?? "");
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  await run("/dashboard/office/plumbers", async () => {
    if (!address) {
      await setPlumberHome(id, null, null, null);
      return "Home address removed.";
    }
    const where = await geocodeAddress(`${address}, New Zealand`);
    if (!where) throw new Error(`Couldn't find "${address}" on the map. Include the street number and suburb.`);
    await setPlumberHome(id, address, where.lat, where.lng);
    return `Home saved: ${address}.`;
  });
}

export async function homeRoutingAction(form: FormData) {
  const on = form.get("on") === "true";
  await run("/dashboard/office/plumbers", async () => {
    await setRouteFromHome(on);
    return on
      ? "Routes now include the drive from and back to each plumber's home."
      : "Routes no longer include the drive from home.";
  });
}

// ── Xero ─────────────────────────────────────────────────────────────────

const XERO_PAGE = "/dashboard/office/xero";

export async function xeroSettingsAction(form: FormData) {
  const enabled = form.get("enabled") === "on";
  const account = String(form.get("account") ?? "").trim();
  const [trackingName, trackingOption] = String(form.get("tracking") ?? "").split("|");
  await run(XERO_PAGE, async () => {
    await saveXeroSettings(enabled, account, trackingName || null, trackingOption || null);
    return enabled
      ? "Saved. New invoices now go to Xero, and customers get a link to view and pay."
      : "Saved. Invoices aren't being sent to Xero.";
  });
}

export async function xeroSyncNowAction() {
  await run(XERO_PAGE, async () => {
    const r = await runXeroSync({ push: true, poll: true });
    const parts = [
      r.sent.length ? `Sent ${r.sent.join(", ")}.` : r.failed.length ? "" : "Nothing waiting to send.",
      r.failed.length ? `Couldn't send ${r.failed.map((f) => `${f.invoice} (${f.error})`).join("; ")}.` : "",
      `Checked ${r.checked} unpaid invoice${r.checked === 1 ? "" : "s"} for payments${r.paid ? `; ${r.paid} newly paid` : ""}.`,
    ];
    if (r.failed.length && !r.sent.length) throw new Error(parts.filter(Boolean).join(" "));
    return parts.filter(Boolean).join(" ");
  });
}

export async function xeroSendInvoiceAction(form: FormData) {
  const id = String(form.get("invoiceId") ?? "");
  await run(XERO_PAGE, async () => {
    await queueXeroInvoice(id);
    const r = await runXeroSync({ push: true, poll: false });
    if (r.failed.length) throw new Error(`Couldn't send: ${r.failed.map((f) => f.error).join("; ")}`);
    return `Sent ${r.sent.join(", ")} to Xero.`;
  });
}

export async function xeroChooseTenantAction(form: FormData) {
  const tenantId = String(form.get("tenantId") ?? "");
  await run(XERO_PAGE, async () => {
    const t = await chooseTenant(tenantId);
    return `Now using ${t.tenantName}.`;
  });
}

export async function xeroDisconnectAction() {
  await run(XERO_PAGE, async () => {
    await disconnectXero();
    return "Disconnected. Invoices aren't sent to Xero until you connect again.";
  });
}
