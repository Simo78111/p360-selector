// Analytics hook for the job finder. It only logs during development for now;
// Phase 5 will send these events to the owner dashboard.
export function track(event: string, data: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "development") console.debug("[track]", event, data);
}
