"use server";
// Job management Phase 3b: the Supplier invoices screen. One server action per form (a second action on a button ran
// the wrong one in Phase 3a). Each checks the person is signed in as owner/admin or office manager; the database checks
// which company's invoices they can touch.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOffice } from "@/lib/auth";
import { parseSupplierCsv } from "@/lib/supplier-csv";
import { approveDoc, approveMatched, docStatus, importDocs, saveCompanyMoney, setDoc, setDocLine } from "@/lib/supplier-docs";
import { findTsJobs } from "@/lib/timesheets";
import { sendSupplierBills } from "@/lib/xero";

const PAGE = "/dashboard/office/supplier-invoices";
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
const withMsg = (path: string, kind: "ok" | "err", msg: string) => {
  const u = new URL(path, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("err");
  u.searchParams.set(kind, msg);
  return `${u.pathname}?${u.searchParams.toString()}${u.hash}`;
};
async function run(form: FormData, fn: () => Promise<string>, fallback = PAGE) {
  const b = text(form, "back", 300);
  let target = b.startsWith("/dashboard/office") ? b : fallback;
  try {
    target = withMsg(target, "ok", await fn());
  } catch (e) {
    target = withMsg(target, "err", e instanceof Error ? e.message : String(e));
  }
  revalidatePath(PAGE);
  revalidatePath("/dashboard", "layout"); // the red count on "Supplier invoices" in the top bar
  redirect(target);
}

/** After approving: bills switched on for Xero go now (on the test site they're marked "not sent"). */
async function pushBills() {
  try {
    const r = await sendSupplierBills();
    if (r.failed.length) return ` Xero refused ${r.failed.map((f) => `${f.number} (${f.error})`).join(", ")}.`;
    if (r.sent) return ` ${r.sent} sent to Xero.`;
    return "";
  } catch (e) {
    return ` Not sent to Xero yet: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** "PTSL-3000a" or "123" → the job and phase, among jobs this person can see. */
async function resolveJob(s: Awaited<ReturnType<typeof assertOffice>>, ref: string) {
  const q = ref.trim().replace(/^#/, "");
  if (q.length < 1) throw new Error("Type the job or phase number, e.g. PTSL-3000a or 123.");
  const list = await findTsJobs(s, q.length < 2 ? `${q} ` : q);
  const lower = q.toLowerCase();
  const exact = list.find((j) => j.label.toLowerCase().startsWith(`${lower} `) || j.label.toLowerCase().startsWith(`#${lower} `));
  const hit = exact ?? (list.length === 1 ? list[0] : null);
  if (!hit) throw new Error(list.length ? `"${ref}" matches several jobs. Type the full phase number, e.g. PTSL-3000a.` : `No job "${ref}".`);
  return hit;
}

export async function uploadSupplierCsvAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("Choose the CSV file(s) from Reece or Chesters.");
    const msgs: string[] = [];
    for (const f of files) {
      if (f.size > 5_000_000) throw new Error(`${f.name} is bigger than 5 MB.`);
      const parsed = parseSupplierCsv(await f.text());
      const r = await importDocs(s, "upload", f.name, parsed.supplier, parsed.docs);
      msgs.push(`${f.name}: ${r.new} new ${r.supplier} invoice${r.new === 1 ? "" : "s"}${r.seen ? `, ${r.seen} already in` : ""}` +
                `${r.problems.length + parsed.problems.length ? ` (${r.problems.length + parsed.problems.length} to check below)` : ""}.`);
    }
    return msgs.join(" ");
  });
}

export async function setDocJobAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Supplier invoice not found.");
    const ref = text(form, "job_ref", 40);
    const note = form.has("note") ? text(form, "note", 500) : undefined;
    const changes: Record<string, unknown> = {};
    if (ref) {
      const j = await resolveJob(s, ref);
      changes.job_id = j.job_id;
      changes.phase_id = j.phase_id ?? "";
    }
    if (note !== undefined) changes.note = note;
    if (!Object.keys(changes).length) throw new Error("Type the job or phase number.");
    const d = await setDoc(s, id, changes);
    return `${d.supplier} ${d.number} → ${d.job_label ?? "no job"}.`;
  });
}

export async function overheadDocAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Supplier invoice not found.");
    const company = text(form, "company_id", 40);
    const d = await setDoc(s, id, { overhead: true, ...(isId(company) ? { company_id: company } : {}) });
    return `${d.supplier} ${d.number} marked overhead (${d.company}). Approve it when you're ready.`;
  });
}

export async function setLineJobAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "line_id", 40);
    if (!isId(id)) throw new Error("Line not found.");
    const ref = text(form, "job_ref", 40);
    if (!ref) {
      await setDocLine(s, id, null, null);
      return "Line back on the invoice's job.";
    }
    const j = await resolveJob(s, ref);
    const d = await setDocLine(s, id, j.job_id, j.phase_id);
    return `Line moved to ${j.label} (invoice ${d.number}).`;
  });
}

export async function approveDocAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Supplier invoice not found.");
    const d = await approveDoc(s, id);
    return `${d.supplier} ${d.number} approved: $${d.subtotal.toFixed(2)} on ${d.job_label ?? "overhead"}.${await pushBills()}`;
  });
}

export async function approveMatchedAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const r = await approveMatched(s);
    const fail = r.failed.map((f) => `${f.number}: ${f.why}`).join("; ");
    return `${r.approved} invoice${r.approved === 1 ? "" : "s"} approved.${fail ? ` Not approved: ${fail}.` : ""}${await pushBills()}`;
  });
}

export async function notOursDocAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Supplier invoice not found.");
    const d = await docStatus(s, id, "not_ours", text(form, "note", 300) || null);
    return `${d.supplier} ${d.number} put under "Not ours".`;
  });
}

export async function reopenDocAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("staff");
    const id = text(form, "id", 40);
    if (!isId(id)) throw new Error("Supplier invoice not found.");
    const d = await docStatus(s, id, "to_approve", null);
    return `${d.supplier} ${d.number} is back in To approve.`;
  });
}

export async function retryXeroAction(form: FormData) {
  await run(form, async () => {
    await assertOffice("staff");
    const r = await pushBills();
    return r.trim() || "Nothing waiting for Xero.";
  });
}

export async function saveCompanyMoneyAction(form: FormData) {
  await run(form, async () => {
    const s = await assertOffice("owner");
    const id = text(form, "companyId", 40);
    if (!isId(id)) throw new Error("Company not found.");
    const changes: Record<string, unknown> = {
      xero_tracking_category: text(form, "xero_tracking_category", 60), xero_tracking_option: text(form, "xero_tracking_option", 60),
      xero_send_status: text(form, "xero_send_status", 12) || "DRAFT", xero_send_bills: form.get("xero_send_bills") === "on",
    };
    for (const k of ["acct_labour", "acct_sales", "acct_vehicle", "acct_materials", "acct_hire", "acct_subcontract", "acct_retentions"]) {
      changes[k] = text(form, k, 10);
    }
    const c = await saveCompanyMoney(s, id, changes);
    return `Xero settings saved for ${c.name}.`;
  }, "/dashboard/office/companies");
}
