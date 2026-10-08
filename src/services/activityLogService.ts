import { getSupabase } from "../lib/supabase";
import type { Tables, TablesInsert } from "../types/database.generated";
import { adminActivityTitle, formatActivityTimeAgo } from "./adminActivityPresentation";

export type ActivityLogRow = Tables<"activity_logs">;

export interface ActivityLogInput {
  action: string;
  actorId?: string | null;
  campusId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityLogFilters {
  entityType?: string;
  entityTypes?: string[];
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  after?: string;
  limit?: number;
}

export interface ActivityPresentationContext {
  actorName?: string | null;
  campusName?: string | null;
  targetName?: string | null;
}

export interface VisibleActivityHistory {
  rows: ActivityLogRow[];
  clearedBefore: string | null;
}

function supabaseErrorParts(error: unknown): { code: string; message: string } {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    code: typeof value.code === "string" ? value.code : "",
    message: typeof value.message === "string" ? value.message : error instanceof Error ? error.message : "",
  };
}

const cutoffUnavailable = new WeakSet<object>();

/** Turn PostgREST's plain error objects into an actionable message for Admin UI. */
export function activityLogErrorMessage(error: unknown): string {
  const { code, message } = supabaseErrorParts(error);
  if ((code === "PGRST202" || code === "42883") && message.includes("clear_admin_activity_history")) {
    return "Clear History is not installed yet. Apply migration 20260930113000_admin_activity_history_preferences.sql.";
  }
  if (code && message) return `${message} (${code})`;
  return message || "Could not load activity logs.";
}

/**
 * Append an audit entry to `activity_logs`.
 * The current authenticated user is used as the actor when none is given.
 * Logging never throws — a failed audit write is warned, not fatal.
 */
export async function logActivity(input: ActivityLogInput): Promise<void> {
  const supabase = getSupabase();
  let actorId = input.actorId ?? null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    actorId = input.actorId ?? userData?.user?.id ?? null;
  } catch {
    // Keep actorId as provided (or null) when auth lookup fails.
  }

  const payload: TablesInsert<"activity_logs"> = {
    action: input.action,
    actor_id: actorId,
    campus_id: input.campusId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: (input.metadata as TablesInsert<"activity_logs">["metadata"]) ?? null,
  };

  try {
    const { error } = await supabase.from("activity_logs").insert(payload);
    if (error) console.warn("Activity log insert warning:", error.message);
  } catch (err) {
    console.warn("Failed to write activity log:", err);
  }
}

/** List activity log entries, newest first, with optional filters. */
export async function listActivityLogs(filters: ActivityLogFilters = {}): Promise<ActivityLogRow[]> {
  const supabase = getSupabase();
  let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false });

  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.entityTypes?.length) query = query.in("entity_type", filters.entityTypes);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.after) query = query.gt("created_at", filters.after);
  if (filters.limit && filters.limit > 0) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function getActivityClearCutoff(): Promise<string | null> {
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const adminId = userData.user?.id;
  if (!adminId) return null;
  if (cutoffUnavailable.has(supabase)) return null;
  const { data, error } = await supabase.rpc('get_admin_activity_clear_cutoff');
  // Activity preferences are an optional UI enhancement during rollout. If a
  // deployed project has not applied that migration yet, keep the append-only
  // audit log readable and show all historical rows (no clear cutoff).
  if (error) {
    const {code,message}=supabaseErrorParts(error);
    if ((code==='PGRST202' || code==='42883') && message.includes('get_admin_activity_clear_cutoff')) {
      cutoffUnavailable.add(supabase); return null;
    }
  }
  if (error) throw error;
  return data ?? null;
}

/** The per-admin view hides entries at or before its saved clear-history cutoff. */
export async function listVisibleActivityHistory(filters: ActivityLogFilters = {}): Promise<VisibleActivityHistory> {
  const clearedBefore = await getActivityClearCutoff();
  const filterAfter = filters.after;
  const after = !filterAfter || (clearedBefore && new Date(clearedBefore).getTime() > new Date(filterAfter).getTime())
    ? clearedBefore ?? filterAfter
    : filterAfter;
  const rows = await listActivityLogs({ ...filters, after });
  return { rows, clearedBefore };
}

export async function listVisibleActivityLogs(filters: ActivityLogFilters = {}): Promise<ActivityLogRow[]> {
  return (await listVisibleActivityHistory(filters)).rows;
}

