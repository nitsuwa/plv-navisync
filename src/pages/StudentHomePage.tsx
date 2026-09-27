import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  GraduationCap, Building2, ArrowUpRight, Search, CalendarDays,
  Flag, Compass, Plus,
} from "lucide-react";
import { motion } from "motion/react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { buildingsFromCampus } from "../lib/mapDataAdapter";
import { cn } from "../lib/utils";
import { Skeleton } from "../components/ui/Skeleton";
import { BuildingDetailModal } from "../components/ui/BuildingDetailModal";
import type { Building } from "../types";
import { studentAccountService } from "../services/studentAccountService";
import { useToast } from "../hooks/useToast";

// ── Helpers ────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Main Component ─────────────────────────────────────────────────────────
export function StudentHomePage() {
  const { username, isStudentOrg } = useStudentAuth();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [savedBuildingIds, setSavedBuildingIds] = useState<Set<string>>(new Set());

  const { activeCampus, loading: publishedCampusLoading } = usePublishedCampus();
  const buildings = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus) as Building[];
    }
    return [];
  }, [activeCampus]);

  const featuredBuildings = buildings.slice(0, 4);
  const activeCampusId = activeCampus?.id;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (buildings.length === 0) {
      return () => {
        mounted = false;
      };
    }
    void studentAccountService.getSavedBuildings(buildings)
      .then((saved) => {
        if (mounted) setSavedBuildingIds(new Set(saved.map((building) => building.id)));
      })
      .catch(() => {
        if (mounted) showError("Favorites could not be loaded");
      });
    return () => {
      mounted = false;
    };
  }, [buildings]);

  const toggleSave = useCallback(async (buildingId: string, campusId?: string) => {
    const nextSaved = !savedBuildingIds.has(buildingId);
    setSavedBuildingIds((current) => {
      const next = new Set(current);
      if (nextSaved) next.add(buildingId);
      else next.delete(buildingId);
      return next;
    });
    try {
      await studentAccountService.toggleSaveBuilding(buildingId, campusId ?? activeCampusId);
      success(nextSaved ? "Saved to favorites" : "Removed from favorites");
    } catch {
      setSavedBuildingIds((current) => {
        const next = new Set(current);
        if (nextSaved) next.delete(buildingId);
        else next.add(buildingId);
        return next;
      });
      showError("Favorite could not be updated");
    }
  }, [activeCampusId, savedBuildingIds, showError, success]);

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
          className="grid grid-cols-3 gap-2 md:hidden"
        >
          {[
            { icon: Compass, label: "Navigate", path: "/map", color: "bg-primary/10 text-primary" },
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

      {/* ══ BUILDING DETAIL MODAL ══ */}
      <BuildingDetailModal
        building={selectedBuilding}
        onClose={() => setSelectedBuilding(null)}
        isSaved={selectedBuilding ? savedBuildingIds.has(selectedBuilding.id) : false}
        onToggleSave={toggleSave}
        campusId={activeCampusId}
      />
    </div>
  );
}
