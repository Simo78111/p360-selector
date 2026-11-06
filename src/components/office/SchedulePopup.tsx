"use client";
// The phase card's Schedule button (Simon, 6 Nov, like Fergus): opens the Calendar for this phase in a pop-up over the
// job (/dashboard/schedule/<phase>). Close with ✕, Esc or a click outside: back to the job, which refreshes to show the
// new bookings.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function SchedulePopup({ phaseRef, booked }: { phaseRef: string; booked: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-[#1d3fce] px-5 py-2 text-sm font-semibold text-white" data-testid="schedule-open">
          Schedule
        </button>
        {booked && <span className="text-xs text-slate">{booked}</span>}
      </span>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={close} role="dialog" aria-modal="true"
          aria-label={`Scheduling for ${phaseRef}`} data-testid="schedule-popup">
          <div className="relative h-full w-full overflow-hidden rounded-2xl bg-mist shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={close} aria-label="Close and go back to the job"
              className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-lg font-bold text-white shadow">
              ✕
            </button>
            <iframe src={`/dashboard/schedule/${encodeURIComponent(phaseRef)}`} title={`Scheduling for ${phaseRef}`} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </>
  );
}
