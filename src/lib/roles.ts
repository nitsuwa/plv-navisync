export type AppRole = "student" | "student_org" | "admin" | "super_admin";

export function isAdminRole(role: unknown): role is "admin" | "super_admin" {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role: unknown): role is "super_admin" {
  return role === "super_admin";
}

export function roleLabel(role: string): string {
  switch (role) {
    case "student_org": return "Student Org";
    case "admin": return "Administrator";
    case "super_admin": return "Super Admin";
    default: return "Student";
  }
}
