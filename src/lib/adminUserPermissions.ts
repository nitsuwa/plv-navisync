import { isAdminRole, isSuperAdminRole, type AppRole } from "./roles";

export interface ManagedUserActor {
  id?: string;
  role?: string | null;
}

export interface ManagedUserTarget {
  id: string;
  role: AppRole;
  is_active: boolean;
}

export interface ManagedUserEditPolicy {
  isSelf: boolean;
  canManageAccount: boolean;
  lastActiveSuperAdmin: boolean;
  canChangeRole: boolean;
  canChangeStatus: boolean;
}

export function countActiveSuperAdmins(
  users: ReadonlyArray<Pick<ManagedUserTarget, "id" | "role" | "is_active">>,
  actor: ManagedUserActor & { is_active?: boolean | null },
): number {
  const activeIds = new Set(users
    .filter((user) => user.role === "super_admin" && user.is_active)
    .map((user) => user.id));

  // Use the centralized auth profile too: a filtered/partially loaded table must
  // not mistake the active Super Admin making the request for a missing record.
  if (actor.id && isSuperAdminRole(actor.role) && actor.is_active) activeIds.add(actor.id);
  return activeIds.size;
}

export function getManagedUserEditPolicy(
  actor: ManagedUserActor,
  target: ManagedUserTarget,
  activeSuperAdminCount: number,
): ManagedUserEditPolicy {
  const isSelf = actor.id === target.id;
  const canManageAccount = isSuperAdminRole(actor.role) || !isAdminRole(target.role);
  const lastActiveSuperAdmin = target.role === "super_admin"
    && target.is_active
    && activeSuperAdminCount <= 1;

  return {
    isSelf,
    canManageAccount,
    lastActiveSuperAdmin,
    canChangeRole: canManageAccount && !isSelf,
    canChangeStatus: canManageAccount && !isSelf,
  };
}
