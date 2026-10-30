import { EngineError, NotConnected } from "@/components/office/bits";
import { DiaryBoard } from "@/components/office/DiaryBoard";
import { requireOffice } from "@/lib/auth";
import { loadDiary, loadDiaryPhases, mondayOf, todayNz, type Diary, type DiaryPhase } from "@/lib/diary";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Diary" };

type Props = { searchParams: Promise<{ d?: string; v?: string; o?: string; co?: string; p?: string }> };

// The diary (schedule board), like Fergus's Calendar: a row per person plus Unassigned, day and week views,
// horizontal or vertical, drag to book, move and resize. Project 360 phases are booked here; the Plumbing 360 booking
// engine's appointments show read-only (its own scheduler books them).
export default async function DiaryPage({ searchParams }: Props) {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  const q = await searchParams;
  const view = q.v === "week" ? "week" : "day";
  const orientation = q.o === "v" ? "vertical" : "horizontal";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : todayNz();
  const from = view === "week" ? mondayOf(date) : date;
  const days = view === "week" ? 7 : 1;

  let diary: Diary;
  let phases: DiaryPhase[] = [];
  try {
    const all = await loadDiary(session, from, days, null);
    const company = all.companies.find((c) => c.code === q.co) ?? null;
    diary = company ? await loadDiary(session, from, days, company.id) : all;
    if (diary.companies.some((c) => c.can_book)) phases = await loadDiaryPhases(session, null, company?.id ?? null);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <DiaryBoard
      key={`${from}-${view}-${q.co ?? ""}`}
      diary={diary}
      phases={phases}
      date={date}
      view={view}
      orientation={orientation}
      companyCode={diary.companies.find((c) => c.code === q.co)?.code ?? ""}
      personFilter={q.p ?? ""}
      today={todayNz()}
    />
  );
}
