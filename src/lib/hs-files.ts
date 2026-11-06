import "server-only";
// SWMS / JSA files (Phase 5b): build one document (SWMS or JSA, PDF or Word) from a pack, and file the approved pack
// on the job — all four files go into the job's Files with a caption, and the pack remembers which they are.
// Downloads from the tab are always built fresh (so they show the latest sign-ons); the filed copies are the record
// of what was approved.
import { randomUUID } from "node:crypto";
import type { OfficeSession } from "./auth";
import { engine } from "./engine";
import { loadHsPrint, saveHsFiles, type HsPrintRaw } from "./hs";
import { jsaLayout, swmsLayout, type HsPrint } from "./hs-layout";
import { layoutDocx } from "./hs-docx";
import { layoutPdf } from "./hs-pdf";
import { addFile, JOB_FILES_BUCKET } from "./jobs";

export type HsKind = "swms" | "jsa";
export type HsFormat = "pdf" | "docx";
const MIME: Record<HsFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** "0800776360" → "0800 776 360", "+6495550931" → "09 555 0931". */
export const nzPhone = (p: string | null) => {
  if (!p) return p;
  const d = p.replace(/^\+64\s?/, "0").replace(/\D/g, "");
  if (/^0[58]00\d{6}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[3-79]\d{7}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  if (/^02\d{7,9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return p;
};

export function toPrint(raw: HsPrintRaw): HsPrint {
  const c = raw.company;
  return {
    ...raw,
    company: { ...c, phone: nzPhone(c.phone),
      name: `${c.legal_name.replace(/\bLtd\b/, "Limited")}${c.name && c.name !== c.legal_name ? ` (${c.name})` : ""}` },
  };
}

export async function renderHs(x: HsPrint, kind: HsKind, format: HsFormat) {
  const layout = kind === "swms" ? swmsLayout(x) : jsaLayout(x);
  const bytes = format === "pdf" ? await layoutPdf(layout) : await layoutDocx(layout);
  return { bytes, name: `${layout.name}.${format}`, mime: MIME[format] };
}

export async function buildHsFile(s: OfficeSession, docId: string, kind: HsKind, format: HsFormat) {
  return renderHs(toPrint(await loadHsPrint(s, docId)), kind, format);
}

/** File the approved SWMS and JSA (PDF and Word) on the job. */
export async function fileHsDocs(s: OfficeSession, docId: string) {
  const db = engine();
  if (!db) throw new Error("The booking engine isn't connected");
  const raw = await loadHsPrint(s, docId);
  const x = toPrint(raw);
  const files: { file_id: string; kind: HsKind; format: HsFormat; name: string }[] = [];
  for (const kind of ["swms", "jsa"] as const) {
    for (const format of ["pdf", "docx"] as const) {
      const f = await renderHs(x, kind, format);
      const path = `${raw.job.id}/${randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await db.storage.from(JOB_FILES_BUCKET).upload(path, f.bytes, { contentType: f.mime });
      if (up.error) throw new Error(`Files: ${up.error.message}`);
      const caption = `${kind.toUpperCase()} v${raw.document.version_no} – ${raw.document.status === "sent" ? "issued" : "approved"} ${new Date().toLocaleDateString("en-NZ", { timeZone: "Pacific/Auckland" })}`;
      const id = await addFile(s, raw.job.id, null, path, f.name, f.mime, f.bytes.length, caption);
      files.push({ file_id: id, kind, format, name: f.name });
    }
  }
  return saveHsFiles(s, docId, files);
}
