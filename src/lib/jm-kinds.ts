// Licence and ticket kinds (Settings → Staff; Phase 5c adds the H&S tickets). Same codes as hs_ticket_kinds in the
// engine. Shared by server and browser code.
export const LICENCE_KINDS: Record<string, string> = {
  plumber: "Plumber (PGDB)",
  gasfitter: "Gas fitter (PGDB)",
  drainlayer: "Drainlayer (PGDB)",
  certifying_plumber: "Certifying plumber",
  certifying_gasfitter: "Certifying gas fitter",
  certifying_drainlayer: "Certifying drainlayer",
  site_safe: "Site Safe passport",
  first_aid: "First aid",
  // Phase 5c tickets (hs_ticket_kinds in the engine)
  ewp: "EWP / scissor lift",
  working_at_height: "Working at height / harness",
  confined_space: "Confined space entry",
  airside: "Airside / ASIC",
  asbestos: "Asbestos awareness",
  traffic_management: "Traffic management (TTM / STMS)",
  hot_works: "Hot works",
  electrofusion: "PE welding / electrofusion",
  forklift: "Forklift",
  excavator: "Excavator / plant",
  drivers: "Driver licence",
  other: "Other",
};
