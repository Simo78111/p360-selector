// Anonymous activity tracking for the owner dashboard. Events are sent to
// /api/events, which stores them in Supabase (or drops them if it isn't set up).

export const trackedEvents = [
  "page_view",
  "finder_answer",
  "finder_outcome",
  "finder_book_click",
  "finder_fixed_myself",
  "booking_step",
  "booking_submitted",
] as const;
export type TrackedEvent = (typeof trackedEvents)[number];

const SESSION_KEY = "p360-session";

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export function track(event: TrackedEvent, props: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") console.debug("[track]", event, props);
  // Owner's own visits to the dashboard aren't counted.
  if (location.pathname.startsWith("/dashboard")) return;

  const body = JSON.stringify({ name: event, props, path: location.pathname, session: sessionId() });
  try {
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    // Tracking must never break the page.
  }
}
