import { getSupabase } from "../lib/supabase";
import { listActivityLogs } from "./activityLogService";
import type { Tables } from "../types/database.generated";

/**
 * Admin dashboard statistics, read live from the database.
 * Every counter is an exact head-count so the dashboard never shows
 * fabricated numbers. Empty databases return zeros (honest empty state).
 */

export interface DashboardStats {
  buildings: number;
  rooms: number;
  activeEdges: number;
  accessibleEdges: number;
  pendingReports: number;
  publishedEvents: number;
  activeStudents: number;
  /** Activity per day for the last 7 days (oldest first), from activity_logs. */
  weeklyActivity: { day: string; count: number }[];
}

export interface RecentActivityItem {
  id: string;
  action: string;
  entityType: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

/** Element types that represent usable rooms on a floor plan. */
const ROOM_ELEMENT_TYPES = [
  "room", "classroom", "laboratory", "office", "restroom",
  "clinic", "library", "canteen", "information_desk", "storage",
];

type CountableTable =
  | "buildings" | "map_elements" | "navigation_edges"
  | "reports" | "events" | "profiles";

async function exactCount(
  table: CountableTable,
  build: (q: ReturnType<ReturnType<typeof getSupabase>["from"]>["select"]) => unknown,
): Promise<number> {
  const supabase = getSupabase();
  const base = supabase.from(table).select("id", { count: "exact", head: true });
  const query = build(base as never) as typeof base;
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString();

  const [buildings, rooms, activeEdges, accessibleEdges, pendingReports, publishedEvents, activeStudents] =
    await Promise.all([
      exactCount("buildings", (q) => q.is("archived_at", null)),
      exactCount("map_elements", (q) => q.in("element_type", ROOM_ELEMENT_TYPES).is("archived_at", null)),
      exactCount("navigation_edges", (q) => q.eq("is_temporarily_closed", false)),
      exactCount("navigation_edges", (q) => q.eq("is_accessible", true).eq("is_temporarily_closed", false)),
      exactCount("reports", (q) => q.in("status", ["pending", "under_review", "in_progress"]).is("archived_at", null)),
      exactCount("events", (q) => q.eq("status", "published")),
      exactCount("profiles", (q) => q.eq("role", "student").eq("is_active", true)),
    ]);

  // Weekly activity — aggregate activity_logs by day, client-side (no SQL grouping needed).
  let logs: Tables<"activity_logs">[] = [];
  try {
    logs = await listActivityLogs({ from: weekAgo, limit: 500 });
  } catch {
    // Activity feed is best-effort; zeros are acceptable on failure.
  }

  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  logs.forEach((l) => {
    const day = l.created_at.slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  });

  return {
    buildings,
    rooms,
    activeEdges,
    accessibleEdges,
    pendingReports,
    publishedEvents,
    activeStudents,
    weeklyActivity: Array.from(byDay.entries()).map(([day, count]) => ({ day, count })),
  };
}

/** Latest activity-log entries with actor display names resolved. */
export async function getRecentActivity(limit = 6): Promise<RecentActivityItem[]> {
  const logs = await listActivityLogs({ limit });

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", actorIds);
    (data ?? []).forEach((p) => {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
      names.set(p.id, full || "Administrator");
    });
  }

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entity_type,
    actorName: l.actor_id ? (names.get(l.actor_id) ?? null) : null,
    createdAt: l.created_at,
    metadata: l.metadata as Record<string, unknown> | null,
  }));
}

export const dashboardService = {
  getDashboardStats,
  getRecentActivity,
};
