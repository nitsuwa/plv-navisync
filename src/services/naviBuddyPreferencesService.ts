import { supabase } from "../lib/supabase";
import { DEFAULT_NAVIBUDDY_APPEARANCE, normalizeNaviBuddyAppearance, type NaviBuddyAppearance } from "../lib/naviBuddy";

const KEY = "navibuddy_preferences";
const LOCAL_KEY = "plv_navibuddy_guest_companion_v1";

export async function loadNaviBuddyAppearance(userId: string | null, isStudent: boolean): Promise<NaviBuddyAppearance> {
  if (!userId || !isStudent || !supabase) {
    try {
      const enabled = localStorage.getItem(LOCAL_KEY);
      return { ...DEFAULT_NAVIBUDDY_APPEARANCE, companionEnabled: enabled !== "off" };
    } catch { return DEFAULT_NAVIBUDDY_APPEARANCE; }
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (data.user?.id !== userId) return DEFAULT_NAVIBUDDY_APPEARANCE;
  return normalizeNaviBuddyAppearance(data.user.user_metadata?.[KEY]);
}

export async function saveNaviBuddyAppearance(userId: string | null, isStudent: boolean, appearance: NaviBuddyAppearance): Promise<NaviBuddyAppearance> {
  const normalized = normalizeNaviBuddyAppearance(appearance);
  if (!userId || !isStudent || !supabase) {
    try { localStorage.setItem(LOCAL_KEY, normalized.companionEnabled ? "on" : "off"); } catch { /* optional guest-only preference */ }
    return normalized;
  }
  const { data, error: readError } = await supabase.auth.getUser();
  if (readError) throw readError;
  if (data.user?.id !== userId) throw new Error("The active account changed. Please try again.");
  const { error } = await supabase.auth.updateUser({ data: { [KEY]: normalized } });
  if (error) throw error;
  return normalized;
}
