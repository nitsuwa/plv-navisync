import { getSupabase, type Profile } from "../lib/supabase";
import { normalizeStudentNumber } from "../lib/studentAccount";
import type { AppRole } from "../lib/roles";

export type ManagedRole = AppRole;
export type ManagedAccountStatus = "pending_invite" | "active" | "inactive";

export interface ManagedProfile extends Omit<Profile, "role"> {
  role: ManagedRole;
  account_status: ManagedAccountStatus;
}

export interface ProfileFilters {
  search?: string;
  role?: ManagedRole | "all";
  status?: ManagedAccountStatus | "all";
}

export interface UpdateManagedProfileInput {
  id: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  studentNumber?: string | null;
  role: ManagedRole;
  isActive: boolean;
}

export interface InviteManagedUserInput extends Omit<UpdateManagedProfileInput, "id" | "isActive"> {
  email: string;
}

export interface ManagedProfilesResult {
  profiles: ManagedProfile[];
  invitationMetadataAvailable: boolean;
}

function isManagedRole(role: string): role is ManagedRole {
  return role === "student" || role === "student_org" || role === "admin" || role === "super_admin";
}

function asManagedProfile(profile: Profile, status: ManagedAccountStatus = profile.is_active ? "active" : "inactive"): ManagedProfile {
  if (!isManagedRole(profile.role)) throw new Error(`Unsupported profile role: ${profile.role}`);
  return { ...profile, role: profile.role, account_status: status };
}

function isMissingInvitationMetadata(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof item.code === "string" ? item.code : "";
  const text = [item.message, item.details].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return code === "PGRST205" || code === "42P01" || /admin_user_invitations.*(not find|does not exist|schema cache)|could not find the table.*admin_user_invitations/.test(text);
}

function isLatestDatabaseUpdateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof item.code === "string" ? item.code : "";
  const text = [item.message, item.details].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return ["PGRST202", "PGRST205", "42P01", "42883"].includes(code)
    || /admin_user_invitations|admin_invitation_intents|admin_update_profile|complete_user_invitation/.test(text);
}

export async function listManagedProfiles(filters: ProfileFilters = {}): Promise<ManagedProfilesResult> {
  const client = getSupabase();
  let query = client.from("profiles").select("*").order("created_at", { ascending: false });
  if (filters.role && filters.role !== "all") query = query.eq("role", filters.role);

  const { data, error } = await query;
  if (error) throw error;

  const { data: invitations, error: invitationError } = await client
    .from("admin_user_invitations")
    .select("profile_id, accepted_at, revoked_at");
  const invitationMetadataAvailable = !invitationError;
  if (invitationError && !isMissingInvitationMetadata(invitationError)) throw invitationError;
  if (invitationError && import.meta.env.DEV) {
    const item = invitationError as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    console.warn("[Admin Users] Invitation metadata is not deployed; using profile status fallback.", {
      code: item.code,
      message: item.message,
      details: item.details,
      hint: item.hint,
    });
  }

  const invitationByProfile = new Map((invitations ?? []).map((invite) => [invite.profile_id, invite]));
  let profiles = (data ?? []).map((row) => {
    const invitation = invitationByProfile.get(row.id);
    const status: ManagedAccountStatus = invitationMetadataAvailable && invitation && !invitation.accepted_at && !invitation.revoked_at
      ? "pending_invite"
      : row.is_active ? "active" : "inactive";
    return asManagedProfile(row as Profile, status);
  });
  if (filters.status && filters.status !== "all") profiles = profiles.filter((profile) => profile.account_status === filters.status);

  const search = filters.search?.trim().toLocaleLowerCase();
  if (search) profiles = profiles.filter((profile) => [
    profile.first_name,
    profile.last_name,
    `${profile.first_name} ${profile.last_name}`,
    profile.email,
    profile.department,
    profile.student_number,
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(search));
  return { profiles, invitationMetadataAvailable };
}

export async function updateManagedProfile(input: UpdateManagedProfileInput): Promise<ManagedProfile> {
  const { data, error } = await getSupabase().rpc("admin_update_profile", {
    p_target_id: input.id,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_department: input.department?.trim() ?? "",
    // Student IDs belong only to Student profiles; role conversion clears them
    // in the database as well as in the form state.
    p_student_number: input.role === "student" ? normalizeStudentNumber(input.studentNumber ?? "") : null,
    p_role: input.role,
    p_is_active: input.isActive,
  });
  if (error) throw new Error(await readFunctionOrDatabaseMessage(error));
  if (!data) throw new Error("The profile update returned no data.");
  return asManagedProfile(data as Profile);
}

async function readFunctionOrDatabaseMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "We couldn't complete the request. Try again.";
  const item = error as { message?: unknown; code?: unknown; details?: unknown; context?: unknown; name?: unknown };
  const text = [item.message, item.details].filter((value) => typeof value === "string").join(" ").toLowerCase();
  if (isLatestDatabaseUpdateError(error)) return "User management needs the latest database update.";
  if (text.includes("failed to send a request to the edge function") || text.includes("fetch failed")) return "Couldn't reach the invitation service. Check your connection and try again.";
  if (item.code === "23505" || /student id is already registered|profiles_student_number_uq|duplicate key.*student_number/.test(text)) return "This Student ID is already registered.";
  if (/email.*already|user already registered|already an account|duplicate.*email/.test(text)) return "An account already uses this email.";
  if (/you cannot change your own|cannot change your own role|self.*(role|status)/.test(text)) return "You can't change your own role or deactivate your own account.";
  if (item.code === "42501" || /permission|forbidden|only super admin/.test(text)) return "You don't have permission to make this change.";
  if (/at least one active super admin/.test(text)) return "At least one active Super Admin is required.";
  if (/wait before|rate limit|too many requests/.test(text)) return "Please wait before sending another invitation.";
  const context = item.context;
  if (typeof Response !== "undefined" && context instanceof Response) {
    if (context.status === 404) return "User invitations require the latest server update.";
    try {
      const body = await context.clone().json() as { error?: unknown; message?: unknown; code?: unknown };
      if (typeof body.error === "string" || typeof body.message === "string" || typeof body.code === "string") {
        return await readFunctionOrDatabaseMessage({ message: body.error ?? body.message, code: body.code });
      }
    } catch {
      // Use the generic fallback for non-JSON transport errors.
    }
  }
  return "We couldn't complete the request. Try again.";
}

