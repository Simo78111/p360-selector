"use client";
// Tool register: add or replace a tool's photo. It goes straight from the phone or computer to storage with a one-off
// address, then is linked to the tool.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishAssetPhotoAction, startAssetPhotoAction } from "@/app/dashboard/asset-actions";

const MAX = 15 * 1024 * 1024;

export function AssetPhotoUpload({ assetId, has }: { assetId: string; has: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX) return setError("That photo is over 15 MB.");
    setBusy(true);
    const start = await startAssetPhotoAction(assetId, file.name);
    if (!start.ok) {
      setError(start.error);
      return setBusy(false);
    }
    const put = await fetch(start.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    if (!put.ok) {
      setError(`Couldn't upload the photo (${put.status}).`);
      return setBusy(false);
    }
    const fin = await finishAssetPhotoAction(assetId, start.data.path);
    if (!fin.ok) setError(fin.error);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm" data-testid="asset-photo-upload">
      <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold hover:border-slate-500">
        {busy ? "Uploading…" : has ? "Replace photo" : "+ Add photo"}
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only"
          aria-label="Photo of the tool" onChange={upload} disabled={busy} />
      </label>
      {error && <span className="font-medium text-red-700" role="alert">{error}</span>}
    </span>
  );
}
