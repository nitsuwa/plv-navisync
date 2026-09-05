import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import {
  GraduationCap, MapPin, Clock, Navigation, BookOpen,
  Building2, Bell, ArrowUpRight, Search, CalendarDays,
  Flag, Compass, Route, Plus, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useCampusData } from "../contexts/CampusDataContext";
import { buildingsFromCampus } from "../lib/mapDataAdapter";
import {
  MOCK_SCHEDULE, getTodayClasses, getNextClass,
  timeToMinutes, type ScheduledClass,
} from "../data/mockSchedule";
import { cn } from "../lib/utils";
import { Skeleton } from "../components/ui/Skeleton";
import { BuildingDetailModal } from "../components/ui/BuildingDetailModal";
import type { Building } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function getShortTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Main Component ─────────────────────────────────────────────────────────
export function StudentHomePage() {
  const navigate = useNavigate();
  const { username, isStudentOrg } = useStudentAuth();
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const campusData = useCampusData();
  const buildings = useMemo(() => {
    const activeCampus = campusData.campuses.find(
      (c) => c.publishStatus !== "draft" && c.status !== "archived"
    );
    if (activeCampus) {
      return buildingsFromCampus(activeCampus) as Building[];
    }
    return [];
  }, [campusData.campuses]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const todayClasses = useMemo(() => getTodayClasses(MOCK_SCHEDULE), []);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const currentClass = todayClasses.find((c) => {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    return nowMin >= start && nowMin < end;
  });

  const nextClass = getNextClass(MOCK_SCHEDULE.classes);

  const completedClasses = todayClasses.filter(
    (c) => timeToMinutes(c.endTime) < nowMin
  ).length;

  const getBuildingName = (id: string): string =>
    buildings.find((b) => b.id === id)?.name ?? id;
  const getBuildingCode = (id: string): string =>
    buildings.find((b) => b.id === id)?.code ?? id;

  const navigateToClass = (cls: ScheduledClass) => {
    const building = buildings.find((b) => b.id === cls.buildingId);
    if (building) {
      navigate(
        `/map?dest=${building.id}&floor=${cls.floor}&room=${encodeURIComponent(cls.roomName)}`
      );
    }
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-5 pt-8 pb-6 space-y-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-11 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24 space-y-6">

        {/* ══ GREETING ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest">
              PLV NaviSync
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {getGreeting()}, {username || "Student"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            <span className="text-border">·</span>
            <span className="font-semibold text-foreground/80">
              {MOCK_SCHEDULE.semester}
            </span>
          </p>
        </motion.div>

        {/* ══ SEARCH BAR ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Link
            to="/map"
            className="flex items-center gap-3 h-12 px-4 rounded-2xl border border-border/60 bg-card/80 hover:bg-card hover:border-primary/20 transition-all group"
          >
            <Search className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground flex-1 text-left">
              Search buildings, rooms...
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-muted text-[10px] font-mono font-bold text-muted-foreground border border-border/60">
              ⌘K
            </kbd>
          </Link>
        </motion.div>

        {/* ══ QUICK ACTIONS ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="grid grid-cols-4 gap-2 md:hidden"
        >
          {[
            { icon: Compass, label: "Navigate", path: "/map", color: "bg-primary/10 text-primary" },
            { icon: CalendarDays, label: "Schedule", path: "/home#schedule", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
            { icon: Building2, label: "Buildings", path: "/map", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
            { icon: Flag, label: "Report", path: "/map", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
          ].map(action => (
            <Link
              key={action.label}
              to={action.path}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-card border border-border/40 hover:border-primary/20 hover:bg-primary/5 transition-all"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", action.color)}>
                <action.icon className="h-4.5 w-4.5" />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground">{action.label}</span>
            </Link>
          ))}
        </motion.div>

        {/* ══ NEXT CLASS CARD ══ */}
        {nextClass ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm"
          >
            <div
              className={cn(
                "h-1.5 w-full",
                currentClass ? "bg-green-500" : "bg-primary"
              )}
            />
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {currentClass ? "IN PROGRESS" : "NEXT CLASS"}
                </span>
                {currentClass && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-600">
                      Ongoing
                    </span>
                  </span>
                )}
              </div>

              <h2 className="text-lg font-extrabold text-foreground">
                {nextClass.courseCode} — {nextClass.courseName}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {nextClass.startTime} — {nextClass.endTime}
                </span>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {getBuildingCode(nextClass.buildingId)} · {nextClass.roomName}
                </span>
                <span className="text-border">·</span>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  Floor {nextClass.floor === 1 ? "G" : nextClass.floor}
                </span>
              </div>

              <button
                onClick={() => navigateToClass(nextClass)}
                className="mt-4 w-full h-11 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Navigation className="h-4 w-4" />
                {currentClass ? "Continue to Class" : "Get Directions"}
              </button>
            </div>
          </motion.div>
        ) : (
          /* ── No more classes today ── */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            <div className="h-1.5 w-full bg-green-500" />
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3">
                <GraduationCap className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-extrabold text-foreground mb-1">
                All classes done!
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {todayClasses.length > 0
                  ? `You completed ${todayClasses.length} classes today.`
                  : "No classes scheduled today."}
              </p>
              <Link
                to="/map"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <MapPin className="h-4 w-4" /> Explore Campus
              </Link>
            </div>
          </motion.div>
        )}

        {/* ══ TODAY'S SCHEDULE MINI ══ */}
        {todayClasses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Today's Schedule
              </h3>
              <span className="text-[11px] font-bold text-muted-foreground">
                ({todayClasses.length} classes)
              </span>
            </div>

            <div className="space-y-2">
              {todayClasses.map((cls, idx) => {
                const isCurrent = currentClass?.id === cls.id;
                const isPast = timeToMinutes(cls.endTime) < nowMin;

                return (
                  <motion.div
                    key={cls.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + idx * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                      isCurrent
                        ? "border-primary/30 bg-primary/5"
                        : isPast
                          ? "border-border/50 bg-muted/30 opacity-60"
                          : "border-border bg-card hover:shadow-sm"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-extrabold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {cls.courseCode}
                        </span>
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                            <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                            Now
                          </span>
                        )}
                        {isPast && (
                          <span className="text-[10px] font-bold text-muted-foreground">
                            Done
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                        {cls.courseName}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {cls.startTime} — {cls.endTime}
                        <span className="text-border">·</span>
                        <MapPin className="h-3 w-3" />
                        {getBuildingCode(cls.buildingId)} · {cls.roomName}
                      </p>
                    </div>

                    {!isPast && (
                      <button
                        onClick={() => navigateToClass(cls)}
                        className="w-9 h-9 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center shrink-0 border border-border"
                        title="Navigate to this class"
                      >
                        <Navigation className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ══ QUICK ACCESS BUILDINGS ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Buildings
              </h3>
            </div>
            <Link
              to="/buildings"
              className="text-xs font-bold text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {buildings.slice(0, 4).map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
              >
                <button
                  onClick={() => setSelectedBuilding(b)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 hover:shadow-sm transition-all group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {b.name}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {b.code}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ══ ANNOUNCEMENTS PREVIEW ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Announcements
              </h3>
            </div>
            <Link
              to="/announcements"
              className="text-xs font-bold text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          <div className="space-y-2">
            {[
              {
                title: "Typhoon Signal No. 3",
                desc: "Classes suspended until further notice.",
                time: "Today",
                urgent: true,
              },
              {
                title: "PLV Tech & Innovation Summit",
                desc: "Join fellow students for keynotes on AI and campus tech.",
                time: "Aug 28",
                urgent: false,
              },
            ].map((item, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 rounded-xl border transition-all",
                  item.urgent
                    ? "border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/10"
                    : "border-border/60 bg-card/50"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    item.urgent ? "bg-red-100 dark:bg-red-900/20" : "bg-primary/10"
                  )}
                >
                  <Bell
                    className={cn(
                      "h-4 w-4",
                      item.urgent
                        ? "text-red-600 dark:text-red-400"
                        : "text-primary"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

      {/* ══ MY EVENTS (Student Org Only) ══ */}
      {isStudentOrg && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              My Events
            </h2>
            <Link
              to="/student/events"
              className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
            >
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            <Link
              to="/student/events"
              className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/60 hover:border-primary/20 hover:bg-primary/5 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Create Event Layout</p>
                <p className="text-xs text-muted-foreground">
                  Design your event map layout with booths, stages, and signage
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </motion.div>
      )}

      </div>

      {/* ══ BUILDING DETAIL MODAL ══ */}
      <BuildingDetailModal
        building={selectedBuilding}
        onClose={() => setSelectedBuilding(null)}
      />
    </div>
  );
}
