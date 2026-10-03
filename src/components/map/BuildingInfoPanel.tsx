import { motion } from "motion/react";
import { ArrowLeft, X } from "lucide-react";
import type { Building } from "../../types";
import type { StudentAuthState } from "../../hooks/useStudentAuth";
import { useEscToClose } from "../../hooks/useEscToClose";
import { BuildingCover } from "./BuildingCover";
import { BuildingDetailsActions } from "./BuildingDetailsActions";
import { BuildingDetailsSections } from "./BuildingDetailsSections";
import { LocationQR } from "./LocationQR";

export type PanelTab = "overview" | "departments" | "facilities" | "accessibility" | "route";

interface BuildingInfoPanelProps {
  selected: Building;
  campusId?: string;
  onClose: () => void;
  onDirections: (building: Building) => void;
  onEnterBuilding: (building: Building) => void;
  saved: Set<string>;
  studentAuth: StudentAuthState;
  onToggleSave: (id: string) => void;
  onReport: (building: Building) => void;
  onSignInPrompt: (message: string) => void;
  showQR: boolean;
  onToggleQR: () => void;
  hasFloorPlans: boolean;
  floorPlanCount: number;
  facilities: string[];
  accessibility: string[];
  onBackToRoutePlanner?: () => void;
}

export function BuildingInfoPanel({
  selected, campusId, onClose, onDirections, onEnterBuilding, saved, studentAuth,
  onToggleSave, onReport, onSignInPrompt, showQR, onToggleQR, hasFloorPlans,
  floorPlanCount, facilities, accessibility, onBackToRoutePlanner,
}: BuildingInfoPanelProps) {
  useEscToClose(onClose);

  return (
    <motion.aside
      data-no-drag
      data-testid="building-details-desktop"
      aria-label={`${selected.name} building details`}
      className="absolute inset-y-0 right-0 z-30 hidden min-h-0 flex-col overflow-hidden border-l border-border/80 bg-card shadow-2xl md:flex"
      style={{ width: "clamp(340px, 32vw, 390px)" }}
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 12, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative shrink-0 p-3 pb-0">
        <BuildingCover imageUrl={selected.image_url} code={selected.code} name={selected.name} className="rounded-2xl shadow-sm" />
        <button type="button" onClick={onClose} aria-label={`Close ${selected.name} details`} className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-950/50 text-white shadow-sm backdrop-blur-md transition hover:bg-slate-950/70 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <header className="shrink-0 px-5 pb-3 pt-3">
        {onBackToRoutePlanner && (
          <button
            type="button"
            onClick={onBackToRoutePlanner}
            aria-label="Back to route planner"
            className="mb-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-extrabold text-primary transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to route planner
          </button>
        )}
        <div className="mb-1.5 flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-extrabold tracking-wide text-primary">{selected.code}</span>
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{selected.category?.replace(/[_-]+/g, " ") || "Campus building"}</span>
          {floorPlanCount > 0 && <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground">{floorPlanCount} {floorPlanCount === 1 ? "floor" : "floors"}</span>}
        </div>
        <h2 className="line-clamp-3 text-xl font-extrabold leading-tight tracking-tight text-foreground">{selected.name}</h2>
      </header>

      <div className="shrink-0 border-y border-border/70 px-4 py-3">
        <BuildingDetailsActions
          building={selected}
          campusId={campusId}
          hasFloorPlans={hasFloorPlans}
          saved={saved}
          studentAuth={studentAuth}
          showQR={showQR}
          onDirections={onDirections}
          onEnterBuilding={onEnterBuilding}
          onSave={onToggleSave}
          onReport={onReport}
          onSignInPrompt={onSignInPrompt}
          onToggleQR={onToggleQR}
        />
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
                <LocationQR buildingId={selected.id} buildingName={selected.name} campusId={campusId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
