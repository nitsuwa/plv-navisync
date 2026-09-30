/** Admin role view over the application's single Supabase auth bootstrap. */
import { useAuth } from "../contexts/StudentAuthContext";
import type { Profile } from "../lib/supabase";

export interface AdminAuthState {
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  status: "initializing" | "authenticated" | "unauthenticated";
}

export function useAdminAuth(): AdminAuthState {
  const auth = useAuth();
  const status = auth.loading
    ? "initializing"
    : auth.isAdmin
      ? "authenticated"
      : "unauthenticated";
  return {
    profile: auth.profile,
    loading: auth.loading,
    isAdmin: auth.isAdmin,
    status,
  };
}
