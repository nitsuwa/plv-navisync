import { getSupabase } from "../lib/supabase";
import { logActivity } from "./activityLogService";

/**
 * Typed settings service over the `system_settings` table (global rows,
 * campus_id IS NULL). Falls back to DEFAULT_SETTINGS when the table is
 * empty, so the app always renders even with a fresh database.
 */

export type SettingValue = string | number | boolean | null;

export interface SettingsEntry {
  key: string;
  value: SettingValue;
  isPublic?: boolean;
}

/** Defaults used when a key has no database row yet. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: "PLV NaviSync",
  site_tagline: "Smart Campus Navigator",
  contact_email: "navisync@plv.edu.ph",
  campus_address: "Tongco Street, Karuhatan, Valenzuela City",
  default_latitude: "14.7116",
  default_longitude: "120.9660",
  default_zoom: "16",
  landing_page: "/",
  default_theme: "dark",
};

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** All global settings for the admin (DB values win over defaults). */
export async function getSettings(): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value")
    .is("campus_id", null)
    .order("key");
  if (error) throw error;

  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  (data ?? []).forEach((row) => {
    out[row.key] = row.value;
  });
  return out;
}

/** Publicly visible subset of settings (is_public = true). */
export async function getPublicSettings(): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("is_public", true)
    .is("campus_id", null);
  if (error) return { ...DEFAULT_SETTINGS };

  const out: Record<string, unknown> = {};
  (data ?? []).forEach((row) => {
    out[row.key] = row.value;
  });
  return out;
}

/** Insert-or-update each entry and append one audit entry for the batch. */
export async function upsertSettings(entries: SettingsEntry[]): Promise<void> {
  const supabase = getSupabase();
  const userId = await currentUserId();
  const now = new Date().toISOString();

  for (const entry of entries) {
    const { data: existing } = await supabase
      .from("system_settings")
      .select("id")
      .eq("key", entry.key)
      .is("campus_id", null)
      .maybeSingle();

    const payload = {
      key: entry.key,
      value: entry.value as never,
      is_public: entry.isPublic ?? false,
      updated_by: userId,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await supabase.from("system_settings").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("system_settings")
        .insert({ ...payload, campus_id: null });
      if (error) throw error;
    }
  }

  await logActivity({
    action: "settings.update",
    entityType: "settings",
    metadata: { keys: entries.map((e) => e.key) },
  });
}

export const settingsService = {
  getSettings,
  getPublicSettings,
  upsertSettings,
  DEFAULT_SETTINGS,
};
