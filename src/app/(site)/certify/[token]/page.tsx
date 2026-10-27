import { notFound } from "next/navigation";
import { CertificateView } from "@/components/certificates/CertificateView";
import { Container } from "@/components/ui";
import { gasCertByToken } from "@/lib/automation";
import { notNeededAction, signCertificateAction } from "../actions";

export const metadata = { title: "Sign gas certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const field = "w-full rounded-xl border border-black/15 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

function YesNo({ name, legend, value }: { name: string; legend: string; value: boolean | null | undefined }) {
  return (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className="mt-1 flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name={name} value="yes" required defaultChecked={value === true} /> Yes
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={name} value="no" defaultChecked={value === false} /> No
        </label>
      </div>
    </fieldset>
  );
}

export default async function CertifyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { ok, err } = await searchParams;
  if (!/^[a-f0-9]{32,}$/.test(token)) notFound();
  const c = await gasCertByToken(token).catch(() => null);
  if (!c || !c.signing) notFound();

  if (c.status === "signed") {
    return (
      <Container className="max-w-3xl space-y-4 py-10">
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          {ok === "signed" ? "Signed. The customer has been sent their copy. Thank you." : "This certificate has been signed."}
        </p>
        <CertificateView c={c} />
      </Container>
    );
  }
  if (c.status === "not_needed") {
    return (
      <Container className="max-w-3xl py-10">
        <p className="rounded-xl bg-mist p-4 text-sm">Marked as not needing a certificate: {c.details.not_needed_reason}</p>
      </Container>
    );
  }

  const d = c.details;
  const w = d.workers?.[0];
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-2xl font-bold">Gas Certificate of Compliance {c.cert_number}</h1>
      <p className="mt-1 text-sm text-slate">
        Job #{c.job_number} for {c.customer}. We&apos;ve filled in what we know from the job — check it, complete the gas
        details and sign. Required under the Gas (Safety and Measurement) Regulations 2010, regs 47–48.
      </p>
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}

      <form action={signCertificateAction} className="mt-6 space-y-5 rounded-2xl bg-white p-5 sm:p-6">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className={label} htmlFor="location">Location of the installation</label>
          <input id="location" name="location" required defaultValue={d.location ?? ""} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="description">Description of the work</label>
          <textarea id="description" name="description" required rows={4} defaultValue={d.description ?? ""} className={field} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="work_dates">Date(s) of the work</label>
            <input id="work_dates" name="work_dates" required defaultValue={d.work_dates ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="worker_name">Done by</label>
            <input id="worker_name" name="worker_name" required defaultValue={w?.name ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="worker_reg">their registration no.</label>
            <input id="worker_reg" name="worker_reg" defaultValue={w?.reg ?? ""} className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="worker_did">What they did (if different people did different parts)</label>
          <input id="worker_did" name="worker_did" defaultValue={w?.did ?? ""} className={field} />
        </div>

        <fieldset>
          <legend className={label}>Risk category</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            {(["low", "general", "high"] as const).map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="radio" name="risk" value={r} required defaultChecked={c.risk === r} /> {r[0].toUpperCase() + r.slice(1)}-risk
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <YesNo name="complies_5601" legend="Complies with AS/NZS 5601.1 (s. 3–6) or 5601.2 (s. 3–9)" value={d.complies_5601} />
          <YesNo name="certified_design" legend="Done to a certified design" value={d.certified_design} />
          <YesNo name="manufacturer_instructions" legend="Relied on manufacturer's instructions" value={d.manufacturer_instructions} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="manufacturer_reference">Manufacturer&apos;s instructions / design: where to find them</label>
            <input id="manufacturer_reference" name="manufacturer_reference" defaultValue={d.manufacturer_reference ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="other_standards">Other standards complied with</label>
            <input id="other_standards" name="other_standards" defaultValue={d.other_standards ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="gas_type">Safe to connect to gas type</label>
            <select id="gas_type" name="gas_type" required defaultValue={d.gas_type ?? ""} className={field}>
              <option value="" disabled>Choose…</option>
              <option>Natural gas</option>
              <option>LPG</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="pressure">Safe to connect at pressure</label>
            <input id="pressure" name="pressure" required placeholder="e.g. 2.75 kPa" defaultValue={d.pressure ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="safe_to_connect">Parts safe to connect</label>
            <input id="safe_to_connect" name="safe_to_connect" required defaultValue={d.safe_to_connect ?? "Whole installation"} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="test_results">Test results</label>
            <input id="test_results" name="test_results" placeholder="e.g. Tightness test passed" defaultValue={d.test_results ?? ""} className={field} />
          </div>
        </div>

        <div className="grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="issuer_name">Certifier</label>
            <input id="issuer_name" name="issuer_name" required defaultValue={c.issuer_name ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="issuer_reg">Registration no. (or employer licence no.)</label>
            <input id="issuer_reg" name="issuer_reg" required defaultValue={c.issuer_reg ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="auth_mark">Authentication mark (reg 85B)</label>
            <input id="auth_mark" name="auth_mark" required defaultValue={c.auth_mark ?? ""} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="signed_name">Type your full name to sign</label>
            <input id="signed_name" name="signed_name" required autoComplete="name" className={field} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="declaration" required className="mt-1 h-4 w-4" />
          I am satisfied that the gasfitting work has been done lawfully and safely, and that the information in this
          certificate is correct.
        </label>
        <button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white">Sign and send to the customer</button>
      </form>

      <form action={notNeededAction} className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl bg-mist p-4 text-sm">
        <input type="hidden" name="token" value={token} />
        <div className="min-w-0 flex-1">
          <label className={label} htmlFor="reason">Low-risk work — no certificate needed? Say why</label>
          <input id="reason" name="reason" required placeholder="e.g. Like-for-like appliance replacement (reg 5A)" className={field} />
        </div>
        <button className="rounded-full bg-white px-4 py-2 font-semibold">No certificate needed</button>
      </form>
    </Container>
  );
}
