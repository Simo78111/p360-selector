// Phase 5b: Settings → Health & Safety → SWMS drafting settings. What the AI drafts from: Simon's instructions (from the
// Claude Project), the reference (company, matrix, H&S manual sections…) and the finished example documents it matches.
// 5c: the hazard and controls library sits at the top. Every save is a new version (each pack records the version it was drafted with). "Can approve H&S documents" edits.
import Link from "next/link";
import { EngineError, NotConnected } from "@/components/office/bits";
import { HsLibrary } from "@/components/office/hs/HsLibrary";
import { HsSettingsForm } from "@/components/office/hs/HsSettingsForm";
import { requireOffice } from "@/lib/auth";
import { loadHsSettings, type HsSettings } from "@/lib/hs";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "SWMS drafting settings" };

export default async function HsSettingsPage() {
  const session = await requireOffice("jobs");
  if (!officeEnabled()) return <NotConnected />;
  let st: HsSettings;
  try {
    st = await loadHsSettings(session);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-4" data-testid="hs-settings">
      <div>
        <p className="text-sm text-slate">
          <Link href="/dashboard/settings" className="hover:underline">Settings</Link> ·{" "}
          <Link href="/dashboard/office/health-safety" className="hover:underline">H&amp;S register</Link>
        </p>
        <h1 className="text-2xl font-bold">SWMS drafting settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          What the AI uses to draft every SWMS and JSA: your instructions, the reference material and the finished documents it
          matches. Changes apply to the next draft; documents already drafted keep the version they were made with.
        </p>
      </div>
      <HsLibrary tasks={st.library} canEdit={st.can_edit} />
      <HsSettingsForm settings={st} />
    </div>
  );
}
