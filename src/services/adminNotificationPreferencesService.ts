import { getSupabase } from "../lib/supabase";
import type { ActivityLogRow } from "./activityLogService";

export interface AdminNotificationPreferences {
  reports: boolean;
  events: boolean;
  campus: boolean;
  announcements: boolean;
  users: boolean;
}

export const DEFAULT_ADMIN_NOTIFICATION_PREFERENCES: AdminNotificationPreferences = {
  reports: true,
  events: true,
  campus: true,
  announcements: true,
  users: true,
};

const PREFERENCE_KEY = "admin_notification_preferences";

function normalizePreferences(value: unknown): AdminNotificationPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    reports: typeof source.reports === "boolean" ? source.reports : true,
    events: typeof source.events === "boolean" ? source.events : true,
    campus: typeof source.campus === "boolean" ? source.campus : true,
    announcements: typeof source.announcements === "boolean" ? source.announcements : true,
    users: typeof source.users === "boolean" ? source.users : true,
  };
}

/** Notification choices live with the signed-in admin, not as platform-wide settings. */
export async function getAdminNotificationPreferences(): Promise<AdminNotificationPreferences> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) throw error;
  return normalizePreferences(data.user?.user_metadata?.[PREFERENCE_KEY]);
}

export async function saveAdminNotificationPreferences(
  preferences: AdminNotificationPreferences,
): Promise<void> {
  const supabase = getSupabase();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!data.user) throw new Error("Sign in again before saving notification preferences.");

  const normalized = normalizePreferences(preferences);
  const { error } = await supabase.auth.updateUser({ data: { [PREFERENCE_KEY]: normalized } });
  if (error) throw error;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("plv-admin-notification-preferences-updated"));
}

export function isAdminActivityNotificationEnabled(
  activity: Pick<ActivityLogRow, "action" | "entity_type">,
  preferences: AdminNotificationPreferences,
): boolean {
  const kind = `${activity.entity_type ?? ""} ${activity.action}`.toLowerCase();
  if (kind.includes("report")) return preferences.reports;
  if (kind.includes("event")) return preferences.events;
  if (kind.includes("announcement")) return preferences.announcements;
  if (kind.includes("campus") || kind.includes("building") || kind.includes("floor") || kind.includes("map")) {
    return preferences.campus;
  }
  if (kind.includes("profile") || kind.includes("user")) return preferences.users;
  // Preserve the existing feed for system actions without a preference group.
  return true;
}

export const adminNotificationPreferencesService = {
  get: getAdminNotificationPreferences,
  save: saveAdminNotificationPreferences,
  isEnabled: isAdminActivityNotificationEnabled,
};
