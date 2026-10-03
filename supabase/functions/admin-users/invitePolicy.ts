export type ManagedRole = "student" | "student_org" | "admin" | "super_admin";

export function isManagedRole(role: string): role is ManagedRole {
  return role === "student" || role === "student_org" || role === "admin" || role === "super_admin";
}

export function roleAllowed(actorRole: string, targetRole: string): boolean {
  const allowed: ManagedRole[] = actorRole === "super_admin"
    ? ["student", "student_org", "admin", "super_admin"]
    : actorRole === "admin" ? ["student", "student_org"] : [];
  return allowed.some((role) => role === targetRole);
}

export function studentNumberForInvite(role: ManagedRole, value: unknown): { valid: boolean; studentNumber: string | null } {
  if (role !== "student") return { valid: true, studentNumber: null };
  const studentNumber = typeof value === "string" ? value.trim() || null : null;
  return { valid: /^\d{2}-\d{4}$/.test(studentNumber ?? ""), studentNumber };
}
