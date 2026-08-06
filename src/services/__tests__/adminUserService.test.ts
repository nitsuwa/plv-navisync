import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { inviteManagedUser, listManagedProfiles, updateManagedProfile } from "../adminUserService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const profile = {
  id: "user-1",
  role: "student",
  first_name: "Maria",
  last_name: "Santos",
  email: "maria@example.test",
  student_number: "2026-001",
  department: "Engineering",
  avatar_path: null,
  is_active: true,
  last_login_at: null,
  created_at: "2026-08-06T00:00:00Z",
  updated_at: "2026-08-06T00:00:00Z",
};

describe("admin user service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists profiles through typed role/status filters and combined-name search", async () => {
    const query: Record<string, unknown> = {};
    query.order = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [profile], error: null }).then(resolve);
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    await expect(listManagedProfiles({ role: "student", status: "active", search: "Maria Santos" })).resolves.toEqual([profile]);
    expect(query.eq).toHaveBeenCalledWith("role", "student");
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("uses the audited RPC for approved profile fields", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: profile, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    await updateManagedProfile({ id: "user-1", firstName: "Maria", lastName: "Santos", role: "student", isActive: false });
    expect(rpc).toHaveBeenCalledWith("admin_update_profile", expect.objectContaining({ p_target_id: "user-1", p_role: "student", p_is_active: false }));
  });

  it("sends invitations only through the protected Edge Function", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { id: "user-2", email: "new@example.test" }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ functions: { invoke } } as never);
    await inviteManagedUser({ email: "new@example.test", firstName: "New", lastName: "User", role: "admin" });
    expect(invoke).toHaveBeenCalledWith("admin-users", { body: expect.objectContaining({ action: "invite", role: "admin" }) });
  });
});
