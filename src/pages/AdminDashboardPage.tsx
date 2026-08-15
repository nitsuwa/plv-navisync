import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Building2, Bell, AlertTriangle, Clock, ArrowRight,
  Flag, Layers, Route, Users, CheckCircle2, CalendarDays, History,
  BarChart3, Search as SearchIcon, MapPin, Flag as FlagIcon,
} from "lucide-react";
import { WeeklyChart } from "../components/ui/WeeklyChart";
import { usageAnalyticsService, type AnalyticsSummary } from "../services/usageAnalyticsService";
import { EmptyState } from "../components/ui/EmptyState";
import { StatCard } from "../components/ui/StatCard";
import { Link } from "react-router";
import { DashboardSkeleton } from "../components/ui/PageSkeleton";
import { cn } from "../lib/utils";
import {
  dashboardService,
  type DashboardStats,
  type RecentActivityItem,
} from "../services/dashboardService";
import { reportService } from "../services/reportService";
import { campusService } from "../services/campusService";
import { readableActionLabel, timeAgoLabel } from "../services/activityLogService";

// ── Quick actions (all links valid) ───────────────────────────────────────

interface QuickAction { label: string; to: string; icon: React.ElementType; desc: string; color: string; }

// ═══════════════════════════════════════════════════════════════════════════

