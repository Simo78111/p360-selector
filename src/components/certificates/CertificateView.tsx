import type { GasCert } from "@/lib/automation";

const yn = (v: boolean | null | undefined) => (v === true ? "Yes" : v === false ? "No" : "—");

/** The signed Certificate of Compliance, laid out to print. */
export function CertificateView({ c }: { c: GasCert }) {
  const d = c.details;
  const rows: [string, string | undefined | null][] = [
    ["Location of the installation", d.location],
    ["Description of the work", d.description],
    ["Date(s) of the work", d.work_dates],
    ["Gasfitting done by", (d.workers ?? []).map((w) => `${w.name ?? ""}${w.reg ? ` (reg. ${w.reg})` : ""}${w.did ? ` — ${w.did}` : ""}`).join("; ")],
    ["Complies with AS/NZS 5601.1 (sections 3–6) or 5601.2 (sections 3–9)", yn(d.complies_5601)],
    ["Done in accordance with a certified design", yn(d.certified_design)],
    ["Relied on manufacturer's instructions", `${yn(d.manufacturer_instructions)}${d.manufacturer_reference ? ` — ${d.manufacturer_reference}` : ""}`],
    ["Other standards complied with", d.other_standards || "—"],
    ["Safe to connect to gas type", d.gas_type],
    ["Safe to connect at gas pressure", d.pressure],
    ["Parts safe to connect to a gas supply", d.safe_to_connect],
    ["Test results", d.test_results || "—"],
    ["Risk category", `${c.risk[0].toUpperCase()}${c.risk.slice(1)}-risk gasfitting`],
  ];
  return (
    <article className="rounded-2xl bg-white p-6 sm:p-10 print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate">{c.company}</p>
          <h1 className="text-2xl font-bold">Gas Certificate of Compliance</h1>
        </div>
        <p className="text-right text-sm">
          <strong>{c.cert_number}</strong><br />Job #{c.job_number} · {c.customer}
        </p>
      </header>
      <dl className="mt-4 divide-y divide-black/5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-2 sm:grid-cols-[18rem_1fr]">
            <dt className="text-slate">{k}</dt>
            <dd className="whitespace-pre-line">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-6 rounded-xl bg-mist p-4 text-sm">
        <p>
          I am satisfied that the gasfitting work has been done lawfully and safely, and that the information in this
          certificate is correct.
        </p>
        <p className="mt-3">
          <strong>{c.signed_name}</strong> · {c.issuer_name}{c.issuer_reg && `, registration ${c.issuer_reg}`}<br />
          Authentication mark: {c.auth_mark} · Signed electronically {c.signed_at}
        </p>
      </section>
      <p className="mt-4 text-xs text-slate">
        Issued under the Gas (Safety and Measurement) Regulations 2010. Keep this certificate with your property records.
      </p>
    </article>
  );
}
