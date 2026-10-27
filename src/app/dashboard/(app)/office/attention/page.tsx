import Link from "next/link";
import { aiRepliesAction, replyTextAction, resolveAction } from "@/app/dashboard/office-actions";
import { eghrdDoneAction, orderPlacedAction } from "@/app/dashboard/automation-actions";
import { EngineError, Flash, NotConnected } from "@/components/office/bits";
import { QuoteReview } from "@/components/office/QuoteReview";
import { loadAttentionRefs, loadQuote, type AttentionRefs, type Quote } from "@/lib/automation";
import { loadAttention, loadTextSettings, officeEnabled, type AttentionItem, type TextSettings } from "@/lib/office";

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
  follow_up_recommended: "Follow-up recommended",
  eta_keeps_moving: "Arrival keeps moving",
  order_needs_placing: "Order to place",
  reschedule_no_reply: "No reply to new times",
  plumber_off_unplaced: "Plumber off: job to rebook",
  gas_certificate_no_certifier: "Gas certificate",
  eghrd_entry_due: "EGHRD entry due",
};

const waited = (min: number) =>
  min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`;

export default async function AttentionPage({ searchParams }: Props) {
  if (!officeEnabled()) return <NotConnected />;
  const { ok, err } = await searchParams;
  let items: AttentionItem[];
  let texts: TextSettings;
  let refs: AttentionRefs;
  const quotes: Record<string, Quote | null> = {};
  try {
    [items, texts, refs] = await Promise.all([loadAttention(), loadTextSettings(), loadAttentionRefs()]);
    await Promise.all(Object.values(refs).filter((r) => r.quote_id).map(async (r) => {
      quotes[r.quote_id!] = await loadQuote(r.quote_id!);
    }));
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

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
        <div className="text-sm">
          <p className="font-semibold">Text assistant</p>
          <p className="text-slate">
            {texts.ai_replies === "auto"
              ? "Answers routine customer texts itself (times, invoices, gate codes) and passes everything else to you."
              : texts.ai_replies === "suggest"
                ? "Suggests a reply for each customer text. Nothing is sent until you send it."
                : "Off. Every customer text comes to you."}
            {texts.sms_mode === "test" && " Texts are in test mode, so nothing reaches customers yet."}
          </p>
        </div>
        <form action={aiRepliesAction} className="flex gap-1 rounded-full bg-mist p-1 text-sm" aria-label="Text assistant">
          {(["auto", "suggest", "off"] as const).map((m) => (
            <button key={m} name="mode" value={m} aria-pressed={texts.ai_replies === m}
                    className={`rounded-full px-3 py-1.5 font-medium ${texts.ai_replies === m ? "bg-ink text-white" : "text-slate hover:text-ink"}`}>
              {{ auto: "Answer", suggest: "Suggest only", off: "Off" }[m]}
            </button>
          ))}
        </form>
      </section>

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
                {item.ai_summary && (
                  <p className="mt-2 rounded-xl bg-aqua-pale/60 px-3 py-2 text-sm">
                    <span className="font-semibold">Assistant:</span> {item.ai_summary}
                    {item.ai_sent && item.ai_reply && <span className="block text-slate">Replied: &ldquo;{item.ai_reply}&rdquo;</span>}
                  </p>
                )}
                {item.kind === "reply_needs_attention" && (
                  <form action={replyTextAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={item.id} />
                    <label className="block text-sm font-medium" htmlFor={`reply-${item.id}`}>
                      {item.ai_reply && !item.ai_sent ? "Suggested reply (edit if you like)" : "Reply by text"}
                    </label>
                    <textarea
                      id={`reply-${item.id}`}
                      name="text"
                      rows={2}
                      maxLength={480}
                      required
                      defaultValue={item.ai_reply && !item.ai_sent ? item.ai_reply : ""}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                    />
                    <button className="rounded-full bg-aqua px-4 py-2 text-sm font-semibold text-ink">Send reply and close</button>
                  </form>
                )}
                {refs[item.id]?.quote_id && quotes[refs[item.id].quote_id!] && (
                  <QuoteReview quote={quotes[refs[item.id].quote_id!]!} back="/dashboard/office/attention" />
                )}
                {item.kind === "order_needs_placing" && refs[item.id]?.po_id && (
                  <form action={orderPlacedAction} className="mt-2">
                    <input type="hidden" name="poId" value={refs[item.id].po_id} />
                    <input type="hidden" name="back" value="/dashboard/office/attention" />
                    <button className="rounded-full bg-aqua px-4 py-2 text-sm font-semibold text-ink">I&apos;ve placed the order</button>
                  </form>
                )}
                {item.kind === "eghrd_entry_due" && refs[item.id]?.cert_id && (
                  <form action={eghrdDoneAction} className="mt-2">
                    <input type="hidden" name="certId" value={refs[item.id].cert_id} />
                    <input type="hidden" name="back" value="/dashboard/office/attention" />
                    <button className="rounded-full bg-aqua px-4 py-2 text-sm font-semibold text-ink">Entered on the EGHRD</button>
                  </form>
                )}
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
