/**
 * Supabase configuration validation.
 *
 * The live browser client lives in src/lib/supabase.ts and reads:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 * from .env.local (see .env.example). This module validates the presence of
 * those variables so other services can decide between Supabase and mock data.
 */

import { requireEnv } from "../config/env";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
// Backwards-compatible fallback for setups still using the older variable name.
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseKey = supabasePublishableKey ?? supabaseAnonKey;

/**
 * Validates that the required Supabase env vars exist.
 * Returns true if the URL and a key are present, false otherwise.
 */
export function validateSupabaseConfig(): boolean {
  try {
    requireEnv("VITE_SUPABASE_URL");
    if (!supabasePublishableKey && !supabaseAnonKey) {
      throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
    }
    return true;
  } catch {
    if (import.meta.env.DEV) {
      console.warn(
        "[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_PUBLISHABLE_KEY not set.\n" +
        "The app will run with local mock data. Set these env vars to connect to Supabase."
      );
    }
    return false;
  }
}

/** True when Supabase env vars are configured and the client will connect */
export const isSupabaseConnected = validateSupabaseConfig();
