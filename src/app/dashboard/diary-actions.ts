"use server";
// Job management Phase 2c: actions for the diary board. Each checks the person is signed in to the office console;
// the database then checks "Can book the diary" for the job's company (lib/diary.ts). They return a result instead
// of redirecting, because the board stays on screen and refreshes itself.
import { revalidatePath } from "next/cache";
import { assertOffice } from "@/lib/auth";
import { loadDiaryPhases, removeBooking, saveBooking, sendSchedule, setDiaryColour, type DiaryPhase } from "@/lib/diary";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));
export type DiaryResult = { ok: true; message?: string; warnings?: string[] } | { ok: false; error: string };
const fail = (e: unknown): DiaryResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const done = () => revalidatePath("/dashboard/office/diary");

export type BookingInput = {
  id?: string | null;          // null/undefined = new booking
  phase_id?: string;           // new bookings only
  plumber_id?: string | null;  // null = Unassigned; undefined = leave as is
  starts_at?: string;
  ends_at?: string;
  note?: string | null;
};

export async function saveBookingAction(b: BookingInput): Promise<DiaryResult> {
  try {
    const s = await assertOffice("jobs");
    const changes: Record<string, unknown> = {};
    if (!b.id) {
      if (!isId(b.phase_id)) throw new Error("Pick the job phase to book.");
      changes.phase_id = b.phase_id;
    } else if (!isId(b.id)) throw new Error("That booking isn't on the diary any more.");
    if (b.plumber_id !== undefined) {
      if (b.plumber_id !== null && !isId(b.plumber_id)) throw new Error("Pick a person.");
      changes.plumber_id = b.plumber_id ?? "";
    }
    if (b.starts_at !== undefined) {
      if (!isTime(b.starts_at)) throw new Error("That time isn't right.");
      changes.starts_at = b.starts_at;
    }
    if (b.ends_at !== undefined) {
      if (!isTime(b.ends_at)) throw new Error("That time isn't right.");
      changes.ends_at = b.ends_at;
    }
    if (b.note !== undefined) changes.note = String(b.note ?? "").slice(0, 1000);
    const r = await saveBooking(s, b.id ?? null, changes);
    done();
    return { ok: true, message: `${r.booking.phase_ref} ${b.id ? "saved" : "booked"}.`, warnings: r.warnings };
  } catch (e) {
    return fail(e);
  }
}

export async function removeBookingAction(id: string): Promise<DiaryResult> {
  try {
    const s = await assertOffice("jobs");
    if (!isId(id)) throw new Error("That booking isn't on the diary any more.");
    const r = await removeBooking(s, id);
    done();
    return { ok: true, message: `${r.phase_ref} booking removed.` };
  } catch (e) {
    return fail(e);
  }
}

export async function sendScheduleAction(plumberId: string | null): Promise<DiaryResult> {
  try {
    const s = await assertOffice("jobs");
    if (plumberId !== null && !isId(plumberId)) throw new Error("Pick a person.");
    const r = await sendSchedule(s, plumberId);
    done();
    if (!r.sent.length) return { ok: true, message: "Nothing new to send." };
    return {
      ok: true,
      message: `Schedule sent to ${r.sent.map((x) => `${x.name} (${x.changes} change${x.changes === 1 ? "" : "s"})`).join(", ")}. They'll see it in the plumber app.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setColourAction(jobId: string, colour: string | null): Promise<DiaryResult> {
  try {
    const s = await assertOffice("jobs");
    if (!isId(jobId)) throw new Error("Job not found.");
    await setDiaryColour(s, jobId, colour);
    done();
    return { ok: true, message: "Job colour saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function searchPhasesAction(q: string, companyId: string | null): Promise<DiaryPhase[]> {
  const s = await assertOffice("jobs");
  return loadDiaryPhases(s, q.trim().slice(0, 100) || null, isId(companyId) ? companyId : null);
}
