/**
 * Application-wide Supabase session and profile bootstrap.
 *
 * Supabase owns persistent credentials and cross-tab session synchronization.
 * This provider owns the in-memory role/profile state used by both Admin and
 * Student routes so each side does not race a separate session restoration.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConnected, type Profile } from "../lib/supabase";
import { isAdminRole } from "../lib/roles";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "error";
export type PasswordRecoveryState = "idle" | "processing" | "ready" | "invalid" | "complete";

const RECOVERY_SESSION_KEY = "plv-navisync:password-recovery-pending";

function isPasswordResetRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/auth/reset-password";
}

function hasAuthRedirectPayload(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return [query, hash].some((params) =>
    params.has("code") || params.has("type") || params.has("token_hash") || params.has("access_token") ||
    params.has("error") || params.has("error_code") || params.has("error_description"));
}

function hasAuthRedirectError(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return [query, hash].some((params) => params.has("error") || params.has("error_code") || params.has("error_description"));
}

function hasRecoveryMarker(): boolean {
  try { return window.sessionStorage.getItem(RECOVERY_SESSION_KEY) === "1"; }
  catch { return false; }
}

function setRecoveryMarker(active: boolean): void {
  try {
    if (active) window.sessionStorage.setItem(RECOVERY_SESSION_KEY, "1");
    else window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
  } catch {
    // Recovery still works for the current page if storage is unavailable.
  }
}

export interface AuthState {
  session: Session | null;
  profile: Profile | null;
  status: AuthStatus;
  /** Central Supabase recovery-link lifecycle; no page owns another auth listener. */
  recoveryState: PasswordRecoveryState;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isStudent: boolean;
  isStudentOrg: boolean;
  username: string;
  /** Existing student-facing role fallback retained for compatibility. */
  role: "student" | "student_org" | "faculty";
  refreshProfile: () => Promise<void>;
  /** Adopt a profile mutation immediately so every account surface stays in sync. */
  applyProfileUpdate: (profile: Partial<Profile>) => void;
  retryBootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const PROFILE_RETRY_MESSAGE = "NaviSync could not verify your login/profile right now. Check your connection and retry; the saved login has not been cleared.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [recoveryState, setRecoveryState] = useState<PasswordRecoveryState>(() =>
    isPasswordResetRoute() ? "processing" : "idle");
  const recoveryStateRef = useRef(recoveryState);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const statusRef = useRef<AuthStatus>("initializing");
  const generationRef = useRef(0);
  const authEventVersionRef = useRef(0);
  const mountedRef = useRef(false);
  const pendingProfileRef = useRef<{ userId: string; generation: number; promise: Promise<void> } | null>(null);
  const retryRef = useRef<() => Promise<void>>(async () => {});
  // Capture before Supabase consumes/cleans the callback URL.
  const recoveryUrlRef = useRef(isPasswordResetRoute() && hasAuthRedirectPayload());
  const recoveryUrlErrorRef = useRef(isPasswordResetRoute() && hasAuthRedirectError());

  const updateRecoveryState = useCallback((next: PasswordRecoveryState) => {
    recoveryStateRef.current = next;
    setRecoveryState(next);
  }, []);

  const updateSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const updateProfile = useCallback((next: Profile | null) => {
    profileRef.current = next;
    setProfile(next);
  }, []);
  const applyProfileUpdate = useCallback((patch: Partial<Profile>) => {
    const current = profileRef.current;
    if (!current || current.id !== sessionRef.current?.user.id) return;
    updateProfile({ ...current, ...patch });
  }, [updateProfile]);
  const updateStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const loadProfile = useCallback((userId: string, generation: number): Promise<void> => {
    if (!supabase) return Promise.resolve();
    const pending = pendingProfileRef.current;
    if (pending?.userId === userId && pending.generation === generation) return pending.promise;

    const promise = (async () => {
      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (!mountedRef.current || generation !== generationRef.current) return;

        if (profileError) {
          setError(PROFILE_RETRY_MESSAGE);
          // A transient profile request must not evict a role already verified
          // in this runtime. A password-recovery route needs only the recovery
          // session, so don't block its password form on an unrelated profile read.
          updateStatus(recoveryStateRef.current === "ready" || profileRef.current?.id === userId ? "authenticated" : "error");
          return;
        }

        updateProfile(data ? (data as Profile) : null);
        setError(null);
        // A missing/inactive/unknown profile still has a Supabase session, but
        // receives no role privileges; existing route checks remain decisive.
        updateStatus("authenticated");
      } catch {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setError(PROFILE_RETRY_MESSAGE);
        updateStatus(recoveryStateRef.current === "ready" || profileRef.current?.id === userId ? "authenticated" : "error");
      }
    })();

    pendingProfileRef.current = { userId, generation, promise };
    void promise.finally(() => {
      if (pendingProfileRef.current?.promise === promise) pendingProfileRef.current = null;
    });
    return promise;
  }, [updateProfile, updateStatus]);

  const adoptSession = useCallback(async (next: Session, forceProfileCheck = false) => {
    const previousUserId = sessionRef.current?.user.id;
    const userId = next.user.id;
    const changedUser = previousUserId !== userId;
    if (changedUser) {
      generationRef.current += 1;
      if (profileRef.current?.id !== userId) updateProfile(null);
      updateStatus("initializing");
    } else if (profileRef.current?.id === userId) {
      updateStatus("authenticated");
    } else {
      updateStatus("initializing");
    }
    updateSession(next);
    setError(null);

    if (changedUser || forceProfileCheck || profileRef.current?.id !== userId) {
      await loadProfile(userId, generationRef.current);
    }
  }, [loadProfile, updateProfile, updateSession, updateStatus]);

  const clearSession = useCallback(() => {
    generationRef.current += 1;
    pendingProfileRef.current = null;
    updateSession(null);
    updateProfile(null);
    setError(null);
    updateStatus("unauthenticated");
  }, [updateProfile, updateSession, updateStatus]);

  const restoreSession = useCallback(async () => {
    if (!isConnected || !supabase) {
      clearSession();
      return;
    }

    const startingGeneration = generationRef.current;
    const startingAuthEventVersion = authEventVersionRef.current;
    if (!profileRef.current) updateStatus("initializing");
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      // An auth event (especially a sign-out in another tab) that arrived
      // while this read was pending takes precedence over its older result.
      if (!mountedRef.current || startingGeneration !== generationRef.current
        || startingAuthEventVersion !== authEventVersionRef.current) return;
      if (sessionError) {
        setError(PROFILE_RETRY_MESSAGE);
        updateStatus(profileRef.current ? "authenticated" : "error");
        return;
      }
      if (!data.session) {
        clearSession();
        if (isPasswordResetRoute() && recoveryStateRef.current !== "ready") {
          if (recoveryUrlRef.current && !recoveryUrlErrorRef.current) {
            // A callback URL can still emit PASSWORD_RECOVERY just after the
            // initial session read. Keep the page in its verifying state briefly.
            updateRecoveryState("processing");
            window.setTimeout(() => {
              if (recoveryStateRef.current !== "processing") return;
              setRecoveryMarker(false);
              updateRecoveryState("invalid");
            }, 1500);
          } else {
            setRecoveryMarker(false);
            updateRecoveryState("invalid");
          }
        }
        return;
      }
      if (isPasswordResetRoute()) {
        if (recoveryUrlRef.current || hasRecoveryMarker()) {
          setRecoveryMarker(true);
          updateRecoveryState("ready");
        } else {
          // A normal signed-in session is not evidence that a recovery link was used.
          updateRecoveryState("invalid");
        }
      }
      await adoptSession(data.session);
    } catch {
      if (!mountedRef.current || startingGeneration !== generationRef.current) return;
      setError(PROFILE_RETRY_MESSAGE);
      updateStatus(profileRef.current ? "authenticated" : "error");
    }
  }, [adoptSession, clearSession, updateRecoveryState, updateStatus]);

  retryRef.current = restoreSession;

  useEffect(() => {
    mountedRef.current = true;
    if (!isConnected || !supabase) {
      clearSession();
      return () => { mountedRef.current = false; };
    }

    // Subscribe before getSession so sign-in/sign-out cannot fall into a gap.
    // INITIAL_SESSION is deliberately ignored here: getSession is the single
    // authoritative initial restore read, avoiding transient-null event races.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMarker(true);
        updateRecoveryState("ready");
      }
      if (event === "USER_UPDATED" && hasRecoveryMarker()) {
        updateRecoveryState("complete");
      }
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        authEventVersionRef.current += 1;
        setRecoveryMarker(false);
        updateRecoveryState("idle");
        clearSession();
        return;
      }
      if (!nextSession) return;

      // Supabase auth callbacks must stay synchronous. Profile work is queued
      // after the SDK finishes notifying its listeners.
      const eventVersion = ++authEventVersionRef.current;
      queueMicrotask(() => {
        // A newer event (especially SIGNED_OUT in this tab or another tab)
        // wins over session adoption that has not started yet.
        if (!mountedRef.current || eventVersion !== authEventVersionRef.current) return;
        void adoptSession(nextSession, event === "SIGNED_IN" || event === "USER_UPDATED");
      });
    });

    void restoreSession();

    const revalidate = async () => {
      if (!mountedRef.current || !sessionRef.current || !supabase) return;
      const generation = generationRef.current;
      try {
        const { data, error: userError } = await supabase.auth.getUser();
        if (!mountedRef.current || generation !== generationRef.current || userError || !data.user) return;
        if (data.user.id !== sessionRef.current?.user.id) return;
        await loadProfile(data.user.id, generation);
      } catch {
        // A temporary network failure never clears a verified in-memory role.
      }
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void revalidate();
    }, 15_000);
    const onFocus = () => { if (document.visibilityState === "visible") void revalidate(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void revalidate(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      listener.subscription.unsubscribe();
    };
  }, [adoptSession, clearSession, loadProfile, restoreSession, updateRecoveryState]);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const current = sessionRef.current;
    if (!current) {
      await restoreSession();
      return;
    }
    // Explicit refreshes (for example after invitation acceptance) supersede
    // any earlier profile fetch so a stale pre-activation result cannot win.
    generationRef.current += 1;
    pendingProfileRef.current = null;
    await loadProfile(current.user.id, generationRef.current);
  }, [loadProfile, restoreSession]);

  const retryBootstrap = useCallback(() => retryRef.current(), []);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    }
    clearSession();
  }, [clearSession]);

  // A cached/in-flight profile is never authentication by itself. Only expose
  // a profile when its id matches the currently adopted Supabase session.
  const activeProfile = session?.user.id && profile?.id === session.user.id ? profile : null;
  const isStudent = !!activeProfile && (activeProfile.role === "student" || activeProfile.role === "student_org") && activeProfile.is_active;
  const isStudentOrg = !!activeProfile && activeProfile.role === "student_org" && activeProfile.is_active;
  const isAdmin = !!activeProfile && isAdminRole(activeProfile.role) && activeProfile.is_active;
  const username = activeProfile
    ? [activeProfile.first_name, activeProfile.last_name].filter(Boolean).join(" ") || activeProfile.email.split("@")[0] || "Student"
    : "";
  const role = activeProfile?.role === "student" ? "student" : activeProfile?.role === "student_org" ? "student_org" : "faculty";

  const value = useMemo<AuthState>(() => ({
    session, profile: activeProfile, status, recoveryState, loading: status === "initializing" || status === "error", error,
    isAdmin, isStudent, isStudentOrg, username, role, refreshProfile, applyProfileUpdate, retryBootstrap, signOut,
  }), [session, activeProfile, status, recoveryState, error, isAdmin, isStudent, isStudentOrg, username, role, refreshProfile, applyProfileUpdate, retryBootstrap, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Backwards-compatible provider name used by older tests and integrations. */
export function StudentAuthProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const EMPTY_AUTH_STATE: AuthState = {
  session: null,
  profile: null,
  status: "initializing",
  recoveryState: "idle",
  loading: true,
  error: null,
  isAdmin: false,
  isStudent: false,
  isStudentOrg: false,
  username: "",
  role: "faculty",
  refreshProfile: async () => {},
  applyProfileUpdate: () => {},
  retryBootstrap: async () => {},
  signOut: async () => {},
};

export function useAuth(): AuthState {
  return useContext(AuthContext) ?? EMPTY_AUTH_STATE;
}

/** Drop-in compatibility hook for existing student UI. */
export type StudentAuthState = Pick<AuthState, "profile" | "loading" | "isStudent" | "isStudentOrg" | "username" | "role" | "refreshProfile" | "applyProfileUpdate" | "signOut">;
export function useStudentAuth(): StudentAuthState {
  const { profile, loading, isStudent, isStudentOrg, username, role, refreshProfile, applyProfileUpdate, signOut } = useAuth();
  return { profile, loading, isStudent, isStudentOrg, username, role, refreshProfile, applyProfileUpdate, signOut };
}
