import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import { partsReadyView } from "@/lib/automation";
import { cantSupplyAction, readyAction } from "../actions";

export const metadata = { title: "Ready for pickup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }) : null;

export default async function PartsReadyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { ok, err } = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const o = await partsReadyView(token).catch(() => null);
  if (!o) notFound();

  const waiting = o.status === "ordered" && !o.ready_at;
  return (
    <Container className="max-w-xl space-y-5 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-aqua-deep">Urgent order · courier pickup</p>
        <h1 className="mt-1 text-2xl font-bold">{o.po_number} for {o.company}</h1>
        <p className="mt-1 text-sm text-slate">
          {o.branch}{o.account && ` · account ${o.account}`} · job #{o.job_number}
        </p>
      </div>

      {ok === "ready" && (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">Thanks — the courier is being booked now. They&apos;ll ask for {o.po_number} at the counter.</p>
      )}
      {ok === "cant" && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Thanks — we&apos;ll sort it out from our end.</p>}
      {err && <p className="rounded-xl bg-red-50 p-4 text-red-800">{err}</p>}

      <section className="rounded-2xl bg-white p-5">
        <h2 className="font-bold">Please pick</h2>
        <ul className="mt-2 divide-y divide-black/5 text-lg">
          {o.lines.map((l, i) => (
            <li key={i} className="flex gap-3 py-2">
              <span className="w-12 font-bold">{Number(l.quantity)} x</span>
              <span>{l.code && <span className="mr-2 font-mono text-base text-slate">{l.code}</span>}{l.description}</span>
            </li>
          ))}
        </ul>
      </section>

      {waiting ? (
        <>
          <form action={readyAction} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <label className="block text-sm font-medium" htmlFor="note">Note for us (optional)</label>
            <input id="note" name="note" maxLength={500} placeholder="e.g. On the shelf behind the counter"
              className="w-full rounded-xl border border-black/15 px-3 py-2" />
            <button className="w-full rounded-2xl bg-aqua-deep px-6 py-5 text-xl font-bold text-white">Ready for pickup</button>
            <p className="text-center text-sm text-slate">Press when it&apos;s packed at the counter. This books an Uber courier to collect it.</p>
          </form>
          <details className="rounded-2xl bg-white p-5">
            <summary className="cursor-pointer font-semibold">Can&apos;t supply something?</summary>
            <form action={cantSupplyAction} className="mt-3 space-y-3">
              <input type="hidden" name="token" value={token} />
              <label className="block text-sm font-medium" htmlFor="why">What&apos;s the problem?</label>
              <input id="why" name="note" required maxLength={500} placeholder="e.g. Out of stock, nearest is Penrose"
                className="w-full rounded-xl border border-black/15 px-3 py-2" />
              <button className="rounded-full bg-ink px-5 py-2 font-semibold text-white">Tell them</button>
            </form>
          </details>
        </>
      ) : (
        <p className="rounded-xl bg-mist p-4 text-sm">
          {o.ready_at ? `Marked ready at ${time(o.ready_at)}.` : "We're sorting this order from our end."}
          {o.courier_name && ` Courier: ${o.courier_name}`}{o.pickup_eta && `, due about ${time(o.pickup_eta)}`}
          {o.ready_note && ` Note: ${o.ready_note}`}
        </p>
      )}
    </Container>
  );
}
