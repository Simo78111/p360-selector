import "server-only";
import { outcomes, questions, ROOT, type Option, type Urgency } from "./finder";
import { pricing } from "./site";
import { getSupabase, PHOTO_BUCKET } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────

export type EventRow = {
  created_at: string;
  session_id: string;
  name: string;
  path: string;
  props: Record<string, unknown>;
};

export type BookingStatus = "new" | "pending_payment" | "paid" | "completed" | "cancelled";

export type DashboardBooking = {
  reference: string;
  createdAt: string;
  status: BookingStatus;
  answers: string;
  outcomeTitle: string;
  service: string;
  urgency: Urgency;
  priceLabel: string;
  description: string;
  street: string;
  suburb: string;
  postcode: string;
  relationship: string;
  access: string;
  name: string;
  phone: string;
  email: string;
  days: string[];
  time: string;
  depositAmount: number;
  paidAt: string | null;
  photoPaths: string[];
  notifiedAt: string | null;
  fergusEnquiryId: string | null;
  notifyError: string | null;
};

const fromRow = (r: Record<string, unknown>): DashboardBooking => ({
  reference: r.reference as string,
  createdAt: r.created_at as string,
  status: r.status as BookingStatus,
  answers: r.answers as string,
  outcomeTitle: r.outcome_title as string,
  service: r.service as string,
  urgency: r.urgency as Urgency,
  priceLabel: r.price_label as string,
  description: r.description as string,
  street: r.street as string,
  suburb: r.suburb as string,
  postcode: r.postcode as string,
  relationship: r.relationship as string,
  access: r.access as string,
  name: r.name as string,
  phone: r.phone as string,
  email: r.email as string,
  days: (r.days as string[]) ?? [],
  time: r.time_of_day as string,
  depositAmount: Number(r.deposit_amount ?? 0),
  paidAt: (r.paid_at as string) ?? null,
  photoPaths: (r.photo_paths as string[]) ?? [],
  notifiedAt: (r.notified_at as string) ?? null,
  fergusEnquiryId: (r.fergus_enquiry_id as string) ?? null,
  notifyError: (r.notify_error as string) ?? null,
});

// ── Loading ───────────────────────────────────────────────────────────────

export const usingSampleData = () => !getSupabase();

const MAX_EVENTS = 50_000;

async function loadEvents(since: Date): Promise<EventRow[]> {
  const db = getSupabase();
  if (!db) return sample().events.filter((e) => e.created_at >= since.toISOString());
  const rows: EventRow[] = [];
  for (let from = 0; from < MAX_EVENTS; from += 1000) {
    const { data, error } = await db
      .from("events")
      .select("created_at, session_id, name, path, props")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as EventRow[]));
    if (data.length < 1000) break;
  }
  return rows;
}

export async function loadBookings(since?: Date, status?: BookingStatus): Promise<DashboardBooking[]> {
  const db = getSupabase();
  if (!db) {
    return sample().bookings.filter(
      (b) => (!since || b.createdAt >= since.toISOString()) && (!status || b.status === status),
    );
  }
  let q = db.from("bookings").select("*").order("created_at", { ascending: false }).limit(1000);
  if (since) q = q.gte("created_at", since.toISOString());
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map(fromRow);
}

export async function loadBooking(reference: string) {
  const db = getSupabase();
  if (!db) return { booking: sample().bookings.find((b) => b.reference === reference) ?? null, photoUrls: [] };
  const { data } = await db.from("bookings").select("*").eq("reference", reference).maybeSingle();
  if (!data) return { booking: null, photoUrls: [] };
  const booking = fromRow(data);
  let photoUrls: string[] = [];
  if (booking.photoPaths.length) {
    const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(booking.photoPaths, 60 * 60);
    photoUrls = (signed ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));
  }
  return { booking, photoUrls };
}

// ── Stats ─────────────────────────────────────────────────────────────────

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date(iso));

const sessionsWith = (events: EventRow[], test: (e: EventRow) => boolean) =>
  new Set(events.filter(test).map((e) => e.session_id)).size;