async function invokeAdminUsers(body: Record<string, unknown>): Promise<{ id?: string; email?: string }> {
  const { data, error } = await getSupabase().functions.invoke<{ id?: string; email?: string; error?: string }>("admin-users", { body });
  if (error) throw new Error(await readFunctionOrDatabaseMessage(error));
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

export async function inviteManagedUser(input: InviteManagedUserInput): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const result = await invokeAdminUsers({
    action: "invite",
    email,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    department: input.department?.trim() || null,
    studentNumber: input.role === "student" ? normalizeStudentNumber(input.studentNumber ?? "") : null,
    role: input.role,
    redirectTo: `${window.location.origin}/auth/invite`,
  });
  if (!result.id) throw new Error("We couldn't complete the request. Try again.");
  return { id: result.id, email: result.email ?? email };
}

export async function resendManagedInvitation(profileId: string): Promise<void> {
  await invokeAdminUsers({ action: "resend", profileId, redirectTo: `${window.location.origin}/auth/invite` });
}

export function managedUserErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (/you cannot change your own|cannot change your own role|self.*(role|status)/.test(message)) return "You can't change your own role or deactivate your own account.";
    if (/user management needs the latest database update/.test(message)) return "User management needs the latest database update.";
    if (/user invitations require the latest server update|function.*not found|edge function.*not found/.test(message)) return "User invitations require the latest server update.";
    if (/couldn't reach the invitation service|failed to send a request|fetch failed|networkerror/.test(message)) return "Couldn't reach the invitation service. Check your connection and try again.";
    if (message.includes("student id is already registered") || message.includes("profiles_student_number_uq")) return "This Student ID is already registered.";
    if (message.includes("account already uses this email") || message.includes("user already registered")) return "An account already uses this email.";
    if (message.includes("at least one active super admin")) return "At least one active Super Admin is required.";
    if (message.includes("wait before") || message.includes("rate limit")) return "Please wait before sending another invitation.";
    if (message.includes("permission") || message.includes("forbidden")) return "You don't have permission to make this change.";
    if (message.includes("invitation is no longer valid") || message.includes("invitation is not pending")) return "This invitation is no longer valid.";
    if (/valid.*student|student id.*format/i.test(message)) return "Use the format 23-3314 for Student ID.";
    if (/student id.*format/i.test(message)) return "Use the format 23-3314 for Student ID.";
    if (/valid email|first and last name|required/i.test(message)) return "Check the required account details and try again.";
    return "We couldn't complete the request. Try again.";
  }
  return "We couldn't complete the request. Try again.";
}

export function managedUserLoadErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Couldn't load users. Please try again.";
  const item = error as { code?: unknown; message?: unknown; details?: unknown; status?: unknown };
  const code = typeof item.code === "string" ? item.code : "";
  const text = [item.message, item.details].filter((value) => typeof value === "string").join(" ").toLowerCase();
  if (isLatestDatabaseUpdateError(error)) return "User management needs the latest database update.";
  if (code === "42501" || item.status === 401 || item.status === 403 || /permission denied|not authorized|forbidden/.test(text)) {
    return "You don't have permission to view these users.";
  }
  if (/failed to fetch|networkerror|network request failed|fetch failed/.test(text)) {
    return "Couldn't load users. Check your connection and try again.";
  }
  return "Couldn't load users. Please try again.";
}