export function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [pendingReports, setPendingReports] = useState<{ title: string; detail: string; time: string; priority: "high" | "medium" }[]>([]);
  const [publishInfo, setPublishInfo] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a, reports, campuses] = await Promise.all([
        dashboardService.getDashboardStats(),
        dashboardService.getRecentActivity(6).catch(() => []),
        reportService.listAllReports({ status: "pending" }).catch(() => []),
        campusService.list().catch(() => []),
      ]);
      setStats(s);
      setActivity(a);
      setPendingReports(
        reports.slice(0, 4).map((r) => ({
          title: r.title,
          detail: r.buildingName ?? r.category ?? "Campus location",
          time: timeAgoLabel(r.createdAt),
          priority: r.priority === "urgent" || r.priority === "high" ? "high" : "medium",
        }))
      );
      // Editor Campus objects expose lifecycleState/publishStatus — check the lifecycle field.
      // Real tracked usage (page views, routes, searches) from this browser.
      setAnalytics(usageAnalyticsService.getAnalytics(7));
      const published = campuses.find((c) => c.lifecycleStatus === "published");
      setPublishInfo(
        published
          ? `Published: ${published.name}${published.updatedAt ? ` · ${published.updatedAt}` : ""}`
          : "No published campus yet"
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-extrabold text-foreground">Dashboard</h1>
        <EmptyState
          icon={AlertTriangle}
          title="Could not load dashboard"
          description={error}
          action={
            <button onClick={load} className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Try Again
            </button>
          }
        />
      </div>
    );
  }

  const s = stats ?? {
    buildings: 0, rooms: 0, activeEdges: 0, accessibleEdges: 0,
    pendingReports: 0, publishedEvents: 0, activeStudents: 0, weeklyActivity: [],
  };

  // Note: these are live head counts, not trends — no fabricated deltas.
  const KEY_METRICS = [
    {
      title: "Buildings Mapped",
      value: s.buildings,
      subtitle: "in the active campus",
      icon: Building2,
      variant: "primary" as const,
    },
    {
      title: "Total Rooms",
      value: s.rooms,
      subtitle: "rooms & offices",
      icon: Layers,
      variant: "success" as const,
    },
    {
      title: "Active Routes",
      value: s.activeEdges,
      subtitle: `${s.accessibleEdges} wheelchair-accessible`,
      icon: Route,
      variant: "accent" as const,
    },
    {
      title: "Pending Reports",
      value: s.pendingReports,
      subtitle: "requiring attention",
      icon: Flag,
      variant: "warning" as const,
    },
  ];

  const maxWeekly = Math.max(1, ...s.weeklyActivity.map((d) => d.count));

  // Analytics chart data — WeeklyChart expects day labels + two series.
  const analyticsChart = analytics
    ? analytics.byDay.map((d) => ({
        day: new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }),
        updates: d.updates,
        reports: d.reports,
      }))
    : [];
  const QUICK_ACTIONS: QuickAction[] = [
    { label: "Open Map Builder", to: "/admin-dashboard/map-builder", icon: Building2, desc: "Edit campus map", color: "bg-primary" },
    { label: "Review Reports", to: "/admin-dashboard/reports", icon: Flag, desc: `${s.pendingReports} pending`, color: "bg-amber-500" },
    { label: "Post Announcement", to: "/admin-dashboard/announcements", icon: Bell, desc: "Notify students", color: "bg-violet-500" },
    { label: "Manage Users", to: "/admin-dashboard/users", icon: Users, desc: `${s.activeStudents} students`, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-4 lg:space-y-3 animate-fade-in">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl lg:text-2xl font-extrabold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{publishInfo ?? "Live data"}</p>
        </div>
      </motion.div>

      {/* KEY METRICS */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3"
      >
        {KEY_METRICS.map((m) => (
          <motion.div
            key={m.title}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          >
            <StatCard
              title={m.title}
              value={m.value}
              subtitle={m.subtitle}
              icon={m.icon}
              variant={m.variant}
              trend={m.trend}
              className="p-4"
            />
          </motion.div>
        ))}
      </motion.div>

      {/* BOTTOM ROW */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
      >
        {/* Priority items — real pending reports */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <h2 className="font-bold text-foreground text-sm">Priority Items</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {pendingReports.length}
              </span>
            </div>
            <Link to="/admin-dashboard/reports" className="text-[11px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">View all</Link>
          </div>
          <div className="flex-1 divide-y divide-border">
            {pendingReports.length > 0 ? (
              pendingReports.map((item, i) => (
                <Link
                  key={i}
                  to="/admin-dashboard/reports"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 active:scale-[0.97] transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                    item.priority === "high"
                      ? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      : "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                  )}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail} · {item.time}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              ))
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="No pending items"
                description="All campus reports have been addressed."
                compact
              />
            )}
          </div>
        </motion.div>

        {/* Recent activity — real activity_logs */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h2 className="font-bold text-foreground text-sm flex-1">Recent Activity</h2>
            <Link to="/admin-dashboard/activity-logs" className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              <History className="h-3 w-3" /> View all
            </Link>
          </div>
          <div className="flex-1 divide-y divide-border">
            {activity.length > 0 ? (
              activity.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{readableActionLabel(item.action)}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {item.actorName ?? "System"} · {item.entityType ?? "system"}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{timeAgoLabel(item.createdAt)}</span>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Clock}
                title="No recent activity"
                description="Admin actions and system events will appear here."
                compact
              />
            )}
          </div>
        </motion.div>

        {/* Usage analytics — real tracked events */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <h2 className="font-bold text-foreground text-sm flex-1">Usage Analytics</h2>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
              last 7 days
            </span>
          </div>
          <div className="p-4 pb-2">
            {analytics && analytics.totalViews + analytics.totalRoutes > 0 ? (
              <WeeklyChart data={analyticsChart} />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No tracked activity yet. Browse the map, search, and plan a route to see charts here.
              </p>
            )}
          </div>
          <div className="px-5 pb-4 grid grid-cols-4 gap-2">
            {[
              { icon: MapPin, label: "Map views", value: analytics?.totalViews ?? 0 },
              { icon: Route, label: "Routes", value: analytics?.totalRoutes ?? 0 },
              { icon: SearchIcon, label: "Searches", value: analytics?.totalSearches ?? 0 },
              { icon: FlagIcon, label: "Reports", value: analytics?.totalReports ?? 0 },
            ].map(({ icon: MiniIcon, label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-muted/30 p-2 text-center">
                <MiniIcon className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
                <p className="text-base font-extrabold text-foreground leading-none">{value}</p>
                <p className="text-[9px] text-muted-foreground mt-1 font-semibold">{label}</p>
              </div>
            ))}
          </div>
          {(analytics?.topSearches.length || analytics?.topRoutes.length) ? (
            <div className="px-5 pb-4 pt-1 border-t border-border grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1.5">Top searches</p>
                {analytics!.topSearches.length > 0 ? (
                  <div className="space-y-1">
                    {analytics!.topSearches.map((s) => (
                      <div key={s.term} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground font-semibold truncate">{s.term}</span>
                        <span className="text-muted-foreground font-mono">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No searches yet.</p>
                )}
              </div>
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1.5">Top routes</p>
                {analytics!.topRoutes.length > 0 ? (
                  <div className="space-y-1">
                    {analytics!.topRoutes.map((r) => (
                      <div key={r.route} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground font-semibold truncate">{r.route}</span>
                        <span className="text-muted-foreground font-mono">{r.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No routes planned yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </motion.div>

        {/* Quick actions */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h2 className="font-bold text-foreground text-sm">Quick Actions</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/20 active:scale-[0.97] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className={`w-8 h-8 rounded-xl ${a.color} flex items-center justify-center shadow-sm shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{a.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Weekly activity (last 7 days, real) */}
          <div className="px-5 pt-1 pb-5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-2.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Activity · last 7 days
              </p>
            </div>
            <div className="flex items-end gap-1.5 h-16">
              {s.weeklyActivity.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/70 hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(8, (d.count / maxWeekly) * 100)}%`, minHeight: d.count > 0 ? 6 : 3, opacity: d.count > 0 ? 1 : 0.25 }}
                      title={`${d.day}: ${d.count} events`}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground font-mono">
                    {new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
