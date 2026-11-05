// The full-screen takeoff for a job (Phase 4). Reading needs the office "jobs" area; changing needs "Can do takeoffs"
// (checked by the database). Desktop only.
import { notFound } from "next/navigation";
import { EngineError, NotConnected } from "@/components/office/bits";
import { TakeoffEditor } from "@/components/office/takeoff/TakeoffEditor";
import { requireOffice } from "@/lib/auth";
import { loadJobPage } from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";
import { loadTakeoff, type Takeoff } from "@/lib/takeoff";
import { isTestSite } from "@/lib/test-mode";

export const metadata = { title: "Takeoff" };

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ plan?: string }> };

export default async function TakeoffPage({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ref } = await params;
  const { plan } = await searchParams;
  let t: Takeoff | null = null;
  try {
    const job = await loadJobPage(session, decodeURIComponent(ref));
    if (job?.kind === "managed") t = await loadTakeoff(session, job.job_id);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(m)) notFound();
    return <EngineError message={m} />;
  }
  if (!t) notFound();   // takeoffs are for managed jobs
  const jobPath = `/dashboard/office/job/${encodeURIComponent(t.job.ref)}`;
  return <TakeoffEditor initial={t} jobPath={jobPath} testSite={isTestSite()} startPlan={plan} />;
}
