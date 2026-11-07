// The office console's menus (Phase 3e). The top bar keeps the day-to-day screens (Today, Jobs, Calendar, Reports);
// everything else lives on the Settings page, in groups. Each item says which part of the console it belongs to
// (lib/auth.ts `can`), so people only see what their role can open.
import type { Area } from "./auth";

export type MenuLink = { href: string; label: string; area: Area; exact?: boolean; also?: string[]; note?: string };

export const TOP_MENU: MenuLink[] = [
  { href: "/dashboard/office", label: "Today", exact: true, area: "staff" },
  { href: "/dashboard/office/all-jobs", label: "Jobs", area: "jobs", also: ["/dashboard/office/job"] },
  { href: "/dashboard/office/diary", label: "Calendar", area: "jobs" },
  // the layout adds a red count of invoices waiting to be reconciled
  { href: "/dashboard/office/supplier-invoices", label: "Supplier invoices", area: "staff" },
  { href: "/dashboard/office/tools", label: "Tools", area: "jobs" },
];

export const REPORTS: MenuLink[] = [
  { href: "/dashboard/office/reports/sales", label: "Sales summary", area: "staff",
    note: "Invoiced by month, company, customer and labour / materials / vehicle." },
  { href: "/dashboard/office/reports/work-on-hand", label: "Work on hand", area: "staff",
    note: "Accepted quotes and charge-up work not invoiced yet." },
  { href: "/dashboard/office/reports/profit", label: "Job profitability", area: "staff",
    note: "Budget, invoiced, cost and gross profit per job. Needs \"Can see costs and margins\"." },
  { href: "/dashboard/office/reports/unbilled", label: "Unbilled work", area: "staff",
    note: "Phases waiting to be invoiced, and costs not on an invoice yet." },
];

export type SettingsGroup = { title: string; items: MenuLink[] };

export const SETTINGS: SettingsGroup[] = [
  {
    title: "Office work",
    items: [
      { href: "/dashboard/office/invoices", label: "Invoices", area: "staff", note: "To invoice, to be approved, invoiced, void." },
      { href: "/dashboard/office/timesheets", label: "Timesheets & leave", area: "staff", note: "Approve the week, leave, the Smartly file." },
      { href: "/dashboard/office/customers", label: "Customers", area: "customers", note: "Customers, sites and contacts." },
    ],
  },
  {
    title: "Maintenance bookings",
    items: [
      { href: "/dashboard/office/jobs", label: "Bookings", area: "bookings", note: "The booking engine's jobs." },
      { href: "/dashboard/office/attention", label: "Needs attention", area: "bookings" },
      { href: "/dashboard/office/orders", label: "Orders", area: "bookings" },
      { href: "/dashboard/office/certificates", label: "Gas certs", area: "bookings" },
      { href: "/dashboard/office/plumbers", label: "Plumbers", area: "bookings", note: "Who's in the booking pool, days off." },
    ],
  },
  {
    title: "Health & safety",
    items: [
      { href: "/dashboard/office/health-safety", label: "H&S register", area: "jobs",
        note: "Every SWMS and JSA: status, who has signed, next booking." },
      { href: "/dashboard/office/health-safety/settings", label: "SWMS settings & hazard library", area: "jobs",
        note: "The hazard and controls library, and the AI's instructions, reference and example documents." },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/dashboard/office/staff", label: "Staff", area: "staff", note: "People, roles, permissions, pay and rates." },
      { href: "/dashboard/office/staff/compliance", label: "Staff compliance schedule", area: "staff",
        note: "Licences, tickets and expiry dates as one PDF for a customer, with copies of the cards." },
      { href: "/dashboard/office/timesheets/settings", label: "Pay rates & allowances", area: "staff" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { href: "/dashboard/office/price-books", label: "Price books", area: "pricing" },
      { href: "/dashboard/office/pricing", label: "Pricing tiers", area: "pricing" },
      { href: "/dashboard/office/favourites", label: "Favourites", area: "jobs", note: "Ready-made quote lines." },
    ],
  },
  {
    title: "Companies & accounts",
    items: [
      { href: "/dashboard/office/companies", label: "Companies", area: "owner", note: "Invoice numbering, footers, due dates, Xero codes." },
      { href: "/dashboard/office/xero", label: "Xero", area: "owner" },
    ],
  },
  {
    title: "Website & marketing",
    items: [
      { href: "/dashboard", label: "Website", area: "bookings", exact: true, note: "Visitors and enquiries." },
      { href: "/dashboard/bookings", label: "Web bookings", area: "bookings" },
      { href: "/dashboard/office/marketing", label: "Marketing", area: "bookings" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/dashboard/office/settings", label: "Booking engine settings", area: "owner" },
      { href: "/dashboard/office/import", label: "Fergus import", area: "owner" },
      { href: "/dashboard/status", label: "Status", area: "owner" },
    ],
  },
];

/** Paths that light up the Settings gear. */
export const SETTINGS_PATHS = ["/dashboard/settings", ...SETTINGS.flatMap((g) => g.items.map((i) => i.href))];
