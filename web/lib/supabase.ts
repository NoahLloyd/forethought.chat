import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is *optional* for forethought.chat. When the three env vars
 * below are present, the chat history sidebar persists transcripts to
 * Postgres; when they are missing, the app falls back to localStorage
 * and the history sidebar simply shows the current session.
 *
 * Server routes always use the service role key so they can bypass
 * row-level security. The cookie-based anonymous user ID is the only
 * isolation boundary between users.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
// Supabase introduced new API keys in mid-2025: `sb_secret_…` replaces
// the legacy JWT-based `service_role` key. Brand-new projects (created
// after Nov 1 2025) only ship with the new format. We accept either
// env var name so the same wiring works for new and pre-existing
// projects, preferring the new SUPABASE_SECRET_KEY.
const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "";

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return URL.length > 0 && SECRET_KEY.length > 0;
}

export function getServerSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env",
    );
  }
  if (!cached) {
    cached = createClient(URL, SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
