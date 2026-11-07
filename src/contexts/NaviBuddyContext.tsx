import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { DEFAULT_NAVIBUDDY_APPEARANCE, type NaviBuddyAppearance } from "../lib/naviBuddy";
import { loadNaviBuddyAppearance, saveNaviBuddyAppearance } from "../services/naviBuddyPreferencesService";
import { NaviBuddyAppearanceContext, NaviBuddyContext } from "./NaviBuddyStore";

export function NaviBuddyProvider({ children }: { children: ReactNode }) {
  const { profile, role, isStudent, loading } = useStudentAuth();
  const canCustomize = isStudent && role === "student";
  const userId = profile?.id ?? null;
  const scope = `${userId ?? "guest"}:${canCustomize ? "student" : "default"}`;
  const [stored, setStored] = useState({ scope: "guest:default", appearance: DEFAULT_NAVIBUDDY_APPEARANCE });
  const appearance = stored.scope === scope ? stored.appearance : DEFAULT_NAVIBUDDY_APPEARANCE;
  const [loadState, setLoadState] = useState({ scope: "guest:default", loaded: false });
  const loaded = loadState.scope === scope && loadState.loaded;
  useEffect(() => {
    if (loading) return;
    let active = true;
    setStored({ scope, appearance: DEFAULT_NAVIBUDDY_APPEARANCE });
    setLoadState({ scope, loaded: false });
    void loadNaviBuddyAppearance(userId, canCustomize).then((value) => {
      if (active) setStored({ scope, appearance: value });
    }).catch(() => {
      if (active) setStored({ scope, appearance: DEFAULT_NAVIBUDDY_APPEARANCE });
    }).finally(() => { if (active) setLoadState({ scope, loaded: true }); });
    return () => { active = false; };
  }, [canCustomize, loading, scope, userId]);

  const saveAppearance = useCallback(async (next: NaviBuddyAppearance) => {
    if (!canCustomize) throw new Error("Only student accounts can customize NaviBuddy.");
    const saved = await saveNaviBuddyAppearance(userId, canCustomize, next);
    // Keep the last persisted appearance active until the write succeeds. This
    // prevents a quick Settings → Map switch from exposing an unsaved draft.
    setStored((current) => current.scope === scope ? { scope, appearance: saved } : current);
  }, [canCustomize, scope, userId]);
  const value = useMemo(() => ({ appearance, loaded, saveAppearance }), [appearance, loaded, saveAppearance]);
  return <NaviBuddyAppearanceContext.Provider value={appearance}>
    <NaviBuddyContext.Provider value={value}>{children}</NaviBuddyContext.Provider>
  </NaviBuddyAppearanceContext.Provider>;
}
