import { getSupabase, type Profile } from "../lib/supabase";

export type ManagedRole = "student" | "admin";

export interface ManagedProfile extends Omit<Profile, "role"> {
  role: ManagedRole;
}

export interface ProfileFilters {
  search?: string;
  role?: ManagedRole | "all";
  status?: "active" | "inactive" | "all";
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

function isManagedRole(role: string): role is ManagedRole {
  return role === "student" || role === "admin";
}

function asManagedProfile(profile: Profile): ManagedProfile {
  if (!isManagedRole(profile.role)) throw new Error(`Unsupported profile role: ${profile.role}`);
  return profile as ManagedProfile;
}

export async function listManagedProfiles(filters: ProfileFilters = {}): Promise<ManagedProfile[]> {
  const client = getSupabase();
  let query = client.from("profiles").select("*").order("created_at", { ascending: false });

  if (filters.role && filters.role !== "all") query = query.eq("role", filters.role);
  if (filters.status && filters.status !== "all") query = query.eq("is_active", filters.status === "active");

  const { data, error } = await query;
  if (error) throw error;
  const profiles = (data ?? []).map(asManagedProfile);
  const search = filters.search?.trim().toLocaleLowerCase();
  if (!search) return profiles;
  return profiles.filter((profile) => [
    profile.first_name,
    profile.last_name,
    `${profile.first_name} ${profile.last_name}`,
    profile.email,
    profile.department,
    profile.student_number,
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(search));
}

export async function updateManagedProfile(input: UpdateManagedProfileInput): Promise<ManagedProfile> {
  const { data, error } = await getSupabase().rpc("admin_update_profile", {
    p_target_id: input.id,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_department: input.department ?? "",
    p_student_number: input.studentNumber ?? "",
    p_role: input.role,
    p_is_active: input.isActive,
  });
  if (error) throw error;
  if (!data) throw new Error("The profile update returned no data.");
  return asManagedProfile(data);
}

export async function inviteManagedUser(input: InviteManagedUserInput): Promise<{ id: string; email: string }> {
  const { data, error } = await getSupabase().functions.invoke<{ id: string; email: string }>("admin-users", {
    body: {
      action: "invite",
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      department: input.department ?? null,
      studentNumber: input.studentNumber ?? null,
      role: input.role,
    },
  });
  if (error) throw error;
  if (!data?.id) throw new Error("The invitation returned no user.");
  return data;
}
