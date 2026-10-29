import "server-only";
// The engine's public (browser) connection details, for pages where staff sign in with their own
// login. Publishable keys only allow what row-level security and the database functions allow, so
// they're safe in the browser. Picked from the engine URL, so the test site uses the test database.
import { isTestSite, TEST_DATABASE_REF } from "./test-mode";

const KNOWN: Record<string, string> = {
  [TEST_DATABASE_REF]: "sb_publishable_OMQrQgdAVnuEe4lz8VUm2w_Jsk95swP",
  swpzujthsmkicraeytan: "sb_publishable_64hug_Tv8DIjISCuoDnOEA_qnBZZlkW",
};

export function publicEngine(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_ENGINE_SUPABASE_URL || process.env.ENGINE_SUPABASE_URL ||
    (isTestSite() ? `https://${TEST_DATABASE_REF}.supabase.co` : "");
  if (!url) return null;
  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  if (isTestSite() && ref !== TEST_DATABASE_REF) return null;
  const key = process.env.NEXT_PUBLIC_ENGINE_SUPABASE_KEY || KNOWN[ref];
  return key ? { url, key } : null;
}
