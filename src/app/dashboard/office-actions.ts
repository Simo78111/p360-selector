"use server";
// Office console actions. Each one checks the owner login, calls the engine,
// then returns to the page with a message (?ok= or ?err=) to show.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice, type Area } from "@/lib/auth";
import { fetchDriveTimes } from "@/lib/drive-times";
import { geocode, geocodeAddress, toE164 } from "@/lib/engine";
import {
  bookCallback,
  bookNow,
  bulkCancel,
  bulkMove,
  cancelJob,
  disconnectXero,
  moveJob,
  planDay,
  queueXeroInvoice,
  resolveItem,
  returnVisit,
  saveXeroSettings,
  updateJob,
  type BulkResult,
  type JobChanges,
  addProfileNote,
  confirmProfileNote,
  forgetProfile,
  removeProfileNote,
  NOTE_KINDS,
  replyToText,
  savePlumber,
  setAiReplies,
  simulateText,
  setAppLogin,
  setPlumberHome,
  setRouteFromHome,
  type PlumberChanges,
  validDate,
} from "@/lib/office";
import { chooseTenant, runXeroSync } from "@/lib/xero";

const back = (path: string, key: "ok" | "err", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

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

const time = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : undefined;
};

/** "$95", "95.50" → number; blank → null. */
const rate = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`"${String(v)}" isn't an hourly rate`);
  return n;
};

/** Add a plumber (no id) or save changes to one. */
export async function savePlumberAction(form: FormData) {
  const id = String(form.get("plumberId") ?? "") || null;
  const text = (k: string, max = 120) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = text("name");
  const phone = text("phone", 30);
  const email = text("email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const home = text("home", 200);
  await run("/dashboard/office/plumbers", async () => {
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`"${email}" doesn't look like an email address.`);
    if (password && password.length < 8) throw new Error("The app password needs at least 8 characters.");
    if (password && !email) throw new Error("Add an email address to make an app login.");
    // find the home first, so a typo doesn't leave a half-made plumber
    const where = home ? await geocodeAddress(`${home}, New Zealand`) : null;
    if (home && !where) throw new Error(`Couldn't find "${home}" on the map. Include the street number and suburb.`);

    const changes: PlumberChanges = {
      full_name: name,
      phone: phone ? toE164(phone) : "",
      email: email || null,
      pgdb_licence_no: text("licence", 40) || null,
      shift_start: time(form.get("shiftStart")),
      shift_end: time(form.get("shiftEnd")),
      is_gasfitter: form.get("gasfitter") === "on",
      rate_plumbing: rate(form.get("ratePlumbing")),
      rate_gas: rate(form.get("rateGas")),
    };
    const saved = await savePlumber(id, changes);
    const done = [saved.created ? `${name} added.` : `${name} saved.`];
    if (where) await setPlumberHome(saved.plumber_id, home, where.lat, where.lng);
    else if (id && form.has("home")) await setPlumberHome(saved.plumber_id, null, null, null);
    if (password) {
      const login = await setAppLogin(email, password);
      done.push(
        login === "created"
          ? `App login made: they sign in to the plumber app with ${email} and the password you set.`
          : `App password changed for ${email}.`,
      );
    }
    return done.join(" ");
  });
}

export async function plumberActiveAction(form: FormData) {
  const id = String(form.get("plumberId") ?? "");
  const on = form.get("active") === "true";
  const name = String(form.get("name") ?? "Plumber");
  await run("/dashboard/office/plumbers", async () => {
    await savePlumber(id, { active: on });
    return on ? `${name} is active again and can be given jobs.` : `${name} is now inactive and won't be given jobs.`;
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
  }, "owner");
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
  }, "owner");
}

export async function xeroSendInvoiceAction(form: FormData) {
  const id = String(form.get("invoiceId") ?? "");
  await run(XERO_PAGE, async () => {
    await queueXeroInvoice(id);
    const r = await runXeroSync({ push: true, poll: false });
    if (r.failed.length) throw new Error(`Couldn't send: ${r.failed.map((f) => f.error).join("; ")}`);
    return `Sent ${r.sent.join(", ")} to Xero.`;
  }, "owner");
}

export async function xeroChooseTenantAction(form: FormData) {
  const tenantId = String(form.get("tenantId") ?? "");
  await run(XERO_PAGE, async () => {
    const t = await chooseTenant(tenantId);
    return `Now using ${t.tenantName}.`;
  }, "owner");
}

export async function xeroDisconnectAction() {
  await run(XERO_PAGE, async () => {
    await disconnectXero();
    return "Disconnected. Invoices aren't sent to Xero until you connect again.";
  }, "owner");
}

// ── Jobs: bulk actions, editing, return visits, callbacks ────────────────

