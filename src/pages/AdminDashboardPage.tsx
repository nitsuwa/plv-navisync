import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Building2, Bell, AlertTriangle, Clock, ArrowRight,
  Flag, Layers, Route, Users, CheckCircle2,
} from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { StatCard } from "../components/ui/StatCard";
import { MOCK_BUILDINGS } from "../data/mockData";
import { FLOOR_PLANS } from "../data/floorPlans";
import { Link } from "react-router";
import { DashboardSkeleton } from "../components/ui/PageSkeleton";
import { cn } from "../lib/utils";

// ── Derived statistics ────────────────────────────────────────────────────

const totalFloors = Object.values(FLOOR_PLANS).reduce((s, fp) => s + fp.floors.length, 0);
const totalRooms = Object.values(FLOOR_PLANS).reduce(
  (s, fp) => s + fp.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0
);

const KEY_METRICS = [
  {
    title: "Buildings Mapped",
    value: MOCK_BUILDINGS.length,
    subtitle: `${Object.keys(FLOOR_PLANS).length} with floor plans`,
    icon: Building2,
    variant: "primary" as const,
    trend: { value: 0, label: "unchanged" },
  },
  {
    title: "Total Rooms",
    value: totalRooms,
    subtitle: `Across ${totalFloors} floors`,
    icon: Layers,
    variant: "success" as const,
    trend: { value: 12, label: "new this month" },
  },
  {
    title: "Active Routes",
    value: 12,
    subtitle: "4 wheelchair-accessible",
    icon: Route,
    variant: "accent" as const,
    trend: { value: 8, label: "new routes" },
  },
  {
    title: "Pending Reports",
    value: 2,
    subtitle: "Requiring attention",
    icon: Flag,
    variant: "warning" as const,
    trend: { value: 5, label: "improvement" },
  },
];

// ── Pending items ─────────────────────────────────────────────────────────

const PENDING_ITEMS = [
  {
    label: "Broken Elevator",
    detail: "ADM Building, 2nd Floor",
    time: "2 days ago",
    priority: "high" as const,
    link: "/admin-dashboard/reports",
  },
  {
    label: "Blocked Walkway",
    detail: "Near Library entrance",
    time: "3 days ago",
    priority: "medium" as const,
    link: "/admin-dashboard/reports",
  },
];

// ── Recent activity ────────────────────────────────────────────────────────

const ACTIVITY = [
  { action: "Floor plan updated",  detail: "MAB — 3rd Floor rooms added",            time: "1h ago", type: "floor" as const },
  { action: "Route modified",      detail: "Main Gate → Library — accessible path",  time: "3h ago", type: "route" as const },
  { action: "Building updated",    detail: "ELB — contact info and hours updated",    time: "5h ago", type: "building" as const },
];

const activityIcon = {
  floor: Layers, route: Route, building: Building2,
};
const activityColor = {
  floor:    "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  route:    "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  building: "bg-primary/10 text-primary",
};

// ── Quick actions ─────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Open Map Builder", to: "/admin-dashboard/map-builder", icon: Building2, desc: "Edit campus map", color: "bg-primary" },
  { label: "Review Reports",   to: "/admin-dashboard/reports",      icon: Flag,       desc: "2 pending",       color: "bg-amber-500" },
  { label: "Post Announcement",to: "/admin-dashboard/announcements",icon: Bell,       desc: "Notify students", color: "bg-violet-500" },
  { label: "Manage Users",     to: "/admin-dashboard/users",        icon: Users,      desc: "6 accounts",      color: "bg-emerald-500" },
];

// ═════════════════════════════════════════════════════════════════════════════

export function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-4 lg:space-y-3 animate-fade-in">
      {/* ═══════════════════════════════════════════════════════════════
           HEADER — title with lightweight status
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xl lg:text-2xl font-extrabold text-foreground">
            Dashboard
          </h1>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            All systems OK
          </span>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           KEY METRICS — 4 essential numbers
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3"
      >
        {KEY_METRICS.map((m) => (
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
              className="p-4"
            />
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           BOTTOM ROW — 3 columns: Priority Items, Activity, Quick Actions
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
      >

        {/* ── Priority Items ── */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0 },
          }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <h2 className="font-bold text-foreground text-sm">
                Priority Items
              </h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {PENDING_ITEMS.length}
              </span>
            </div>
            <Link to="/admin-dashboard/reports" className="text-[11px] font-bold text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="flex-1 divide-y divide-border">
            {PENDING_ITEMS.length > 0 ? (
              PENDING_ITEMS.map((item, i) => (
                <Link
                  key={i}
                  to={item.link}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 active:scale-[0.97] transition-all group"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                    item.priority === "high" ? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400" :
                    "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                  )}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail} · {item.time}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              ))
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="No pending items"
                description="All campus reports have been addressed. No issues requiring attention."
                compact
              />
            )}
          </div>
        </motion.div>

        {/* ── Recent Activity ── */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0 },
          }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h2 className="font-bold text-foreground text-sm flex-1">
              Recent Activity
            </h2>
          </div>
          <div className="flex-1 divide-y divide-border">
            {ACTIVITY.length > 0 ? (
              ACTIVITY.map((item, i) => {
                const Icon = activityIcon[item.type];
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${activityColor[item.type]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{item.action}</p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {item.detail}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{item.time}</span>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={Clock}
                title="No recent activity"
                description="Campus map changes and system events will appear here."
                compact
              />
            )}
          </div>
        </motion.div>

        {/* ── Quick Actions ── */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0 },
          }}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h2 className="font-bold text-foreground text-sm">
              Quick Actions
            </h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/20 active:scale-[0.97] transition-all duration-200"
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
        </motion.div>
      </motion.div>

      {/* Version info — minimal */}
      <div className="text-[10px] text-muted-foreground text-right">
        v2.1.0 · Last published: Jan 15, 2025
      </div>
    </div>
  );
}
