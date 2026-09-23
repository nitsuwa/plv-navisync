import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";
import { supabase } from "../lib/supabase";

export interface StudentNotificationPreferences {
  mapUpdates: boolean;
  reportStatus: boolean;
  campusEvents: boolean;
}

export const DEFAULT_STUDENT_PREFERENCES: StudentNotificationPreferences = {
  mapUpdates: true,
  reportStatus: true,
  campusEvents: true,
};

const LOCAL_STORAGE_KEY = "plv_student_preferences_v1";
type StudentClient = SupabaseClient<Database>;

function isPreferences(value: unknown): value is StudentNotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.mapUpdates === "boolean" &&
    typeof candidate.reportStatus === "boolean" &&
    typeof candidate.campusEvents === "boolean"
  );
}

function getStorageKey(scope: string): string {
  return `${LOCAL_STORAGE_KEY}:${scope || "guest"}`;
}

function readLocalPreferences(scope: string): StudentNotificationPreferences | null {
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalPreferences(scope: string, preferences: StudentNotificationPreferences): void {
  try {
    localStorage.setItem(getStorageKey(scope), JSON.stringify(preferences));
  } catch {
    // Local storage is only a demo fallback; a blocked store should not stop the UI.
  }
}

async function resolveUser(client?: StudentClient) {
  const activeClient = client ?? supabase;
  if (!activeClient) return { client: null, user: null };

  const { data, error } = await activeClient.auth.getUser();
  if (error) throw error;
  return { client: activeClient, user: data.user };
}

export async function loadStudentPreferences(client?: StudentClient): Promise<StudentNotificationPreferences> {
  try {
    const { user } = await resolveUser(client);
    const remotePreferences = user?.user_metadata?.student_preferences;
    if (isPreferences(remotePreferences)) return remotePreferences;

    const localPreferences = readLocalPreferences(user?.id ?? "guest");
    return localPreferences ?? DEFAULT_STUDENT_PREFERENCES;
  } catch {
    return readLocalPreferences("guest") ?? DEFAULT_STUDENT_PREFERENCES;
  }
}

export async function saveStudentPreferences(
  preferences: StudentNotificationPreferences,
  client?: StudentClient,
): Promise<StudentNotificationPreferences> {
  const normalized: StudentNotificationPreferences = {
    mapUpdates: Boolean(preferences.mapUpdates),
    reportStatus: Boolean(preferences.reportStatus),
    campusEvents: Boolean(preferences.campusEvents),
  };

  try {
    const { client: activeClient, user } = await resolveUser(client);
    if (activeClient && user) {
      const { error } = await activeClient.auth.updateUser({
        data: { student_preferences: normalized },
      });
      if (error) throw error;
      return normalized;
    }
  } catch {
    // Fall through to the account-scoped local fallback.
  }

  let scope = "guest";
  try {
    const { user } = await resolveUser(client);
    scope = user?.id ?? "guest";
  } catch {
    // Keep the guest scope when the auth client is unavailable.
  }
  writeLocalPreferences(scope, normalized);
  return normalized;
}
