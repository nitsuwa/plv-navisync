import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { inviteManagedUser, listManagedProfiles, managedUserErrorMessage, resendManagedInvitation, updateManagedProfile } from "../adminUserService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const profile = {
  id: "user-1",
  role: "student",
  first_name: "Maria",
  last_name: "Santos",
  email: "maria@example.test",
  student_number: "23-3314",
  department: "Engineering",
  avatar_path: null,
  is_active: true,
  last_login_at: null,
  created_at: "2026-08-06T00:00:00Z",
  updated_at: "2026-08-06T00:00:00Z",
};

function queryResult(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq", "ilike"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe("admin user service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives pending invite state and filters by role and lifecycle status", async () => {
    const profileQuery = queryResult({ data: [profile, { ...profile, id: "user-2", is_active: false }], error: null });
    const inviteQuery = queryResult({ data: [{ profile_id: "user-2", accepted_at: null, revoked_at: null }], error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn((table: string) => table === "profiles" ? profileQuery : inviteQuery) } as never);

    await expect(listManagedProfiles({ role: "student", status: "pending_invite" })).resolves.toMatchObject({
      invitationMetadataAvailable: true,
      profiles: [{ id: "user-2", account_status: "pending_invite" }],
    });
    expect(profileQuery.eq).toHaveBeenCalledWith("role", "student");
  });

  it("falls back to profile active state when invitation metadata is not deployed", async () => {
    const profileQuery = queryResult({ data: [profile, { ...profile, id: "inactive-user", is_active: false }], error: null });
    const invitationQuery = queryResult({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.admin_user_invitations' in the schema cache" } });
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn((table: string) => table === "profiles" ? profileQuery : invitationQuery) } as never);

    await expect(listManagedProfiles()).resolves.toMatchObject({
      invitationMetadataAvailable: false,
      profiles: [
        { id: "user-1", account_status: "active" },
        { id: "inactive-user", account_status: "inactive" },
      ],
    });
  });

  it("uses the audited RPC for every role, including Student Org", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...profile, role: "student_org" }, error: null });
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ rpc, from } as never);
    await updateManagedProfile({ id: "user-1", firstName: "Maria", lastName: "Santos", role: "student_org", isActive: true });
    expect(rpc).toHaveBeenCalledWith("admin_update_profile", expect.objectContaining({ p_target_id: "user-1", p_role: "student_org", p_student_number: null, p_is_active: true }));
    expect(from).not.toHaveBeenCalled();
  });

  it("sends invitations only through the protected Edge Function with the invite callback", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { id: "user-2", email: "new@example.test" }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ functions: { invoke } } as never);
    await inviteManagedUser({ email: "New@Example.test", firstName: "New", lastName: "User", role: "admin" });
    expect(invoke).toHaveBeenCalledWith("admin-users", { body: expect.objectContaining({
      action: "invite", role: "admin", email: "new@example.test", studentNumber: null,
      redirectTo: `${window.location.origin}/auth/invite`,
    }) });
  });

  it("resends through the Edge Function without creating a second profile", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { id: "user-2", resent: true }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ functions: { invoke } } as never);
    await resendManagedInvitation("user-2");
    expect(invoke).toHaveBeenCalledWith("admin-users", { body: expect.objectContaining({ action: "resend", profileId: "user-2" }) });
  });

  it("maps database collision and privilege guard errors to friendly text", () => {
    expect(managedUserErrorMessage(new Error("profiles_student_number_uq Student ID is already registered"))).toBe("This Student ID is already registered.");
    expect(managedUserErrorMessage(new Error("at least one active Super Admin is required"))).toBe("At least one active Super Admin is required.");
    expect(managedUserErrorMessage(new Error("42501 permission denied"))).toBe("You don't have permission to make this change.");
    expect(managedUserErrorMessage(new Error("you cannot change your own role or deactivate your own account"))).toBe("You can't change your own role or deactivate your own account.");
  });
});
