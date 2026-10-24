"use server";
// Office console actions. Each one checks the owner login, calls the engine,
// then returns to the page with a message (?ok= or ?err=) to show.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { bookNow, cancelJob, moveJob, resolveItem, validDate } from "@/lib/office";

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
    return r.start_local ? `Moved to ${r.plumber}, ${r.start_local}. The customer has been texted.` : "Booked.";
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
    if (r.scheduled) return `Booked for ${r.start_local}. The customer has been texted.`;
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
