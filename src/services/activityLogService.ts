import { getSupabase } from "../lib/supabase";
import type { Tables, TablesInsert } from "../types/database.generated";

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
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
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
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.limit && filters.limit > 0) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Human-readable label for a raw activity-log action string. */
export function readableActionLabel(action: string): string {
  const map: Record<string, string> = {
    "report.pending": "Report submitted",
    "report.under_review": "Report under review",
    "report.in_progress": "Report in progress",
    "report.resolved": "Report resolved",
    "report.rejected": "Report dismissed",
    "report.notes": "Internal notes updated",
    "report.archive": "Report archived",
    "event.create": "Event created",
    "event.update": "Event updated",
    "event.publish": "Event published",
    "event.archive": "Event archived",
    "announcement.create": "Announcement created",
    "announcement.update": "Announcement updated",
    "announcement.publish": "Announcement published",
    "announcement.archive": "Announcement archived",
    "settings.update": "Settings updated",
    "campus.save": "Campus draft saved",
    "campus.publish": "Campus published",
    "campus.unpublish": "Campus unpublished",
    "campus.archive": "Campus archived",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

/** Compact relative time label ("just now", "3h ago", "2d ago"). */
export function timeAgoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export const activityLogService = {
  logActivity,
  listActivityLogs,
  readableActionLabel,
  timeAgoLabel,
};
