import Link from "next/link";
import { eghrdDoneAction, resendCertAction } from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadGasCertificates, type GasCertRow } from "@/lib/automation";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Gas certificates" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const statusText: Record<string, string> = {
  draft: "Not sent yet", sent_for_signing: "With the certifier", signed: "Signed and sent to the customer", not_needed: "Not needed (low-risk)",
};

export default async function CertificatesPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let certs: GasCertRow[];
  try {
    certs = await loadGasCertificates();
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gas certificates</h1>
        <p className="mt-1 text-sm text-slate">
          Every finished gas job gets a Certificate of Compliance drafted from the job and emailed to the certifying gasfitter
          to complete and sign (Settings → Gas certificates). Kept for at least 7 years.
        </p>
      </div>
      <Flash ok={ok} err={err} />
      {certs.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate">No gas jobs finished yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-2xl bg-white px-5">
          {certs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">
                  {c.cert_number} · <Link href={`/dashboard/office/jobs/${c.job_number}`} className="text-aqua-deep hover:underline">job #{c.job_number}</Link>
                  <span className="ml-2 text-sm font-normal text-slate">{c.address}</span>
                </p>
                <p className="text-sm text-slate">
                  {statusText[c.status] ?? c.status}{c.issuer && ` · ${c.issuer}`} · {c.risk}-risk
                  {c.eghrd_due && (c.eghrd_done ? " · on the EGHRD" : ` · enter on the EGHRD by ${c.eghrd_due}`)}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                {c.view_token && <a href={`/certificate/${c.view_token}`} target="_blank" rel="noreferrer" className="rounded-full bg-mist px-3 py-1.5 font-semibold">View</a>}
                {(c.status === "draft" || c.status === "sent_for_signing") && (
                  <form action={resendCertAction}>
                    <input type="hidden" name="certId" value={c.id} />
                    <button className="rounded-full bg-ink px-3 py-1.5 font-semibold text-white">{c.status === "draft" ? "Send to sign" : "Send again"}</button>
                  </form>
                )}
                {c.eghrd_due && !c.eghrd_done && (
                  <form action={eghrdDoneAction}>
                    <input type="hidden" name="certId" value={c.id} />
                    <button className="rounded-full bg-mist px-3 py-1.5 font-semibold">Entered on the EGHRD</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
