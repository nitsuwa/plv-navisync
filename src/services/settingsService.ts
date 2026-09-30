import { getSupabase } from "../lib/supabase";
import { logActivity } from "./activityLogService";

/**
 * Typed settings service over the `system_settings` table (global rows,
 * campus_id IS NULL). Falls back to DEFAULT_SETTINGS when the table is
 * empty, so the app always renders even with a fresh database.
 */

export type SettingValue = string | number | boolean | null;

export type StudentLandingPage = "home" | "map";
export type StudentRouteMode = "standard" | "accessible";

export interface PublicPlatformSettings {
  defaultCampusId: string;
  defaultLandingPage: StudentLandingPage;
  rememberLastCampus: boolean;
  showApprovedEventOverlays: boolean;
  defaultRouteMode: StudentRouteMode;
  animatedRouteArrows: boolean;
  autoFocusRoute: boolean;
  autoFollowFloors: boolean;
  showMapLabels: boolean;
}

export const DEFAULT_PUBLIC_PLATFORM_SETTINGS: PublicPlatformSettings = {
  defaultCampusId: "",
  defaultLandingPage: "home",
  rememberLastCampus: true,
  showApprovedEventOverlays: true,
  defaultRouteMode: "standard",
  animatedRouteArrows: true,
  autoFocusRoute: true,
  autoFollowFloors: true,
  showMapLabels: true,
};

export interface SettingsEntry {
  key: string;
  value: SettingValue;
  isPublic?: boolean;
}

/** Defaults used when a key has no database row yet. */
export const DEFAULT_SETTINGS: Record<string, SettingValue> = {
  site_name: "PLV NaviSync",
  site_tagline: "Smart Campus Navigator",
  contact_email: "navisync@plv.edu.ph",
  campus_address: "Tongco Street, Karuhatan, Valenzuela City",
  default_latitude: "14.7116",
  default_longitude: "120.9660",
  default_zoom: "16",
  landing_page: "/",
  default_theme: "dark",
  default_campus_id: DEFAULT_PUBLIC_PLATFORM_SETTINGS.defaultCampusId,
  default_student_landing_page: DEFAULT_PUBLIC_PLATFORM_SETTINGS.defaultLandingPage,
  remember_last_campus: DEFAULT_PUBLIC_PLATFORM_SETTINGS.rememberLastCampus,
  show_approved_event_overlays: DEFAULT_PUBLIC_PLATFORM_SETTINGS.showApprovedEventOverlays,
  default_route_mode: DEFAULT_PUBLIC_PLATFORM_SETTINGS.defaultRouteMode,
  animated_route_arrows: DEFAULT_PUBLIC_PLATFORM_SETTINGS.animatedRouteArrows,
  auto_focus_route: DEFAULT_PUBLIC_PLATFORM_SETTINGS.autoFocusRoute,
  auto_follow_floors: DEFAULT_PUBLIC_PLATFORM_SETTINGS.autoFollowFloors,
  show_map_labels: DEFAULT_PUBLIC_PLATFORM_SETTINGS.showMapLabels,
};

let publicSettingsCache: { value: Record<string, unknown>; expiresAt: number } | null = null;
const PUBLIC_SETTINGS_CACHE_MS = 15_000;

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizePublicPlatformSettings(settings: Record<string, unknown>): PublicPlatformSettings {
  const defaultLandingPage = settings.default_student_landing_page === "map" ? "map" : "home";
  const defaultRouteMode = settings.default_route_mode === "accessible" ? "accessible" : "standard";
  return {
    defaultCampusId: asString(settings.default_campus_id, ""),
    defaultLandingPage,
    rememberLastCampus: asBoolean(settings.remember_last_campus, true),
    showApprovedEventOverlays: asBoolean(settings.show_approved_event_overlays, true),
    defaultRouteMode,
    animatedRouteArrows: asBoolean(settings.animated_route_arrows, true),
    autoFocusRoute: asBoolean(settings.auto_focus_route, true),
    autoFollowFloors: asBoolean(settings.auto_follow_floors, true),
    showMapLabels: asBoolean(settings.show_map_labels, true),
  };
}

/** Read and normalize public student-facing controls in one settings request. */
export async function getPublicPlatformSettings(): Promise<PublicPlatformSettings> {
  return normalizePublicPlatformSettings(await getPublicSettings());
}

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
  if (publicSettingsCache && publicSettingsCache.expiresAt > Date.now()) return publicSettingsCache.value;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .eq("is_public", true)
      .is("campus_id", null);
    if (error) return { ...DEFAULT_SETTINGS };

    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    (data ?? []).forEach((row) => {
      out[row.key] = row.value;
    });
    publicSettingsCache = { value: out, expiresAt: Date.now() + PUBLIC_SETTINGS_CACHE_MS };
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Insert-or-update each entry and append one audit entry for the batch. */
export async function upsertSettings(entries: SettingsEntry[], writeAudit = true): Promise<void> {
  if (entries.length === 0) return;
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

  publicSettingsCache = null;
  if (writeAudit) await logPlatformSettingsActivity(entries.map((entry) => entry.key));
}

export async function logPlatformSettingsActivity(keys: string[]): Promise<void> {
  await logActivity({
    action: "settings.update",
    entityType: "settings",
    metadata: { keys },
  });
}

export const settingsService = {
  getSettings,
  getPublicSettings,
  getPublicPlatformSettings,
  normalizePublicPlatformSettings,
  upsertSettings,
  logPlatformSettingsActivity,
  DEFAULT_SETTINGS,
};
