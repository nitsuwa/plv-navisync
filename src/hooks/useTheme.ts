import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export type ThemePreference = "system" | Theme;

interface ThemeSnapshot {
  preference: ThemePreference;
  theme: Theme;
}

const PREFERENCE_KEY = "plv-theme-preference";
const LEGACY_KEY = "plv-theme";
const listeners = new Set<() => void>();
let snapshot: ThemeSnapshot | null = null;
let media: MediaQueryList | null = null;

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    if (value === "system" || value === "light" || value === "dark") return value;
    // Preserve a previous explicit choice. A missing legacy value means the
    // app follows the device instead of freezing today's resolved theme.
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy === "light" || legacy === "dark" ? legacy : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function ensureSnapshot(): ThemeSnapshot {
  if (!snapshot) {
    const preference = readPreference();
    snapshot = { preference, theme: preference === "system" ? systemTheme() : preference };
    applyTheme(snapshot.theme);
    if (typeof window !== "undefined" && window.matchMedia) {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", handleSystemThemeChange);
      window.addEventListener("storage", handleStorageChange);
    }
  }
  return snapshot;
}

function publish(next: ThemeSnapshot) {
  const current = ensureSnapshot();
  if (current.preference === next.preference && current.theme === next.theme) return;
  snapshot = next;
  applyTheme(next.theme);
  listeners.forEach((listener) => listener());
}

function handleSystemThemeChange() {
  const current = ensureSnapshot();
  if (current.preference === "system") publish({ preference: "system", theme: systemTheme() });
}

function handleStorageChange(event: StorageEvent) {
  if (event.key !== PREFERENCE_KEY && event.key !== LEGACY_KEY) return;
  const previous = ensureSnapshot();
  const preference = readPreference();
  const next = { preference, theme: preference === "system" ? systemTheme() : preference };
  snapshot = next;
  applyTheme(next.theme);
  if (previous.preference !== next.preference || previous.theme !== next.theme) listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  ensureSnapshot();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return ensureSnapshot();
}

export function setThemePreference(preference: ThemePreference) {
  const theme = preference === "system" ? systemTheme() : preference;
  try {
    localStorage.setItem(PREFERENCE_KEY, preference);
    // Keep older theme readers compatible while the app is migrated.
    localStorage.setItem(LEGACY_KEY, theme);
  } catch {
    // The current page still adopts the requested theme if storage is blocked.
  }
  publish({ preference, theme });
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggleTheme = () => setThemePreference(current.theme === "light" ? "dark" : "light");
  return { ...current, setThemePreference, toggleTheme };
}
