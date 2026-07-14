import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Building2, Bell, MapPin, AlertTriangle, Clock, ArrowRight, Plus, Activity,
  Flag, Layers, Route, Accessibility, CheckCircle2, Star, Globe,
  CalendarDays, BarChart3, Shield, Sparkles,
  Wifi, Database, HardDrive, ExternalLink, ChevronRight, Eye,
} from "lucide-react";
import { StatCard } from "../components/ui/StatCard";
import { AnnouncementCard } from "../components/ui/AnnouncementCard";
import { MOCK_ANNOUNCEMENTS, MOCK_BUILDINGS, MOCK_LOCATIONS } from "../data/mockData";
import { FLOOR_PLANS } from "../data/floorPlans";
import { Link } from "react-router";
import { DashboardSkeleton } from "../components/ui/PageSkeleton";
import { WeeklyChart } from "../components/ui/WeeklyChart";
import { cn } from "../lib/utils";

// ── Derived statistics ────────────────────────────────────────────────────

const totalFloors = Object.values(FLOOR_PLANS).reduce((s, fp) => s + fp.floors.length, 0);
const totalRooms = Object.values(FLOOR_PLANS).reduce(
  (s, fp) => s + fp.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0
);
const mappedPct = Math.round((MOCK_BUILDINGS.length / 8) * 100);
const resolutionRate = 75; // %

// ── Key metrics with trend data ───────────────────────────────────────────

const KEY_METRICS = [
  {
    title: "Buildings Mapped",
    value: MOCK_BUILDINGS.length,
    subtitle: `${mappedPct}% of 8 planned`,
    icon: Building2,
    variant: "primary" as const,
    trend: { value: 6, label: "vs last month" },
  },
  {
    title: "Floor Plans",
    value: totalFloors,
    subtitle: `Across ${Object.keys(FLOOR_PLANS).length} buildings`,
    icon: Layers,
    variant: "warning" as const,
    trend: { value: 0, label: "unchanged" },
  },
  {
    title: "Total Rooms",
    value: totalRooms,
    subtitle: `Classrooms, labs, offices, etc.`,
    icon: Activity,
    variant: "success" as const,
    trend: { value: 12, label: "new this month" },
  },
  {
    title: "Active Routes",
    value: 12,
    subtitle: "4 wheelchair-accessible",
    icon: Route,
    variant: "default" as const,
    trend: { value: 8, label: "new routes added" },
  },
  {
    title: "Campus Assets",
    value: MOCK_LOCATIONS.length,
    subtitle: "ATMs, canteens, clinics",
    icon: MapPin,
    variant: "accent" as const,
    trend: { value: 0, label: "unchanged" },
  },
  {
    title: "Resolution Rate",
    value: `${resolutionRate}%`,
    subtitle: "2 pending reports",
    icon: CheckCircle2,
    variant: "success" as const,
    trend: { value: 5, label: "improvement" },
  },
];

// ── Building status with floor plan data ─────────────────────────────────

const BUILDING_STATUS = MOCK_BUILDINGS.map((b) => {
  const fp = FLOOR_PLANS[b.id];
  return {
    ...b,
    hasFloorPlan: !!fp,
    floorCount: fp?.floors.length ?? 0,
    roomCount: fp?.floors.reduce((s, f) => s + f.rooms.length, 0) ?? 0,
    routeCount: Math.floor(Math.random() * 4) + 1,
  };
});

// ── Recent activity enriched ──────────────────────────────────────────────

interface ActivityItem {
  action: string;
  detail: string;
  time: string;
  type: "floor" | "route" | "building" | "report" | "announce" | "asset";
  link: string;
}

const ACTIVITY: ActivityItem[] = [
  { action: "Floor plan updated",  detail: "MAB Building — 3rd Floor rooms added",            time: "1 hour ago",  type: "floor",    link: "/admin/map-builder" },
  { action: "Route modified",      detail: "Main Gate → Library — accessible path added",      time: "3 hours ago", type: "route",    link: "/admin/routes" },
  { action: "Building updated",    detail: "ELB — contact info and hours updated",             time: "5 hours ago", type: "building", link: "/admin/buildings" },
  { action: "Report resolved",     detail: "Broken elevator in ADM marked as resolved",        time: "1 day ago",   type: "report",   link: "/admin/reports" },
  { action: "Announcement posted", detail: "Class suspensions — Typhoon signal advisory",      time: "1 day ago",   type: "announce", link: "/admin/announcements" },
  { action: "Asset added",         detail: "New BDO ATM near Library entrance",                time: "2 days ago",  type: "asset",    link: "/admin/locations" },
  { action: "Campus published",    detail: "PLV Main Campus map published to student portal",   time: "3 days ago",  type: "floor",    link: "/admin/map-builder" },
  { action: "User registered",     detail: "Moderator account: Prof. Carlos Mendoza",          time: "4 days ago",  type: "report",   link: "/admin/users" },
];

