/**
 * Supabase client factory.
 *
 * TO CONNECT:
 * 1. Install the package: pnpm add @supabase/supabase-js
 * 2. Set these env vars in your .env file:
 *    VITE_SUPABASE_URL=https://your-project.supabase.co
 *    VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 3. Uncomment the createClient line below.
 * 4. Replace the export with the live client.
 */

import { requireEnv } from "../config/env";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Validates that required Supabase env vars exist.
 * Returns true if both env vars are present, false otherwise.
 */
export function validateSupabaseConfig(): boolean {
  try {
    requireEnv("VITE_SUPABASE_URL");
    requireEnv("VITE_SUPABASE_ANON_KEY");
    return true;
  } catch {
    console.warn(
      "[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY not set.\n" +
      "The app will run with local mock data. Set these env vars to connect to Supabase."
    );
    return false;
  }
}

/** True when Supabase env vars are configured and the client will connect */
export const isSupabaseConnected = validateSupabaseConfig();

// ── Uncomment after installing @supabase/supabase-js ─────────────────────
// import { createClient } from "@supabase/supabase-js";
//
// export const supabase = createClient(
//   requireEnv("VITE_SUPABASE_URL"),
//   requireEnv("VITE_SUPABASE_ANON_KEY")
// );
//
// ── Helper: typed Supabase client for auto-completion ────────────────────
// import type { SupabaseClient } from "@supabase/supabase-js";
// import type { Database } from "./database.gen"; // generated via supabase gen types
// export type TypedSupabaseClient = SupabaseClient<Database>;
