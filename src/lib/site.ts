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
  currency: "NZD",
};

export const nav = [
  { href: "/services", label: "Services" },
  { href: "/why-choose-us", label: "Why us" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const formatPrice = (n: number) => `$${n.toLocaleString("en-NZ")}`;