const activityIcon: Record<string, React.ElementType> = {
  floor: Layers, route: Route, building: Building2, report: Flag, announce: Bell, asset: MapPin,
};

const activityColor: Record<string, string> = {
  floor:    "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  route:    "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  building: "bg-primary/10 text-primary",
  report:   "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  announce: "bg-accent/15 text-accent",
  asset:    "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
};

// ── Enhanced quick actions ────────────────────────────────────────────────

interface QuickAction {
  label: string;
  to: string;
  icon: React.ElementType;
  desc: string;
  color: string;
  badge?: string;
  stat?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Open Map Builder",
    to: "/admin/map-builder",
    icon: Globe,
    desc: "Create and edit campus maps",
    color: "from-primary to-primary/80 text-white shadow-primary/20",
    stat: "6 buildings",
  },
  {
    label: "Review Reports",
    to: "/admin/reports",
    icon: Flag,
    desc: "Pending campus issues",
    color: "from-amber-500 to-amber-600 text-white shadow-amber-500/20",
    badge: "2 pending",
    stat: "8 total",
  },
  {
    label: "Manage Buildings",
    to: "/admin/buildings",
    icon: Building2,
    desc: "Edit building information",
    color: "from-blue-500 to-blue-600 text-white shadow-blue-500/20",
    stat: "6 buildings",
  },
  {
    label: "Post Announcement",
    to: "/admin/announcements",
    icon: Bell,
    desc: "Notify students & faculty",
    color: "from-violet-500 to-violet-600 text-white shadow-violet-500/20",
    badge: "3 active",
    stat: "6 total",
  },
  {
    label: "Event Maps",
    to: "/admin/events",
    icon: Star,
    desc: "Temporary campus overlays",
    color: "from-rose-500 to-rose-600 text-white shadow-rose-500/20",
    stat: "2 active",
  },
  {
    label: "Accessibility",
    to: "/admin/accessibility",
    icon: Accessibility,
    desc: "Wheelchair routes & ramps",
    color: "from-purple-500 to-purple-600 text-white shadow-purple-500/20",
    stat: "4 routes",
  },
];

// ── System health ─────────────────────────────────────────────────────────

