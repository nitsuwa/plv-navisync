import {
  X, Navigation, Share2, Bookmark, Flag, Clock, Layers,
  QrCode, Accessibility, Building2, ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";
import { LocationQR } from "./LocationQR";
import { getOpenStatus } from "../../lib/buildingHours";
import { useToast } from "../../hooks/useToast";
import { useEscToClose } from "../../hooks/useEscToClose";
import type { StudentAuthState } from "../../hooks/useStudentAuth";

// ── Re-export shared types/constants ────────────────────────────────────────
export type PanelTab = "overview" | "departments" | "facilities" | "accessibility" | "route";

const STATUS_COLOR = { Open: "text-green-500", Busy: "text-amber-500", Closed: "text-red-500" as const };
const STATUS_DOT = { Open: "bg-green-500", Busy: "bg-amber-500", Closed: "bg-red-500" as const };

interface BuildingInfoPanelProps {
  selected: Building;
  onClose: () => void;
  onDirections: (b: Building) => void;
  onFloorPlan: (b: Building) => void;
  isFloorMode: boolean;
  floorBuildingId?: string;
  saved: Set<string>;
  studentAuth: StudentAuthState;
  onToggleSave: (id: string) => void;
  onReport: (b: Building) => void;
  onSignInPrompt: (msg: string) => void;
  showQR: boolean;
  onToggleQR: () => void;
  hasFloorPlans: boolean;
  floorPlanCount: number;
  facilities: string[];
  accessibility: string[];
  route: { dist: number; mins: number } | null;
}

export function BuildingInfoPanel({
  selected, onClose, onDirections, onFloorPlan,
  isFloorMode, floorBuildingId, saved, studentAuth, onToggleSave, onReport,
  onSignInPrompt, showQR, onToggleQR, hasFloorPlans, floorPlanCount,
  facilities, accessibility, route,
}: BuildingInfoPanelProps) {
  const toast = useToast();
  useEscToClose(onClose);
  // Live open/closed status from operating hours (seeded campus + legacy).
  const hours = getOpenStatus(selected);
  const status: "Open" | "Busy" | "Closed" = hours.status ?? "Open";
  const statusKnown = hours.status !== null;

  return (
    <div
      data-no-drag
      className="absolute top-0 right-0 bottom-0 z-30 hidden md:flex flex-col border-l border-border bg-card shadow-2xl"
      style={{
        width: 280,
        transform: "translateX(0)",
        transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Photo header */}
      <div className="relative h-28 shrink-0 overflow-hidden bg-muted">
        {selected.image_url && (
          <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button
          onClick={onClose}
          aria-label={`Close ${selected.name} details`}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 active:scale-90 transition-all"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="absolute bottom-3 left-3 right-10">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-extrabold px-2 py-0.5 rounded">
              {selected.code}
            </span>
            {statusKnown ? (
              <span
                className={cn("flex items-center gap-1 text-[10px] font-bold", STATUS_COLOR[status])}
                title={hours.label}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[status])} />
                {status}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                {hours.label}
              </span>
            )}
          </div>
          <h2 className="text-white font-extrabold text-sm leading-tight">
            {selected.name}
          </h2>
        </div>
      </div>

      {/* Action buttons — compact grid for 280px panel */}
      <div className="grid grid-cols-4 gap-1 px-2 py-2.5 border-b border-border shrink-0">
        <button
          onClick={() => onDirections(selected)}
          className="flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl bg-primary text-primary-foreground text-[10px] font-extrabold hover:bg-primary/90 active:scale-[0.97] transition-all"
        >
          <Navigation className="h-3 w-3 shrink-0" /> Directions
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard?.writeText(selected.name + " — PLV NaviSync");
              toast.success("Copied to clipboard", `${selected.name} info copied.`);
            } catch {
              toast.error("Could not copy", "Clipboard access denied.");
            }
          }}
          className="flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-secondary active:scale-[0.97] transition-all"
        >
          <Share2 className="h-3 w-3 shrink-0" /> Share
        </button>
        {studentAuth.isStudent ? (() => {
          const isSaved = saved.has(selected.id) || (Boolean(selected.code) && (saved.has(selected.code) || saved.has(selected.code.toLowerCase())));
          return (
            <button
              onClick={() => onToggleSave(selected.id)}
              aria-label={isSaved ? `Remove ${selected.name} from saved` : `Save ${selected.name}`}
              className={cn(
                "flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl text-[10px] font-extrabold border active:scale-[0.97] transition-all",
                isSaved
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-muted text-muted-foreground border-border hover:bg-secondary",
              )}
            >
              <Bookmark className={cn("h-3 w-3 shrink-0", isSaved && "fill-current")} />
              {isSaved ? "Saved" : "Save"}
            </button>
          );
        })() : (
          <button
            onClick={() => onSignInPrompt("save locations")}
            className="flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl bg-muted/60 text-muted-foreground/80 text-[10px] font-semibold border border-dashed border-border/60"
          >
            <Bookmark className="h-3 w-3 shrink-0" /> Save
          </button>
        )}
        {studentAuth.isStudent ? (
          <button
            onClick={() => onReport(selected)}
            className="flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] transition-all"
          >
            <Flag className="h-3 w-3 shrink-0" /> Report
          </button>
        ) : (
          <button
            onClick={() => onSignInPrompt("report issues")}
            className="flex items-center justify-center gap-0.5 h-8 px-1 rounded-xl bg-muted/60 text-muted-foreground/80 text-[10px] font-semibold border border-dashed border-border/60"
          >
            <Flag className="h-3 w-3 shrink-0" /> Report
          </button>
        )}
      </div>

      {/* Unified scrollable content — no tabs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-show-on-hover">
        {/* Category badge */}
        <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15">
          <span className="text-[10px] font-bold text-primary capitalize">{selected.category}</span>
        </div>

        {/* Operating hours */}
        {hours.hoursLabel && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary shrink-0" /> {hours.hoursLabel}
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {selected.description}
        </p>

        {/* Floor plan link */}
        {hasFloorPlans && (!isFloorMode || floorBuildingId !== selected.id) && (
          <button
            onClick={() => onFloorPlan(selected)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <div className="text-left">
                <p className="text-xs font-extrabold text-primary">View Floor Plan</p>
                <p className="text-[10px] text-muted-foreground">{floorPlanCount} floors</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Facilities */}
        <div>
          <h4 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Facilities</h4>
          {facilities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {facilities.map((f) => (
                <span
                  key={f}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/90">No facilities data yet.</p>
          )}
        </div>

        {/* Accessibility features */}
        <div>
          <h4 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Accessibility</h4>
          {accessibility.length > 0 ? (
            <div className="space-y-1.5">
              {accessibility.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 text-xs text-foreground"
                >
                  <Accessibility className="h-4 w-4 text-green-500 shrink-0" /> {a}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/90">No accessibility data yet.</p>
          )}
        </div>

        {/* QR code */}
        <div className="pt-1">
          <button
            onClick={onToggleQR}
            className="flex items-center gap-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest hover:text-primary active:scale-[0.98] transition-all w-full"
          >
            <QrCode className="h-3.5 w-3.5" /> QR Code
            <ChevronRight className={cn("h-3.5 w-3.5 ml-auto transition-transform duration-200", showQR && "rotate-90")} />
          </button>
          {showQR && (
            <div className="mt-3 flex flex-col items-center gap-2 p-4 rounded-xl bg-muted border border-border animate-scale-in">
              <div className="text-foreground">
                <LocationQR buildingId={selected.id} buildingName={selected.name} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
