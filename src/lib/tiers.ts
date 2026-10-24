// Booking tiers: how soon we come, and what it costs.
//   Priority — the soonest slot, usually today or the next working day
//   Standard — on a day that suits you (the job finder's price)
//   Flexi    — any time in the next few days; we text when a plumber is nearby
// Safe to import in the browser.
import type { Outcome, Urgency } from "./finder";
import { pricing } from "./site";

export const tierIds = ["priority", "standard", "flexi"] as const;
export type Tier = (typeof tierIds)[number];

const roundTo5 = (n: number) => Math.round(n / 5) * 5;

/** Prices for each tier, GST inclusive, from the job finder's "from" price. */
export function tierPrices(standard: number): Record<Tier, number> {
  return {
    priority: roundTo5(standard * (1 + pricing.tiers.priorityUplift)),
    standard,
    flexi: roundTo5(standard * (1 - pricing.tiers.flexiDiscount)),
  };
}

export const tierInfo: Record<Tier, { label: string; when: string; detail: string }> = {
  priority: {
    label: "Priority",
    when: "Today or the next working day",
    detail: "The soonest slot we have. We text you the arrival time.",
  },
  standard: {
    label: "Standard",
    when: "On a day that suits you",
    detail: "Pick your days and we text you the arrival time.",
  },
  flexi: {
    label: "Flexi",
    when: `Any time in the next ${pricing.tiers.flexiWindowDays} days`,
    detail:
      "When a plumber's working near you, we text you a time. Reply YES to take it. If nothing comes up, we book you in before then at the Flexi price.",
  },
};

// Jobs that can't wait for a gap in someone's day, or are too long to fit one.
const noFlexi = new Set(["install-cylinder", "gas-install", "install-toilet"]);

/**
 * Which tiers to offer for a job. Emergencies only get Priority (and the
 * finder already tells people to call); urgent jobs can't wait for Flexi.
 */
export function tiersFor(outcome: Pick<Outcome, "id">, urgency: Urgency): Tier[] {
  if (urgency === "emergency") return ["priority"];
  if (urgency === "urgent" || noFlexi.has(outcome.id)) return ["priority", "standard"];
  return ["priority", "standard", "flexi"];
}
