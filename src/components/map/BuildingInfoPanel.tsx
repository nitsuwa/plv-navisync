import {
  X, Navigation, Share2, Bookmark, Flag, Building2, Clock, Layers,
  ChevronRight, QrCode, ChevronDown,
} from "lucide-react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";
import { QRPlaceholder } from "./QRPlaceholder";

// ── Re-export shared types/constants ────────────────────────────────────────
export type PanelTab = "overview" | "departments" | "facilities" | "accessibility" | "route";

const STATUS: Record<string, "Open" | "Busy" | "Closed"> = {
  b1: "Open", b2: "Open", b3: "Open", b4: "Open", b5: "Busy", b6: "Open",
};
const STATUS_COLOR = { Open: "text-green-500", Busy: "text-amber-500", Closed: "text-red-500" as const };
const STATUS_DOT = { Open: "bg-green-500", Busy: "bg-amber-500", Closed: "bg-red-500" as const };

// ── Props ───────────────────────────────────────────────────────────────────
interface BuildingInfoPanelProps {
  selected: Building;
  panelTab: PanelTab;
  onSelectTab: (tab: PanelTab) => void;
  onClose: () => void;
  onDirections: (b: Building) => void;
  onFloorPlan: (b: Building) => void;
  isFloorMode: boolean;
  floorBuildingId?: string;
  saved: Set<string>;
  studentAuth: { username: string; role: "student" | "faculty" } | null;
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

// ── Component ───────────────────────────────────────────────────────────────
export function BuildingInfoPanel({
  selected, panelTab, onSelectTab, onClose, onDirections, onFloorPlan,
  isFloorMode, floorBuildingId, saved, studentAuth, onToggleSave, onReport,
  onSignInPrompt, showQR, onToggleQR, hasFloorPlans, floorPlanCount,
  facilities, accessibility, route,
}: BuildingInfoPanelProps) {
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
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="absolute bottom-3 left-3 right-10">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-extrabold px-2 py-0.5 rounded">
              {selected.code}
            </span>
            <span className={cn("flex items-center gap-1 text-[10px] font-bold", STATUS_COLOR[STATUS[selected.id] ?? "Open"])}>
              <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[STATUS[selected.id] ?? "Open"])} />
              {STATUS[selected.id] ?? "Open"}
            </span>
          </div>
          <h2 className="text-white font-extrabold text-sm leading-tight" style={{ fontFamily: "var(--font-sans)" }}>
            {selected.name}
          </h2>
        </div>
      </div>

      {/* 2×2 action buttons */}
      <div className="grid grid-cols-2 gap-1.5 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={() => onDirections(selected)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-extrabold hover:bg-primary/90 transition-colors"
        >
          <Navigation className="h-3.5 w-3.5" /> Directions
        </button>
        <button
          onClick={() => { try { navigator.clipboard?.writeText(selected.name + " — PLV NaviSync"); } catch {} }}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-secondary transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        {studentAuth ? (
          <button
            onClick={() => onToggleSave(selected.id)}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-extrabold border transition-colors",
              saved.has(selected.id)
                ? "bg-accent/15 text-accent border-accent/30"
                : "bg-muted text-muted-foreground border-border hover:bg-secondary",
            )}
          >
            <Bookmark className={cn("h-3.5 w-3.5", saved.has(selected.id) && "fill-current")} />
            {saved.has(selected.id) ? "Saved" : "Save"}
          </button>
        ) : (
          <button
            onClick={() => onSignInPrompt("save locations")}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60"
          >
            <Bookmark className="h-3.5 w-3.5" /> Save
          </button>
        )}
        {studentAuth ? (
          <button
            onClick={() => onReport(selected)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Flag className="h-3.5 w-3.5" /> Report
          </button>
        ) : (
          <button
            onClick={() => onSignInPrompt("report issues")}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60"
          >
            <Flag className="h-3.5 w-3.5" /> Report
          </button>
        )}
      </div>

      {/* 5-tab navigation */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto no-scrollbar">
        {(["overview", "departments", "facilities", "accessibility", "route"] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => onSelectTab(t)}
            className={cn(
              "flex-1 py-2 text-[10px] font-extrabold whitespace-nowrap px-1 transition-all border-b-2 shrink-0",
              panelTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "overview"
              ? "Overview"
              : t === "departments"
                ? "Depts"
                : t === "facilities"
                  ? "Facilities"
                  : t === "accessibility"
                    ? "Access."
                    : "Route"}
            {t === "route" && route && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent ml-1 align-middle animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {panelTab === "overview" && (
          <div className="h-full overflow-y-auto p-4 space-y-3 scrollbar-show-on-hover">
            <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15">
              <span className="text-[10px] font-bold text-primary capitalize">{selected.category}</span>
            </div>
            {selected.operating_hours && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" /> {selected.operating_hours}
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
              {selected.description}
            </p>
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
            {isFloorMode && floorBuildingId === selected.id && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
                <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-primary">Viewing floor plan — use the floor selector →</span>
              </div>
            )}
            <div>
              <button
                onClick={onToggleQR}
                className="flex items-center gap-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors w-full"
              >
                <QrCode className="h-3.5 w-3.5" /> QR Code
                <ChevronRight className={cn("h-3.5 w-3.5 ml-auto transition-transform", showQR && "rotate-90")} />
              </button>
              {showQR && (
                <div className="mt-3 flex flex-col items-center gap-2 p-4 rounded-xl bg-muted border border-border animate-scale-in">
                  <div className="text-foreground">
                    <QRPlaceholder />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Scan to view {selected.name} on mobile
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {panelTab === "departments" && (
          <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
            {selected.departments?.length ? (
              <div className="space-y-0">
                <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
                  Departments
                </p>
                {selected.departments.map((d) => (
                  <div
                    key={d}
                    className="flex items-center gap-2 py-2 border-b border-border last:border-0 text-xs text-foreground"
                  >
                    <Building2 className="h-3.5 w-3.5 text-primary shrink-0" /> {d}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-8">No departments listed.</p>
            )}
          </div>
        )}
        {panelTab === "facilities" && (
          <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
              Facilities
            </p>
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
              <p className="text-sm text-muted-foreground">No facilities data.</p>
            )}
          </div>
        )}
        {panelTab === "accessibility" && (
          <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
              Accessibility Features
            </p>
            {accessibility.length > 0 ? (
              <div className="space-y-2">
                {accessibility.map((a) => (
                  <div
                    key={a}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 text-xs text-foreground"
                  >
                    <span className="text-green-500 text-sm">♿</span> {a}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No accessibility data.</p>
            )}
          </div>
        )}
        {panelTab === "route" && (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-5 py-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Navigation className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground">Get Directions</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use the Directions panel to plan a route to or from this building.
            </p>
            <button
              onClick={() => onDirections(selected)}
              className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Navigation className="h-3.5 w-3.5" /> Directions to here
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
