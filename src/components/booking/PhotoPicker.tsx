"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/booking";

export type PickedPhoto = { id: string; name: string; blob: Blob; url: string };

const MAX_EDGE = 1600;

/** Shrinks a photo in the browser so uploads stay small and fast on mobile data. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch {
    // Formats the browser can't decode fall through to the original file.
  }
  return file;
}

export function PhotoPicker({ photos, onChange }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Release preview URLs when the picker goes away.
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (chosen.length < files.length) setError("Only photos can be added.");
    if (chosen.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);

    setBusy(true);
    const added: PickedPhoto[] = [];
    for (const file of chosen.slice(0, room)) {
      const blob = await shrink(file);
      if (blob.size > MAX_PHOTO_BYTES) {
        setError(`"${file.name}" is too large. Try a screenshot of it instead.`);
        continue;
      }
      added.push({ id: crypto.randomUUID(), name: file.name, blob, url: URL.createObjectURL(blob) });
    }
    setBusy(false);
    onChange([...photos, ...added]);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-mist">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a picked file */}
            <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-white hover:bg-ink"
              aria-label={`Remove ${p.name}`}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-aqua bg-aqua-pale text-center text-sm font-medium text-aqua-deep hover:bg-aqua-light focus-within:outline-3 focus-within:outline-aqua-deep">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {busy ? "Adding…" : "Add photo"}
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => add(e.target.files)}
              disabled={busy}
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-sm text-slate">
        Optional, but it really helps. Up to {MAX_PHOTOS} photos of the problem, the area around it, and any labels or
        model numbers.
      </p>
      {error && (
        <p className="mt-2 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
