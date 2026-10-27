# Plumbing360 website

Website and job finder for Plumbing360: residential plumbing, drainage and gas fitting in Auckland.

Built with Next.js, TypeScript and Tailwind CSS.

## Run it locally

```bash
npm install
npm run dev -- -p 3360
```

Then open http://localhost:3360.

## Where things live

- `src/lib/site.ts`: business details (phone, email, hours) and prices. Values marked `PLACEHOLDER` need confirming before launch.
- `src/lib/services.ts`: service descriptions, DIY tips and "call a pro" warnings.
- `src/app/(site)/`: the public pages, one folder per page.
- `src/app/dashboard/`: the owner dashboard.
- `src/components/`: header, footer, logo and shared UI.

## Roadmap

1. Foundations: brand, layout, main pages ✅
2. Job finder: step-by-step questions with tips ✅
3. Prices, job details, photos and Stripe deposit ✅ (deposits switched off for now)
4. Email notifications and Fergus enquiries ✅ (keys still to add)
5. Owner dashboard and analytics ✅ (keys still to add)
6. Launch

## Job finder

The questions, tips and "call a pro" warnings live in `src/lib/finder.ts`. After editing, run:

```bash
npm run check:finder
```

It walks every path through the questions and fails if any path doesn't end in a result.

## Bookings and Stripe deposits

The booking form is at `/book` and is reached from a job finder result. Bookings are posted to `src/app/api/bookings/route.ts`.

**Deposits are switched off** (`pricing.depositsEnabled: false` in `src/lib/site.ts`). Bookings go straight through, no payment is taken, and deposits aren't mentioned anywhere on the site, even if Stripe keys are added. The Stripe code stays in place for later. To start taking deposits:

1. Set `depositsEnabled: true` in `src/lib/site.ts`.
2. In Stripe, go to **Developers → API keys** and copy the secret key (`sk_test_...` for testing, `sk_live_...` when going live).
3. Copy `.env.example` to `.env.local` and paste it in as `STRIPE_SECRET_KEY`. On Vercel, add it under **Settings → Environment Variables**.
4. In Stripe, go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Event: `checkout.session.completed`
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Set `NEXT_PUBLIC_SITE_URL` to the site's address.
6. Redeploy. The final button changes from "Send booking" to "Pay $50 deposit".

Test card: `4242 4242 4242 4242`, any future date, any CVC.

The deposit amount and its terms are in `src/lib/site.ts` (`pricing.depositAmount` and `pricing.depositTerms`).


## Saving bookings, emails and Fergus

Each service switches on when its keys are added (see `.env.example`). Anything without keys is skipped and noted in the server log, so the site works at every stage.

| Service | What it does | Keys |
|---|---|---|
| Supabase | Saves every booking and its photos | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Emails the office (photos attached) and the customer | `RESEND_API_KEY`, `EMAIL_FROM`, `OFFICE_EMAIL` |
| Fergus | Creates an enquiry with photos attached | `FERGUS_API_TOKEN` |
| Booking engine | Books the time automatically (Priority/Standard), or adds Flexi jobs to the standby pool, and texts the customer | `ENGINE_SUPABASE_URL`, `ENGINE_SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_SERVER_KEY` |

### Priority, Standard and Flexi

Step 3 of the booking form ("When would you like us?") offers the tiers from `src/lib/tiers.ts`:
Priority (soonest slot, +40%), Standard (the finder price, customer picks days) and Flexi (-20%,
any time in the next 3 days, texted when a plumber is nearby). The percentages are PLACEHOLDERS in
`src/lib/site.ts`. Emergencies only get Priority; urgent jobs and long installs (cylinder, toilet,
gas install) don't get Flexi.

With the engine keys set, `src/lib/engine.ts` finds the address on the map, calls the engine's
`create_booking` and `auto_schedule_job`, and the confirmation page shows the booked time. An
address Google can't find sends the customer back to fix it. Outside Auckland, emergencies and
engine errors are still saved and emailed, and the office books those by hand.

The engine's service menu is generated from the job finder: `npm run export:menu` prints the SQL
(prices excluding GST). Re-run it and apply it as a new engine migration when prices change.
Tests: `npm run test:engine` (adapter) and `python3 tests/booking_tiers_test.py` (the form, with
`npm run start` running on port 3360).

**When it happens:** if payments are off, as soon as the booking is sent. If payments are on, once the deposit is paid (Stripe webhook, with the confirmation page as a backup). Emails go out only once.

### Setting up Supabase

1. Create a project at supabase.com (Sydney region is closest).
2. Open **SQL Editor** and run each file in `supabase/migrations/` in order: `0001_bookings.sql` (bookings table and a private `booking-photos` bucket), then `0002_events.sql` (anonymous click tracking).
3. Under **Project Settings → API**, copy the Project URL and the `service_role` key into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Setting up Resend

1. Create an account at resend.com and add your domain (e.g. plumbing360.nz). Add the DNS records it gives you.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on that domain, and `OFFICE_EMAIL` to where booking emails should go.

### Setting up Fergus

Create a Personal Access Token in your Fergus account and set `FERGUS_API_TOKEN`. Bookings appear in Fergus as **Enquiries**, ready to convert into a job.

> If Stripe is on but Supabase isn't, bookings are sent immediately and marked "deposit not yet paid", because there's nowhere to keep them until payment.

## Office console (/dashboard/office)

The human side of the booking engine, behind the same owner login. Needs the three `ENGINE_` keys
(see above); without them the pages say so.

