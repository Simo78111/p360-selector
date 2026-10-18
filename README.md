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

## Owner dashboard

Go to `/dashboard` and log in with `DASHBOARD_PASSWORD`. Changing the password logs everyone out.

- **Overview:** visitors, job finder starts, people who fixed it themselves, bookings and deposits, each compared with the period before. Also visitors per day, the visit-to-booking funnel, the most common problems, where people stop in the job finder, and bookings by suburb.
- **Bookings:** every booking with status filters. Open one to see the customer's description, photos, contact details and a map link, and mark it completed or cancelled.

Until Supabase is connected the dashboard shows **sample data** with a banner saying so. Running locally with no password set lets you in without logging in; the live site stays locked until `DASHBOARD_PASSWORD` is set.

Tracking is anonymous: a random ID per browser tab, the page, and which job finder options were picked. No names, emails or IP addresses. Visits to `/dashboard` aren't counted.