/** Store a per-admin cutoff; activity_logs itself remains append-only. */
export async function clearAdminActivityHistory(): Promise<string> {
  const { data, error } = await getSupabase().rpc("clear_admin_activity_history");
  if (error) {
    const { code, message } = supabaseErrorParts(error);
    if ((code === "PGRST202" || code === "42883") && message.includes("clear_admin_activity_history")) {
      throw new Error("Clear History is not installed yet. Apply migration 20260930113000_admin_activity_history_preferences.sql.");
    }
    throw error;
  }
  const clearedBefore = data ?? new Date().toISOString();
  cutoffUnavailable.delete(getSupabase());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("plv-admin-activity-cleared"));
    try {
      window.localStorage.setItem("plv-admin-activity-clear-sync", clearedBefore);
    } catch {
      // The database cutoff is authoritative; cross-tab signaling is best effort.
    }
  }
  return clearedBefore;
}

/** Resolve activity context in a small fixed set of batched lookups. */
export async function resolveActivityPresentationContexts(
  rows: ActivityLogRow[],
): Promise<Map<string, ActivityPresentationContext>> {
  const result = new Map<string, ActivityPresentationContext>();
  if (rows.length === 0) return result;
  const supabase = getSupabase();
  const unique = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => Boolean(value)))];
  const actorIds = unique(rows.map((row) => row.actor_id));
  const campusIds = unique(rows.map((row) => row.campus_id));
  const idsFor = (type: string) => unique(rows.filter((row) => row.entity_type === type).map((row) => row.entity_id));
  const eventOverlayIds = idsFor("event_overlay");
  const reportIds = idsFor("report");
  const eventIds = idsFor("event");
  const announcementIds = idsFor("announcement");
  const profileTargetIds = idsFor("profile");
  const profileIds = unique([...actorIds, ...profileTargetIds]);

  const safeRows = async <T,>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await query;
      return error ? [] : data ?? [];
    } catch {
      // Optional name lookups never take otherwise-valid audit rows down.
      return [];
    }
  };
  const [profiles, campuses, overlays, reports, events, announcements] = await Promise.all([
    profileIds.length ? safeRows(supabase.from("profiles").select("id, first_name, last_name").in("id", profileIds)) : Promise.resolve([]),
    campusIds.length ? safeRows(supabase.from("campuses").select("id, name").in("id", campusIds)) : Promise.resolve([]),
    eventOverlayIds.length ? safeRows(supabase.from("map_elements").select("id, name, metadata").in("id", eventOverlayIds)) : Promise.resolve([]),
    reportIds.length ? safeRows(supabase.from("reports").select("id, title").in("id", reportIds)) : Promise.resolve([]),
    eventIds.length ? safeRows(supabase.from("events").select("id, title").in("id", eventIds)) : Promise.resolve([]),
    announcementIds.length ? safeRows(supabase.from("announcements").select("id, title").in("id", announcementIds)) : Promise.resolve([]),
  ]);

  const actorNames = new Map<string, string>();
  for (const profile of profiles) {
    actorNames.set(profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Administrator");
  }
  const campusNames = new Map(campuses.map((row) => [row.id, row.name]));
  const targetNames = new Map<string, string>();
  for (const item of overlays) {
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
    const title = typeof metadata.title === "string" ? metadata.title : item.name;
    if (title) targetNames.set(item.id, title);
  }
  for (const item of [...reports, ...events, ...announcements]) {
    if (item.title) targetNames.set(item.id, item.title);
  }
  for (const profile of profiles) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    if (name) targetNames.set(profile.id, name);
  }

  for (const row of rows) {
    result.set(row.id, {
      actorName: row.actor_id ? actorNames.get(row.actor_id) ?? "Administrator" : "System",
      campusName: row.campus_id ? campusNames.get(row.campus_id) ?? undefined : undefined,
      targetName: row.entity_id ? targetNames.get(row.entity_id) : undefined,
    });
  }
  return result;
}

/** Human-readable title for older call sites; full screens should use formatAdminActivity. */
export function readableActionLabel(action: string): string {
  return adminActivityTitle(action);
}

/** Compact relative time label ("just now", "3h ago", "2d ago"). */
export function timeAgoLabel(iso: string): string {
  return formatActivityTimeAgo(iso);
}

export const activityLogService = {
  logActivity,
  listActivityLogs,
  listVisibleActivityHistory,
  listVisibleActivityLogs,
  clearAdminActivityHistory,
  resolveActivityPresentationContexts,
  readableActionLabel,
  timeAgoLabel,
};
