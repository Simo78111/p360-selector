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
- `src/app/`: one folder per page.
- `src/components/`: header, footer, logo and shared UI.

## Roadmap

1. Foundations: brand, layout, main pages ✅
2. Job finder: step-by-step questions with tips ✅
3. Prices, job details, photos and Stripe deposit ✅ (Stripe keys still to add)
4. Email notifications and Fergus enquiries
5. Owner dashboard and analytics
6. Launch

## Job finder

The questions, tips and "call a pro" warnings live in `src/lib/finder.ts`. After editing, run:

```bash
npm run check:finder
```

It walks every path through the questions and fails if any path doesn't end in a result.

## Bookings and Stripe deposits

The booking form is at `/book` and is reached from a job finder result. Bookings are posted to `src/app/api/bookings/route.ts`.

**Payments are off until Stripe keys are added.** Without them, bookings go straight through as test bookings and no deposit is taken. To switch payments on:

1. In Stripe, go to **Developers → API keys** and copy the secret key (`sk_test_...` for testing, `sk_live_...` when going live).
2. Copy `.env.example` to `.env.local` and paste it in as `STRIPE_SECRET_KEY`. On Vercel, add it under **Settings → Environment Variables**.
3. In Stripe, go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Event: `checkout.session.completed`
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Set `NEXT_PUBLIC_SITE_URL` to the site's address.
5. Redeploy. The final button changes from "Send booking" to "Pay $50 deposit".

Test card: `4242 4242 4242 4242`, any future date, any CVC.

The deposit amount and its terms are in `src/lib/site.ts` (`pricing.depositAmount` and `pricing.depositTerms`).

> Bookings are currently only logged on the server (`src/lib/bookings-store.ts`). Phase 4 adds storage for bookings and photos, an email to the office, and a new enquiry in Fergus.
