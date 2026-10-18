import { Card } from "@/components/dashboard/ui";
import { fromAddress, officeAddress } from "@/lib/email";
import { pricing } from "@/lib/site";
import { TestEmailForm } from "./TestEmailForm";

const has = (name: string) => Boolean(process.env[name]);

export default function StatusPage() {
  const services = [
    { name: "Saving bookings and photos", detail: "Supabase", on: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY") },
    { name: "Booking emails", detail: `Resend, sent from ${fromAddress()}`, on: has("RESEND_API_KEY") },
    { name: "Fergus enquiries", detail: "Fergus API", on: has("FERGUS_API_TOKEN") },
    {
      name: "Online deposits",
      detail: pricing.depositsEnabled ? "Stripe" : "Switched off in site settings",
      on: pricing.depositsEnabled && has("STRIPE_SECRET_KEY"),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Status</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Connected services">
          <ul className="divide-y divide-black/5">
            {services.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-sm text-slate">{s.detail}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    s.on ? "bg-green-100 text-green-900" : "bg-mist text-slate"
                  }`}
                >
                  {s.on ? "✓ On" : "Off"}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Test email" subtitle={`New bookings are emailed to ${officeAddress()}.`}>
          <TestEmailForm defaultTo={officeAddress()} />
          <p className="mt-3 text-xs text-slate">Sends one plain email. No booking is created and nothing goes to Fergus.</p>
        </Card>
      </div>
    </div>
  );
}
