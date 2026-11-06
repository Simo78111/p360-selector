"use client";
// Phase 5c: add (or replace) the photo of a licence or ticket card. The photo goes straight from the phone or computer
// to storage with a one-off address, then is linked to the licence.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishCardUploadAction, startCardUploadAction } from "@/app/dashboard/jm-actions";

const MAX = 15 * 1024 * 1024;

export function CardPhotoUpload({ staffId, licenceId, has }: { staffId: string; licenceId: string; has: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX) {
      setError("That photo is over 15 MB.");
      return;
    }
    setBusy(true);
    const start = await startCardUploadAction(staffId, file.name);
    if (!start.ok) {
      setError(start.error);
      setBusy(false);
      return;
    }
    const put = await fetch(start.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) {
      setError(`Couldn't upload the photo (${put.status}).`);
      setBusy(false);
      return;
    }
    const fin = await finishCardUploadAction(staffId, licenceId, start.data.path, file.name);
    if (!fin.ok) setError(fin.error);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs" data-testid="card-upload">
      <label className="cursor-pointer font-semibold text-aqua-deep underline">
        {busy ? "Uploading…" : has ? "Replace card photo" : "+ Card photo"}
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only"
          aria-label="Photo of the card" onChange={upload} disabled={busy} />
      </label>
      {error && <span className="font-medium text-red-700" role="alert">{error}</span>}
    </span>
  );
}
