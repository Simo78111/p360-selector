"use server";
// Job management Phase 2c: actions for the diary board. Each checks the person is signed in to the office console;
// the database then checks "Can book the diary" for the job's company (lib/diary.ts). They return a result instead
// of redirecting, because the board stays on screen and refreshes itself.
import { revalidatePath } from "next/cache";
import { assertOffice } from "@/lib/auth";
import { loadDiaryPhases, nzInstant, removeBooking, saveBooking, sendSchedule, setDiaryColour, type DiaryPhase } from "@/lib/diary";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));
export type DiaryResult = { ok: true; message?: string; warnings?: string[] } | { ok: false; error: string };
const fail = (e: unknown): DiaryResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const done = () => revalidatePath("/dashboard/office/diary");

export type BookingInput = {
  id?: string | null;          // null/undefined = new booking
  phase_id?: string;           // new job bookings only
  title?: string;              // a holder: what the booking is for (no job)
  colour?: string | null;      // a holder's colour
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
      if (isId(b.phase_id)) changes.phase_id = b.phase_id;
      else if (b.title?.trim()) changes.title = b.title.trim().slice(0, 120);
      else throw new Error("Say what the booking is for, or pick a job phase.");
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
    if (b.id && b.title !== undefined) changes.title = String(b.title).trim().slice(0, 120);
    if (b.colour !== undefined) {
      if (b.colour !== null && !/^#[0-9a-f]{6}$/i.test(b.colour)) throw new Error("Pick a colour.");
      changes.colour = b.colour ?? "";
    }
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

/** Schedule from the job's phase card (6 Nov): the chosen people on the chosen working days, start to finish each day.
 *  Each booking goes through the same database function as the Calendar ("Can book the diary", clash warnings). */
export async function scheduleFromJobAction(input: {
  phase_id: string; plumber_ids: string[]; date: string; start_min: number; end_min: number; days: number;
  skip_weekends: boolean; note: string | null; back: string;
}): Promise<DiaryResult> {
  try {
    const s = await assertOffice("jobs");
    if (!isId(input.phase_id)) throw new Error("Pick a phase.");
    const people = (input.plumber_ids ?? []).filter(isId).slice(0, 20);
    if (!people.length) throw new Error("Tick at least one person.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a start date.");
    const [a, b] = [Math.round(input.start_min / 15) * 15, Math.round(input.end_min / 15) * 15];
    if (!(a >= 0 && b <= 24 * 60 && b > a)) throw new Error("The finish time has to be after the start.");
    const n = Math.min(Math.max(Math.floor(input.days || 1), 1), 20);
    const dates: string[] = [];
    for (let d = new Date(`${input.date}T12:00:00Z`); dates.length < n; d.setUTCDate(d.getUTCDate() + 1)) {
      if (input.skip_weekends && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
      dates.push(d.toISOString().slice(0, 10));
    }
    const warnings: string[] = [];
    let made = 0;
    for (const day of dates) {
      for (const p of people) {
        const r = await saveBooking(s, null, { phase_id: input.phase_id, plumber_id: p, starts_at: nzInstant(day, a),
          ends_at: nzInstant(day, b), ...(input.note?.trim() ? { note: input.note.trim().slice(0, 1000) } : {}) });
        made++;
        warnings.push(...(r.warnings ?? []));
      }
    }
    done();
    if (typeof input.back === "string" && input.back.startsWith("/dashboard/office/job/")) revalidatePath(input.back.split("?")[0]);
    return { ok: true, message: `${made} booking${made === 1 ? "" : "s"} made — they're on the Calendar. Send the schedule from there when you're ready.`,
             warnings: [...new Set(warnings)] };
  } catch (e) {
    return fail(e);
  }
}
