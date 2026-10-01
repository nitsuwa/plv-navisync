import type { StudentLandingPage } from "../services/settingsService";

/** Return a safe in-app Student deep link saved by a route guard, if present. */
export function requestedStudentPath(state: unknown, origin = window.location.origin): string | null {
  if (!state || typeof state !== "object" || !("from" in state)) return null;
  const from = (state as { from?: unknown }).from;
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return null;

  try {
    const parsed = new URL(from, origin);
    const isStudentPath = parsed.pathname === "/home"
      || parsed.pathname === "/student"
      || parsed.pathname.startsWith("/student/")
      || parsed.pathname === "/map"
      || parsed.pathname === "/buildings"
      || parsed.pathname.startsWith("/buildings/");
    if (parsed.origin === origin && isStudentPath) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Malformed navigation state is ignored; the caller uses the configured default.
  }
  return null;
}

export function studentEntryPath(state: unknown, defaultLandingPage: StudentLandingPage): string {
  return requestedStudentPath(state)
    ?? (defaultLandingPage === "map" ? "/map" : "/home");
}