export type Kpi = { id: string; label: string; value: number; previous: number; upIsGood: boolean; spark: number[] };
export type FunnelStep = { label: string; value: number };
export type OutcomeStat = { id: string; title: string; reached: number; bookClicks: number; fixed: number; booked: number };
export type QuestionStat = { id: string; title: string; context: string; reached: number; answered: number };

export type Stats = {
  days: number;
  daily: { date: string; visitors: number; bookings: number }[];
  kpis: Kpi[];
  funnel: FunnelStep[];
  outcomes: OutcomeStat[];
  questions: QuestionStat[];
  suburbs: { suburb: string; count: number }[];
  recent: DashboardBooking[];
};

function windowStats(events: EventRow[], bookings: DashboardBooking[]) {
  return {
    visitors: sessionsWith(events, (e) => e.name === "page_view"),
    starts: sessionsWith(events, (e) => e.name === "finder_answer"),
    results: sessionsWith(events, (e) => e.name === "finder_outcome"),
    fixed: events.filter((e) => e.name === "finder_fixed_myself").length,
    bookings: bookings.filter((b) => b.status !== "pending_payment" && b.status !== "cancelled").length,
    deposits: bookings.filter((b) => b.paidAt).reduce((sum, b) => sum + b.depositAmount, 0),
  };
}

