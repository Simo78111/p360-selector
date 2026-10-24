import Link from "next/link";
import { resolveAction } from "@/app/dashboard/office-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { loadAttention, officeEnabled, type AttentionItem } from "@/lib/office";

export const metadata = { title: "Needs attention" };

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const kindLabel: Record<string, string> = {
  schedule_failed: "Couldn't find a time",
  priority_late: "Priority job booked late",
  reply_needs_attention: "Customer text",
  reply_from_unknown_number: "Text from unknown number",
  review_incomplete_job: "Job not finished",
  invoice_held: "Invoice held",
  route_problem: "Route doesn't fit",
  xero_failed: "Xero",
  xero_total_differs: "Xero total differs",
  invoice_overpaid: "Overpaid",
};

const waited = (min: number) =>
  min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`;

export default async function AttentionPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let items: AttentionItem[];
  try {
    items = await loadAttention();
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Needs attention</h1>
        <p className="mt-1 text-sm text-slate">
          The only things the system can&apos;t sort out on its own. Deal with each one, then mark it done.
        </p>
      </div>
      <Flash ok={ok} err={err} />

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate">All clear. Nothing needs you right now.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            return (
              <li
                key={item.id}
                className={`rounded-2xl border-l-4 bg-white p-5 ${item.severity === "urgent" ? "border-red-500" : "border-amber-400"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {kindLabel[item.kind] ?? item.kind.replaceAll("_", " ")}
                    {item.severity === "urgent" && <span className="ml-2 text-red-700">Urgent</span>}
                  </p>
                  <p className="text-xs text-slate">waiting {waited(item.waiting_min)}</p>
                </div>
                <p className="mt-1">{item.message}</p>
                {item.job_number && (
                  <Link href={`/dashboard/office/jobs/${item.job_number}`} className="mt-1 inline-block text-sm font-medium text-aqua-deep hover:underline">
                    Open job #{item.job_number} →
                  </Link>
                )}
                <form action={resolveAction} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="back" value="/dashboard/office/attention" />
                  <label className="sr-only" htmlFor={`note-${item.id}`}>Note</label>
                  <input
                    id={`note-${item.id}`}
                    name="note"
                    placeholder="What you did (optional)"
                    className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm"
                  />
                  <button name="decision" value="approve" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                    Done
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
