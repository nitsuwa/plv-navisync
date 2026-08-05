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

    const loadProfile = async (userId: string) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data) setProfile(data as Profile);
      else setProfile(null);
      setLoading(false);
    };

    // Restore any persisted session (page refresh / returning visitor).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        void loadProfile(data.session.user.id);
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

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = !!profile && profile.role === "admin" && profile.is_active;

  return { profile, loading, isAdmin };
}
