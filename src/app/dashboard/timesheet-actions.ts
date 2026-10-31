"use server";
// Job management Phase 3a: office actions for timesheets, leave, pay rates and allowances. Each checks the person is
// signed in as owner/admin or office manager; the database then checks "Can approve timesheets" for the person whose
// timesheet it is (lib/timesheets.ts). They redirect back with a message, like the other office forms.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import {
  approveDays, decideLeave, findTsJobs, removeTsLine, reopenDay, saveAllowance, saveLeave, savePayRule, saveStaffPay, saveTsLine,
} from "@/lib/timesheets";

const PAGE = "/dashboard/office/timesheets";
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const back = (form: FormData, fallback = PAGE) => {
  const s = text(form, "back", 300);
  return s.startsWith("/dashboard/office") ? s : fallback;
};
const withMsg = (path: string, kind: "ok" | "err", msg: string) => {
  const u = new URL(path, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("err");
  u.searchParams.set(kind, msg);
  return `${u.pathname}?${u.searchParams.toString()}${u.hash}`;
};

async function run(form: FormData, fn: () => Promise<string>, fallback = PAGE) {
  let target = back(form, fallback);
  try {
    target = withMsg(target, "ok", await fn());
  } catch (e) {
    target = withMsg(target, "err", e instanceof Error ? e.message : String(e));
  }
  revalidatePath(PAGE);
  redirect(target);
}

/** "PTSL-3000a" or "123": the job (and phase) it means, among jobs this person can see. */
async function resolveJob(s: Awaited<ReturnType<typeof assertOffice>>, ref: string) {
  const q = ref.trim().replace(/^#/, "");
  if (q.length < 2) throw new Error("Type the job or phase number, e.g. PTSL-3000a or 123.");
  const list = await findTsJobs(s, q);
  const lower = q.toLowerCase();
  const exact = list.find((j) => j.label.toLowerCase().startsWith(`${lower} `) || j.label.toLowerCase().startsWith(`#${lower} `));
  const hit = exact ?? (list.length === 1 ? list[0] : null);
  if (!hit) throw new Error(list.length ? `"${ref}" matches several jobs. Type the full phase number, e.g. PTSL-3000a.` : `No job "${ref}".`);
  return hit;
}

export async function saveLineAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const plumber = text(form, "plumberId", 40);
    const date = text(form, "date", 10);
    if (!isId(plumber) || !isDate(date)) throw new Error("Pick the person and the day.");
    const line: Record<string, unknown> = {};
    const id = text(form, "id", 40);
    if (id) {
      if (!isId(id)) throw new Error("That line isn't on this day.");
      line.id = id;
    }
    const kind = text(form, "kind", 10);
    if (kind) line.kind = kind;
    for (const k of ["start", "finish", "break_min", "note"]) if (form.has(k)) line[k] = text(form, k, 300);
    const rate = text(form, "rate", 60);       // "rule:<id>" or "1" / "2" / "3"
    if (rate.startsWith("rule:")) line.pay_rule_id = rate.slice(5);
    else if (["1", "2", "3"].includes(rate)) { line.pay_rate = Number(rate); line.pay_rule_id = ""; }
    const ref = text(form, "job_ref", 40);
    if (ref && kind !== "other") {
      const j = await resolveJob(s, ref);
      line.job_id = j.job_id;
      line.phase_id = j.phase_id ?? "";
    }
    if (!id && !ref && kind !== "other") throw new Error("Type the job or phase number for this time.");
    const day = await saveTsLine(s, plumber, date, line);
    return `Saved ${day.day_label}: ${day.hours} h.`;
  });
}

export async function removeLineAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("That line isn't there any more.");
    const day = await removeTsLine(s, id);
    return `Line removed. ${day.day_label} is now ${day.hours} h.`;
  });
}

export async function approveAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const from = text(form, "from", 10), to = text(form, "to", 10);
    if (!isDate(from) || !isDate(to)) throw new Error("Pick the days to approve.");
    const plumber = text(form, "plumberId", 40);
    const r = await approveDays(s, from, to, isId(plumber) ? plumber : null);
    const msg = [`${r.approved} day${r.approved === 1 ? "" : "s"} approved.`];
    for (const k of r.skipped) msg.push(`Not ${k.name} ${k.date}: ${k.why}.`);
    return msg.join(" ");
  });
}

export async function reopenAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Timesheet not found.");
    const d = await reopenDay(s, id);
    return `${d.day_label} reopened. Approve it again when it's right.`;
  });
}

export async function saveLeaveAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const staff = text(form, "staffId", 40);
    if (!isId(staff)) throw new Error("Pick the person.");
    const from = text(form, "date_from", 10);
    const r = await saveLeave(s, {
      staff_id: staff, code: text(form, "code", 3), date_from: from, date_to: text(form, "date_to", 10) || from,
      hours_per_day: text(form, "hours_per_day", 5) || "8", note: text(form, "note", 300),
    });
    return `${r.type} for ${r.staff} (${r.dates_label}, ${r.hours} h) entered and approved.`;
  });
}

async function decide(form: FormData, approve: boolean) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Leave not found.");
    const r = await decideLeave(s, id, approve, approve ? null : text(form, "reason", 300) || null);
    return approve ? `${r.type} approved for ${r.staff} (${r.dates_label}). They're marked off in the diary.`
                   : `${r.type} for ${r.staff} declined.`;
  });
}
// One action per button: a shared action reading the clicked button's value declined everything on the preview.
export async function approveLeaveAction(form: FormData) { await decide(form, true); }
export async function declineLeaveAction(form: FormData) { await decide(form, false); }

export async function savePayRuleAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    await savePayRule(s, {
      id: text(form, "id", 40), name: text(form, "name", 80), pay_rate: text(form, "pay_rate", 1), applies: text(form, "applies", 10),
      night_from: text(form, "night_from", 5), night_to: text(form, "night_to", 5), sort: text(form, "sort", 3),
      active: form.get("active") === "on",
    });
    return `Pay rate "${text(form, "name", 80)}" saved.`;
  }, `${PAGE}/settings`);
}

export async function saveAllowanceAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    await saveAllowance(s, {
      id: text(form, "id", 40), name: text(form, "name", 80), smartly_ref: text(form, "smartly_ref", 4), per: text(form, "per", 5),
      active: form.get("active") === "on",
    });
    return `Allowance "${text(form, "name", 80)}" saved.`;
  }, `${PAGE}/settings`);
}

export async function saveStaffPayAction(form: FormData) {
  let target = "/dashboard/office/staff";
  try {
    await assertOffice("owner");
    const id = text(form, "staffId", 40);
    if (!isId(id)) throw new Error("Staff member not found.");
    const money = (k: string) => text(form, k, 20).replace(/[$,\s]/g, "");
    await saveStaffPay(id, {
      pay_rate: money("pay_rate"), cost_rate: money("cost_rate"), charge_out_rate: money("charge_out_rate"),
      order_initials: text(form, "order_initials", 4), tool_allowance: text(form, "tool_allowance", 8) || "default",
    });
    target = withMsg(target, "ok", `Pay and rates saved for ${text(form, "name", 120) || "them"}.`);
  } catch (e) {
    target = withMsg(target, "err", e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/dashboard/office/staff");
  redirect(target);
}
