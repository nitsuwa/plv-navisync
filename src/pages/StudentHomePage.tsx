import { useState, useMemo, useEffect } from "react";
import { Link, Navigate } from "react-router";
import {
  GraduationCap, Building2, Bookmark, ArrowUpRight, CalendarDays,
  Compass, Flag, MapPin, Plus, RefreshCw,
} from "lucide-react";
import { motion } from "motion/react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { buildingsFromCampus } from "../lib/mapDataAdapter";
import { cn } from "../lib/utils";
import { Skeleton } from "../components/ui/Skeleton";
import type { Building } from "../types";
import { studentAccountService } from "../services/studentAccountService";
import { reportService, type IssueReport } from "../services/reportService";

// ── Helpers ────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function getReportStatusDetails(status: string): { label: string; className: string } {
  switch (status) {
    case "under_review":
      return { label: "Under Review", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300" };
    case "in_progress":
      return { label: "In Progress", className: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/40 dark:bg-indigo-900/20 dark:text-indigo-300" };
    case "resolved":
      return { label: "Resolved", className: "border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300" };
    case "rejected":
      return { label: "Dismissed", className: "border-destructive/20 bg-destructive/5 text-destructive" };
    default:
      return { label: "Pending", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300" };
  }
}

// ── Main Component ─────────────────────────────────────────────────────────
export function StudentHomePage() {
  const { username, isStudent, isStudentOrg, loading: authLoading, profile } = useStudentAuth();
  const [loading, setLoading] = useState(true);
  const [savedBuildingIds, setSavedBuildingIds] = useState<Set<string>>(new Set());
  const [savedBuildingsLoading, setSavedBuildingsLoading] = useState(true);
  const [savedBuildingsError, setSavedBuildingsError] = useState(false);
  const [savedBuildingsRetryKey, setSavedBuildingsRetryKey] = useState(0);
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [reportsRetryKey, setReportsRetryKey] = useState(0);

  const { activeCampus, loading: publishedCampusLoading } = usePublishedCampus();
  const buildings = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus) as Building[];
    }
    return [];
  }, [activeCampus]);

  const featuredBuildings = buildings.slice(0, 4);
  const savedBuildings = useMemo(
    () => buildings.filter((building) => savedBuildingIds.has(building.id)),
    [buildings, savedBuildingIds],
  );
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (publishedCampusLoading) {
      setSavedBuildingsLoading(true);
      return () => {
        mounted = false;
      };
    }
    if (buildings.length === 0) {
      setSavedBuildingIds(new Set());
      setSavedBuildingsError(false);
      setSavedBuildingsLoading(false);
      return () => {
        mounted = false;
      };
    }
    setSavedBuildingsLoading(true);
    setSavedBuildingsError(false);
    void studentAccountService.getSavedBuildings(buildings)
      .then((saved) => {
        if (mounted) setSavedBuildingIds(new Set(saved.map((building) => building.id)));
      })
      .catch(() => {
        if (mounted) {
          setSavedBuildingIds(new Set());
          setSavedBuildingsError(true);
        }
      })
      .finally(() => {
        if (mounted) setSavedBuildingsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [buildings, publishedCampusLoading, savedBuildingsRetryKey]);

  useEffect(() => {
    if (authLoading) return;
    if (!isStudent) {
      setReports([]);
      setReportsLoading(false);
      return;
    }
    let mounted = true;
    setReportsLoading(true);
    setReportsError(false);
    void reportService.getStudentReports()
      .then((loadedReports) => {
        if (mounted) setReports(loadedReports);
      })
      .catch(() => {
        if (mounted) {
          setReports([]);
          setReportsError(true);
        }
      })
      .finally(() => {
        if (mounted) setReportsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authLoading, isStudent, profile?.id, reportsRetryKey]);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Loading skeleton ──
  if (!authLoading && !isStudent) return <Navigate to="/" replace />;
  if (authLoading || loading) {
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
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-8 space-y-6">

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
          </p>
        </motion.div>

        {/* ══ QUICK ACTIONS ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="grid grid-cols-3 gap-2 md:hidden"
        >
          {[
            { icon: Compass, label: "Navigate", color: "bg-primary/10 text-primary", target: "map" },
            { icon: Bookmark, label: "Saved", color: "bg-green-500/10 text-green-600 dark:text-green-400", target: "saved" },
            { icon: Flag, label: "Report", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", target: "reports" },
          ].map((action) => {
            const content = (
              <>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", action.color)}>
                  <action.icon className="h-4.5 w-4.5" />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">{action.label}</span>
              </>
            );
            const className = "flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-card border border-border/40 hover:border-primary/20 hover:bg-primary/5 transition-all";

            if (action.target === "map") {
              return <Link key={action.target} to="/map" className={className}>{content}</Link>;
            }
            return (
              <button
                key={action.target}
                type="button"
                onClick={() => scrollToSection(action.target === "saved" ? "saved-buildings" : "student-reports")}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </motion.div>

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

          {publishedCampusLoading ? (
            <div className="grid grid-cols-2 gap-3" aria-label="Loading buildings">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-xl" />
              ))}
            </div>
          ) : featuredBuildings.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {featuredBuildings.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                >
                  <Link
                    to={`/buildings/${encodeURIComponent(b.id)}`}
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
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-5 text-center">
              <Building2 className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-bold text-foreground">No published buildings yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Published campus buildings will appear here for quick access.
              </p>
              <Link
                to="/map"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Open Campus Map <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </motion.div>

        {/* ══ SAVED BUILDINGS ══ */}
        <motion.div
          id="saved-buildings"
          className="scroll-mt-24"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Saved Buildings
              </h3>
              {!savedBuildingsLoading && savedBuildings.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {savedBuildings.length}
                </span>
              )}
            </div>
            <Link
              to="/student/favorites"
              className="text-xs font-bold text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          {savedBuildingsLoading ? (
            <div className="grid grid-cols-2 gap-3" aria-label="Loading saved buildings">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-xl" />
              ))}
            </div>
          ) : savedBuildingsError ? (
            <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-5 text-center">
              <p className="text-sm font-bold text-foreground">Saved buildings are unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">Check your connection and try loading them again.</p>
              <button
                type="button"
                onClick={() => {
                  setSavedBuildingsLoading(true);
                  setSavedBuildingsRetryKey((value) => value + 1);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : savedBuildings.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {savedBuildings.map((building, i) => (
                <motion.div
                  key={building.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                >
                  <Link
                    to={`/map?buildingId=${encodeURIComponent(building.id)}`}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-primary/20 bg-primary/[0.04] hover:bg-primary/[0.08] hover:border-primary/35 hover:shadow-sm transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {building.name}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {building.code}
                      </p>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-5 text-center">
              <Bookmark className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-bold text-foreground">No saved buildings yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save a building from the campus map and it will appear here.
              </p>
              <Link
                to="/map"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Explore Buildings <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </motion.div>

        {/* ══ STUDENT REPORTS ══ */}
        <motion.div
          id="student-reports"
          className="scroll-mt-24"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.32 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                My Reports
              </h3>
              {!reportsLoading && !reportsError && reports.length > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  {reports.length}
                </span>
              )}
            </div>
            <Link
              to="/student/reports"
              className="text-xs font-bold text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          {reportsLoading ? (
            <div className="space-y-2" aria-label="Loading reports">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[76px] rounded-xl" />
              ))}
            </div>
          ) : reportsError ? (
            <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-5 text-center">
              <p className="text-sm font-bold text-foreground">Your reports are unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">Check your connection and try loading them again.</p>
              <button
                type="button"
                onClick={() => {
                  setReportsLoading(true);
                  setReportsRetryKey((value) => value + 1);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : reports.length > 0 ? (
            <div className="space-y-2">
              {reports.slice(0, 3).map((report) => {
                const status = getReportStatusDetails(report.status);
                const location = [report.campusPlaceName || report.buildingName || "Campus Location", report.floorLabel, report.roomName]
                  .filter(Boolean)
                  .join(" · ");
                const createdDate = new Date(report.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <Link
                    key={report.id}
                    to="/student/reports"
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3 hover:border-primary/20 hover:bg-card transition-all"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Flag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-bold text-foreground">{report.title}</p>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", status.className)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-primary" /> {location}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Submitted {createdDate}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-5 text-center">
              <Flag className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-bold text-foreground">No reports submitted yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Report a campus issue from the map and track its progress here.
              </p>
              <Link
                to="/map"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Open Campus Map <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
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
                  Request multiple campus or building locations, then design each map with booths, chairs, stages, and AV assets.
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </motion.div>
      )}

      </div>

    </div>
  );
}
