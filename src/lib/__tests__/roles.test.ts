import { describe, expect, it } from "vitest";
import { isAdminRole, isSuperAdminRole, roleLabel } from "../roles";

describe("shared application roles", () => {
  it("treats both administrator roles as Admin Portal roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("student_org")).toBe(false);
  });

  it("keeps Super Admin detection distinct and labels all roles", () => {
    expect(isSuperAdminRole("super_admin")).toBe(true);
    expect(isSuperAdminRole("admin")).toBe(false);
    expect(["student", "student_org", "admin", "super_admin"].map(roleLabel)).toEqual([
      "Student", "Student Org", "Administrator", "Super Admin",
    ]);
  });
});
