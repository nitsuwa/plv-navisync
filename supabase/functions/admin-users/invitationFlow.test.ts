import { describe, expect, it, vi } from "vitest";
import { sendManagedInvitation } from "./invitationFlow";
import { isManagedRole, roleAllowed, studentNumberForInvite } from "./invitePolicy";

const baseInput = {
  email: "invitee@example.com",
  firstName: "Alex",
  lastName: "Reyes",
  department: "Student Services",
  studentNumber: null,
  role: "admin" as const,
  actorId: "trusted-actor-id",
  roleLabel: "Administrator",
  redirectTo: "https://plvnavisync.vercel.app/auth/invite",
  expiresAt: "2026-10-02T12:10:00.000Z",
  metadata: { first_name: "Alex", last_name: "Reyes", invited_role: "Administrator", email_template: "PLV" },
};

function mockService(inviteResult: unknown = { data: { user: { id: "auth-user-id" } }, error: null }) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn();
  const deleteChain = {
    eq: deleteEq,
    then: (resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
  };
  deleteEq.mockReturnValue(deleteChain);
  const remove = vi.fn(() => deleteChain);
  const inviteUserByEmail = vi.fn().mockResolvedValue(inviteResult);
  const service = {
    from: vi.fn(() => ({ upsert, delete: remove })),
    auth: { admin: { inviteUserByEmail } },
  };
  return { service, upsert, remove, deleteEq, inviteUserByEmail };
}

describe("managed invitation token handshake", () => {
  it.each([
    ["admin", "Administrator"],
    ["super_admin", "Super Admin"],
  ] as const)("stores and sends the same private token for %s invitations", async (role, roleLabel) => {
    const token = "6be59650-7f22-4d9e-9348-960b9d4e0a8f";
    const { service, upsert, inviteUserByEmail } = mockService();
    const result = await sendManagedInvitation(service, {
      ...baseInput,
      role,
      roleLabel,
      studentNumber: null,
    }, () => token);

    expect(result).toEqual({ ok: true, userId: "auth-user-id" });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      email: baseInput.email,
      invited_role: role,
      student_number: null,
      intent_token: token,
    }), { onConflict: "email" });
    expect(inviteUserByEmail).toHaveBeenCalledWith(baseInput.email, expect.objectContaining({
      redirectTo: baseInput.redirectTo,
      data: expect.objectContaining({
        first_name: baseInput.firstName,
        last_name: baseInput.lastName,
        invited_role: roleLabel,
        email_template: "PLV",
        navisync_invite_token: token,
      }),
    }));
    expect(service.from).toHaveBeenCalledTimes(1);
    expect(service.from).toHaveBeenCalledWith("admin_invitation_intents");
  });

  it("keeps student ID required and validates NN-NNNN", () => {
    expect(studentNumberForInvite("student", "23-3314")).toEqual({ valid: true, studentNumber: "23-3314" });
    expect(studentNumberForInvite("student", null)).toEqual({ valid: false, studentNumber: null });
    expect(studentNumberForInvite("student", "233314").valid).toBe(false);
    expect(studentNumberForInvite("student", "23-33145").valid).toBe(false);
  });

  it.each(["student_org", "admin", "super_admin"] as const)("forces Student ID to null for %s", (role) => {
    expect(studentNumberForInvite(role, "23-3314")).toEqual({ valid: true, studentNumber: null });
  });

  it("keeps the Admin and Super Admin invite boundaries server-side", () => {
    expect(isManagedRole("super_admin")).toBe(true);
    expect(roleAllowed("admin", "student")).toBe(true);
    expect(roleAllowed("admin", "student_org")).toBe(true);
    expect(roleAllowed("admin", "admin")).toBe(false);
    expect(roleAllowed("admin", "super_admin")).toBe(false);
    expect(roleAllowed("super_admin", "admin")).toBe(true);
    expect(roleAllowed("super_admin", "super_admin")).toBe(true);
  });

  it("deletes only the matching token intent when Auth rejects the invite", async () => {
    const token = "55dd3196-a341-4f82-9c72-3ab7bd6e78fd";
    const { service, remove, deleteEq, inviteUserByEmail } = mockService({ data: { user: null }, error: { message: "provider unavailable" } });
    const result = await sendManagedInvitation(service, baseInput, () => token);

    expect(result).toEqual({ ok: false, reason: "invite", authMessage: "provider unavailable" });
    expect(remove).toHaveBeenCalledOnce();
    expect(deleteEq).toHaveBeenNthCalledWith(1, "email", baseInput.email);
    expect(deleteEq).toHaveBeenNthCalledWith(2, "intent_token", token);
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("does not include a token in the invitation result or activity-log writes", async () => {
    const token = "c4136b31-daf1-433b-8391-4be1e36302a2";
    const { service, upsert } = mockService();
    const result = await sendManagedInvitation(service, baseInput, () => token);

    expect(Object.keys(result)).toEqual(["ok", "userId"]);
    expect(upsert.mock.calls[0][0]).toHaveProperty("intent_token", token);
    expect(service.from).not.toHaveBeenCalledWith("activity_logs");
  });
});
