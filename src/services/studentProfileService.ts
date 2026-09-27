import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../types/database.generated";
import { getSupabase } from "../lib/supabase";

type StudentClient = SupabaseClient<Database>;
type Profile = Tables<"profiles">;

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function activeClient(client?: StudentClient): StudentClient {
  return client ?? getSupabase();
}

async function currentUser(client: StudentClient) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("student_auth_required");
  return data.user;
}

export async function updateStudentProfile(
  input: { firstName: string; lastName: string; avatarPath?: string | null },
  client?: StudentClient,
): Promise<Profile> {
  const supabaseClient = activeClient(client);
  const user = await currentUser(supabaseClient);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("student_name_required");

  const updates = {
    first_name: firstName,
    last_name: lastName,
    ...(input.avatarPath !== undefined ? { avatar_path: input.avatarPath } : {}),
  };
  const { data, error } = await supabaseClient
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function fileExtension(file: Blob): string {
  const subtype = file.type.split("/")[1]?.toLowerCase();
  return subtype === "jpeg" ? "jpg" : subtype || "png";
}

export async function uploadStudentAvatar(
  file: Blob,
  client?: StudentClient,
): Promise<{ path: string; url: string }> {
  const supabaseClient = activeClient(client);
  const user = await currentUser(supabaseClient);
  if (!file.type.startsWith("image/")) throw new Error("student_avatar_type");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("student_avatar_size");

  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const path = `${user.id}/${id}.${fileExtension(file)}`;
  const { error: uploadError } = await supabaseClient.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signedUrlError } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signedUrlError || !data?.signedUrl) throw signedUrlError ?? new Error("student_avatar_url");
  return { path, url: data.signedUrl };
}

export async function getStudentAvatarUrl(path: string | null | undefined, client?: StudentClient): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await activeClient(client).storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
