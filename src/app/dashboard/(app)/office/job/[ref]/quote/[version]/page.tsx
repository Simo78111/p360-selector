import { notFound } from "next/navigation";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { QuoteBuilder } from "@/components/office/QuoteBuilder";
import { requireOffice } from "@/lib/auth";
import { officeEnabled } from "@/lib/office";
import { loadQuote, type OfficeQuote } from "@/lib/quotes";

export const metadata = { title: "Quote" };

type Props = { params: Promise<{ ref: string; version: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function QuotePage({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ref, version } = await params;
  const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(version)) notFound();
  let q: OfficeQuote;
  try {
    q = await loadQuote(session, version);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(m)) notFound();
    return <EngineError message={m} />;
  }
  const jobPath = `/dashboard/office/job/${encodeURIComponent(q.job_ref || decodeURIComponent(ref))}`;
  return (
    <div className="space-y-3">
      <Flash ok={ok} err={err} />
      <QuoteBuilder initial={q} jobPath={jobPath} />
    </div>
  );
}
