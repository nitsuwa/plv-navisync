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
const supabaseAuthStorageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : null;
const SIGN_OUT_FETCH_TIMEOUT_MS = 2_000;
const AUTH_USER_CACHE_TTL_MS = 1_500;
const inFlightAuthUserRequests = new Map<string, Promise<Response>>();
const cachedAuthUserResponses = new Map<string, { response: Response; expiresAt: number }>();

const authFetch: typeof fetch = async (input, init) => {
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const requestMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const isAuthUserRequest = requestUrl.includes("/auth/v1/user");

  // Several independent services verify the same signed-in user during route
  // bootstrap. Reuse only a very recent successful answer for the exact token;
  // each caller gets a Response clone and RLS still authorizes DB requests.
  if (isAuthUserRequest && requestMethod.toUpperCase() === "GET" && !requestSignal) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const requestKey = `${requestUrl}\n${headers.get("Authorization") ?? ""}`;
    const cached = cachedAuthUserResponses.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) return cached.response.clone();
    if (cached) cachedAuthUserResponses.delete(requestKey);

    let request = inFlightAuthUserRequests.get(requestKey);
    if (!request) {
      request = fetch(input, init);
      inFlightAuthUserRequests.set(requestKey, request);
    }
    try {
      const response = await request;
      if (response.ok) {
        if (cachedAuthUserResponses.size >= 8) cachedAuthUserResponses.clear();
        cachedAuthUserResponses.set(requestKey, {
          response: response.clone(),
          expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
        });
      }
      return response.clone();
    } finally {
      if (inFlightAuthUserRequests.get(requestKey) === request) {
        inFlightAuthUserRequests.delete(requestKey);
      }
    }
  }

  if (isAuthUserRequest) {
    const response = await fetch(input, init);
    if (response.ok && requestMethod.toUpperCase() !== "GET") cachedAuthUserResponses.clear();
    return response;
  }

  if (!requestUrl.includes("/auth/v1/logout")) return fetch(input, init);
  cachedAuthUserResponses.clear();

  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), SIGN_OUT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};

let supabaseClient: SupabaseClient<Database> | null = null;
let isConnected = false;

if (supabaseUrl && supabaseKey && supabaseUrl !== PLACEHOLDER_URL) {
  supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: supabaseAuthStorageKey ?? undefined,
      fetch: authFetch,
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
export { supabaseAuthStorageKey };

/**
 * Clear only this client's persisted session after the official signOut call
 * fails or stalls. Supabase JS 2.x performs a remote logout before removing
 * local storage, and a rejected fetch can skip its normal local cleanup.
 */
export function clearPersistedSupabaseSession(expectedAccessToken?: string): boolean {
  if (!supabaseAuthStorageKey || typeof window === "undefined") return false;
  try {
    const savedSession = window.localStorage.getItem(supabaseAuthStorageKey);
    if (expectedAccessToken && savedSession) {
      try {
        const parsed: unknown = JSON.parse(savedSession);
        if (parsed && typeof parsed === "object" && "access_token" in parsed
          && typeof parsed.access_token === "string" && parsed.access_token !== expectedAccessToken) {
          // A newer login replaced the session while the remote logout settled.
          return true;
        }
      } catch {
        // Remove a malformed value under the exact session key.
      }
    }
    window.localStorage.removeItem(supabaseAuthStorageKey);
    window.localStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
    window.localStorage.removeItem(`${supabaseAuthStorageKey}-user`);
    return true;
  } catch {
    return false;
  }
}

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
