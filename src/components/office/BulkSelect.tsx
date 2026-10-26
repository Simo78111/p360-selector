"use client";
// Tick-all box and the "n selected" count for the jobs list. The ticks themselves are
// plain checkboxes in the form, so the bulk buttons work even before this loads.
import { useEffect, useState } from "react";

export function SelectAll({ formId }: { formId: string }) {
  const [state, setState] = useState<"none" | "some" | "all">("none");

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const update = () => {
      const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="jobIds"]'));
      const n = boxes.filter((b) => b.checked).length;
      setState(n === 0 ? "none" : n === boxes.length ? "all" : "some");
      document.querySelectorAll<HTMLElement>("[data-selected-count]").forEach((el) => {
        el.textContent = n ? `${n} selected` : "Tick jobs to move or cancel them together";
      });
      document.querySelectorAll<HTMLButtonElement>("[data-needs-selection]").forEach((b) => (b.disabled = n === 0));
    };
    form.addEventListener("change", update);
    update();
    return () => form.removeEventListener("change", update);
  }, [formId]);

  return (
    <input
      type="checkbox"
      aria-label="Select all jobs"
      className="h-4 w-4 accent-aqua-deep"
      checked={state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      onChange={(e) => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        form?.querySelectorAll<HTMLInputElement>('input[name="jobIds"]').forEach((b) => (b.checked = e.target.checked));
        form?.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}
