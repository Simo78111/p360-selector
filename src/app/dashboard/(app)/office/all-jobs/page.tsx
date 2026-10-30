import Link from "next/link";
import { ClickableRow } from "@/components/office/ClickableRow";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { CompanyBadge, StageChip, StateBadge } from "@/components/office/jobs-ui";
import { input, primaryBtn } from "@/components/office/jm";
import { can, canEditCompany, requireOffice } from "@/lib/auth";
import { loadCompanies, type Company } from "@/lib/jm";
import {
  daysSince,
  isStage,
  loadJobList,
  loadPipelineCounts,
  nzDateTime,
  STAGES,
  type JobRow,
  type ListView,
  type PhaseRow,
  type PipelineCounts,
} from "@/lib/jobs";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "All jobs" };

type Props = { searchParams: Promise<{ ok?: string; err?: string; view?: string; q?: string; co?: string }> };

const OTHER_VIEWS: { id: ListView; label: string }[] = [
  { id: "on_hold", label: "On hold" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "Everything" },
];

function parseView(v: string | undefined): ListView {
  if (!v) return "open";
  if (v.startsWith("stage:") && isStage(v.slice(6))) return v as ListView;
  return (["open", "all", "on_hold", "closed", "cancelled"] as const).includes(v as "open") ? (v as ListView) : "open";
}

