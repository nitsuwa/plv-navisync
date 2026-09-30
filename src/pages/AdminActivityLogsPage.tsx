import { useState, useEffect, useCallback, useRef } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { History, Clock, Search, RefreshCw, Filter, Trash2 } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { cn } from "../lib/utils";
import {
  activityLogErrorMessage,
  clearAdminActivityHistory,
  listVisibleActivityHistory,
  resolveActivityPresentationContexts,
  type ActivityPresentationContext,
} from "../services/activityLogService";
import { formatAdminActivity } from "../services/adminActivityPresentation";
import type { Tables } from "../types/database.generated";

type LogRow = Tables<"activity_logs">;

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
  { key: "", label: "All", entityTypes: [] as string[] },
  { key: "report", label: "Reports", entityTypes: ["report"] },
  { key: "event", label: "Events", entityTypes: ["event", "event_overlay"] },
  { key: "announcement", label: "Announcements", entityTypes: ["announcement"] },
  { key: "settings", label: "Settings", entityTypes: ["settings"] },
  { key: "campus", label: "Campus", entityTypes: ["campus", "campus_versions", "building", "floor"] },
];

export function AdminActivityLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [contexts, setContexts] = useState<Map<string, ActivityPresentationContext>>(new Map());
  const [clearedBefore, setClearedBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (entityType: string) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const selectedFilter = ENTITY_TYPES.find((item) => item.key === entityType);
      const { rows, clearedBefore: cutoff } = await listVisibleActivityHistory({
        entityTypes: selectedFilter?.entityTypes.length ? selectedFilter.entityTypes : undefined,
        limit: PAGE_SIZE,
      });
      const contextMap = await resolveActivityPresentationContexts(rows);
      if (requestId !== requestRef.current) return;
      setLogs(rows);
      setContexts(contextMap);
      setClearedBefore(cutoff);
      setHasMore(rows.length >= PAGE_SIZE);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(activityLogErrorMessage(err));
      setLogs([]);
      setContexts(new Map());
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const refresh = async () => {
    setIsRefreshing(true);
    await load(filter);
    setIsRefreshing(false);
  };

  const clearHistory = async () => {
    setIsClearing(true);
    setClearError(null);
    try {
      await clearAdminActivityHistory();
      setConfirmClear(false);
      await load(filter);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Activity history could not be cleared.");
    } finally {
      setIsClearing(false);
    }
  };

  if (loading) return <TablePageSkeleton rows={6} />;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Activity Logs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Audit trail of administrator and system actions.</p>
        </div>
        <EmptyState
          icon={History}
          title="Could not load activity logs"
          description={error}
          action={<button onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Try Again</button>}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Activity Logs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {logs.length} entries · audit trail of administrator and system actions
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={refresh} disabled={isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:bg-accent hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Refresh activity logs">
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
          </button>
          <AlertDialog.Root open={confirmClear} onOpenChange={(open) => { setConfirmClear(open); if (!open) setClearError(null); }}>
            <AlertDialog.Trigger asChild>
              <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground transition hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Trash2 className="h-3.5 w-3.5" /> <span>Clear History</span>
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none sm:p-6">
                <AlertDialog.Title className="text-base font-extrabold text-foreground">Clear activity history?</AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  This clears all current activity from your view, regardless of the selected filter. Audit records remain safely stored, and new activity will appear normally.
                </AlertDialog.Description>
                {clearError && <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{clearError}</p>}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialog.Cancel asChild>
                    <button disabled={isClearing} className="h-10 rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
                  </AlertDialog.Cancel>
                  <button disabled={isClearing} onClick={clearHistory} className="h-10 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                    {isClearing ? "Clearing…" : "Clear History"}
                  </button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {ENTITY_TYPES.map((item) => (
          <button key={item.key || "all"} onClick={() => setFilter(item.key)}
            className={cn(
              "shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === item.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted-foreground/10",
            )}>
            {item.label}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={clearedBefore ? History : Search}
          title={clearedBefore ? "Activity is all clear" : filter ? "No logs in this category" : "No activity yet"}
          description={clearedBefore
            ? "New administrator and system activity will appear here."
            : filter ? "There are no activity entries matching the selected filter." : "Administrator actions and system events will be recorded here."}
          action={clearedBefore ? <button onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-4 text-xs font-bold text-foreground hover:bg-muted"><RefreshCw className="h-3 w-3" />Refresh</button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const formatted = formatAdminActivity(log, contexts.get(log.id));
              return (
                <article key={log.id} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-bold text-foreground">{formatted.title}</p>
                      <time dateTime={log.created_at} title={formatted.timestamp} className="shrink-0 text-[10px] text-muted-foreground">
                        {formatted.relativeTime}
                      </time>
                    </div>
                    <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{formatted.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{formatted.category}</span>
                      {formatted.campusLabel && <span className="text-[10px] text-muted-foreground">{formatted.campusLabel}</span>}
                      <span className="text-[10px] text-muted-foreground">{formatted.timestamp}</span>
                    </div>
                    <details className="mt-1.5 text-[10px] text-muted-foreground">
                      <summary className="w-fit cursor-pointer select-none hover:text-foreground">Technical details</summary>
                      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono">
                        <dt>Action</dt><dd className="break-all">{formatted.technicalAction}</dd>
                        <dt>Record ID</dt><dd className="break-all">{formatted.recordId}</dd>
                        <dt>Exact time</dt><dd className="break-all">{log.created_at}</dd>
                      </dl>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
          {hasMore && (
            <div className="border-t border-border px-5 py-3">
              <p className="text-center text-[10px] text-muted-foreground">Showing the {logs.length} most recent entries. Use the filters to narrow results.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
