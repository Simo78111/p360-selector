"use server";
// Office actions for the automation pages: settings, quotes, orders, bills, timesheets, plumbers off,
// gas certificates. Each checks the owner login, calls the engine and returns with ?ok= or ?err=.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice, type Area } from "@/lib/auth";
import {
  approveTimesheets,
  eghrdDone,
  markPlumberBack,
  markPlumberOff,
  matchBill,
  officePartsCancel,
  officePartsReady,
  orderPlaced,
  saveBranch,
  resendGasCertificate,
  savePlumberGas,
  saveSettings,
  saveSupplierOrdering,
  saveTimesheet,
  sendQuote,
} from "@/lib/automation";
import { validDate } from "@/lib/office";

const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
const safePath = (p: FormDataEntryValue | null, fallback = "/dashboard/office") => {
  const s = String(p ?? "");
  return s.startsWith("/dashboard/office") ? s : fallback;
};
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const num = (form: FormData, k: string) => {
  const v = str(form, k);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k.replaceAll("_", " ")} must be a number`);
  return n;
};

async function run(path: string, work: () => Promise<string>, area: Area = "bookings") {
  let target: string;
  try {
    await assertOffice(area);
    target = back(path, "ok", await work());
  } catch (err) {
    target = back(path, "err", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/dashboard/office", "layout");
  redirect(target);
}

// ---------- settings ----------
export async function saveSettingsAction(form: FormData) {
  await run("/dashboard/office/settings", async () => {
    const p: Record<string, unknown> = {};
    for (const k of ["company_name", "owner_email", "email_mode", "quotes_mode", "google_review_url", "certifier_plumber_id",
                     "certifier_name", "certifier_email", "certifier_reg", "default_supplier_id", "daily_summary_time"]) {
      if (form.has(k)) p[k] = str(form, k);
    }
    for (const k of ["cancel_notice_hours", "reschedule_days_ahead", "callback_warranty_days", "quote_auto_send_max",
                     "quote_valid_days", "review_delay_hours", "timesheet_break_min"]) {
      if (form.has(k)) {
        const n = num(form, k);
        if (n !== null) p[k] = n;
      }
    }
    if (form.has("timesheet_break_after_h")) {
      const h = num(form, "timesheet_break_after_h");
      if (h !== null) p.timesheet_break_after_min = Math.round(h * 60);
    }
    for (const k of ["review_requests", "daily_summary"]) {
      if (form.has(`${k}_present`)) p[k] = form.get(k) === "on";
    }
    await saveSettings(p);
    return "Settings saved.";
  }, "owner");
}

export async function saveSupplierAction(form: FormData) {
  await run("/dashboard/office/settings", async () => {
    const id = str(form, "id");
    await saveSupplierOrdering({
      id,
      order_email: str(form, "order_email") || null,
      account_number: str(form, "account_number") || null,
      branch: str(form, "branch") || null,
      lead_days: num(form, "lead_days") ?? 1,
      auto_order: form.get("auto_order") === "on",
    });
    return `Ordering details saved for ${str(form, "name") || "the supplier"}.`;
  });
}

export async function savePlumberGasAction(form: FormData) {
  await run("/dashboard/office/settings", async () => {
    await savePlumberGas(str(form, "id"), str(form, "gas_reg_number") || null, form.get("certifying") === "on");
    return `Gas details saved for ${str(form, "name")}.`;
  });
}

// ---------- quotes ----------
export async function sendQuoteAction(form: FormData) {
  await run(safePath(form.get("back"), "/dashboard/office/attention"), async () => {
    const id = str(form, "quoteId");
    const count = Number(form.get("count") ?? 0);
    const lines: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      if (form.get(`remove_${i}`) === "on") continue;
      const description = str(form, `desc_${i}`);
      const quantity = num(form, `qty_${i}`) ?? 1;
      const unit = num(form, `price_${i}`);
      const kind = str(form, `kind_${i}`);
      const item = str(form, `item_${i}`);
      if (unit === null) throw new Error(`Put a price on "${description}"`);
      if (kind === "labour") lines.push({ labour: description.startsWith("Gas") ? "gas" : "plumbing", quantity, unit_price: unit });
      else if (item) lines.push({ price_book_item_id: item, description, quantity, unit_price: unit });
      else lines.push({ description, quantity, unit_price: unit, kind: kind || "other" });
    }
    const addDesc = str(form, "add_desc");
    if (addDesc) {
      const p = num(form, "add_price");
      if (p === null) throw new Error(`Put a price on "${addDesc}"`);
      lines.push({ description: addDesc, quantity: num(form, "add_qty") ?? 1, unit_price: p, kind: "other" });
    }
    if (!lines.length) throw new Error("The quote needs at least one line.");
    const r = await sendQuote(id, str(form, "summary") || null, lines);
    return `Quote sent to the customer: $${r.total.toFixed(2)} incl GST. They reply YES to book it.`;
  });
}

// ---------- orders and bills ----------
export async function orderPlacedAction(form: FormData) {
  await run(safePath(form.get("back"), "/dashboard/office/orders"), async () => {
    await orderPlaced(str(form, "poId"));
    return "Marked as placed.";
  });
}

// ---------- same-day couriers ----------
export async function partsReadyOfficeAction(form: FormData) {
  await run("/dashboard/office/orders", async () => {
    await officePartsReady(str(form, "deliveryId"));
    return "Booking the courier now.";
  });
}

export async function partsCancelAction(form: FormData) {
  await run("/dashboard/office/orders", async () => {
    await officePartsCancel(str(form, "deliveryId"));
    return "Courier delivery cancelled.";
  });
}

const tri = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
export async function saveBranchAction(form: FormData) {
  await run("/dashboard/office/orders#branches", async () => {
    await saveBranch(str(form, "branchId"), {
      order_email: str(form, "order_email"),
      urgent_ok: tri(str(form, "urgent_ok")),
      courier_ok: tri(str(form, "courier_ok")),
      pick_minutes: num(form, "pick_minutes") ?? 20,
      active: form.get("active") === "on",
    });
    return `${str(form, "name")} saved.`;
  });
}

export async function matchBillAction(form: FormData) {
  await run("/dashboard/office/orders", async () => {
    const n = num(form, "jobNumber");
    await matchBill(str(form, "billId"), n);
    return n ? `Bill matched to job #${n}.` : "Match removed.";
  });
}

