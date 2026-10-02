type ManagedInviteInput = {
  email: string;
  firstName: string;
  lastName: string;
  department: string | null;
  studentNumber: string | null;
  role: "student" | "student_org" | "admin" | "super_admin";
  actorId: string;
  roleLabel: string;
  redirectTo: string;
  expiresAt: string;
  metadata: Record<string, unknown>;
};

export type ManagedInviteResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "intent" | "invite"; authMessage?: string };

/**
 * Creates the short-lived server-only intent, then sends the exact same
 * one-time token through trusted Supabase Auth metadata. The token is never
 * included in the result returned to the request handler.
 */
export async function sendManagedInvitation(
  service: any,
  input: ManagedInviteInput,
  makeToken: () => string = () => crypto.randomUUID(),
): Promise<ManagedInviteResult> {
  const intentToken = makeToken();
  const { error: intentError } = await service.from("admin_invitation_intents").upsert({
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    department: input.department,
    student_number: input.studentNumber,
    invited_role: input.role,
    invited_by: input.actorId,
    expires_at: input.expiresAt,
    intent_token: intentToken,
  }, { onConflict: "email" });

  if (intentError) return { ok: false, reason: "intent" };

  let inviteData: { user?: { id?: string } | null } | null = null;
  let inviteError: { message?: string } | null = null;
  try {
    const result = await service.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: input.redirectTo,
      data: {
        ...input.metadata,
        first_name: input.firstName,
        last_name: input.lastName,
        invited_role: input.roleLabel,
        navisync_invite_token: intentToken,
      },
    });
    inviteData = result.data;
    inviteError = result.error;
  } catch (error) {
    inviteError = { message: error instanceof Error ? error.message : "Invitation request failed" };
  }

  if (inviteError || !inviteData?.user?.id) {
    // Match both keys so a concurrent newer invite intent is never removed.
    try {
      await service.from("admin_invitation_intents").delete()
        .eq("email", input.email)
        .eq("intent_token", intentToken);
    } catch {
      // The short expiry remains the final cleanup bound if Supabase is offline.
    }
    return { ok: false, reason: "invite", authMessage: inviteError?.message ?? "Invitation request failed" };
  }

  return { ok: true, userId: inviteData.user.id };
}