export async function loadStats(days: number): Promise<Stats> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);
  const prevStart = new Date(now.getTime() - 2 * days * 86_400_000);
  const [allEvents, allBookings] = await Promise.all([loadEvents(prevStart), loadBookings(prevStart)]);

  const isCurrent = (iso: string) => iso >= start.toISOString();
  const events = allEvents.filter((e) => isCurrent(e.created_at));
  const prevEvents = allEvents.filter((e) => !isCurrent(e.created_at));
  const bookings = allBookings.filter((b) => isCurrent(b.createdAt));
  const prevBookings = allBookings.filter((b) => !isCurrent(b.createdAt));

  // Daily series, every day present even with no activity.
  const daily = new Map<string, { visitors: Set<string>; bookings: number }>();
  for (let i = days - 1; i >= 0; i--) {
    daily.set(dayKey(new Date(now.getTime() - i * 86_400_000).toISOString()), { visitors: new Set(), bookings: 0 });
  }
  for (const e of events) if (e.name === "page_view") daily.get(dayKey(e.created_at))?.visitors.add(e.session_id);
  for (const b of bookings) {
    const d = daily.get(dayKey(b.createdAt));
    if (d && b.status !== "pending_payment" && b.status !== "cancelled") d.bookings++;
  }
  const dailyList = Array.from(daily, ([date, d]) => ({ date, visitors: d.visitors.size, bookings: d.bookings }));

  // Sparklines: the current window split into 12 buckets.
  const spark = (pick: (d: (typeof dailyList)[number]) => number) => {
    const size = Math.max(1, Math.ceil(dailyList.length / 12));
    const out: number[] = [];
    for (let i = 0; i < dailyList.length; i += size) out.push(dailyList.slice(i, i + size).reduce((s, d) => s + pick(d), 0));
    return out;
  };

  const cur = windowStats(events, bookings);
  const prev = windowStats(prevEvents, prevBookings);
  const kpis: Kpi[] = [
    { id: "visitors", label: "Visitors", value: cur.visitors, previous: prev.visitors, upIsGood: true, spark: spark((d) => d.visitors) },
    { id: "starts", label: "Started the job finder", value: cur.starts, previous: prev.starts, upIsGood: true, spark: [] },
    { id: "fixed", label: "Fixed it themselves", value: cur.fixed, previous: prev.fixed, upIsGood: true, spark: [] },
    { id: "bookings", label: "Bookings", value: cur.bookings, previous: prev.bookings, upIsGood: true, spark: spark((d) => d.bookings) },
    { id: "deposits", label: "Deposits taken", value: cur.deposits, previous: prev.deposits, upIsGood: true, spark: [] },
  ].filter((k) => k.id !== "deposits" || pricing.depositsEnabled);

  const funnel: FunnelStep[] = [
    { label: "Visited the site", value: cur.visitors },
    { label: "Started the job finder", value: cur.starts },
    { label: "Reached a result", value: cur.results },
    { label: "Clicked “Book this job”", value: sessionsWith(events, (e) => e.name === "finder_book_click") },
    { label: "Sent a booking", value: cur.bookings },
  ];

  // Per result
  const byOutcome = new Map<string, OutcomeStat>();
  const stat = (id: string) => {
    if (!byOutcome.has(id)) byOutcome.set(id, { id, title: outcomes[id]?.title ?? id, reached: 0, bookClicks: 0, fixed: 0, booked: 0 });
    return byOutcome.get(id)!;
  };
  for (const e of events) {
    const id = e.props.outcome as string | undefined;
    if (!id) continue;
    if (e.name === "finder_outcome") stat(id).reached++;
    if (e.name === "finder_book_click") stat(id).bookClicks++;
    if (e.name === "finder_fixed_myself") stat(id).fixed++;
  }
  for (const b of bookings) {
    const id = Object.values(outcomes).find((o) => o.title === b.outcomeTitle)?.id;
    if (id && b.status !== "pending_payment" && b.status !== "cancelled") stat(id).booked++;
  }
  const outcomeList = [...byOutcome.values()].sort((a, b) => b.reached - a.reached);

  // Where people drop out of the finder: who saw each question vs who answered it.
  const reached = new Map<string, Set<string>>();
  const answered = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, s: string) => {
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(s);
  };
  for (const e of events) {
    if (e.name === "page_view" && e.path === "/get-started") add(reached, ROOT, e.session_id);
    if (e.name !== "finder_answer") continue;
    const q = questions[e.props.question as string];
    if (!q) continue;
    add(answered, q.id, e.session_id);
    if (q.id === ROOT) add(reached, ROOT, e.session_id);
    const next = q.options.find((o) => o.id === e.props.answer)?.next;
    if (next) add(reached, next, e.session_id);
  }
  const context = questionContexts();
  const questionList: QuestionStat[] = Object.values(questions)
    .map((q) => ({
      id: q.id,
      title: q.title,
      context: context.get(q.id) ?? "",
      reached: reached.get(q.id)?.size ?? 0,
      answered: answered.get(q.id)?.size ?? 0,
    }))
    .filter((q) => q.reached > 0)
    .sort((a, b) => b.reached - a.reached);

  const suburbCounts = new Map<string, number>();
  for (const b of bookings) suburbCounts.set(b.suburb, (suburbCounts.get(b.suburb) ?? 0) + 1);
  const suburbs = [...suburbCounts].map(([suburb, count]) => ({ suburb, count })).sort((a, b) => b.count - a.count);

  return {
    days,
    daily: dailyList,
    kpis,
    funnel,
    outcomes: outcomeList,
    questions: questionList,
    suburbs,
    recent: bookings.slice(0, 5),
  };
}

/** The answers that lead to each question, e.g. "Plumbing › A leak". */
function questionContexts() {
  const out = new Map<string, string>([[ROOT, "Start"]]);
  const queue: [string, string[]][] = [[ROOT, []]];
  while (queue.length) {
    const [id, trail] = queue.shift()!;
    for (const o of questions[id].options) {
      if (!o.next || out.has(o.next)) continue;
      const next = [...trail, o.label].slice(0, 2);
      out.set(o.next, next.join(" › "));
      queue.push([o.next, next]);
    }
  }
  return out;
}

// ── Sample data (shown until Supabase is connected) ───────────────────────

let cached: { events: EventRow[]; bookings: DashboardBooking[] } | null = null;

