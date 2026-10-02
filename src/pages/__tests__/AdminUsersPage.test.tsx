import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminUsersPage } from "../AdminUsersPage";

const mocks = vi.hoisted(() => ({
  useAdminAuth: vi.fn(),
  listManagedProfiles: vi.fn(),
  inviteManagedUser: vi.fn(),
  updateManagedProfile: vi.fn(),
  resendManagedInvitation: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../hooks/useAdminAuth", () => ({ useAdminAuth: mocks.useAdminAuth }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => mocks.toast }));
vi.mock("../../services/adminUserService", async () => {
  const actual = await vi.importActual<typeof import("../../services/adminUserService")>("../../services/adminUserService");
  return { ...actual, listManagedProfiles: mocks.listManagedProfiles, inviteManagedUser: mocks.inviteManagedUser, updateManagedProfile: mocks.updateManagedProfile, resendManagedInvitation: mocks.resendManagedInvitation };
});

describe("AdminUsersPage role-aware account forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    mocks.listManagedProfiles.mockResolvedValue({ profiles: [], invitationMetadataAvailable: true });
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "caller", role: "admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(cleanup);

  it("lets an Admin invite Students and Student Orgs without exposing privileged role options", async () => {
    render(<AdminUsersPage />);
    await screen.findByRole("heading", { name: "User Management" });
    fireEvent.click(screen.getByRole("button", { name: /Invite User/i }));
    expect(screen.getByPlaceholderText("23-3314")).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    expect(await screen.findByRole("option", { name: /Student Org/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Administrator/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Super Admin/ })).toBeNull();
    expect(screen.getByText("Administrator accounts can only be invited by a Super Admin.")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Student Org/ }));
    await waitFor(() => expect(screen.queryByPlaceholderText("23-3314")).toBeNull());
    expect(screen.getByText(/only after the organization has been verified/i)).toBeTruthy();
  });

  it("offers privileged roles only to Super Admin and hides Student ID after role selection", async () => {
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    render(<AdminUsersPage />);
    await screen.findByRole("heading", { name: "User Management" });
    fireEvent.click(screen.getByRole("button", { name: /Invite User/i }));
    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    const administratorOption = (await screen.findAllByRole("option")).find((option) => option.textContent?.includes("Administrative tools"));
    expect(administratorOption).toBeTruthy();
    fireEvent.click(administratorOption!);
    expect(screen.getByText("Admin details")).toBeTruthy();
    expect(screen.getByText("Department / Office (optional)")).toBeTruthy();
    expect(screen.queryByPlaceholderText("23-3314")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    const superAdminOption = (await screen.findAllByRole("option")).find((option) => option.textContent?.includes("Full account and security management"));
    expect(superAdminOption).toBeTruthy();
    fireEvent.click(superAdminOption!);
    expect(screen.queryByPlaceholderText("23-3314")).toBeNull();
    expect(screen.getByText(/manage administrator access and privileged accounts/i)).toBeTruthy();
  });

  it("shows a distinct load error and retries instead of displaying empty counts", async () => {
    mocks.listManagedProfiles
      .mockRejectedValueOnce(new Error("network request failed"))
      .mockResolvedValueOnce({ profiles: [], invitationMetadataAvailable: true });
    render(<AdminUsersPage />);
    expect(await screen.findByRole("heading", { name: "Couldn’t load users" })).toBeTruthy();
    expect(screen.queryByText("No users match these filters.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));
    expect(await screen.findByText("No users match these filters.")).toBeTruthy();
  });

  it("keeps historical profiles visible and explains missing invite migration", async () => {
    mocks.listManagedProfiles.mockResolvedValue({
      profiles: [{
        id: "student-1", role: "student", account_status: "active", first_name: "Jamie", last_name: "Student",
        email: "jamie@example.test", student_number: "23-3314", department: "Science", avatar_path: null,
        is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      invitationMetadataAvailable: false,
    });
    render(<AdminUsersPage />);
    expect(await screen.findByText("Backend setup required")).toBeTruthy();
    expect(screen.getByText("Jamie Student")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Invite User/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pending Invite" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["Administrator", "admin"],
    ["Super Admin", "super_admin"],
  ] as const)("lets a Super Admin edit another %s and use Role and Access controls", async (label, role) => {
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root-a", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    const targetName = role === "admin" ? "Casey Administrator" : "Riley Superadmin";
    const common = {
      account_status: "active" as const, email: `${role}@example.test`, student_number: null, department: "Office",
      avatar_path: null, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    mocks.listManagedProfiles.mockResolvedValue({
      invitationMetadataAvailable: true,
      profiles: [
        { ...common, id: "root-b", role: "super_admin", first_name: "Riley", last_name: "Superadmin" },
        { ...common, id: "admin-b", role: "admin", first_name: "Casey", last_name: "Administrator" },
      ],
    });
    render(<AdminUsersPage />);
    await screen.findByText(targetName);
    fireEvent.pointerDown(screen.getByRole("button", { name: `Actions for ${targetName}` }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit account" }));
    const roleControl = screen.getByRole("combobox", { name: "Role" }) as HTMLButtonElement;
    const accessControl = screen.getByRole("combobox", { name: "Account status" }) as HTMLButtonElement;
    expect(roleControl.disabled).toBe(false);
    expect(accessControl.disabled).toBe(false);
    fireEvent.click(roleControl);
    expect((await screen.findAllByRole("option", { name: /Super Admin/ })).length).toBeGreaterThan(0);
  });

  it("blocks own privilege controls with a clear explanation", async () => {
    const self = {
      id: "root", role: "super_admin", account_status: "active", first_name: "Alex", last_name: "Root", email: "root@example.test",
      student_number: null, department: "IT", avatar_path: null, is_active: true, last_login_at: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    mocks.listManagedProfiles.mockResolvedValue({ profiles: [self], invitationMetadataAvailable: true });
    render(<AdminUsersPage />);
    await screen.findByText("Alex Root");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Alex Root" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit account" }));
    expect(screen.getByText("You can't change your own role or deactivate your own account.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Role" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Account status" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps Normal Admin from editing a privileged account", async () => {
    const target = {
      id: "admin-b", role: "admin", account_status: "active", first_name: "Casey", last_name: "Admin", email: "casey@example.test",
      student_number: null, department: "Office", avatar_path: null, is_active: true, last_login_at: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    mocks.listManagedProfiles.mockResolvedValue({ profiles: [target], invitationMetadataAvailable: true });
    render(<AdminUsersPage />);
    await screen.findByText("Casey Admin");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Casey Admin" }), { button: 0, ctrlKey: false });
    const edit = await screen.findByRole("menuitem", { name: "Edit account" });
    expect(edit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Only a Super Admin can manage this account.")).toBeTruthy();
  });

  it("allows a Super Admin to demote another Super Admin while one remains active", async () => {
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root-a", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    mocks.listManagedProfiles.mockResolvedValue({
      invitationMetadataAvailable: true,
      profiles: [{
        id: "root-b", role: "super_admin", account_status: "active", first_name: "Riley", last_name: "Superadmin", email: "riley@example.test",
        student_number: null, department: "Office", avatar_path: null, is_active: true, last_login_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
    });
    mocks.updateManagedProfile.mockResolvedValue({});
    render(<AdminUsersPage />);
    await screen.findByText("Riley Superadmin");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Riley Superadmin" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit account" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    fireEvent.click((await screen.findAllByRole("option", { name: /Administrative tools/ }))[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(within(confirmation).getByText("Change administrator access?")).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access" }));
    await waitFor(() => expect(mocks.updateManagedProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "root-b", role: "admin", isActive: true, studentNumber: null })));
  });

  it("clears Student ID when role changes away from Student and requires it when changing back", async () => {
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    mocks.listManagedProfiles.mockResolvedValue({ invitationMetadataAvailable: true, profiles: [{
      id: "student-3", role: "student", account_status: "active", first_name: "Taylor", last_name: "Student", email: "taylor@example.test",
      student_number: "23-3314", department: "Science", avatar_path: null, is_active: true, last_login_at: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }] });
    render(<AdminUsersPage />);
    await screen.findByText("Taylor Student");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Taylor Student" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit account" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    fireEvent.click((await screen.findAllByRole("option", { name: /Administrative tools/ }))[0]);
    expect(screen.queryByPlaceholderText("23-3314")).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    fireEvent.click((await screen.findAllByRole("option", { name: /Normal student access/ }))[0]);
    const studentId = screen.getByPlaceholderText("23-3314") as HTMLInputElement;
    expect(studentId.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Use the format 23-3314.")).toBeTruthy();
  });

  it("keeps the parent Edit dialog and selected form state after nested confirmation closes", async () => {
    mocks.useAdminAuth.mockReturnValue({ profile: { id: "root", role: "super_admin", is_active: true }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    mocks.listManagedProfiles.mockResolvedValue({
      invitationMetadataAvailable: true,
      profiles: [{
        id: "student-2", role: "student", account_status: "active", first_name: "Jordan", last_name: "Student", email: "jordan@example.test",
        student_number: "23-3314", department: "Science", avatar_path: null, is_active: true, last_login_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
    });
    render(<AdminUsersPage />);
    await screen.findByText("Jordan Student");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Jordan Student" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit account" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    fireEvent.click(await screen.findByRole("option", { name: /Administrative tools/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Edit user" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Role" }).textContent).toContain("Administrator");
  });

  it("applies filters immediately and marks the selected role/status chips", async () => {
    const common = { account_status: "active" as const, student_number: null, department: null, avatar_path: null, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
    mocks.listManagedProfiles.mockResolvedValue({ invitationMetadataAvailable: true, profiles: [
      { ...common, id: "student-1", role: "student", first_name: "Sam", last_name: "Student", email: "sam@example.test" },
      { ...common, id: "org-1", role: "student_org", first_name: "Olive", last_name: "Org", email: "olive@example.test" },
    ] });
    render(<AdminUsersPage />);
    await screen.findByText("Sam Student");
    fireEvent.click(screen.getByRole("button", { name: "Student Org" }));
    expect(screen.getByRole("button", { name: "Student Org" }).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Olive Org")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Sam Student")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(screen.getByRole("button", { name: "Inactive" }).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("No users match these filters.")).toBeTruthy();
  });
});
