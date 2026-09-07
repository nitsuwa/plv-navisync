import { useEffect, useCallback } from "react";
import {
  X, Navigation, Bookmark, Layers, Clock, MapPin, Building2,
  ChevronRight, Accessibility, Share2, Flag,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import type { Building } from "../../types";
import { getOpenStatus } from "../../lib/buildingHours";
import { cn } from "../../lib/utils";

// ── Status helpers ──────────────────────────────────────────────────────────
const STATUS_COLOR = {
  Open: "text-green-600 dark:text-green-400",
  Busy: "text-amber-600 dark:text-amber-400",
  Closed: "text-red-600 dark:text-red-400",
} as const;

const STATUS_BG = {
  Open: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",
  Busy: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",
  Closed: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30",
} as const;

const STATUS_DOT = {
  Open: "bg-green-500",
  Busy: "bg-amber-500",
  Closed: "bg-red-500",
} as const;

// ── Props ───────────────────────────────────────────────────────────────────
interface BuildingDetailModalProps {
  building: Building | null;
  onClose: () => void;
  /** Whether the building is saved in favorites */
  isSaved?: boolean;
  /** Toggle save/favorite */
  onToggleSave?: (buildingId: string) => void;
  /** Floor plan count (0 = no floor plans) */
  floorPlanCount?: number;
  /** Rooms list for this building */
  rooms?: string[];
  /** Distance in meters and walk time in minutes */
  route?: { dist: number; mins: number } | null;
}

export function BuildingDetailModal({
  building,
  onClose,
  isSaved = false,
  onToggleSave,
  floorPlanCount = 0,
  rooms = [],
  route = null,
}: BuildingDetailModalProps) {
  const navigate = useNavigate();

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (building) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [building, handleKeyDown]);

  if (!building) return null;

  const hours = getOpenStatus(building);
  const status: "Open" | "Busy" | "Closed" = hours.status ?? "Open";
  const statusKnown = hours.status !== null;

  const handleNavigate = () => {
    onClose();
    navigate(`/map?dest=${building.id}`);
  };

  const handleFloorPlan = () => {
    onClose();
    navigate(`/map?buildingId=${building.id}`);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard?.writeText(
        `${building.name} (${building.code}) — PLV NaviSync`
      );
    } catch {
      // silent
    }
  };

  return (
    <AnimatePresence>
      {building && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal — bottom sheet on mobile, centered on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label={`${building.name} details`}
            className="fixed z-50 bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[420px] md:max-h-[85vh] bg-card rounded-t-3xl md:rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Drag handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Image header */}
            <div className="relative h-40 md:h-44 shrink-0 overflow-hidden bg-muted">
              {building.image_url ? (
                <img
                  src={building.image_url}
                  alt={building.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              {/* Fallback gradient */}
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-muted",
                  building.image_url && "hidden"
                )}
              >
                <Building2 className="h-16 w-16 text-primary/20" />
              </div>
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Close button */}
              <button
                onClick={onClose}
                aria-label="Close details"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 active:scale-90 transition-all backdrop-blur-sm"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Building info overlay */}
              <div className="absolute bottom-3 left-4 right-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-primary/90 text-primary-foreground text-[11px] font-mono font-extrabold px-2.5 py-0.5 rounded-lg backdrop-blur-sm">
                    {building.code}
                  </span>
                  {statusKnown && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm",
                        STATUS_BG[status],
                        STATUS_COLOR[status]
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[status])} />
                      {status}
                    </span>
                  )}
                </div>
                <h2 className="text-white font-extrabold text-lg leading-tight drop-shadow-lg">
                  {building.name}
                </h2>
                {building.description && (
                  <p className="text-white/80 text-xs mt-1 line-clamp-2 drop-shadow">
                    {building.description}
                  </p>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Quick info chips */}
              <div className="flex flex-wrap gap-2">
                {/* Operating hours */}
                {hours.hoursLabel && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {hours.hoursLabel}
                  </div>
                )}

                {/* Floor count */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  {building.floor_count} {building.floor_count === 1 ? "floor" : "floors"}
                </div>

                {/* Distance / walk time */}
                {route && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-semibold">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {route.dist < 1000
                      ? `${Math.round(route.dist)}m`
                      : `${(route.dist / 1000).toFixed(1)}km`}
                    <span className="text-muted-foreground font-normal">·</span>
                    ~{route.mins} min walk
                  </div>
                )}

                {/* Category */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-xs text-muted-foreground capitalize">
                  {building.category}
                </div>
              </div>

              {/* Floor plan link */}
              {floorPlanCount > 0 && (
                <button
                  onClick={handleFloorPlan}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-extrabold text-primary">
                        View Floor Plan
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {floorPlanCount} {floorPlanCount === 1 ? "floor" : "floors"} available
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-primary group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}

              {/* Room list */}
              {rooms.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
                    Rooms
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {rooms.map((room) => (
                      <span
                        key={room}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground"
                      >
                        {room}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Departments */}
              {building.departments && building.departments.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
                    Departments
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {building.departments.map((dept) => (
                      <span
                        key={dept}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 border border-primary/15 text-primary"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons — fixed at bottom */}
            <div className="shrink-0 p-4 pt-3 border-t border-border bg-card/95 backdrop-blur-sm">
              <div className="flex gap-2">
                {/* Navigate — primary */}
                <button
                  onClick={handleNavigate}
                  className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Navigation className="h-4 w-4" />
                  Navigate
                </button>

                {/* Save — toggle */}
                {onToggleSave && (
                  <button
                    onClick={() => onToggleSave(building.id)}
                    className={cn(
                      "h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 active:scale-[0.97] transition-all",
                      isSaved
                        ? "bg-accent/15 text-accent border-accent/30"
                        : "bg-muted text-muted-foreground border-border hover:bg-secondary"
                    )}
                    title={isSaved ? "Remove from favorites" : "Save to favorites"}
                  >
                    <Bookmark
                      className={cn("h-5 w-5", isSaved && "fill-current")}
                    />
                  </button>
                )}

                {/* Share */}
                <button
                  onClick={handleShare}
                  className="h-12 w-12 rounded-2xl bg-muted text-muted-foreground border border-border hover:bg-secondary flex items-center justify-center shrink-0 active:scale-[0.97] transition-all"
                  title="Copy building info"
                >
                  <Share2 className="h-5 w-5" />
                </button>

                {/* Report */}
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/student/reports?building=${building.id}`);
                  }}
                  className="h-12 w-12 rounded-2xl bg-muted text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0 active:scale-[0.97] transition-all"
                  title="Report an issue"
                >
                  <Flag className="h-5 w-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