export default async function AllJobsPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err, q = "", co } = await searchParams;
  const view = parseView((await searchParams).view);
  let companies: Company[];
  let rows: (JobRow | PhaseRow)[];
  let counts: PipelineCounts;
  try {
    companies = (await loadCompanies()).filter((c) => can(session, "jobs", c.id));
    const company = companies.find((c) => c.code === co) ?? null;
    [rows, counts] = await Promise.all([
      loadJobList(session, view, q.trim(), company?.id ?? null),
      loadPipelineCounts(session, company?.id ?? null),
    ]);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  const company = companies.find((c) => c.code === co) ?? null;
  const canCreate = companies.some((c) => canEditCompany(session, c.id));
  const link = (v: ListView, c: string | null = company?.code ?? null) =>
    `/dashboard/office/all-jobs?view=${v}${c ? `&co=${c}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const stageView = view.startsWith("stage:");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">All jobs</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            Project 360 jobs and Plumbing 360 bookings together, showing the companies your role covers. Pick a stage to see
            what&apos;s waiting there, oldest first.
          </p>
        </div>
        {canCreate && (
          <Link href="/dashboard/office/all-jobs/new" className={primaryBtn} data-testid="new-job">
            + New job
          </Link>
        )}
      </div>
      <Flash ok={ok} err={err} />

      {companies.length > 1 && (
        <nav className="flex flex-wrap gap-1" aria-label="Company">
          {[{ code: null, name: "Both companies" }, ...companies.map((c) => ({ code: c.code, name: c.name }))].map((c) => (
            <Link
              key={c.code ?? "all"}
              href={link(view, c.code)}
              aria-current={(company?.code ?? null) === c.code ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                (company?.code ?? null) === c.code ? "bg-ink text-white" : "bg-white text-slate hover:text-ink"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <nav className="flex flex-wrap gap-1 rounded-2xl bg-white p-2" aria-label="Job lists" data-testid="pipeline-tabs">
        <Tab href={link("open")} on={view === "open"} label="Open" />
        {STAGES.map((s) => (
          <Tab
            key={s.id}
            href={link(`stage:${s.id}`)}
            on={view === `stage:${s.id}`}
            label={s.list}
            count={counts.stages.find((c) => c.id === s.id)?.count}
          />
        ))}
        {OTHER_VIEWS.map((v) => (
          <Tab key={v.id} href={link(v.id)} on={view === v.id} label={v.label} count={v.id === "on_hold" ? counts.on_hold : undefined} />
        ))}
      </nav>

      <form className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="view" value={view} />
        {company && <input type="hidden" name="co" value={company.code} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Job or phase number, customer, site, order number, phone…"
          aria-label="Search jobs"
          className={`${input} max-w-xl flex-1`}
        />
        <button className={primaryBtn}>Search</button>
        {q && <Link href={link(view).replace(/&q=[^&]*/, "")} className="self-center text-sm text-slate underline">Clear</Link>}
      </form>

      <section className="overflow-x-auto rounded-2xl bg-white">
        {stageView ? <PhaseTable rows={rows as PhaseRow[]} /> : <JobTable rows={rows as JobRow[]} />}
        {rows.length === 0 && <p className="p-6 text-sm text-slate">Nothing here{q ? ` matching “${q}”` : ""}.</p>}
        {rows.length >= 300 && <p className="p-4 text-xs text-slate">Showing the first 300. Search to narrow it down.</p>}
      </section>
    </div>
  );
}

function Tab({ href, on, label, count }: { href: string; on: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-aqua-pale text-aqua-deep" : "text-slate hover:text-ink"}`}
    >
      {label}
      {count !== undefined && count > 0 && <span className="ml-1 rounded-full bg-ink/10 px-1.5 text-xs font-bold">{count}</span>}
    </Link>
  );
}

const jobHref = (ref: string) => `/dashboard/office/job/${encodeURIComponent(ref)}`;

function JobTable({ rows }: { rows: JobRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full min-w-[760px] text-left text-sm" data-testid="jobs-table">
      <thead className="border-b border-black/5 text-xs text-slate">
        <tr>
          <th className="px-4 py-2">Job</th>
          <th className="px-4 py-2">Customer and site</th>
          <th className="px-4 py-2">Stage</th>
          <th className="px-4 py-2">Manager</th>
          <th className="px-4 py-2 text-right">Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/5">
        {rows.map((r) => (
          <ClickableRow key={r.job_id} href={jobHref(r.job_ref)} className="align-top hover:bg-mist/60">
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <CompanyBadge code={r.company} />
                <Link href={jobHref(r.job_ref)} className="font-semibold hover:underline">{r.kind === "booking" ? `#${r.job_ref}` : r.job_ref}</Link>
                {r.state !== "active" && <StateBadge state={r.state} />}
              </div>
              <p className="mt-0.5">{r.title}</p>
              <p className="text-xs text-slate">
                {r.kind === "booking" ? "Booking" : r.parent_ref ? `Variation of ${r.parent_ref}` : r.variations > 0 ? `${r.variations} variation${r.variations === 1 ? "" : "s"}` : ""}
                {r.order_number && ` · Order ${r.order_number}`}
              </p>
            </td>
            <td className="px-4 py-3">
              <p>{r.customer}</p>
              <p className="text-xs text-slate">{r.site}</p>
            </td>
            <td className="px-4 py-3">
              {r.kind === "booking" ? (
                <StageChip stage={r.stage} />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(r.stages ?? []).map((p) => <StageChip key={p.ref} stage={p.stage} prefix={p.ref.slice(r.job_ref.length)} />)}
                </div>
              )}
            </td>
            <td className="px-4 py-3 text-slate">{r.manager ?? ""}</td>
            <td className="px-4 py-3 text-right text-xs text-slate">{nzDateTime(r.updated_at)}</td>
          </ClickableRow>
        ))}
      </tbody>
    </table>
  );
}

function PhaseTable({ rows }: { rows: PhaseRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full min-w-[760px] text-left text-sm" data-testid="phases-table">
      <thead className="border-b border-black/5 text-xs text-slate">
        <tr>
          <th className="px-4 py-2">Phase</th>
          <th className="px-4 py-2">Customer and site</th>
          <th className="px-4 py-2">Stage</th>
          <th className="px-4 py-2">Manager</th>
          <th className="px-4 py-2 text-right">Waiting</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/5">
        {rows.map((r) => (
          <ClickableRow key={`${r.job_id}-${r.ref}`} href={jobHref(r.ref)} className="align-top hover:bg-mist/60">
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <CompanyBadge code={r.company} />
                <Link href={jobHref(r.ref)} className="font-semibold hover:underline">{r.kind === "booking" ? `#${r.ref}` : r.ref}</Link>
              </div>
              <p className="mt-0.5">{r.phase_name ?? r.title}</p>
              <p className="text-xs text-slate">
                {r.kind === "booking" ? "Booking" : r.title}
                {r.is_variation && " · variation"}
                {r.order_number && ` · Order ${r.order_number}`}
              </p>
            </td>
            <td className="px-4 py-3">
              <p>{r.customer}</p>
              <p className="text-xs text-slate">{r.site}</p>
            </td>
            <td className="px-4 py-3"><StageChip stage={r.stage} /></td>
            <td className="px-4 py-3 text-slate">{r.manager ?? ""}</td>
            <td className="px-4 py-3 text-right text-xs text-slate">
              {daysSince(r.since) === 0 ? "today" : `${daysSince(r.since)} day${daysSince(r.since) === 1 ? "" : "s"}`}
            </td>
          </ClickableRow>
        ))}
      </tbody>
    </table>
  );
}
