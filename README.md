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
2. Job finder: step-by-step questions with tips
3. Prices, job details, photos and Stripe deposit
4. Email notifications and Fergus enquiries
5. Owner dashboard and analytics
6. Launch
