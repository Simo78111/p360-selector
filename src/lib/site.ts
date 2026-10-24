// Business details used across the site. Values marked PLACEHOLDER need
// confirming before launch.
export const site = {
  name: "Plumbing360",
  tagline: "Plumbing, drainage and gas fitting across Auckland",
  url: "https://plumbing360.nz",
  phone: "0800 776 360",
  phoneHref: "tel:0800776360",
  email: "jobs@plumbing360.nz", // PLACEHOLDER
  area: "Auckland",
  hours: "Monday to Friday, 7:30am – 5:00pm",
  afterHours: false,
};

// PLACEHOLDER prices — swap for real numbers before launch.
export const pricing = {
  callOutFrom: 95,
  // Online deposits through Stripe. Off: no payment is taken and deposits
  // aren't mentioned anywhere, even if Stripe keys are added. Turn on to
  // start taking deposits (Stripe keys needed too, see README).
  depositsEnabled: false,
  depositAmount: 50,
  // PLACEHOLDER deposit terms, shown at checkout and on /terms.
  depositTerms:
    "Your deposit secures your booking and is deducted from your final invoice. It's fully refundable if you cancel at least 24 hours before your booking.",
  currency: "NZD",
  // Booking tiers (see src/lib/tiers.ts). Standard is the job finder's price below;
  // Priority and Flexi are worked out from it and rounded to the nearest $5.
  // PLACEHOLDER percentages — confirm before launch.
  tiers: {
    priorityUplift: 0.4, // Priority costs 40% more: the soonest slot, usually today or the next working day
    flexiDiscount: 0.2, // Flexi costs 20% less: any time in the next few days, when a plumber is nearby
    flexiWindowDays: 3, // must match flexi_window_days in the booking engine
  },
  // "From" prices shown at the end of the job finder
  from: {
    callOut: 95,
    blockedDrain: 195,
    cctv: 295,
    hotWaterRepair: 145,
    cylinderReplace: 2400,
    tapInstall: 180,
    toiletInstall: 450,
    gasCallOut: 120,
    gasInstall: 450,
    gasCertificate: 150,
  },
};

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/why-choose-us", label: "Why us" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const formatPrice = (n: number) => `$${n.toLocaleString("en-NZ")}`;