const summarise = (r: BulkResult, verb: string) => {
  const ok = r.filter((x) => x.ok);
  const bad = r.filter((x) => !x.ok);
  const parts = [];
  if (ok.length) {
    parts.push(
      `${verb} ${ok.length} job${ok.length === 1 ? "" : "s"}` +
        (ok.some((x) => x.start_local) ? `: ${ok.map((x) => `#${x.job_number} ${x.start_local ?? ""}`.trim()).join(", ")}.` : "."),
    );
  }
  if (bad.length) parts.push(`Couldn't do ${bad.map((x) => `#${x.job_number} (${x.error})`).join("; ")}.`);
  if (!ok.length) throw new Error(parts.join(" ") || "No jobs were selected.");
  return parts.join(" ");
};

const jobsBack = (form: FormData) => {
  const b = String(form.get("back") ?? "");
  return b.startsWith("/dashboard/office/jobs") ? b : "/dashboard/office/jobs";
};

export async function bulkMoveAction(form: FormData) {
  const ids = form.getAll("jobIds").map(String).filter(Boolean);
  const date = validDate(String(form.get("date") ?? ""));
  const plumber = String(form.get("plumberId") ?? "");
  await run(jobsBack(form), async () => {
    if (!ids.length) throw new Error("Tick the jobs to move first.");
    if (!date) throw new Error("Pick a day to move them to.");
    return summarise(await bulkMove(ids, plumber || null, date), "Moved") + " Customers have been texted.";
  });
}

export async function bulkCancelAction(form: FormData) {
  const ids = form.getAll("jobIds").map(String).filter(Boolean);
  const notify = form.get("notify") === "on";
  const reason = String(form.get("reason") ?? "").slice(0, 300);
  await run(jobsBack(form), async () => {
    if (!ids.length) throw new Error("Tick the jobs to cancel first.");
    return summarise(await bulkCancel(ids, reason, notify), "Cancelled") + (notify ? " Customers have been texted." : "");
  });
}

export async function updateJobAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const back = safePath(form.get("back"));
  const text = (k: string) => String(form.get(k) ?? "").trim();
  await run(back, async () => {
    const changes: JobChanges = {
      full_name: text("full_name"),
      email: text("email"),
      description: text("description"),
      access_notes: text("access_notes"),
      office_notes: text("office_notes"),
    };
    if (text("phone")) changes.phone = toE164(text("phone"));
    const minutes = Number(text("duration_min"));
    if (minutes) changes.duration_min = minutes;
    if (text("service_code")) changes.service_code = text("service_code");
    // A new address has to be found on the map first
    const street = text("address_line");
    if (street && form.get("address_changed") === "1") {
      const where = await geocode(street, text("suburb"), text("postcode"));
      if (!where) throw new Error("Couldn't find that address on the map. Check the street number, suburb and postcode.");
      Object.assign(changes, { address_line: street, suburb: text("suburb"), postcode: text("postcode"), lat: where.lat, lng: where.lng });
    }
    const r = await updateJob(jobId, changes);
    return r.changed.length ? `Saved: ${r.changed.join(", ")}.` : "Nothing had changed.";
  });
}

export async function returnVisitAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const plumberId = String(form.get("plumberId") ?? "");
  const date = validDate(String(form.get("date") ?? ""));
  await run(safePath(form.get("back")), async () => {
    if (!plumberId || !date) throw new Error("Pick a plumber and a day.");
    const r = await returnVisit(jobId, plumberId, date);
    return `Return visit booked: ${r.plumber ?? ""}, ${r.start_local ?? "same day"}. The customer has been texted.`;
  });
}

export async function bookCallbackAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  const plumberId = String(form.get("plumberId") ?? "");
  const date = validDate(String(form.get("date") ?? ""));
  await run(safePath(form.get("back")), async () => {
    const r = await bookCallback(jobId, reason, plumberId && date ? plumberId : null, plumberId && date ? date : null);
    const when = r.start_local ? ` for ${r.start_local}` : r.reason === "no_room" ? ", but there's no room yet: book it by hand" : "";
    return `Callback job #${r.job_number} booked${when}, no charge. The customer has been texted.`;
  });
}

// ── Customer texts ───────────────────────────────────────────────────────

export async function replyTextAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const text = String(form.get("text") ?? "").trim();
  await run("/dashboard/office/attention", async () => {
    await replyToText(id, text);
    return "Reply sent.";
  });
}

export async function aiRepliesAction(form: FormData) {
  const mode = String(form.get("mode") ?? "");
  await run("/dashboard/office/attention", async () => {
    await setAiReplies(mode);
    return {
      auto: "The assistant now answers routine texts itself and passes the rest to you.",
      suggest: "The assistant now only suggests replies; you send them.",
      off: "The assistant is off. Every text comes to you.",
    }[mode] ?? "Saved.";
  });
}

export async function simulateTextAction(form: FormData) {
  const jobId = String(form.get("jobId") ?? "");
  const back = safePath(form.get("back"));
  const body = String(form.get("body") ?? "").trim().slice(0, 500);
  await run(back, async () => {
    const r = await simulateText(jobId, body);
    return r.action === "needs_attention"
      ? "Text received. The assistant is answering it now: refresh in about 10 seconds, or see Needs attention."
      : `Text received (${r.action.replaceAll("_", " ")}).`;
  });
}

// ── Customer and property profile ────────────────────────────────────────

export async function addNoteAction(form: FormData) {
  const back = safePath(form.get("back"));
  const kind = String(form.get("kind") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 300);
  await run(back, async () => {
    if (!(kind in NOTE_KINDS)) throw new Error("Pick what kind of note it is.");
    await addProfileNote(String(form.get("jobId") ?? ""), kind, body);
    return "Note saved.";
  });
}

export async function confirmNoteAction(form: FormData) {
  const back = safePath(form.get("back"));
  await run(back, async () => {
    await confirmProfileNote(String(form.get("noteId") ?? ""));
    return "Marked as still right.";
  });
}

export async function removeNoteAction(form: FormData) {
  const back = safePath(form.get("back"));
  await run(back, async () => {
    await removeProfileNote(String(form.get("noteId") ?? ""));
    return "Note removed.";
  });
}

export async function forgetProfileAction(form: FormData) {
  const back = safePath(form.get("back"));
  await run(back, async () => {
    if (form.get("sure") !== "on") throw new Error("Tick the box to confirm.");
    const n = await forgetProfile(String(form.get("jobId") ?? ""));
    return `Done: ${n} note${n === 1 ? "" : "s"} about this customer and their property wiped.`;
  });
}
