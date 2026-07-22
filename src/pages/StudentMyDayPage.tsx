import { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import {
  GraduationCap, MapPin, Clock, Navigation, AlertTriangle,
  BookOpen, Building2, Footprints, CalendarDays,
  Bell, ArrowRight, Layers,
} from "lucide-react";
import { motion } from "motion/react";
import { MOCK_BUILDINGS } from "../data/mockData";
import {
  MOCK_SCHEDULE, getTodayClasses, getNextClass,
  timeToMinutes, getTransitionStatus,
  getShortDayName, type ScheduledClass,
} from "../data/mockSchedule";
import { cn } from "../lib/utils";
import { Skeleton } from "../components/ui/Skeleton";
import { useStudentAuth } from "../hooks/useStudentAuth";

// ── ScrollReveal-like wrapper ────────────────────────────────────────────
function Reveal({ children, delay = 0, className }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.001, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export function StudentMyDayPage() {
  const navigate = useNavigate();
  const studentAuth = useStudentAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Today's classes sorted chronologically
  const todayClasses = useMemo(() => getTodayClasses(MOCK_SCHEDULE), []);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  // ── Compute transition warnings between consecutive classes ──
  const transitions = useMemo(() => {
    const result: { fromIdx: number; toIdx: number; available: number; needed: number; isTight: boolean; willBeLate: boolean }[] = [];
    for (let i = 0; i < todayClasses.length - 1; i++) {
      const status = getTransitionStatus(todayClasses[i], todayClasses[i + 1]);
      result.push({
        fromIdx: i,
        toIdx: i + 1,
        available: status.availableMinutes,
        needed: status.neededMinutes,
        isTight: status.isTight,
        willBeLate: status.willBeLate,
      });
    }
    return result;
  }, [todayClasses]);

  // ── Current & next class ──
  const currentClass = todayClasses.find(c => {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    return nowMin >= start && nowMin < end;
  });
  const nextClass = getNextClass(MOCK_SCHEDULE.classes);
  const nextClassIndex = nextClass ? todayClasses.indexOf(nextClass) : -1;

  // Stats
  const todayTotalClasses = todayClasses.length;
  const completedClasses = todayClasses.filter(c => timeToMinutes(c.endTime) < nowMin).length;

  // ── Navigate to campus map with directions to a class ──
  const navigateToClass = (cls: ScheduledClass) => {
    const building = MOCK_BUILDINGS.find(b => b.id === cls.buildingId);
    if (building) {
      navigate(`/map?dest=${building.id}&floor=${cls.floor}&room=${encodeURIComponent(cls.roomName)}`);
    }
  };

  // ── Get building name helper ──
  const getBuildingName = (id: string): string => {
    return MOCK_BUILDINGS.find(b => b.id === id)?.name ?? id;
  };
  const getBuildingCode = (id: string): string => {
    return MOCK_BUILDINGS.find(b => b.id === id)?.code ?? id;
  };

  // ── Time of day greeting ──
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // ── Day info ──
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  // ── Loading skeleton (all hooks must run before early return) ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-gradient-to-br from-primary/5 via-background to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-32 rounded-xl" />
              <Skeleton className="h-7 w-28 rounded-xl" />
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Next class hero skeleton */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="h-1.5 w-full bg-muted" />
            <div className="p-5 sm:p-6 space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-72" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <div className="sm:col-span-2">
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
          {/* Schedule skeleton */}
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "var(--font-body)" }}>

      {/* ── Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-background border-b border-border">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/3 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <Reveal>
            {/* Greeting */}
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                {MOCK_SCHEDULE.course}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1" style={{ fontFamily: "var(--font-sans)" }}>
              {greeting}, {studentAuth?.username ?? "Student"}
            </h1>

            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {dateStr}
              <span className="text-border">·</span>
              <span className="font-semibold text-foreground/80">{MOCK_SCHEDULE.semester}</span>
            </p>
          </Reveal>

          {/* Stats row */}
          <Reveal delay={80}>
            <div className="flex gap-3 mt-5">
              <div className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/15 flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold text-primary">{todayTotalClasses} classes today</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/15 flex items-center gap-2">
                <Footprints className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-bold text-green-600">{completedClasses}/{todayTotalClasses} done</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ═══════ NEXT CLASS — HERO CARD ═══════ */}
        {nextClass ? (
          <Reveal delay={120}>
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card"
            >
              {/* Top accent bar */}
              <div className={cn(
                "h-1.5 w-full",
                currentClass ? "bg-green-500" : "bg-primary"
              )} />

              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {currentClass ? "IN PROGRESS" : "NEXT CLASS"}
                  </span>
                  {currentClass && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-green-600">Ongoing</span>
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                  {nextClass.courseCode} — {nextClass.courseName}
                </h2>

                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {/* Time */}
                  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-muted/70 border border-border">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Schedule</p>
                      <p className="text-sm font-extrabold text-foreground">
                        {nextClass.startTime} — {nextClass.endTime}
                      </p>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-muted/70 border border-border">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Location</p>
                      <p className="text-sm font-extrabold text-foreground">
                        {getBuildingCode(nextClass.buildingId)} · {nextClass.roomName}
                      </p>
                    </div>
                  </div>

                  {/* Building name (full width) */}
                  <div className="sm:col-span-2 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-muted/70 border border-border">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Building</p>
                      <p className="text-sm font-extrabold text-foreground truncate">
                        {getBuildingName(nextClass.buildingId)}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-extrabold px-2 py-1 rounded-lg bg-primary/10 text-primary shrink-0">
                      Floor {nextClass.floor === 1 ? "G" : nextClass.floor}
                    </span>
                  </div>
                </div>

                {/* CTA: Navigate to class */}
                <button
                  onClick={() => navigateToClass(nextClass)}
                  className="mt-4 w-full h-12 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Navigation className="h-4 w-4" />
                  {currentClass ? "Continue to Class" : "Get Me to Class"}
                </button>
              </div>
            </motion.div>
          </Reveal>
        ) : (
          /* ── No more classes today ── */
          <Reveal delay={120}>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="h-1.5 w-full bg-green-500" />
              <div className="p-6 sm:p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                  <GraduationCap className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-extrabold text-foreground mb-1">All classes done for today!</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {todayTotalClasses > 0
                    ? `You completed ${todayTotalClasses} classes. Great job!`
                    : "No classes scheduled today. Enjoy your day off!"}
                </p>
                <Link to="/map"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  <MapPin className="h-4 w-4" /> Explore Campus
                </Link>
              </div>
            </div>
          </Reveal>
        )}

        {/* ═══════ TODAY'S SCHEDULE TIMELINE ═══════ */}
        {todayClasses.length > 0 && (
          <Reveal delay={200}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-sans)" }}>
                  Today's Schedule
                </h3>
                <span className="text-xs font-bold text-muted-foreground">({todayClasses.length} classes)</span>
              </div>

              <div className="space-y-3">
                {todayClasses.map((cls, idx) => {
                  const isCurrent = currentClass?.id === cls.id;
                  const isPast = timeToMinutes(cls.endTime) < nowMin;
                  const isUpcoming = !isPast && !isCurrent;
                  const trans = transitions.find(t => t.fromIdx === idx);

                  return (
                    <motion.div
                      key={cls.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.06 }}
                      className={cn(
                        "relative pl-8 pr-4 py-3.5 rounded-2xl border transition-all",
                        isCurrent
                          ? "border-primary/30 bg-primary/5 shadow-sm"
                          : isPast
                            ? "border-border/50 bg-muted/30 opacity-70"
                            : "border-border bg-card hover:shadow-sm"
                      )}
                    >
                      {/* Timeline line */}
                      <div className="absolute left-3 top-0 bottom-0 w-px bg-border/60" />

                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-2 top-4 w-[7px] h-[7px] rounded-full border-2",
                        isCurrent ? "bg-primary border-primary" :
                          isPast ? "bg-muted-foreground/30 border-muted-foreground/30" :
                            "bg-card border-primary/50"
                      )} />

                      {/* Class header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-extrabold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                              {cls.courseCode}
                            </span>
                            <span className="text-xs font-bold text-foreground/80">
                              {cls.section}
                            </span>
                            {isCurrent && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                Now
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-foreground mt-1 truncate">{cls.courseName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {cls.startTime} — {cls.endTime}
                            </span>
                            <span className="text-border">·</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {getBuildingCode(cls.buildingId)} · {cls.roomName}
                            </span>
                            <span className="text-border">·</span>
                            <span className="text-muted-foreground">F{cls.floor === 1 ? "G" : cls.floor}</span>
                          </p>
                        </div>

                        {/* Navigate button */}
                        {!isPast && (
                          <button
                            onClick={() => navigateToClass(cls)}
                            className="w-9 h-9 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center shrink-0 border border-border"
                            title="Navigate to this class"
                          >
                            <Navigation className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Transition warning (between this class and next) */}
                      {trans && !isPast && (
                        <div className={cn(
                          "mt-3 px-3 py-2 rounded-xl border text-xs flex items-center gap-2",
                          trans.willBeLate
                            ? "bg-destructive/10 border-destructive/20 text-destructive"
                            : trans.isTight
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
                              : "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                        )}>
                          {trans.willBeLate ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          ) : trans.isTight ? (
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Footprints className="h-3.5 w-3.5 shrink-0" />
                          )}

                          {trans.willBeLate ? (
                            <span className="font-semibold">
                              Tight! Need <strong>{trans.needed} min</strong> to reach{' '}
                              {getBuildingCode(todayClasses[trans.toIdx].buildingId)}
                              {' '}but only have {trans.available} min between classes.
                            </span>
                          ) : trans.isTight ? (
                            <span className="font-semibold">
                              Tight transition — need {trans.needed} min to reach{' '}
                              {getBuildingCode(todayClasses[trans.toIdx].buildingId)}. Leave promptly!
                            </span>
                          ) : (
                            <span className="font-semibold">
                              {trans.available} min break — enough time to reach{' '}
                              {getBuildingCode(todayClasses[trans.toIdx].buildingId)} ({trans.needed} min walk)
                            </span>
                          )}

                          {/* Quick nav to next class in transition */}
                          <button
                            onClick={() => navigateToClass(todayClasses[trans.toIdx])}
                            className="ml-auto shrink-0 w-7 h-7 rounded-lg bg-background/80 hover:bg-background flex items-center justify-center border border-border/50 transition-colors"
                            title="Navigate"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        )}

        {/* ═══════ WEEK AT A GLANCE ═══════ */}
        <Reveal delay={300}>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-sans)" }}>
              <Layers className="h-4 w-4 text-primary" /> Week at a Glance
            </h3>

            <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day, idx) => {
                const dayClasses = MOCK_SCHEDULE.classes.filter(c => c.dayOfWeek === day);
                const isToday = day === new Date().getDay();
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl transition-all",
                      isToday ? "bg-primary/10 border border-primary/20 ring-1 ring-primary/20" : "bg-muted/50 border border-border/50"
                    )}
                  >
                    <span className={cn(
                      "text-[10px] font-extrabold uppercase tracking-wider",
                      isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {getShortDayName(day)}
                    </span>
                    <span className={cn(
                      "text-lg font-extrabold",
                      isToday ? "text-primary" : "text-foreground"
                    )}>
                      {dayClasses.length}
                    </span>
                    <span className="text-[9px] font-semibold text-muted-foreground">classes</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        {/* ═══════ QUICK LINKS ═══════ */}
        <Reveal delay={360}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: MapPin, label: "Campus Map", path: "/map", color: "text-primary" },
              { icon: Bell, label: "Announcements", path: "/announcements", color: "text-accent" },
              { icon: BookOpen, label: "Favorites", path: "/student/favorites", color: "text-secondary" },
              { icon: Building2, label: "Buildings", path: "/buildings", color: "text-green-600" },
            ].map(({ icon: Icon, label, path, color }) => (
              <Link to={path} key={label}
                className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border border-border bg-card hover:shadow-sm hover:border-primary/30 transition-all group"
              >
                <Icon className={cn("h-5 w-5 shrink-0 group-hover:scale-110 transition-transform", color)} />
                <span className="text-[11px] font-bold text-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </Reveal>

        <div className="h-8" />
      </div>
    </div>
  );
}
