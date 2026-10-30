import "server-only";
// Job management Phase 2c: the diary (schedule board), through the engine's office_* functions
// (engine repo, migration 20261030001100_jm_diary). Every call passes the signed-in staff member's id; the database
// checks who may see what and who may book ("Can book the diary").
import { engine } from "./engine";
import type { OfficeSession } from "./auth";
export * from "./diary-shared";
import type { Diary, DiaryPhase, SavedBooking } from "./diary-shared";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const who = (s: OfficeSession) => s.staffId; // null = owner backup password

export const loadDiary = (s: OfficeSession, from: string, days: number, companyId: string | null) =>
  rpc<Diary>("office_diary", { p_staff_id: who(s), p_from: from, p_days: days, p_company_id: companyId });

export const loadDiaryPhases = (s: OfficeSession, search: string | null, companyId: string | null) =>
  rpc<DiaryPhase[]>("office_diary_phases", { p_staff_id: who(s), p_search: search, p_company_id: companyId, p_limit: 200 });

export const saveBooking = (s: OfficeSession, bookingId: string | null, changes: Record<string, unknown>) =>
  rpc<SavedBooking>("office_save_booking", { p_staff_id: who(s), p_booking_id: bookingId, p_changes: changes });

export const removeBooking = (s: OfficeSession, bookingId: string) =>
  rpc<{ removed: string; phase_ref: string }>("office_remove_booking", { p_staff_id: who(s), p_booking_id: bookingId });

export const setDiaryColour = (s: OfficeSession, jobId: string, colour: string | null) =>
  rpc<{ job_id: string; colour: string }>("office_set_diary_colour", { p_staff_id: who(s), p_job_id: jobId, p_colour: colour });

export const sendSchedule = (s: OfficeSession, plumberId: string | null) =>
  rpc<{ sent: { plumber_id: string; name: string; changes: number }[] }>("office_send_schedule", {
    p_staff_id: who(s),
    p_plumber_id: plumberId,
  });
