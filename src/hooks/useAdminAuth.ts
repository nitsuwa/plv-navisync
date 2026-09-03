/**
 * useAdminAuth — real Supabase authentication state for the admin portal.
 *
 * - Restores the persisted Supabase session on mount (survives page refresh).
 * - Fetches the authenticated user's matching row from `public.profiles`.
 * - Exposes `isAdmin` = profile exists, role === "admin", and is_active.
 * - `loading` is true until the initial session AND profile check finish.
 */
import { useEffect, useState } from "react";
import { supabase, isConnected, type Profile } from "../lib/supabase";

export interface AdminAuthState {
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
}

export function useAdminAuth(): AdminAuthState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No Supabase configuration — the app is running in mock-data mode.
    if (!isConnected || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const profileRef = { current: null as Profile | null };
    const setCurrentProfile = (next: Profile | null) => {
      profileRef.current = next;
      setProfile(next);
    };

    const loadProfile = async (userId: string, preserveCurrentOnError = false) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data) {
        setCurrentProfile(data as Profile);
      } else if (!error || !preserveCurrentOnError || profileRef.current?.id !== userId) {
        // A successful query with no row is authoritative (for example, an
        // admin was deactivated). Only preserve the current session when the
        // profile request itself failed transiently for that same user.
        setCurrentProfile(null);
      }
      setLoading(false);
    };

    const revalidate = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        // Focus/visibility revalidation commonly races a short network
        // interruption. Do not turn that transient error into an auth-gate
        // redirect that remounts the Map Builder and loses its draft.
        setLoading(false);
        return;
      }
      if (!data.user) {
        setCurrentProfile(null);
        setLoading(false);
        return;
      }
      await loadProfile(data.user.id, true);
    };

    // Restore and validate the current identity against the Auth server.
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (!error && data.user) {
        void loadProfile(data.user.id);
      } else {
        setCurrentProfile(null);
        setLoading(false);
      }
    });

    // Keep state in sync with sign-in / sign-out / token refresh.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      if (nextSession) {
        const sameUser = profileRef.current?.id === nextSession.user.id;
        // A new sign-in must not briefly display the previous administrator,
        // but a token refresh for the current user should remain mounted even
        // if the profile query is temporarily unavailable.
        if (!sameUser) {
          setCurrentProfile(null);
          setLoading(true);
        }
        void loadProfile(nextSession.user.id, sameUser);
      } else {
        setCurrentProfile(null);
        setLoading(false);
      }
    });

    // Profile authorization is database state, not JWT state. Recheck it while
    // the portal is open and immediately when the tab/window becomes active so
    // another administrator's deactivation takes effect in the current session.
    const interval = window.setInterval(() => {
      // Do not poll the auth/profile endpoint while the editor is in a
      // background tab. The visibility handler performs one state-preserving
      // check when the user returns.
      if (document.visibilityState === "visible") void revalidate();
    }, 15_000);
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

  const isAdmin = !!profile && profile.role === "admin" && profile.is_active;

  return { profile, loading, isAdmin };
}
