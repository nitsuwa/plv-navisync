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
  /** Explicit lifecycle state so route guards can distinguish restore from sign-out. */
  status: "initializing" | "authenticated" | "unauthenticated";
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
    // Ignore profile responses that belong to an identity/session which has
    // already been superseded (for example a late request completing after
    // an explicit sign-out).
    const authGeneration = { current: 0 };
    let initialAuthEventSeen = false;
    let initialAuthEventHadSession = false;
    let initialRestoreSettled = false;
    let initialRestoreUserId: string | undefined;
    let initialProfileCheckInFlight = false;
    let initialRestoreTimer: number | undefined;
    const setCurrentProfile = (next: Profile | null) => {
      profileRef.current = next;
      setProfile(next);
    };

    const finishInitialNoSession = () => {
      if (!mounted) return;
      // Supabase can emit INITIAL_SESSION with a transient null session while
      // its persisted session read is still completing.  Do not release the
      // admin route guard until that read has settled; otherwise AdminLayout
      // can redirect the editor before the authenticated session is restored.
      if (!initialRestoreSettled) return;
      if (initialRestoreUserId) return;
      // A null session is only authoritative after the initial restore event
      // (or its short safety timeout) has settled. This prevents a temporary
      // auth.getSession/getUser race from clearing the admin gate and
      // redirecting an editor that is still restoring a persisted session.
      if (!profileRef.current) setCurrentProfile(null);
      setLoading(false);
    };

    const loadProfile = async (userId: string, generation = authGeneration.current) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!mounted || generation !== authGeneration.current) return;
      if (!error && data) {
        setCurrentProfile(data as Profile);
      } else if (!error || profileRef.current?.id !== userId) {
        // A successful query with no row is authoritative (for example, an
        // admin was deactivated). A failed profile request is transient when
        // it is for the already-mounted user, including a duplicate initial
        // check racing Supabase's INITIAL_SESSION event; never clear that
        // valid profile just because one request timed out.
        setCurrentProfile(null);
      }
      setLoading(false);
    };

    const loadInitialProfile = (userId: string, generation: number) => {
      initialRestoreUserId = userId;
      initialProfileCheckInFlight = true;
      void loadProfile(userId, generation).finally(() => {
        if (mounted && generation === authGeneration.current) {
          initialRestoreUserId = undefined;
          initialProfileCheckInFlight = false;
        }
      });
    };

    const revalidate = async () => {
      if (!supabase) return;
      // Focus/visibility events can arrive while the persisted session or its
      // profile is still being restored.  Ignore those checks rather than
      // interpreting a transient empty auth response as a logout.
      if (!initialRestoreSettled || initialProfileCheckInFlight) return;
      const generation = authGeneration.current;
      const { data, error } = await supabase.auth.getUser();
      if (!mounted || generation !== authGeneration.current) return;
      if (error) {
        // Focus/visibility revalidation commonly races a short network
        // interruption. Do not turn that transient error into an auth-gate
        // redirect that remounts the Map Builder and loses its draft.
        setLoading(false);
        return;
      }
      if (!data.user) {
        // A focus/visibility check can briefly return an empty user while the
        // persisted session is being refreshed.  Keep the already-authorized
        // profile mounted until Supabase emits an authoritative sign-out (or
        // a later check confirms the session is truly gone).
        if (profileRef.current) {
          setLoading(false);
          return;
        }
        setCurrentProfile(null);
        setLoading(false);
        return;
      }
      await loadProfile(data.user.id, generation);
    };

    // Keep state in sync with session restoration, sign-in/sign-out, and token
    // refresh. Register this before reading the initial session so the
    // INITIAL_SESSION event cannot arrive during an unobserved gap.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "INITIAL_SESSION") {
        initialAuthEventSeen = true;
        initialAuthEventHadSession = !!nextSession;
        if (initialRestoreTimer !== undefined) window.clearTimeout(initialRestoreTimer);
        if (nextSession) {
          initialRestoreUserId = nextSession.user.id;
          const sameUser = profileRef.current?.id === nextSession.user.id;
          if (!sameUser) {
            authGeneration.current += 1;
            setCurrentProfile(null);
            setLoading(true);
          }
          loadInitialProfile(nextSession.user.id, authGeneration.current);
        } else {
          // Keep the editor gate in AUTH_INITIALIZING until getSession has
          // completed.  A bounded fallback is installed below for adapters
          // that never resolve their initial restore request.
          if (!initialRestoreSettled) {
            initialRestoreTimer = window.setTimeout(() => {
              initialRestoreSettled = true;
              finishInitialNoSession();
            }, 2500);
          } else {
            finishInitialNoSession();
          }
        }
        return;
      }
      if (nextSession) {
        const sameUser = profileRef.current?.id === nextSession.user.id;
        // A new sign-in must not briefly display the previous administrator,
        // but a token refresh for the current user should remain mounted even
        // if the profile query is temporarily unavailable.
        if (!sameUser) {
          authGeneration.current += 1;
          setCurrentProfile(null);
          setLoading(true);
        }
        void loadProfile(nextSession.user.id, authGeneration.current);
      } else if (event === "SIGNED_OUT") {
        authGeneration.current += 1;
        initialProfileCheckInFlight = false;
        setCurrentProfile(null);
        setLoading(false);
      } else if (profileRef.current) {
        // Do not tear down the editor for a non-authoritative null-session
        // notification (for example a transient refresh race).  The next
        // auth/profile check will reconcile the mounted session.
        setLoading(false);
      } else {
        setCurrentProfile(null);
        setLoading(false);
      }
    });

    // Restore the persisted session through Supabase's session API. Unlike a
    // one-off getUser() call, this does not treat a transient auth-server
    // response while the browser session is being restored as a definitive
    // logout. INITIAL_SESSION normally settles this immediately; the timeout
    // is only a bounded fallback for a client that does not emit that event.
    const initialGeneration = authGeneration.current;
    const readInitialSession = async (): Promise<{ userId?: string; error: unknown }> => {
      try {
        // `getSession` is the normal browser restore path. Keep a guarded
        // getUser fallback for lightweight test clients/older adapters so a
        // missing optional method cannot itself tear down the admin shell.
        if (typeof supabase.auth.getSession === "function") {
          const { data, error } = await supabase.auth.getSession();
          return { userId: data.session?.user?.id, error };
        }
        const { data, error } = await supabase.auth.getUser();
        return { userId: data.user?.id, error };
      } catch (error) {
        return { error };
      }
    };
    readInitialSession().then(({ userId, error }) => {
      if (!mounted || initialGeneration !== authGeneration.current) return;
      initialRestoreSettled = true;
      if (initialRestoreTimer !== undefined) {
        window.clearTimeout(initialRestoreTimer);
        initialRestoreTimer = undefined;
      }
      if (userId) {
        loadInitialProfile(userId, initialGeneration);
        return;
      }
      // If INITIAL_SESSION already carried a user, its profile request is the
      // authoritative restore path.  Do not let a contradictory transient
      // getSession response tear that request down.
      if (initialAuthEventHadSession) return;
      if (!error && initialAuthEventSeen) {
        finishInitialNoSession();
        return;
      }
      initialRestoreTimer = window.setTimeout(finishInitialNoSession, error ? 2500 : 1000);
    }).catch(() => {
      if (!mounted || initialGeneration !== authGeneration.current) return;
      initialRestoreSettled = true;
      if (initialRestoreTimer !== undefined) {
        window.clearTimeout(initialRestoreTimer);
        initialRestoreTimer = undefined;
      }
      initialRestoreTimer = window.setTimeout(finishInitialNoSession, 2500);
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
      if (initialRestoreTimer !== undefined) window.clearTimeout(initialRestoreTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      listener.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = !!profile && profile.role === "admin" && profile.is_active;
  const status = loading ? "initializing" : isAdmin ? "authenticated" : "unauthenticated";

  return { profile, loading, isAdmin, status };
}
