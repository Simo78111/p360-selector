// Schedule one phase from its job (Simon, 6 Nov, like Fergus): the job page's Schedule button opens this page in a
// pop-up. It's the Calendar board for the job's company (day / week, horizontal / vertical, drag, resize, the booking
// dialog, Send schedule) with a "Scheduling for PTSL-…" panel holding just this phase. When people have already worked
// on the job (bookings or timesheet hours, the job and its variations) only their rows show first, with "Show everyone".
// Outside the office layout on purpose (no top bar inside the pop-up); the same sign-in and "Can book the diary" apply.
import { EngineError, NotConnected } from "@/components/office/bits";
import { DiaryBoard } from "@/components/office/DiaryBoard";
import { requireOffice } from "@/lib/auth";
import { loadDiary, loadDiaryPhases, loadDiaryPool, loadJobSchedule, mondayOf, todayNz, type Diary, type DiaryPhase } from "@/lib/diary";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Schedule", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ d?: string; v?: string; o?: string; co?: string; p?: string }> };

export default async function SchedulePhasePage({ params, searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const { ref } = await params;
  const q = await searchParams;
  if (!/^[A-Za-z0-9-]{3,30}$/.test(ref)) return <Note text="That isn't a phase number." />;
  const view = q.v === "week" ? "week" : "day";
  const orientation = q.o === "v" ? "vertical" : "horizontal";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : todayNz();
  const from = view === "week" ? mondayOf(date) : date;
  const days = view === "week" ? 7 : 1;

  let diary: Diary;
  let phase: DiaryPhase | undefined;
  let pool: Record<string, string[]> = {};
  let worked: string[] = [];
  try {
    phase = (await loadDiaryPhases(session, ref, null)).find((p) => p.phase_ref.toLowerCase() === ref.toLowerCase());
    if (!phase) {
      return <Note text={`${ref} can't be booked from here: it isn't To Schedule, To Start or In Progress, or you don't have "Can book the diary" for its company.`} />;
    }
    const all = await loadDiary(session, from, days, null);
    const code = q.co ?? phase.company_code;
    const company = all.companies.find((c) => c.code === code) ?? null;
    diary = company ? await loadDiary(session, from, days, company.id) : all;
    pool = await loadDiaryPool(from, days);
    const sched = await loadJobSchedule(session, phase.job_id).catch(() => null);
    worked = (sched?.people ?? []).filter((p) => p.worked).map((p) => p.plumber_id);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <main className="min-h-screen bg-mist">
      <DiaryBoard
        key={`${from}-${view}-${q.co ?? ""}`}
        diary={diary}
        phases={[phase]}
        pool={pool}
        date={date}
        view={view}
        orientation={orientation}
        companyCode={q.co ?? phase.company_code}
        personFilter={q.p ?? ""}
        today={todayNz()}
        focus={{ phase, basePath: `/dashboard/schedule/${encodeURIComponent(phase.phase_ref)}`, worked }}
      />
    </main>
  );
}

function Note({ text }: { text: string }) {
  return <main className="p-6 text-sm text-slate">{text}</main>;
}