function sample() {
  if (cached) return cached;
  let seed = 360;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const suburbs = [
    ["Ponsonby", "1011"], ["Grey Lynn", "1021"], ["Mt Eden", "1024"], ["Remuera", "1050"], ["Epsom", "1023"],
    ["Takapuna", "0622"], ["Henderson", "0612"], ["Howick", "2014"], ["Papatoetoe", "2025"], ["Albany", "0632"],
    ["Onehunga", "1061"], ["New Lynn", "0600"],
  ] as const;

  const events: EventRow[] = [];
  const bookings: DashboardBooking[] = [];
  const now = Date.now();
  let n = 0;

  for (let day = 180; day >= 0; day--) {
    const date = new Date(now - day * 86_400_000);
    const weekday = date.getUTCDay();
    const growth = 1 + (180 - day) / 180;
    const sessions = Math.round((weekday === 0 || weekday === 6 ? 14 : 24) * growth * (0.8 + rand() * 0.4));

    for (let s = 0; s < sessions; s++) {
      const sid = `sample-${day}-${s}`;
      let t = date.getTime() - rand() * 86_400_000 * 0.9;
      const at = () => new Date((t += 20_000 + rand() * 60_000)).toISOString();
      const ev = (name: string, path: string, props: Record<string, unknown> = {}) =>
        events.push({ created_at: at(), session_id: sid, name, path, props });

      ev("page_view", pick(["/", "/", "/", "/services/plumbing", "/services/drainage"]));
      if (rand() > 0.55) continue;
      ev("page_view", "/get-started");

      const answers: string[] = [];
      let q: (typeof questions)[string] | undefined = questions[ROOT];
      let outcomeId: string | undefined;
      let urgency: Urgency = "standard";
      while (q) {
        if (rand() < 0.1) break;
        const weights = q.options.map((_, i) => (i === 0 ? 3 : i === 1 ? 2 : 1));
        let r = rand() * weights.reduce((a, b) => a + b, 0);
        const option: Option = q.options.find((_, i) => (r -= weights[i]) < 0) ?? q.options[0];
        answers.push(option.id);
        ev("finder_answer", "/get-started", { question: q.id, answer: option.id });
        if (option.outcome) outcomeId = option.outcome;
        if (option.urgency) urgency = option.urgency;
        q = option.next ? questions[option.next] : undefined;
      }
      if (q || !outcomeId) continue;
      const outcome = outcomes[outcomeId];
      ev("finder_outcome", "/get-started", { outcome: outcomeId, urgency, answers: answers.join(".") });

      const fixChance = outcome.urgency === "diy" ? 0.3 : outcome.urgency === "emergency" ? 0 : 0.06;
      if (rand() < fixChance) {
        ev("finder_fixed_myself", "/get-started", { outcome: outcomeId });
        continue;
      }
      if (rand() > 0.4) continue;
      ev("finder_book_click", "/get-started", { outcome: outcomeId, urgency });
      ev("page_view", "/book");
      if (rand() > 0.55) continue;

      const [suburb, postcode] = pick(suburbs);
      const createdAt = at();
      const status: BookingStatus = day > 14 ? (rand() < 0.9 ? "completed" : "cancelled") : rand() < 0.85 ? "paid" : "pending_payment";
      n++;
      bookings.push({
        reference: `P360-SMP${String(n).padStart(3, "0")}`,
        createdAt,
        status,
        answers: answers.join("."),
        outcomeTitle: outcome.title,
        service: outcome.service,
        urgency,
        priceLabel: `${outcome.price.label} $${outcome.price.amount}`,
        description: "Sample booking. Real bookings will show the customer's description here.",
        street: `${1 + Math.floor(rand() * 200)} Sample Street`,
        suburb,
        postcode,
        relationship: pick(["owner", "owner", "tenant", "manager"]),
        access: "",
        name: `Sample customer ${n}`,
        phone: "021 000 0000",
        email: "customer@example.com",
        days: ["Mon", "Wed"],
        time: "any",
        depositAmount: status === "pending_payment" ? 0 : 50,
        paidAt: status === "pending_payment" ? null : createdAt,
        photoPaths: [],
        notifiedAt: createdAt,
        fergusEnquiryId: null,
        notifyError: null,
      });
      ev("booking_submitted", "/book", {});
    }
  }

  events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  cached = { events, bookings };
  return cached;
}
