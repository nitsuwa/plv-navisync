/**
 * Supabase client for PLV NaviSync.
 *
 * ✅ Now ready to connect! Just set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *    in your .env file and restart the dev server.
 *
 * If env vars are not set, the app gracefully falls back to mock data.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabaseClient: SupabaseClient | null = null;
let isConnected = false;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== "https://your-project-id.supabase.co") {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  isConnected = true;
  if (import.meta.env.DEV) {
    console.log("[Supabase] Client initialized successfully.");
  }
} else {
  if (import.meta.env.DEV) {
    console.warn(
      "[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY not configured.\n" +
      "The app will run with local mock data.\n" +
      "To connect, create a .env file based on .env.example."
    );
  }
}

export { supabaseClient as supabase, isConnected };
export const supabaseUrl_ = supabaseUrl;
export const supabaseAnonKey_ = supabaseAnonKey;

/**
 * Get the Supabase client. Throws if not connected.
 * Use this when you want a guaranteed client (e.g., after user login).
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(
      "Supabase is not connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
    );
  }
  return supabaseClient;
}
