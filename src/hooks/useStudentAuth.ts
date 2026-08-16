/**
 * useStudentAuth — real Supabase authentication state for the student UI.
 *
 * - Restores the persisted Supabase session on mount (survives page refresh).
 * - Fetches the authenticated user's matching row from `public.profiles`.
 * - Exposes `isStudent` = profile exists, role === "student", and is_active.
 * - `loading` is true until the initial session AND profile check finish.
 * - `signOut` ends the Supabase session (used by all student logout controls).
 *
 * This replaces the legacy sessionStorage-based "plv-student-auth" check.
 * Guests (no session) get profile = null, isStudent = false.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase, isConnected, type Profile } from "../lib/supabase";

export interface StudentAuthState {
  /** The authenticated user's profile row, or null for guests / non-students. */
  profile: Profile | null;
  /** True until the initial session + profile check finishes. */
  loading: boolean;
  /** True only for an active student profile (role === "student", is_active). */
  isStudent: boolean;
  /** Display name for menus/headers (first + last name, else email local part). */
  username: string;
  /** Derived role kept for compatibility with the existing student UI. */
  role: "student" | "faculty";
  /** Ends the Supabase session and clears local student state. */
  signOut: () => Promise<void>;
}

export function useStudentAuth(): StudentAuthState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No Supabase configuration — the app is running in mock-data mode.
    if (!isConnected || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadProfile = async (userId: string) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!mounted) return;
      setProfile(!error && data ? (data as Profile) : null);
      setLoading(false);
    };

    const revalidate = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      await loadProfile(data.user.id);
    };

    // Restore and validate the persisted identity against the Auth server.
    // getSession() alone trusts local storage and can temporarily preserve an
    // expired identity until the next refresh attempt.
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (!error && data.user) {
        void loadProfile(data.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Keep state in sync with sign-in / sign-out / token refresh.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      if (nextSession) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Profile activation is live database authorization state, not a JWT
    // claim. Recheck it while the portal is open and when the tab regains
    // focus so an administrator's deactivation takes effect without logout.
    const interval = window.setInterval(() => void revalidate(), 15_000);
    const handleFocus = () => void revalidate();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    setLoading(false);
  }, []);

  const isStudent = !!profile && profile.role === "student" && profile.is_active;
  const username = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
      profile.email.split("@")[0] ||
      "Student"
    : "";
  const role = profile?.role === "student" ? "student" : "faculty";

  return { profile, loading, isStudent, username, role, signOut };
}
