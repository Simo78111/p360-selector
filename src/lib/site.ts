// Business details used across the site. Values marked PLACEHOLDER need
// confirming before launch.
export const site = {
  name: "Plumbing360",
  tagline: "Plumbing, drainage and gas fitting across Auckland",
  url: "https://plumbing360.co.nz",
  phone: "0800 000 000", // PLACEHOLDER
  phoneHref: "tel:0800000000", // PLACEHOLDER
  email: "jobs@plumbing360.co.nz", // PLACEHOLDER
  area: "Auckland",
  hours: "Monday to Friday, 7:30am – 5:00pm",
  afterHours: false,
};

// PLACEHOLDER prices — swap for real numbers before launch.
export const pricing = {
  callOutFrom: 95,
  depositAmount: 50,
  // PLACEHOLDER deposit terms, shown at checkout and on /terms.
  depositTerms:
    "Your deposit secures your booking and is deducted from your final invoice. It's fully refundable if you cancel at least 24 hours before your booking.",
  currency: "NZD",
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