- **Today**: each plumber's day in order with live status, ETAs and a Google Maps route link, plus
  jobs waiting for a time (book the first free slot, or add to a plumber's day).
- **Needs attention**: the engine's queue of things it couldn't handle. Mark each one done. The
  **text assistant** switch (Answer / Suggest only / Off) is here: Claude answers routine customer
  texts and hands the rest over with a summary; reply to any customer text from its card (the
  assistant's suggestion is pre-filled). While texts are in test mode, each job page has **Test:
  text as the customer**. `tests/text_replies_test.py` checks it against a local engine and the
  `answer-text` function with a fake Claude.
- **Customer profile**: each job page has **About {name} and the property** — practical notes (gate
  code, access, pets, parking, water shut-off, hazards, equipment, preferences) from the office,
  plumbers and the text assistant. Mark a note **Still right**, remove it (its text is wiped), add one,
  or **Forget this customer's details** (wipes every note; needs the tick box). Keep it to practical
  details: no children's names or health information. Gate codes only show in the plumber's app on the
  day of the visit. `tests/profile_test.py` checks it.
- **Finished jobs**: click anywhere on a job's row to open it. **What happened** shows the visit in
  order with times (planned, on the way, arrived early/late, ran long, finished and time on site, the
  plumber's note, invoice sent, paid). **Photos**: add before/after photos (shrunk to 1600px in the
  browser and uploaded straight to the engine's private `job-photos` storage), see the plumbers'
  ones and the customer's (photos sent with a website booking are copied onto the job, marked Customer), remove, and tick photos to email to the customer as attachments (needs `RESEND_API_KEY`).
  `tests/job_photos_test.py` checks it; locally the gateway fakes Storage and Resend
  (`RESEND_API_BASE`).
- **Jobs**: search (here or from the box in the header) by name, phone, email, address, job
  number, invoice number, description or office notes. Filters: Open, Overdue (booked for an
  earlier day and not done), Today, Callbacks, Done, Cancelled, All. Tick jobs to move them to a
  day together (in a sensible driving order, keeping their plumber or giving them all to one) or
  cancel them together. Each job shows what the customer said, every text and plumber update and
  the invoice. You can edit the details, keep private office notes, move or cancel it, book a
  return visit for a job that couldn't be finished, and book a **callback** on a finished job:
  rework at no charge, linked to the original and counted against the plumber who did it (shown
  on Plumbers). `tests/jobs_editing_test.py` checks all of this against a local engine.

- **Plumbers**: add plumbers (name, mobile, email, PGDB number, shift, home address) and, with a
  password, make their plumber-app login (Supabase Auth admin on the engine). Tick "Also a gas fitter"
  and set plumbing and gas fitting hourly rates; gas jobs only go to gas fitters, and labour on extra
  work is charged at the job's plumber's rate. Edit them, reset the app
  password, or make them inactive (only once their booked jobs are moved). Also the switch that plans
  routes from home (off by default), and callbacks per plumber. `tests/plumbers_test.py` checks it;
  locally the gateway fakes the Auth admin API.

**Route planning.** Customers booking for a later day get the day and morning or afternoon. At 3pm the
day before, the engine puts each plumber's jobs in the shortest driving order and texts exact times.
Real drive times come from Google: `/api/cron/drive-times` runs daily at 01:00 UTC (early afternoon
in Auckland, before the 3pm planning; see `vercel.json`) and needs `CRON_SECRET`. "Work out best
route now" on Today does the same for one day without texting anyone. `npm run test:drive-times`
checks the lookup against a local engine.

- **Price books**: upload each supplier's monthly price book (CSV). It's read in the browser; the
  columns are guessed (code, description, your price, unit, brand, discount %, price-per) and can be
  corrected, then it's sent to the engine in chunks of 1,500 rows. The summary shows new items, price
  changes and items no longer listed (switched off). Set a default markup and per-supplier markups,
  and search everything. On a job page, **Materials and extra work** searches the price books, adds
  labour or anything else, and texts the customer for approval; it lists what's on the job with cost.
  `tests/price_books_test.py` (fixtures in `tests/fixtures/`) checks it against a local engine.
- **Xero**: connect an organisation, choose the sales account and tracking category, switch sending
  on, see what's been sent, and send older invoices by hand.

**Xero.** Needs `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` from a Xero web app (developer.xero.com, free
Starter plan) with the redirect URI `https://<site>/api/xero/callback`. Once connected, each issued
invoice is created in Xero within about 5 minutes (the engine nudges `/api/xero/sync`), the customer
is texted Xero's view-and-pay link, and payments made in Xero come back every 30 minutes. Vercel also
runs the sync once a day as a backup. `src/lib/xero.ts` does the talking; `tests/xero_test.py` runs the
whole flow against a fake Xero (`node tests/mocks/fake-xero.cjs`, with `XERO_LOGIN_BASE`,
`XERO_IDENTITY_BASE` and `XERO_API_BASE` pointed at it).

Logging in goes straight to Today once the engine is connected.
`tests/office_console_test.py` checks it against a local engine.

## Owner dashboard

Go to `/dashboard` and log in with `DASHBOARD_PASSWORD`. Changing the password logs everyone out.

- **Overview:** visitors, job finder starts, people who fixed it themselves, bookings and deposits, each compared with the period before. Also visitors per day, the visit-to-booking funnel, the most common problems, where people stop in the job finder, and bookings by suburb.
- **Bookings:** every booking with status filters. Open one to see the customer's description, photos, contact details and a map link, and mark it completed or cancelled.

Until Supabase is connected the dashboard shows **sample data** with a banner saying so. Running locally with no password set lets you in without logging in; the live site stays locked until `DASHBOARD_PASSWORD` is set.

Tracking is anonymous: a random ID per browser tab, the page, and which job finder options were picked. No names, emails or IP addresses. Visits to `/dashboard` aren't counted.