// ---------- timesheets ----------
export async function saveTimesheetAction(form: FormData) {
  const path = safePath(form.get("back"), "/dashboard/office/timesheets");
  await run(path, async () => {
    const start = str(form, "start"), finish = str(form, "finish");
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(finish)) throw new Error("Times look like 07:30 or 16:45.");
    const r = await saveTimesheet(str(form, "id"), start, finish, num(form, "break") ?? 0, str(form, "note") || null);
    return `Saved: ${r.hours} hours.`;
  });
}

export async function approveTimesheetsAction(form: FormData) {
  const path = safePath(form.get("back"), "/dashboard/office/timesheets");
  await run(path, async () => {
    const from = validDate(str(form, "from")), to = validDate(str(form, "to"));
    if (!from || !to) throw new Error("Pick the week first.");
    const n = await approveTimesheets(from, to, str(form, "plumberId") || null);
    return n ? `${n} day${n === 1 ? "" : "s"} approved.` : "Nothing new to approve.";
  });
}

// ---------- plumbers off ----------
export async function plumberOffAction(form: FormData) {
  await run("/dashboard/office/plumbers", async () => {
    const date = validDate(str(form, "date"));
    if (!date) throw new Error("Pick the day.");
    const r = await markPlumberOff(str(form, "plumberId"), date, str(form, "reason") || "sick", str(form, "note") || null);
    const moved = r.moved_today + r.moved_later;
    return `${str(form, "name") || "They"} are off ${date}. ${moved} job${moved === 1 ? "" : "s"} moved (${r.moved_today} to someone else that day, ${r.moved_later} to another day) and the customers texted.${r.office ? ` ${r.office} couldn't be placed — see Needs attention.` : ""}`;
  });
}

export async function plumberBackAction(form: FormData) {
  await run("/dashboard/office/plumbers", async () => {
    await markPlumberBack(str(form, "plumberId"), str(form, "date"));
    return `${str(form, "name")} is back on for ${str(form, "date")}. Moved jobs stay where they are.`;
  });
}

// ---------- gas certificates ----------
export async function resendCertAction(form: FormData) {
  await run("/dashboard/office/certificates", async () => {
    const r = await resendGasCertificate(str(form, "certId"));
    return r.sent ? `Sent to ${r.to} to sign.` : "Couldn't send: set the certifying gasfitter in Settings.";
  });
}

export async function eghrdDoneAction(form: FormData) {
  await run(safePath(form.get("back"), "/dashboard/office/certificates"), async () => {
    await eghrdDone(str(form, "certId"));
    return "Marked as entered on the EGHRD.";
  });
}
