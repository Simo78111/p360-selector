import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service role key. It bypasses Row
// Level Security, so it must never be imported into browser code.
// Switched on by SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client;
}

export const PHOTO_BUCKET = "booking-photos";
