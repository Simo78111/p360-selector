// Diary types and Auckland-time helpers, shared by the server and the board (no server-only imports here).

export type DiaryCompany = { id: string; code: string; name: string; can_book: boolean };
export type DiaryPerson = {
  plumber_id: string; staff_id: string; name: string; initials: string; companies: string[] | null;
  off: string[] | null; not_sent: number;
};
export type DiaryBooking = {
  id: string; plumber_id: string | null; starts_at: string; ends_at: string; start_label: string; length_label: string;
  phase_ref: string; description: string; colour: string;
  kind?: "job" | "holder";   // holder = a booking with no job ("what is the booking for?")
  title?: string | null;
  // missing on a "Busy" block (an office-only job the viewer can't open)
  busy?: boolean;
  phase_id?: string; job_id?: string; company_id?: string; company_code?: string; phase_name?: string; stage?: string;
  stage_label?: string; job_ref?: string; job_title?: string | null; job_state?: string; customer?: string; site?: string;
  site_name?: string | null; note?: string | null; started_at?: string | null; finished_at?: string | null;
  not_sent?: boolean; sent_at?: string | null; can_edit?: boolean;
};
export type DiaryAppointment = {
  id: string; job_id: string; job_ref: string; job_number: number; plumber_id: string; starts_at: string; ends_at: string;
  start_label: string; length_label: string; customer: string; site: string; description: string; status: string;
  company_code: string;
};
export type Diary = {
  from: string; days: number; timezone: string; companies: DiaryCompany[]; people: DiaryPerson[];
  bookings: DiaryBooking[]; appointments: DiaryAppointment[]; removed_unsent: Record<string, number>;
};
export type DiaryPhase = {
  phase_id: string; phase_ref: string; phase_name: string; stage: string; stage_label: string; job_id: string;
  job_ref: string; job_title: string | null; company_code: string; customer: string; site: string; description: string;
  colour: string; booked: number;
};
export type SavedBooking = { booking: DiaryBooking; warnings: string[] };

export const TZ = "Pacific/Auckland";
export const SLOT_MIN = 15;
export const DEFAULT_START_MIN = 7 * 60 + 30; // 7:30 AM
export const DEFAULT_LENGTH_MIN = 7.5 * 60; // 7.5 hours

const fmt = new Intl.DateTimeFormat("en-NZ", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Auckland date (YYYY-MM-DD) and minutes after midnight for an instant. */
export function nzParts(iso: string | Date): { date: string; min: number } {
  const p = Object.fromEntries(fmt.formatToParts(typeof iso === "string" ? new Date(iso) : iso).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

/** The instant for an Auckland date and minutes after midnight (handles daylight saving). */
export function nzInstant(date: string, min: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  // Find the offset Auckland had at that moment, then correct (twice for the changeover hour).
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = nzParts(new Date(t));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const shown = Date.UTC(py, pm - 1, pd, Math.floor(p.min / 60), p.min % 60);
    t = t + (guess - shown);
  }
  return new Date(t).toISOString();
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const todayNz = () => nzParts(new Date()).date;
/** Monday of the week the date is in. */
export const mondayOf = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
};
export const dayLabel = (date: string, long = false) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NZ", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
export const timeLabel = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
export const lengthLabel = (min: number) => `${Number((min / 60).toFixed(2))} hrs`;
export const snap = (min: number) => Math.round(min / SLOT_MIN) * SLOT_MIN;
