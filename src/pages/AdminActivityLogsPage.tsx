import { useState, useEffect, useCallback, useRef } from "react";
import { History, Clock, Search, RefreshCw, Filter } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { cn } from "../lib/utils";
import { listActivityLogs, readableActionLabel, timeAgoLabel } from "../services/activityLogService";
import { getSupabase } from "../lib/supabase";
import type { Tables } from "../types/database.generated";
import { useSupabaseRealtimeRefresh } from "../hooks/useSupabaseRealtimeData";

type LogRow = Tables<"activity_logs">;

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
  { key: "", label: "All" },
  { key: "report", label: "Reports" },
  { key: "event", label: "Events" },
  { key: "announcement", label: "Announcements" },
  { key: "settings", label: "Settings" },
  { key: "campus", label: "Campus" },
];

/** Map a raw entity type to a friendly label; falls back to the raw value. */
function entityLabel(entityType: string | null): string {
  if (!entityType) return "system";
  return entityType.replace(/_/g, " ");
}

export function AdminActivityLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (entityType: string) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const rows = await listActivityLogs({
        entityType: entityType || undefined,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      setLogs(rows);
      setHasMore(rows.length >= PAGE_SIZE);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load activity logs.");
      setLogs([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSupabaseRealtimeRefresh({ channel: "activity-logs", tables: ["activity_logs", "profiles"], onChange: () => load(filter) });

  // Resolve actor display names for the current page.
  const resolveActors = useCallback(async (rows: LogRow[]) => {
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    const { data } = await getSupabase()
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", ids);
    const map: Record<string, string> = {};
    (data ?? []).forEach((p) => {
      map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Administrator";
    });
    setActorNames((prev) => ({ ...prev, ...map }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  useEffect(() => {
    if (logs.length > 0) resolveActors(logs);
  }, [logs, resolveActors]);

  const refresh = async () => {
    setIsRefreshing(true);
    await load(filter);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (loading) return <TablePageSkeleton rows={6} />;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Activity Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Audit trail of administrator and system actions.</p>
        </div>
        <EmptyState
          icon={History}
          title="Could not load activity logs"
          description={error}
          action={<button onClick={refresh} className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">Try Again</button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Activity Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {logs.length} entries · audit trail of administrator and system actions
          </p>
        </div>
        <button onClick={refresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 h-9 w-9 rounded-xl text-xs font-bold border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-all justify-center disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Refresh activity logs">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
        </button>
      </div>

      {/* Entity type filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {ENTITY_TYPES.map((t) => (
          <button key={t.key || "all"} onClick={() => setFilter(t.key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted-foreground/10"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Log entries */}
      {logs.length === 0 ? (
        <EmptyState
          icon={Search}
          title={filter ? "No logs in this category" : "No activity yet"}
          description={filter
            ? "There are no activity entries matching the selected filter."
            : "Administrator actions and system events will be recorded here."}
        />
      ) : (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-foreground">{readableActionLabel(log.action)}</p>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{timeAgoLabel(log.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {entityLabel(log.entity_type)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {log.actor_id ? (actorNames[log.actor_id] ?? "Administrator") : "System"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{log.created_at}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">
                Showing the {logs.length} most recent entries. Use the filters to narrow results.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
