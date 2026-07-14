/**
 * Returns the logged-in student/faculty session, or null if not signed in.
 * Used by public pages to unlock student-only features (e.g. report form).
 */
export function useStudentAuth(): { username: string; role: "student" | "faculty" } | null {
  try {
    const raw = sessionStorage.getItem("plv-student-auth");
    if (!raw) return null;
    return JSON.parse(raw) as { username: string; role: "student" | "faculty" };
  } catch {
    return null;
  }
}