const SYSTEM_HEALTH = [
  { label: "System Status",     value: "Operational",     icon: Shield,  color: "text-green-500",   bg: "bg-green-100 dark:bg-green-900/20" },
  { label: "Uptime",            value: "99.97%",          icon: Wifi,    color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
  { label: "Database",          value: "Connected",       icon: Database,color: "text-blue-500",     bg: "bg-blue-100 dark:bg-blue-900/20" },
  { label: "Storage",           value: "2.4 GB / 10 GB",  icon: HardDrive,color: "text-accent",      bg: "bg-accent/10" },
];

// ── Main component ────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const urgentAnnouncements = MOCK_ANNOUNCEMENTS.filter(
    (a) => a.priority === "urgent" || a.priority === "high"
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══════════════════════════════════════════════════════════════
           HEADER
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
            Navigation System Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
            Real-time health of the PLV NaviSync campus navigation system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-700 dark:text-green-400">Map Live</span>
          </div>
          <Link
            to="/admin/map-builder"
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Globe className="h-3.5 w-3.5" /> Map Builder
          </Link>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           KEY METRICS ROW — using StatCard with trend indicators
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 xl:grid-cols-3 gap-4"
      >
        {KEY_METRICS.map((m, i) => (
          <motion.div
            key={m.title}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <StatCard
              title={m.title}
              value={m.value}
              subtitle={m.subtitle}
              icon={m.icon}
              variant={m.variant}
              trend={m.trend}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           WEEKLY ACTIVITY + MAP COVERAGE
         ═══════════════════════════════════════════════════════════════ */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Weekly Activity Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-sm p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                  Weekly Activity
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  Map updates and student reports this week
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-primary font-bold">44 updates</span>
              <span className="opacity-50">·</span>
              <span className="text-amber-500 font-bold">13 reports</span>
            </div>
          </div>
          <WeeklyChart />
        </motion.div>

        {/* System Health */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="bg-card rounded-2xl border border-border shadow-sm p-5"
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                System Health
              </h2>
              <p className="text-[10px] text-muted-foreground">
                All systems operational
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            {SYSTEM_HEALTH.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/40 border border-border"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 ${s.color}`} />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{s.label}</span>
                  </div>
                  <span className={`text-[11px] font-bold ${s.color}`}>{s.value}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Last checked 2 min ago</span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              All OK
            </span>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           CAMPUS MAP COVERAGE
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="bg-card rounded-2xl border border-border shadow-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                Campus Map Coverage
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {mappedPct}% of planned buildings mapped · {Object.keys(FLOOR_PLANS).length} with floor plans
              </p>
            </div>
          </div>
          <Link
            to="/admin/buildings"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-muted rounded-full mb-5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${mappedPct}%` }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="h-full bg-primary rounded-full"
          />
        </div>

        {/* Per-building status */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {BUILDING_STATUS.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.04 }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  b.hasFloorPlan ? "bg-green-500" : "bg-muted-foreground/30"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-foreground truncate">{b.name}</p>
                  {b.hasFloorPlan && (
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded shrink-0">
                      {b.floorCount}F
                    </span>
                  )}
                </div>
                <p
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {b.hasFloorPlan
                    ? `${b.roomCount} rooms · ${b.routeCount} routes`
                    : "No floor plan yet"}
                </p>
              </div>
              {b.hasFloorPlan ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/30 shrink-0" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           QUICK ACTIONS — enhanced cards with descriptions
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.to}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.04 }}
              >
                <Link
                  to={a.to}
                  className="group relative flex flex-col rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  {/* Gradient top accent */}
                  <div className={`h-1.5 bg-gradient-to-r ${a.color.split(" ")[0]}`} />

                  <div className="flex flex-col gap-2 p-4">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.color.split(" ").slice(0, 3).join(" ")} flex items-center justify-center shadow-sm`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Label & desc */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">{a.label}</span>
                        {a.badge && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0">
                            {a.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{a.desc}</p>
                    </div>

                    {/* Footer stat */}
                    <div className="mt-auto pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground font-medium">{a.stat}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           BOTTOM ROW — Alerts / Announcements / Recent Activity
         ═══════════════════════════════════════════════════════════════ */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: Alerts & Reports */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="space-y-4"
        >
          {/* Urgent announcements */}
          {urgentAnnouncements.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <h3 className="text-sm font-bold text-destructive">Active Alerts</h3>
                </div>
                <Link
                  to="/admin/announcements"
                  className="text-[11px] text-destructive font-bold hover:underline"
                >
                  View all
                </Link>
              </div>
              {urgentAnnouncements.slice(0, 2).map((a) => (
                <div
                  key={a.id}
                  className="text-xs text-foreground py-1.5 border-b border-destructive/10 last:border-0 line-clamp-2 font-medium"
                >
                  {a.title}
                </div>
              ))}
            </div>
          )}

          {/* Pending reports */}
          <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Pending Reports</h3>
              </div>
              <Link
                to="/admin/reports"
                className="text-[11px] text-amber-600 dark:text-amber-400 font-bold hover:underline"
              >
                Review
              </Link>
            </div>
            <div className="space-y-2">
              {[
                { type: "Broken Elevator", bldg: "ADM Building, 2F", time: "2 days ago" },
                { type: "Blocked Walkway", bldg: "Near Library", time: "3 days ago" },
              ].map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-1.5 border-b border-amber-200/50 dark:border-amber-800/20 last:border-0"
                >
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      <span className="font-bold">{r.type}</span>
                      <span className="text-muted-foreground"> — {r.bldg}</span>
                    </p>
                    <span className="text-[9px] text-muted-foreground">{r.time}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/admin/reports"
              className="mt-3 flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
            >
              <Eye className="h-3 w-3" /> View all reports
            </Link>
          </div>
        </motion.div>

        {/* Center: Announcements */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35 }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-bold text-foreground text-sm flex items-center gap-2" style={{ fontFamily: "var(--font-sans)" }}>
              <Bell className="h-4 w-4 text-primary" /> Announcements
            </h2>
            <Link
              to="/admin/announcements"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex-1 p-4 space-y-2.5">
            {MOCK_ANNOUNCEMENTS.slice(0, 3).map((a) => (
              <AnnouncementCard key={a.id} announcement={a} compact />
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border bg-muted/20">
            <Link
              to="/admin/announcements"
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
            <Plus className="h-3 w-3" /> Create new announcement
          </Link>
        </div>
      </motion.div>

        {/* Right: Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.35 }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm flex-1" style={{ fontFamily: "var(--font-sans)" }}>
              Recent Activity
            </h2>
            <span className="text-[9px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              Today
            </span>
          </div>
          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {ACTIVITY.map((item, i) => {
              const Icon = activityIcon[item.type] ?? Bell;
              return (
                <Link
                  key={i}
                  to={item.link}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors group"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs ${activityColor[item.type]}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      {item.action}
                    </p>
                    <p
                      className="text-[10px] text-muted-foreground truncate mt-0.5"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {item.detail}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[9px] text-muted-foreground font-mono whitespace-nowrap">{item.time}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-border bg-muted/20">
            <Link
              to="/admin/reports"
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              <Activity className="h-3 w-3" /> View full activity log
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           FOOTER — quick summary
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="flex items-center justify-between px-5 py-3 rounded-2xl border border-border bg-card/50"
      >
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>© 2025 PLV NaviSync</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>v2.1.0</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>Last published: Jan 15, 2025</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

