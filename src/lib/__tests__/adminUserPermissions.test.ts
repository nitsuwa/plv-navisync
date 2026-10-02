import { describe, expect, it } from "vitest";
import { countActiveSuperAdmins, getManagedUserEditPolicy } from "../adminUserPermissions";

describe("managed user edit permissions", () => {
  it("lets a Super Admin manage another active Administrator or Super Admin", () => {
    const actor = { id: "root", role: "super_admin", is_active: true };
    const admin = { id: "admin-b", role: "admin" as const, is_active: true };
    const superAdmin = { id: "root-b", role: "super_admin" as const, is_active: true };
    const count = countActiveSuperAdmins([superAdmin], actor);

    expect(count).toBe(2);
    expect(getManagedUserEditPolicy(actor, admin, count)).toMatchObject({ canManageAccount: true, canChangeRole: true, canChangeStatus: true, lastActiveSuperAdmin: false });
    expect(getManagedUserEditPolicy(actor, superAdmin, count)).toMatchObject({ canManageAccount: true, canChangeRole: true, canChangeStatus: true, lastActiveSuperAdmin: false });
  });

  it("denies normal Admins access to privileged accounts", () => {
    const actor = { id: "admin-a", role: "admin" };
    expect(getManagedUserEditPolicy(actor, { id: "admin-b", role: "admin", is_active: true }, 1).canManageAccount).toBe(false);
    expect(getManagedUserEditPolicy(actor, { id: "root", role: "super_admin", is_active: true }, 1).canManageAccount).toBe(false);
  });

  it("blocks own role/access changes and protects the last active Super Admin", () => {
    const self = { id: "root", role: "super_admin" };
    const own = getManagedUserEditPolicy(self, { id: "root", role: "super_admin", is_active: true }, 1);
    const last = getManagedUserEditPolicy(self, { id: "other-root", role: "super_admin", is_active: true }, 1);
    expect(own).toMatchObject({ isSelf: true, canChangeRole: false, canChangeStatus: false });
    expect(last).toMatchObject({ lastActiveSuperAdmin: true, canManageAccount: true });
  });

  it("allows changing a different Super Admin when another active Super Admin remains", () => {
    const policy = getManagedUserEditPolicy(
      { id: "root-a", role: "super_admin" },
      { id: "root-b", role: "super_admin", is_active: true },
      2,
    );
    expect(policy).toMatchObject({ canChangeRole: true, canChangeStatus: true, lastActiveSuperAdmin: false });
  });
});
