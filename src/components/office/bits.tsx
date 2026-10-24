import Link from "next/link";
import { statusLabel, tierTone, type JobCard, type JobStatus } from "@/lib/office";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const s = statusLabel[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

export function TierLabel({ tier }: { tier: JobCard["tier"] }) {
  return <span className={`text-xs font-semibold uppercase tracking-wide ${tierTone[tier]}`}>{tier}</span>;
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p
      role={err ? "alert" : "status"}
      className={`rounded-xl p-4 text-sm font-medium ${err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}
    >
      {err ?? ok}
    </p>
  );
}

export function NotConnected() {
  return (
    <div className="rounded-2xl bg-white p-6">
      <h1 className="text-xl font-bold">The booking engine isn&apos;t connected</h1>
      <p className="mt-2 text-sm text-slate">
        Add <code>ENGINE_SUPABASE_URL</code>, <code>ENGINE_SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
        <code>GOOGLE_MAPS_SERVER_KEY</code> in Vercel, then redeploy.
      </p>
    </div>
  );
}

export function EngineError({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-red-50 p-6 text-sm text-red-800" role="alert">
      Couldn&apos;t load from the booking engine: {message}
    </p>
  );
}

export function JobLink({ job, className = "" }: { job: Pick<JobCard, "job_number" | "service">; className?: string }) {
  return (
    <Link href={`/dashboard/office/jobs/${job.job_number}`} className={`font-semibold hover:text-aqua-deep hover:underline ${className}`}>
      #{job.job_number} {job.service}
    </Link>
  );
}

/** "Mon 26 Oct" from YYYY-MM-DD. */
export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const hours = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;
