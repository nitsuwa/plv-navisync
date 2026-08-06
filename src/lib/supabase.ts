/**
 * Supabase browser client for PLV NaviSync.
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from the Vite
 * environment (see .env.example). The publishable (anon) key is safe to ship
 * to the browser — the service-role key must NEVER be used on the client.
 *
 * If env vars are not set, the app gracefully falls back to mock data.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../types/database.generated";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
// Backwards-compatible fallback for setups still using the older variable name.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseKey = supabasePublishableKey ?? supabaseAnonKey;

const PLACEHOLDER_URL = "https://your-project-id.supabase.co";

let supabaseClient: SupabaseClient<Database> | null = null;
let isConnected = false;

if (supabaseUrl && supabaseKey && supabaseUrl !== PLACEHOLDER_URL) {
  supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  isConnected = true;
  if (import.meta.env.DEV) {
    console.log("[Supabase] Client initialized successfully.");
  }
} else {
  if (import.meta.env.DEV) {
    console.warn(
      "[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_PUBLISHABLE_KEY not configured.\n" +
      "The app will run with local mock data.\n" +
      "To connect, create a .env file based on .env.example."
    );
  }
}

export { supabaseClient as supabase, isConnected };
export const supabaseUrl_ = supabaseUrl;
export const supabaseKey_ = supabaseKey;

/** Generated `profiles` row shape used by the authentication flows. */
export type Profile = Tables<"profiles">;

/**
 * Get the Supabase client. Throws if not connected.
 * Use this when you want a guaranteed client (e.g., after user login).
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseClient) {
    throw new Error(
      "Supabase is not connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file."
    );
  }
  return supabaseClient;
}
