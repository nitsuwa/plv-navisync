import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, Layers, Map as MapIcon, Route, Eye, Save, Send,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { BuildingsTab } from "./BuildingsTab";
import { FloorPlansTab } from "./FloorPlansTab";
import { RoutesTab } from "./RoutesTab";
import { LayersTab } from "./LayersTab";
import { PreviewTab } from "./PreviewTab";
import { useToast } from "../../hooks/useToast";
import { useCampusData } from "../../contexts/CampusDataContext";
import { SEED_CAMPUSES, genId } from "../map-builder/constants";
import type { Campus, PublishStatus } from "../map-builder/types";

// ── Tab definitions ──────────────────────────────────────────────────────────

interface TabDefinition {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const TABS: TabDefinition[] = [
  { id: "buildings",   label: "Buildings",   icon: Building2, description: "Manage campus buildings", color: "#3b82f6" },
  { id: "floorplans",  label: "Floor Plans", icon: Layers,    description: "Design floor interiors",   color: "#8b5cf6" },
  { id: "routes",      label: "Routes",      icon: Route,     description: "Create navigation paths",  color: "#10b981" },
  { id: "layers",      label: "Layers",      icon: MapIcon,   description: "Accessibility & events",   color: "#f59e0b" },
  { id: "preview",     label: "Preview",     icon: Eye,       description: "Test student experience",  color: "#ec4899" },
];

// ── Tab content transition ────────────────────────────────────────────────────

const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

const tabTransition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "plv-admin-campuses";

function loadCampuses(): Campus[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Campus[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fall back to seed
  }
  return SEED_CAMPUSES;
}

// ══════════════════════════════════════════════════════════════════════════════

export function MapBuilderWorkspace() {
  const [campuses, setCampuses] = useState<Campus[]>(loadCampuses);
  const [activeTab, setActiveTab] = useState("buildings");
  const [activeCampusId, setActiveCampusId] = useState<string | null>(
    () => campuses[0]?.id ?? null
  );
  const [direction, setDirection] = useState(0);
  const [pendingFloorTarget, setPendingFloorTarget] = useState<{ buildingId: string; floorId: string } | null>(null);
  const [savedState, setSavedState] = useState<"saved" | "unsaved" | "saving">("saved");
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "published" | "error">("idle");
  const toast = useToast();
  const { publishCampus: ctxPublish, removeCampus: ctxRemove } = useCampusData();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef(activeTab);

  const activeCampus = campuses.find((c) => c.id === activeCampusId) ?? campuses[0] ?? null;

  // ── Persist campuses ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campuses));
    } catch { /* ignore */ }
  }, [campuses]);

  // ── Auto-save indicator ─────────────────────────────────────────────────────
  const markDirty = useCallback(() => {
    setSavedState("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSavedState("saved");
    }, 2000);
  }, []);

  // ── Campus updates ──────────────────────────────────────────────────────────
  const updateCampus = useCallback((updated: Campus) => {
    setCampuses((p) => p.map((c) => (c.id === updated.id ? updated : c)));
    markDirty();
  }, [markDirty]);

  const handleSave = useCallback(() => {
    setSavedState("saving");
    setTimeout(() => {
      setSavedState("saved");
      toast.success("Changes saved", "All campus data has been saved locally.");
    }, 600);
  }, [toast]);

  const handlePublish = useCallback(() => {
    if (!activeCampus) return;
    setPublishState("publishing");
    setTimeout(() => {
      const now = new Date().toISOString().slice(0, 10);
      setCampuses((p) =>
        p.map((c) =>
          c.id === activeCampus.id
            ? { ...c, publishStatus: "published" as PublishStatus, publishedAt: now, updatedAt: now }
            : c
        )
      );
      // Sync to shared context so students can see it
      ctxPublish({
        id: activeCampus.id,
        name: activeCampus.name,
        code: activeCampus.code,
        canvasW: activeCampus.canvasW,
        canvasH: activeCampus.canvasH,
        buildings: activeCampus.buildings.map((b) => ({
          id: b.id, name: b.name, code: b.code,
          category: b.category, description: b.description,
          x: b.x, y: b.y, width: b.width, height: b.height,
          color: b.color, floors: b.floors,
        })),
        markers: activeCampus.markers,
        paths: activeCampus.paths,
        publishedAt: now,
      });
      setPublishState("published");
      toast.success("Published!", `"${activeCampus.name}" is now live for students.`);
      setTimeout(() => setPublishState("idle"), 2000);
    }, 1200);
  }, [activeCampus, ctxPublish, toast]);

  // ── Tab navigation ──────────────────────────────────────────────────────────
  const switchTab = useCallback((tabId: string) => {
    const prevIdx = TABS.findIndex((t) => t.id === prevTabRef.current);
    const nextIdx = TABS.findIndex((t) => t.id === tabId);
    setDirection(nextIdx > prevIdx ? 1 : -1);
    prevTabRef.current = activeTab;
    setActiveTab(tabId);
  }, [activeTab]);

  const currentTabIndex = TABS.findIndex((t) => t.id === activeTab);
  const currentTab = TABS[currentTabIndex];

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════════
         TOP BAR — Campus selector + action buttons
         ═══════════════════════════════════════════════════════════════════════ */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        {/* Campus selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50">
            <MapIcon className="h-3.5 w-3.5 text-primary" />
            <select
              value={activeCampus?.id ?? ""}
              onChange={(e) => setActiveCampusId(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-foreground focus:outline-none cursor-pointer appearance-none pr-4"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronLeft className="h-3 w-3 text-muted-foreground -ml-1 rotate-90" />
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40">
          {savedState === "saving" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          ) : savedState === "unsaved" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          )}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {savedState === "saving" ? "Saving..." : savedState === "unsaved" ? "Unsaved" : "Saved"}
          </span>
        </div>

        <div className="flex-1" />

        {/* Campus publish status */}
        {activeCampus && (
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
            activeCampus.publishStatus === "published"
              ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
          )}>
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              activeCampus.publishStatus === "published" ? "bg-emerald-500" : "bg-amber-500"
            )} />
            {activeCampus.publishStatus === "published" ? "Published" : "Draft"}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={savedState === "saved"}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
            savedState === "saved"
              ? "bg-muted text-muted-foreground cursor-default"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>

        {/* Publish button */}
        <button
          onClick={handlePublish}
          disabled={publishState === "publishing" || publishState === "published"}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
            publishState === "published"
              ? "bg-emerald-500/20 text-emerald-600 cursor-default"
              : publishState === "publishing"
              ? "bg-primary/50 text-primary-foreground cursor-wait"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          )}
        >
          {publishState === "publishing" ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ) : publishState === "published" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {publishState === "publishing" ? "Publishing..." : publishState === "published" ? "Published!" : "Publish"}
        </button>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
         TAB BAR — 5 editing modes
         ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/40 shrink-0">
        {TABS.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                "hover:bg-muted/60 active:scale-[0.97]",
                isActive
                  ? "text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-lg bg-card border border-border"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                <span>{tab.label}</span>
              </span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Step</span>
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
            {currentTabIndex + 1}
          </span>
          <span>of {TABS.length}</span>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
         TAB CONTENT — Animated tab switching
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 bg-muted/20">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeTab}
            custom={direction}
            variants={tabVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={tabTransition}
            className="w-full h-full"
          >
            {activeTab === "buildings" && activeCampus && (
              <BuildingsTab
                campus={activeCampus}
                onUpdate={updateCampus}
                onOpenFloorPlan={(buildingId, floorId) => {
                  setPendingFloorTarget({ buildingId, floorId });
                  setDirection(1);
                  prevTabRef.current = activeTab;
                  setActiveTab("floorplans");
                }}
              />
            )}
            {activeTab === "floorplans" && activeCampus && (
              <FloorPlansTab
                campus={activeCampus}
                onUpdate={updateCampus}
                initialBuildingId={pendingFloorTarget?.buildingId}
                initialFloorId={pendingFloorTarget?.floorId}
                onConsumedInitial={() => setPendingFloorTarget(null)}
              />
            )}
            {activeTab === "routes" && activeCampus && (
              <RoutesTab
                campus={activeCampus}
                onUpdate={updateCampus}
              />
            )}
            {activeTab === "layers" && activeCampus && (
              <LayersTab
                campus={activeCampus}
                onUpdate={updateCampus}
              />
            )}
            {activeTab === "preview" && activeCampus && (
              <PreviewTab campus={activeCampus} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
