/**
 * StudentAuthContext — single-source-of-truth for student auth state.
 *
 * Instead of every useStudentAuth() call independently fetching the profile
 * from Supabase (causing 15+ redundant requests per navigation), this
 * provider fetches the profile once and shares it via React Context.
 */
import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase, isConnected, type Profile } from "../lib/supabase";

interface StudentAuthState {
  profile: Profile | null;
  loading: boolean;
  isStudent: boolean;
  isStudentOrg: boolean;
  username: string;
  role: "student" | "student_org" | "faculty";
  signOut: () => Promise<void>;
}

const StudentAuthContext = createContext<StudentAuthState | null>(null);

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        void loadProfile(data.session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

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

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    setLoading(false);
  }, []);

  // Both student and student_org get full student experience access
  const isStudent = !!profile && (profile.role === "student" || profile.role === "student_org") && profile.is_active;
  const isStudentOrg = !!profile && profile.role === "student_org" && profile.is_active;
  const username = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
      profile.email.split("@")[0] ||
      "Student"
    : "";
  const role = profile?.role === "student" ? "student" : profile?.role === "student_org" ? "student_org" : "faculty";

  return (
    <StudentAuthContext.Provider value={{ profile, loading, isStudent, isStudentOrg, username, role, signOut }}>
      {children}
    </StudentAuthContext.Provider>
  );
}

/**
 * Drop-in replacement for the old useStudentAuth hook.
 * Reads from context instead of fetching independently.
 */
export function useStudentAuth(): StudentAuthState {
  const ctx = useContext(StudentAuthContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (shouldn't happen
    // in normal app flow, but guards against edge cases during testing).
    return {
      profile: null,
      loading: true,
      isStudent: false,
      isStudentOrg: false,
      username: "",
      role: "faculty",
      signOut: async () => {},
    };
  }
  return ctx;
}
