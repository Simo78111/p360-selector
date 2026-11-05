"use client";
// "Add plans" on the job's Takeoff tab: uploads the PDF, then opens the new plan set in the takeoff.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlanUpload } from "./PlanUpload";

export function TakeoffTabUpload({ jobId, names, open }: { jobId: string; names: string[]; open: string }) {
  const router = useRouter();
  const [show, setShow] = useState(names.length === 0);
  if (!show) {
    return (
      <button type="button" onClick={() => setShow(true)} className="mt-3 rounded-full bg-mist px-4 py-2 text-sm font-semibold" data-testid="add-plans">
        Add plans
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-black/10 p-3">
      <PlanUpload jobId={jobId} names={names} onDone={(id) => router.push(`${open}?plan=${id}`)} />
    </div>
  );
}
