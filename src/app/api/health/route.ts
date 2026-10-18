import { NextResponse } from "next/server";
import { pricing } from "@/lib/site";

// Reports which services are switched on, as yes/no only. Never returns key
// values. Handy for checking Vercel settings took effect after a redeploy.
export const dynamic = "force-dynamic";

const has = (name: string) => Boolean(process.env[name]);

export function GET() {
  const from = process.env.EMAIL_FROM ?? "";
  return NextResponse.json({
    supabase: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
    email: {
      apiKey: has("RESEND_API_KEY"),
      officeEmail: has("OFFICE_EMAIL"),
      // Only the domain, so a typo in it is easy to spot.
      fromDomain: from.match(/@([^>\s]+)/)?.[1] ?? null,
    },
    fergus: has("FERGUS_API_TOKEN"),
    stripe: { depositsEnabled: pricing.depositsEnabled, secretKey: has("STRIPE_SECRET_KEY"), webhookSecret: has("STRIPE_WEBHOOK_SECRET") },
    dashboardPassword: has("DASHBOARD_PASSWORD"),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
