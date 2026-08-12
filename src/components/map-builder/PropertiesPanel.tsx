import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  X, Eye, EyeOff, Lock, Unlock, Info, Palette, Settings2,
  Route, Accessibility, Star, CheckCircle2, XCircle, AlertTriangle,
  PaintBucket, Trash2, MapPin, Calendar, Plus, Minus, GripVertical,
  Layers, Copy,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
  DoorOpen,
} from "lucide-react";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { normalizeRotation, clampDecorScale, DECOR_SCALE_MIN, DECOR_SCALE_MAX } from "../../lib/decorAsset";
import { createDefaultFloor } from "../../lib/floorPlanNormalization";
import { DecorAssetVisual } from "./DecorAssetVisual";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import { LAYERS, LAYER_TOOLS, DECOR_ASSET_MAP, DECOR_ASSET_TYPES, genId } from "./constants";
import { Combobox } from "../ui/Combobox";
import {
  BUILDING_ENTRANCE_EDGE_LABELS,
  BUILDING_ENTRANCE_TYPES,
  entranceDisplayName,
  entrancePurposeMeta,
  entranceTypeLabel,
  normalizeEntranceType,
} from "../../lib/buildingEntrances";
import type {
  CampusBuilding, CampusMarker, CampusSelection, EditorLayer,
  CampusRoute, NavigationNode, NavigationEdge, CampusEventOverlay,
  EventLocationRef, FloorPlan, CampusDecorAsset, DecorAssetType,
  BuildingEntranceEdge, BuildingEntranceType,
  CampusEntrance,
} from "./types";

const ColorPickerImpl = lazy(() => import("../ui/ColorPicker"));
function ColorPicker(props: { value: string; onChange: (c: string) => void }) {
  return (
    <Suspense fallback={<div className="h-10 rounded-xl border border-border bg-muted/30 animate-pulse" />}>
      <ColorPickerImpl {...props} />
    </Suspense>
  );
}

type TabId = "basic" | "style" | "advanced";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "basic",    label: "Basic",    icon: Info },
  { id: "style",    label: "Style",    icon: Palette },
  { id: "advanced", label: "Advanced", icon: Settings2 },
];

interface PropertiesPanelProps {
  selected: CampusSelection | null;
  selBldg: CampusBuilding | undefined;
  selEntrance?: CampusEntrance | undefined;
  selEntranceParent?: CampusBuilding | undefined;
  selMkr: CampusMarker | undefined;
  selDecorAsset?: CampusDecorAsset | undefined;
  /** All decorative assets — used to detect reorderable multi-selections. */
  allDecorAssets: CampusDecorAsset[];
  selRoute: CampusRoute | undefined;
  selNavNode?: NavigationNode | undefined;
  selNavEdge?: NavigationEdge | undefined;
  selEventOverlay?: CampusEventOverlay | undefined;
  allNavNodes?: NavigationNode[];
  allNavEdges?: NavigationEdge[];
  allBuildings: CampusBuilding[];
  layer: EditorLayer;
  // Multi-select props
  multiSelected: string[];
  multiSelectedBuildings: CampusBuilding[];
  selectedOutdoorCount: number;
  onBatchUpdateBuildings: (ids: string[], changes: Partial<CampusBuilding>) => void;
  onBatchDeleteBuildings: (ids: string[]) => void;
  onClearMultiSelect: () => void;
  /** Layer-ordering action (B2): bring forward/backward, bring to front/back. */
  onLayerOrder?: (action: LayerOrderAction) => void;
  // Individual item callbacks
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onAddEntrance: (buildingId: string) => void;
  onSelectEntrance: (buildingId: string, entranceId: string) => void;
  onUpdateEntrance: (buildingId: string, entranceId: string, changes: Partial<CampusEntrance>) => void;
  onDeleteEntrance: (buildingId: string, entranceId: string) => void;
  onUpdateMarker: (id: string, changes: Partial<CampusMarker>) => void;
  onUpdateRoute?: (id: string, changes: Partial<CampusRoute>) => void;
  onUpdateEventOverlay?: (id: string, changes: Partial<CampusEventOverlay>) => void;
  onDeleteBuilding: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onUpdateDecorAsset: (id: string, changes: Partial<CampusDecorAsset>) => void;
  onDeleteDecorAsset: (id: string) => void;
  onDuplicateDecorAsset: (id: string) => void;
  onDeleteRoute?: (id: string) => void;
  onDeleteEventOverlay?: (id: string) => void;
  // Navigation node/edge callbacks
  onUpdateNavNode?: (id: string, changes: Partial<NavigationNode>) => void;
  onDeleteNavNode?: (id: string) => void;
  onUpdateNavEdge?: (id: string, changes: Partial<NavigationEdge>) => void;
  onDeleteNavEdge?: (id: string) => void;
  /** B5 Phase 1.6: bulk edge routing-flag update for graph multi-selection. */
  onBatchUpdateNavEdges?: (ids: string[], changes: Partial<NavigationEdge>) => void;
  /** B5 Phase 1.6: delete a set of nodes+edges as one history action. */
  onDeleteNavSelection?: (nodeIds: string[], edgeIds: string[]) => void;
  onClose: () => void;
}

const inputCls = "w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
const labelCls = "block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground";

// ── B5 Phase 1.6: human-readable waypoint types (custom selector options) ──
const WAYPOINT_TYPE_LABELS: Record<string, string> = {
  outdoor: "Outdoor Waypoint",
  entrance: "Building Entrance",
  hallway: "Hallway",
  room_access: "Destination",
  stair: "Staircase",
  elevator: "Elevator",
  transition: "Floor Transition",
  emergency_exit: "Emergency Exit",
  assembly: "Assembly Area",
  safe_area: "Safe Area",
};
// B5 Phase 1.7: the OUTDOOR authoring menu only exposes types that are
// meaningful for outdoor route planning. Indoor-only enum members (hallway /
// stair / elevator / transition) belong to the future Floor Editor graph and
// are not shown here — a type is never exposed just because the enum has it.
const WAYPOINT_TYPE_ORDER = [
  "outdoor", "entrance", "room_access", "emergency_exit", "assembly", "safe_area",
];

/** Compact custom dropdown used for the Waypoint Type selector (no native select). */
function WaypointTypeMenu({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs font-semibold flex items-center justify-between gap-2 hover:border-primary/40 transition-colors"
      >
        <span className="truncate">{WAYPOINT_TYPE_LABELS[value] ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 left-0 z-50 mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden" role="listbox">
          {WAYPOINT_TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={value === t}
              onClick={() => { onChange(t); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left hover:bg-muted transition-colors",
                value === t ? "text-primary bg-primary/5" : "text-foreground"
              )}
            >
              {WAYPOINT_TYPE_LABELS[t] ?? t}
              {value === t && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * B5 Phase 1.8: comfortable custom Yes/No (or Open/Closed) segmented control
 * for navigation Boolean properties — larger hit targets, readable labels,
 * balanced width, consistent height with other NaviSync controls, and
 * keyboard/focus accessible (radiogroup + aria-pressed). Never a native select.
 */
function BoolSegmented({ value, onYes, onNo, label, yesLabel = "Yes", noLabel = "No" }: {
  value: boolean;
  onYes: () => void;
  onNo: () => void;
  label: string;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl border border-border bg-muted/30 w-[128px] shrink-0">
      <button
        type="button"
        onClick={onYes}
        aria-pressed={value}
        className={cn(
          "h-9 rounded-lg text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          value ? "bg-card text-primary shadow-sm border border-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
        )}
      >{yesLabel}</button>
      <button
        type="button"
        onClick={onNo}
        aria-pressed={!value}
        className={cn(
          "h-9 rounded-lg text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          !value ? "bg-card text-primary shadow-sm border border-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
        )}
      >{noLabel}</button>
    </div>
  );
}

/** B5 Phase 1.7: shared reason options for Accessible = No (explanatory
 * metadata, not a separate routing graph). */
const INACCESSIBLE_REASONS: { value: string; label: string }[] = [
  { value: "stairs", label: "Stairs" },
  { value: "narrow_path", label: "Narrow Path" },
  { value: "restricted_access", label: "Restricted Access" },
  { value: "uneven_surface", label: "Uneven Surface" },
  { value: "other", label: "Other" },
];

/** B5 Phase 1.7: shared reason options for Emergency Safe = No. */
const EMERGENCY_REASONS: { value: string; label: string }[] = [
  { value: "hazard", label: "Hazard Area" },
  { value: "blocked", label: "Restricted During Emergency" },
  { value: "construction", label: "Not an Evacuation Route" },
  { value: "other", label: "Other" },
];

/** Compact custom dropdown for reason selectors (no native select). */
function ReasonMenu({ value, options, onChange, placeholder }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-8 px-3 rounded-lg border border-border bg-input-background text-foreground text-[11px] font-semibold flex items-center justify-between gap-2 hover:border-primary/40 transition-colors"
      >
        <span className="truncate text-muted-foreground">{placeholder}</span>
        <span className="truncate">{current?.label ?? "Other"}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 left-0 z-50 mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left hover:bg-muted transition-colors",
                value === o.value ? "text-primary bg-primary/5" : "text-foreground"
              )}
            >
              {o.label}
              {value === o.value && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex border-b border-border shrink-0">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold transition-all relative",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            {tab.label}
            {isActive && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PropertiesPanel({
  selected, selBldg, selEntrance, selEntranceParent, selMkr, selRoute,
  selDecorAsset, allDecorAssets,
  selNavNode, selNavEdge, selEventOverlay, allNavNodes, allNavEdges,
  allBuildings,
  layer,
  multiSelected, multiSelectedBuildings, selectedOutdoorCount,
  onBatchUpdateBuildings, onBatchDeleteBuildings, onClearMultiSelect, onLayerOrder,
  onUpdateBuilding, onAddEntrance, onSelectEntrance, onUpdateEntrance, onDeleteEntrance, onUpdateMarker, onUpdateRoute,
  onUpdateEventOverlay,
  onDeleteBuilding, onDeleteMarker, onDeleteRoute,
  onDeleteEventOverlay,
  onUpdateDecorAsset, onDeleteDecorAsset, onDuplicateDecorAsset,
  onUpdateNavNode, onDeleteNavNode, onUpdateNavEdge, onDeleteNavEdge,
  onBatchUpdateNavEdges, onDeleteNavSelection,
  onClose,
}: PropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "route" | "batch" | "decorAsset"; id: string; label: string } | null>(null);
  const visible = !!selected || multiSelected.length > 0;

  // Reset to basic tab when selection changes
  useEffect(() => { setTab("basic"); }, [selected]);

  // ── Multi-select mode ──
  const multiSelectedDecorAssets = allDecorAssets.filter((d) => multiSelected.includes(d.id));
  const isMultiMode = selectedOutdoorCount > 0;
  const isBuildingOnlyMultiMode = isMultiMode && selectedOutdoorCount === multiSelectedBuildings.length;

  const handleBatchColor = useCallback((color: string) => {
    onBatchUpdateBuildings(multiSelected, { color });
  }, [multiSelected, onBatchUpdateBuildings]);

  // Check if all selected are visible / locked for batch toggle clarity
  const allVisible = multiSelectedBuildings.length > 0 && multiSelectedBuildings.every((b) => b.visible !== false);
  const allLocked = multiSelectedBuildings.length > 0 && multiSelectedBuildings.every((b) => b.locked === true);

  // ── B5 Phase 1.6: navigation multi-selection ──
  // A marquee/shift-selection over graph elements selects nav nodes + edges.
  // This is distinct from outdoor multi-mode (buildings/decor): show a compact
  // graph summary + routing bulk flags + delete instead of layer/align tools.
  const multiNavNodeIds = multiSelected.filter((id) => allNavNodes?.some((n) => n.id === id) ?? false);
  const multiNavEdgeIds = multiSelected.filter((id) => allNavEdges?.some((e) => e.id === id) ?? false);
  const isNavMultiMode = layer === "navigation" && multiSelected.length > 0 && selectedOutdoorCount === 0
    && (multiNavNodeIds.length > 0 || multiNavEdgeIds.length > 0)
    && multiNavNodeIds.length + multiNavEdgeIds.length === multiSelected.length;

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-30 flex flex-col border-l border-border shadow-2xl overflow-hidden"
      style={{
        width: 240,
        background: "var(--card)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
          {isNavMultiMode
            ? `Graph Multi-Select (${multiNavNodeIds.length + multiNavEdgeIds.length})`
            : isMultiMode
              ? `Multi-Select (${selectedOutdoorCount})`
              : selBldg ? "Building" : selEntrance ? "Entrance" : selMkr ? "Marker" : selDecorAsset ? "Decorative Asset" : selRoute ? "Route" : selected?.type === "navNode" ? "Waypoint" : selected?.type === "navEdge" ? "Navigation Edge" : "Properties"}
        </span>
        <button
          onClick={() => { onClearMultiSelect(); onClose(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar (only for single building selection) */}
      {selBldg && !isMultiMode && <TabBar active={tab} onChange={setTab} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-4">
        {/* ── NAVIGATION MULTI-SELECT (B5 Phase 1.6) ── */}
        {isNavMultiMode && (
          <div data-testid="nav-multi-props">
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Graph Selection</span>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Waypoints</span>
                <span className="font-bold">{multiNavNodeIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Connections</span>
                <span className="font-bold">{multiNavEdgeIds.length}</span>
              </div>
              <p className="text-[9px] pt-1 border-t border-border">Drag a waypoint to move the selected nodes together. Connections follow their waypoints.</p>
            </div>
            {multiNavEdgeIds.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border space-y-2">
                <div className="flex items-center gap-1.5">
                  <Accessibility className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Bulk Routing</span>
                </div>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, { accessible: true })}
                  className="w-full h-8 rounded-xl border border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-[10px] font-bold text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors"
                >
                  Mark accessible
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, { emergencySafe: true })}
                  className="w-full h-8 rounded-xl border border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-[10px] font-bold text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors"
                >
                  Mark emergency safe
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, { accessible: false, inaccessibleReason: "other" })}
                  className="w-full h-8 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px] font-bold text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
                >
                  Mark not accessible
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, { closed: true })}
                  className="w-full h-8 rounded-xl border border-red-200 dark:border-red-700/30 bg-red-50 dark:bg-red-900/10 text-[10px] font-bold text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                >
                  Mark closed
                </button>
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-border">
              <button
                onClick={() => onDeleteNavSelection?.(multiNavNodeIds, multiNavEdgeIds)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors"
              >
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Selected</span>
              </button>
            </div>
          </div>
        )}

        {/* ── LAYER ORDER (B2): bring forward/backward, bring to front/back ── */}
        {/* Only show for selections that actually contain reorderable objects
            (buildings or decor assets) — a marker-only multi-selection must
            not expose controls that can only no-op. */}
        {(selBldg || selected?.type === "decorAsset" || multiSelected.some((id) => allBuildings.some((b) => b.id === id) || allDecorAssets.some((d) => d.id === id))) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Layer Order</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { action: "front" as const, label: "Bring to Front", icon: ChevronsUp },
                { action: "forward" as const, label: "Bring Forward", icon: ChevronUp },
                { action: "backward" as const, label: "Send Backward", icon: ChevronDown },
                { action: "back" as const, label: "Send to Back", icon: ChevronsDown },
              ].map(({ action, label, icon: Icon }) => (
                <button
                  key={action}
                  title={label}
                  aria-label={label}
                  onClick={() => onLayerOrder?.(action)}
                  className="flex items-center justify-center h-9 rounded-xl border border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/30 hover:text-foreground transition-all"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            <p className="text-[8px] text-muted-foreground mt-1.5 italic">
              Reorders buildings and outdoor assets in one shared stack without moving them. One undo step per action.
            </p>
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/* ── MULTI-SELECT BATCH OPERATIONS ── */}
        {/* ════════════════════════════════════ */}
        {isMultiMode && (
          <>
            {/* Selected items quick list */}
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Selected Objects</span>
            </div>
            <div className="space-y-1 max-h-[120px] overflow-y-auto scrollbar-show-on-hover">
              {multiSelectedBuildings.map((b) => (
                <div key={b.id} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/50 bg-muted/20">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                  <span className="text-[10px] font-semibold truncate text-foreground">{b.code} — {b.name}</span>
                </div>
              ))}
              {multiSelectedDecorAssets.map((asset) => {
              const template = DECOR_ASSET_MAP[asset.type];
              return (
                <div key={asset.id} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/50 bg-muted/20">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                  <span className="text-[10px] font-semibold truncate text-foreground">{asset.name || template.label}</span>
                </div>
              );
            })}
            </div>

            {isBuildingOnlyMultiMode && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <PaintBucket className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Building Batch Actions</span>
              </div>

              {/* Batch Color */}
              <div>
                <label className={labelCls}>Set Color</label>
                <ColorPicker value={multiSelectedBuildings[0]?.color ?? "#0e2a6e"} onChange={handleBatchColor} />
              </div>

              {/* Visibility toggle */}
              <div className="pt-2">
                <label className={labelCls}>Visibility</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const makeVisible = !allVisible;
                      onBatchUpdateBuildings(multiSelected, { visible: makeVisible });
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      allVisible
                        ? "border-primary/30 bg-primary/8 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {allVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {allVisible ? "Hide All" : "Show All"}
                  </button>
                  <button
                    onClick={() => {
                      onBatchUpdateBuildings(multiSelected, { locked: !allLocked });
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      allLocked
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {allLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {allLocked ? "Unlock All" : "Lock All"}
                  </button>
                </div>
              </div>

            </div>
            )}

            {/* Batch Delete */}
            <div className="pt-3 border-t border-border">
              <button
                onClick={() => setDeleteConfirm({
                  type: "batch",
                  id: "batch",
                  label: `${selectedOutdoorCount} objects`,
                })}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200"
              >
                <span className="flex items-center justify-center gap-1.5"><Trash2 className="h-3 w-3" /> Delete All ({selectedOutdoorCount})</span>
              </button>
            </div>
          </>
        )}

        {/* ── BUILDING PROPERTIES (single) ── */}
        {selBldg && !isMultiMode && (
          <>
            {/* ═══ BASIC ═══ */}
            {tab === "basic" && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="h-3 w-3 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Basic Info</span>
                </div>
                <div>
                  <label htmlFor="bldg-name" className={labelCls}>Name</label>
                  <input id="bldg-name" value={selBldg.name} onChange={(e) => onUpdateBuilding(selBldg.id, { name: e.target.value })} className={inputCls} placeholder="e.g. Main Academic Building" />
                </div>
                <div>
                  <label htmlFor="bldg-code" className={labelCls}>Code</label>
                  <input id="bldg-code" value={selBldg.code} onChange={(e) => onUpdateBuilding(selBldg.id, { code: e.target.value.toUpperCase().slice(0, 5) })} className={inputCls} placeholder="e.g. MAB" />
                </div>
                {/* Building Type is intentionally NOT editable in the sidebar:
                    an outdoor building object is simply a Building here. The
                    legacy `category` field is preserved in the data model for
                    backward compatibility but provides no editor functionality. */}
                <div>
                  <label htmlFor="bldg-description" className={labelCls}>Description</label>
                  <textarea id="bldg-description" value={selBldg.description ?? ""} rows={2} onChange={(e) => onUpdateBuilding(selBldg.id, { description: e.target.value })} placeholder="Optional description..." className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200" />
                </div>
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <DoorOpen className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Entrances ({selBldg.entrances?.length ?? 0})</span>
                    </div>
                    <button
                      onClick={() => onAddEntrance(selBldg.id)}
                      disabled={selBldg.locked}
                      className="flex items-center gap-1 h-6 px-2 rounded-lg border border-primary/30 text-[9px] font-bold text-primary hover:bg-primary/8 transition-all disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                  {(selBldg.entrances?.length ?? 0) > 0 ? (
                    <div className="space-y-1 max-h-[132px] overflow-y-auto scrollbar-show-on-hover">
                      {(selBldg.entrances ?? []).map((entrance, idx) => {
                        const meta = entrancePurposeMeta(entrance);
                        const entranceType = normalizeEntranceType(entrance.type);
                        return (
                          <button
                            key={entrance.id}
                            type="button"
                            onClick={() => onSelectEntrance(selBldg.id, entrance.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/30 text-left transition-colors"
                          >
                            <DoorOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10px] font-bold text-foreground truncate">{entranceDisplayName(entrance, idx)}</span>
                              <span className="block text-[8px] text-muted-foreground truncate">{meta}</span>
                            </span>
                            {entrance.isPrimary && entranceType === "general" && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                            {entrance.accessible && <Accessibility className="h-3 w-3 text-blue-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground italic">No entrances yet.</p>
                  )}
                </div>
                {/* ── Floor Management ── */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Floors ({selBldg.floors.length})</span>
                    </div>
                    <button
                      onClick={() => {
                        const nextNum = selBldg.floors.length + 1;
                        const newFloor: FloorPlan = createDefaultFloor({ id: genId("fl"), buildingId: selBldg.id, number: nextNum });
                        onUpdateBuilding(selBldg.id, { floors: [...selBldg.floors, newFloor] });
                      }}
                      className="flex items-center gap-1 h-6 px-2 rounded-lg border border-primary/30 text-[9px] font-bold text-primary hover:bg-primary/8 transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-show-on-hover">
                    {selBldg.floors.map((floor, idx) => (
                      <div
                        key={floor.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/60 bg-muted/10 group hover:bg-muted/20 transition-colors"
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 cursor-grab" />
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-extrabold text-white shrink-0"
                          style={{ background: selBldg.color }}
                        >
                          {idx + 1}
                        </div>
                        <span className="flex-1 text-[10px] font-medium text-foreground truncate">
                          {floor.label}
                        </span>
                        <span className="text-[8px] text-muted-foreground">{floor.rooms.length} rooms</span>
                        <button
                          onClick={() => {
                            if (selBldg.floors.length <= 1) return;
                            const newFloors = selBldg.floors.filter((f) => f.id !== floor.id);
                            // Re-number
                            onUpdateBuilding(selBldg.id, {
                              floors: newFloors.map((f, i) => ({
                                ...f,
                                number: i + 1,
                                label: i === 0 ? "Ground Floor" : `Floor ${i + 1}`,
                              })),
                            });
                          }}
                          disabled={selBldg.floors.length <= 1}
                          className={cn(
                            "w-5 h-5 rounded flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-all",
                            selBldg.floors.length <= 1
                              ? "text-muted-foreground/20 cursor-not-allowed"
                              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          )}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {selBldg.floors.length <= 1 && (
                    <p className="text-[8px] text-muted-foreground mt-1 italic">At least 1 floor is required. Click "Add" to add more floors.</p>
                  )}
                </div>
                {/* ── Room Navigation Status ── */}
                <div className="pt-2 border-t border-border">
                  <span className={labelCls}>Rooms & Navigation</span>
                  {(() => {
                    const allRooms = selBldg.floors.flatMap(f =>
                      f.rooms.map(r => ({ ...r, floorLabel: f.label, floorId: f.id }))
                    );
                    const connectedRooms = allRooms.filter(r => r.navConnection || r.accessNodeId);
                    if (allRooms.length === 0) {
                      return <p className="text-[9px] text-muted-foreground italic">No rooms defined in this building yet.</p>;
                    }
                    return (
                      <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-show-on-hover">
                        {allRooms.map((r) => {
                          const isConnected = !!(r.navConnection || r.accessNodeId);
                          return (
                            <div key={r.id} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/50 bg-muted/10">
                              <div className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                isConnected ? "bg-green-500" : "bg-amber-400"
                              )} />
                              <span className="text-[10px] font-medium truncate flex-1 text-foreground">{r.name}</span>
                              <span className="text-[8px] text-muted-foreground">{r.floorLabel}</span>
                              <span className={cn(
                                "text-[8px] font-bold",
                                isConnected ? "text-green-500" : "text-amber-500"
                              )}>
                                {isConnected ? "Nav ✓" : "Not connected"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* ═══ STYLE ═══ */}
            {tab === "style" && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <Palette className="h-3 w-3 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Appearance</span>
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <ColorPicker value={selBldg.color} onChange={(c) => onUpdateBuilding(selBldg.id, { color: c })} />
                </div>
                <div>
                  <label htmlFor="bldg-opacity" className={labelCls}>Opacity</label>
                  <div className="flex items-center gap-2">
                    <input id="bldg-opacity" type="range" min={0.1} max={1} step={0.05} value={selBldg.opacity ?? 1} onChange={(e) => onUpdateBuilding(selBldg.id, { opacity: parseFloat(e.target.value) })} className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{Math.round((selBldg.opacity ?? 1) * 100)}%</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="bldg-rotation" className={labelCls}>Rotation</label>
                  <div className="flex items-center gap-2">
                    <input id="bldg-rotation" type="range" min={0} max={360} step={15} value={selBldg.rotation ?? 0} onChange={(e) => onUpdateBuilding(selBldg.id, { rotation: parseInt(e.target.value) })} className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selBldg.rotation ?? 0}°</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Layer</label>
                  <Combobox
                    value={selBldg.layer ?? "campus"}
                    onChange={(v) => onUpdateBuilding(selBldg.id, { layer: v })}
                    options={LAYERS.map((l) => ({ value: l.id, label: l.label, icon: l.icon }))}
                    placeholder="Select layer"
                    searchPlaceholder="Search layers..."
                  />
                </div>
                <div className="pt-1">
                  <label className={labelCls}>Visibility</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onUpdateBuilding(selBldg.id, { visible: !(selBldg.visible ?? true) })}
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                        (selBldg.visible ?? true)
                          ? "border-primary/30 bg-primary/8 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {selBldg.visible ?? true ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {selBldg.visible ?? true ? "Visible" : "Hidden"}
                    </button>
                    <button
                      onClick={() => onUpdateBuilding(selBldg.id, { locked: !(selBldg.locked ?? false) })}
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                        selBldg.locked
                          ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {selBldg.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      {selBldg.locked ? "Locked" : "Unlocked"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ═══ ADVANCED ═══ */}
            {tab === "advanced" && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <Settings2 className="h-3 w-3 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Position & Size</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[["x", "X"], ["y", "Y"]].map(([k, l]) => (
                    <div key={k}>
                      <label htmlFor={`bldg-${k}`} className={labelCls}>{l}</label>
                      <input id={`bldg-${k}`} type="number" value={(selBldg as any)[k]} onChange={(e) => onUpdateBuilding(selBldg.id, { [k]: parseInt(e.target.value) || 0 })} className={`${inputCls} font-mono`} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[["width", "Width"], ["height", "Height"]].map(([k, l]) => (
                    <div key={k}>
                      <label htmlFor={`bldg-${k}`} className={labelCls}>{l}</label>
                      <input id={`bldg-${k}`} type="number" min={20} value={(selBldg as any)[k]} onChange={(e) => onUpdateBuilding(selBldg.id, { [k]: Math.max(20, parseInt(e.target.value) || 40) })} className={`${inputCls} font-mono`} />
                    </div>
                  ))}
                </div>
                {/* Navigation Connection section */}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Route className="h-3 w-3 text-blue-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation Connection</span>
                  </div>
                  <div className="mb-2">
                    <label className={labelCls}>Entrance Waypoint</label>
                    <select
                      value={selBldg.entranceNodeId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateBuilding(selBldg.id, { entranceNodeId: val || undefined });
                      }}
                      className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
                    >
                      <option value="">None — not connected</option>
                      {(allNavNodes ?? []).map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name || n.id} ({n.type}) {n.buildingId === selBldg.id ? '📍' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selBldg.entranceNodeId ? (
                    <div className="px-2.5 py-2 rounded-xl border border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-[10px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="font-bold text-green-600 dark:text-green-400">Connected</span>
                      </div>
                      <p className="text-muted-foreground text-[9px]">
                        Entrance linked to nav node "{allNavNodes?.find(n => n.id === selBldg.entranceNodeId)?.name || selBldg.entranceNodeId}".
                      </p>
                    </div>
                  ) : (
                    <div className="px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        <span className="font-bold text-amber-600 dark:text-amber-400">Not Connected</span>
                      </div>
                      <p className="text-muted-foreground text-[9px]">
                        No entrance navigation node assigned. Select a waypoint from the dropdown above, or create one in the Navigation layer.
                      </p>
                    </div>
                  )}
                </div>
                {/* Accessibility section */}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Accessibility className="h-3 w-3 text-blue-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Accessibility</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mb-2">Basic accessibility information for this building.</p>
                  <div className="space-y-2">
                    {[
                      { key: "wheelchairAccessible" as const, label: "Wheelchair Accessible" },
                      { key: "hasElevator" as const, label: "Has Elevator" },
                      { key: "hasRamp" as const, label: "Has Wheelchair Ramp" },
                      { key: "accessibleEntrance" as const, label: "Accessible Entrance" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selBldg.accessibility?.[key] ?? false}
                          onChange={(e) => {
                            const current = selBldg.accessibility || { wheelchairAccessible: false, hasElevator: false, hasRamp: false, accessibleEntrance: false };
                            onUpdateBuilding(selBldg.id, { accessibility: { ...current, [key]: e.target.checked } });
                          }}
                          className="accent-primary h-3.5 w-3.5 rounded"
                        />
                        <span className="text-[10px] text-foreground font-medium">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t border-border">
                  <button onClick={() => setDeleteConfirm({ type: "building", id: selBldg.id, label: selBldg.name || selBldg.code })} className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200">
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Building</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── MARKER PROPERTIES ── */}
        {selEntrance && selEntranceParent && !isMultiMode && (
          <>
            {(() => {
              const entranceLocked = selEntranceParent.locked === true;
              const entranceType = normalizeEntranceType(selEntrance.type);
              const canBePrimary = entranceType === "general";
              return (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <DoorOpen className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Entrance</span>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border bg-muted/20">
              <span className="block text-xs font-extrabold text-foreground truncate">{entranceDisplayName(selEntrance, selEntranceParent.entrances?.findIndex((e) => e.id === selEntrance.id) ?? 0)}</span>
              <span className="block text-[9px] text-muted-foreground truncate">{selEntranceParent.code} - {selEntranceParent.name}</span>
            </div>
            <div>
              <label htmlFor="entrance-name" className={labelCls}>Name</label>
              <CommittedTextInput
                id="entrance-name"
                value={selEntrance.name ?? ""}
                onCommit={(name) => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { name: name || undefined })}
                className={inputCls}
                placeholder="Main Entrance"
                disabled={entranceLocked}
              />
            </div>
            <div>
              <label id="entrance-purpose-label" className={labelCls}>Purpose</label>
              <div
                data-testid="entrance-purpose-control"
                aria-labelledby="entrance-purpose-label"
                role="group"
                className="grid grid-cols-1 gap-1.5"
              >
                {BUILDING_ENTRANCE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={entranceLocked}
                    onClick={() => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { type })}
                    className={cn(
                      "flex items-center justify-between gap-2 min-h-8 px-2.5 py-1.5 rounded-lg border text-left text-[10px] font-bold transition-colors disabled:opacity-50",
                      entranceType === type
                        ? "border-primary/40 bg-primary/8 text-primary"
                        : "border-border/70 bg-muted/10 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    )}
                  >
                    <span>{entranceTypeLabel(type)}</span>
                    {entranceType === type && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between gap-2">
                <span>Parent</span>
                <span className="font-bold text-foreground truncate">{selEntranceParent.code} - {selEntranceParent.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Edge</span>
                <span className="font-bold">{BUILDING_ENTRANCE_EDGE_LABELS[selEntrance.edge]}</span>
              </div>
              <div className="flex justify-between">
                <span>Offset</span>
                <span className="font-mono">{Math.round(selEntrance.offset * 100)}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label id="entrance-edge-label" className={labelCls}>Side</label>
                <div role="group" aria-labelledby="entrance-edge-label" className="grid grid-cols-4 gap-1">
                  {Object.entries(BUILDING_ENTRANCE_EDGE_LABELS).map(([edge, label]) => (
                    <button
                      key={edge}
                      type="button"
                      disabled={entranceLocked}
                      onClick={() => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { edge: edge as BuildingEntranceEdge })}
                      className={cn(
                        "h-8 rounded-lg border text-[9px] font-bold transition-colors disabled:opacity-50",
                        selEntrance.edge === edge
                          ? "border-primary/40 bg-primary/8 text-primary"
                          : "border-border/70 bg-muted/10 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="entrance-offset" className={labelCls}>Position Along Side</label>
                <CommittedSlider
                  id="entrance-offset"
                  value={selEntrance.offset}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={entranceLocked}
                  onCommit={(offset) => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { offset })}
                  format={(v) => `${Math.round(v * 100)}%`}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer", entranceLocked && "cursor-not-allowed opacity-60")}>
                <input type="checkbox" checked={canBePrimary && (selEntrance.isPrimary ?? false)} disabled={entranceLocked || !canBePrimary} onChange={(e) => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { isPrimary: e.target.checked })} className="accent-primary h-3.5 w-3.5 rounded" />
                <span className="text-[10px] text-foreground font-medium">Primary Entrance</span>
              </label>
              <label className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer", entranceLocked && "cursor-not-allowed opacity-60")}>
                <input type="checkbox" checked={selEntrance.accessible ?? false} disabled={entranceLocked} onChange={(e) => onUpdateEntrance(selEntranceParent.id, selEntrance.id, { accessible: e.target.checked })} className="accent-primary h-3.5 w-3.5 rounded" />
                <span className="text-[10px] text-foreground font-medium">Accessible</span>
              </label>
            </div>
            <div className="pt-3 border-t border-border">
              <button
                onClick={() => onDeleteEntrance(selEntranceParent.id, selEntrance.id)}
                disabled={entranceLocked}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="flex items-center justify-center gap-1.5"><Trash2 className="h-3 w-3" /> Delete Entrance</span>
              </button>
            </div>
          </>
              );
            })()}
          </>
        )}

        {selMkr && !isMultiMode && (
          <>
            {/* Basic */}
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Marker Info</span>
            </div>
            <div>
              <label htmlFor="mkr-name" className={labelCls}>Name</label>
              <input id="mkr-name" value={selMkr.name} onChange={(e) => onUpdateMarker(selMkr.id, { name: e.target.value })} className={inputCls} placeholder="Marker name" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <Combobox
                value={selMkr.type}
                onChange={(v) => {
                  const style = MARKER_STYLES[v];
                  onUpdateMarker(selMkr.id, { type: v, color: style?.color || selMkr.color });
                }}
                options={Object.entries(MARKER_STYLES).map(([v, c]) => ({ value: v, label: c.label, color: c.color }))}
                placeholder="Select type"
                searchPlaceholder="Search marker types..."
              />
            </div>
            <div className="pt-2 border-t border-border">
              <span className={labelCls}>Position</span>
              <div className="grid grid-cols-2 gap-2">
                {[["x", "X"], ["y", "Y"]].map(([k, l]) => (
                  <div key={k}>
                    <label htmlFor={`mkr-${k}`} className={labelCls}>{l}</label>
                    <input id={`mkr-${k}`} type="number" value={(selMkr as any)[k]} onChange={(e) => onUpdateMarker(selMkr.id, { [k]: parseInt(e.target.value) || 0 })} className={inputCls} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <ColorPicker value={selMkr.color || "#0e2a6e"} onChange={(c) => onUpdateMarker(selMkr.id, { color: c })} />
            </div>
            <div className="pt-3 border-t border-border">
              <button onClick={() => setDeleteConfirm({ type: "marker", id: selMkr.id, label: selMkr.name })} className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Marker</span>
              </button>
            </div>
          </>
        )}

        {/* ── DECORATIVE ASSET PROPERTIES (B2 Phase 3) ── */}
        {selDecorAsset && !isMultiMode && (
          (() => {
            const template = DECOR_ASSET_MAP[selDecorAsset.type];
            const rot = normalizeRotation(selDecorAsset.rotation ?? 0);
            const scale = clampDecorScale(selDecorAsset.scale ?? 1);
            return (
              <>
                {/* Asset summary */}
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="h-3 w-3 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Asset Info</span>
                </div>
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-border bg-muted/20">
                  <DecorAssetVisual type={selDecorAsset.type} className="w-7 h-8 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-foreground truncate">{template?.label ?? selDecorAsset.type}</p>
                    <p className="text-[9px] text-muted-foreground capitalize">{template?.category ?? "Asset"}</p>
                  </div>
                </div>
                <div>
                  <label htmlFor="decor-name" className={labelCls}>Name (optional)</label>
                  <CommittedTextInput
                    id="decor-name"
                    value={selDecorAsset.name ?? ""}
                    onCommit={(v) => onUpdateDecorAsset(selDecorAsset.id, { name: v.trim() ? v.trim() : undefined })}
                    className={inputCls}
                    placeholder="e.g. Old Oak Tree"
                  />
                </div>
                <div>
                  <label className={labelCls}>Type</label>
                  <Combobox
                    value={selDecorAsset.type}
                    onChange={(v) => onUpdateDecorAsset(selDecorAsset.id, { type: v as DecorAssetType })}
                    options={DECOR_ASSET_TYPES.map((t) => ({ value: t.type, label: t.label, color: t.color }))}
                    placeholder="Select asset type"
                    searchPlaceholder="Search asset types..."
                  />
                </div>

                {/* Transform */}
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Settings2 className="h-3 w-3 text-primary" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Transform</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[["x", "X"], ["y", "Y"]].map(([k, l]) => (
                      <div key={k}>
                        <label htmlFor={`decor-${k}`} className={labelCls}>{l}</label>
                        <CommittedNumberInput
                          id={`decor-${k}`}
                          value={selDecorAsset[k as "x" | "y"]}
                          onCommit={(v) => onUpdateDecorAsset(selDecorAsset.id, { [k]: v })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <label htmlFor="decor-rotation" className={labelCls}>Rotation</label>
                    <div className="flex items-center gap-2">
                      <CommittedSlider
                        id="decor-rotation"
                        value={rot}
                        min={0}
                        max={360}
                        step={5}
                        onCommit={(v) => onUpdateDecorAsset(selDecorAsset.id, { rotation: normalizeRotation(v) })}
                        format={(v) => `${Math.round(v)}°`}
                        className="flex-1"
                      />
                      <CommittedNumberInput
                        id="decor-rotation-input"
                        value={rot}
                        onCommit={(v) => onUpdateDecorAsset(selDecorAsset.id, { rotation: normalizeRotation(v) })}
                        className="w-16 shrink-0 font-mono"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label htmlFor="decor-scale" className={labelCls}>Scale</label>
                    <CommittedSlider
                      id="decor-scale"
                      value={scale}
                      min={DECOR_SCALE_MIN}
                      max={DECOR_SCALE_MAX}
                      step={0.1}
                      onCommit={(v) => onUpdateDecorAsset(selDecorAsset.id, { scale: clampDecorScale(v) })}
                      format={(v) => `${Math.round(v * 10) / 10}×`}
                    />
                  </div>
                </div>

                {/* Appearance */}
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Palette className="h-3 w-3 text-primary" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Appearance</span>
                  </div>
                  <label className={labelCls}>Visibility</label>
                  <button
                    onClick={() => onUpdateDecorAsset(selDecorAsset.id, { visible: !(selDecorAsset.visible ?? true) })}
                    className={cn(
                      "w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      (selDecorAsset.visible ?? true)
                        ? "border-primary/30 bg-primary/8 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {selDecorAsset.visible ?? true ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {selDecorAsset.visible ?? true ? "Visible" : "Hidden"}
                  </button>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-border space-y-2">
                  <button
                    title="Duplicate Asset"
                    onClick={() => onDuplicateDecorAsset(selDecorAsset.id)}
                    className="w-full h-10 rounded-xl border border-primary/30 text-xs font-bold text-primary hover:bg-primary/8 hover:border-primary/50 transition-colors duration-200"
                  >
                    <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate Asset</span>
                  </button>
                  <button
                    title="Delete Asset"
                    onClick={() => setDeleteConfirm({ type: "decorAsset", id: selDecorAsset.id, label: selDecorAsset.name || template?.label || "this asset" })}
                    className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200"
                  >
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Asset</span>
                  </button>
                </div>
              </>
            );
          })()
        )}

        {/* ── NAV NODE PROPERTIES (Navigation layer) ── */}
        {selNavNode && !isMultiMode && (
          <div data-testid="nav-node-props">
            <div className="flex items-center gap-1.5 mb-3">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Waypoint</span>
            </div>

            {/* GENERAL */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">General</span>
              </div>
              <div>
                <label htmlFor="nav-name" className={labelCls}>Name</label>
                <input id="nav-name" value={selNavNode.name} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { name: e.target.value })}
                  className={inputCls} placeholder="Waypoint name" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                {/* B5 Phase 1.7: an entrance-linked waypoint is permanently a
                    Building Entrance — the type is locked so a generic Type
                    change can never silently break the B3 entrance relationship. */}
                {selNavNode.entranceId ? (
                  <div className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-foreground text-xs font-semibold flex items-center gap-2">
                    <DoorOpen className="h-3.5 w-3.5 text-blue-500" />
                    <span className="truncate">Building Entrance</span>
                    <span className="ml-auto text-[9px] text-muted-foreground font-medium">Linked</span>
                  </div>
                ) : (
                  <WaypointTypeMenu value={selNavNode.type} onChange={(t) => onUpdateNavNode?.(selNavNode.id, { type: t as NavigationNode["type"] })} />
                )}
              </div>
            </div>

            {/* ROUTING */}
            <div className="pt-3 mt-3 border-t border-border space-y-3">
              <div className="flex items-center gap-1.5">
                <Accessibility className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Routing</span>
              </div>
              {/* B5 Phase 1.8: comfortable custom Yes/No segmented control + custom
                  reason selector. Accessible = may be used for an Accessible route. */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> Accessible</span>
                  <BoolSegmented
                    value={selNavNode.accessible}
                    onYes={() => onUpdateNavNode?.(selNavNode.id, { accessible: true, inaccessibleReason: undefined })}
                    onNo={() => onUpdateNavNode?.(selNavNode.id, { accessible: false, inaccessibleReason: selNavNode.inaccessibleReason ?? "other" })}
                    label="Accessible"
                  />
                </div>
                {selNavNode.accessible === false && (
                  <ReasonMenu
                    value={selNavNode.inaccessibleReason ?? "other"}
                    options={INACCESSIBLE_REASONS}
                    onChange={(r) => onUpdateNavNode?.(selNavNode.id, { inaccessibleReason: r as NavigationNode["inaccessibleReason"] })}
                    placeholder="Why is this not accessible?"
                  />
                )}
              </div>
              {selNavNode.type === "entrance" && selNavNode.buildingId && (
                <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground">
                  Linked to building entrance — outdoor routes enter the building through here.
                </div>
              )}
            </div>

            {/* CONNECTIONS */}
            <div className="pt-3 mt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Route className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Connections</span>
              </div>
              <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Connected paths</span>
                  <span className="font-bold">
                    {allNavEdges?.filter(e => e.startNodeId === selNavNode.id || e.endNodeId === selNavNode.id).length ?? 0}
                  </span>
                </div>
                {selNavNode.buildingId && (
                  <div className="flex justify-between mt-1">
                    <span>Building</span>
                    <span className="font-bold text-[9px]">{allBuildings.find((b) => b.id === selNavNode.buildingId)?.name ?? selNavNode.buildingId}</span>
                  </div>
                )}
                {selNavNode.floorId && (
                  <div className="flex justify-between mt-1">
                    <span>Floor</span>
                    <span className="font-bold text-[9px]">{selNavNode.floorId}</span>
                  </div>
                )}
              </div>
              {/* Isolated warning — only when genuinely isolated */}
              {allNavEdges && allNavEdges.filter(e => e.startNodeId === selNavNode.id || e.endNodeId === selNavNode.id).length === 0 && (
                <div className="mt-2 px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="font-bold text-amber-600 dark:text-amber-400">Isolated</span>
                  </div>
                  <p className="text-muted-foreground">This waypoint has no connections. Use Connect Path to link it into the walking network.</p>
                </div>
              )}
            </div>

            {/* POSITION — compact secondary fields, never the focus. Entrance-
                linked nodes are derived geometry: position is read-only because
                it always follows the linked building entrance. */}
            <div className="pt-3 mt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Settings2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Position</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>X</label>
                  <input type="number" value={selNavNode.x} disabled={!!selNavNode.entranceId}
                    onChange={(e) => onUpdateNavNode?.(selNavNode.id, { x: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} font-mono ${selNavNode.entranceId ? "opacity-60 cursor-not-allowed" : ""}`} />
                </div>
                <div>
                  <label className={labelCls}>Y</label>
                  <input type="number" value={selNavNode.y} disabled={!!selNavNode.entranceId}
                    onChange={(e) => onUpdateNavNode?.(selNavNode.id, { y: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} font-mono ${selNavNode.entranceId ? "opacity-60 cursor-not-allowed" : ""}`} />
                </div>
              </div>
              {selNavNode.entranceId && (
                <p className="px-1 pt-1.5 text-[9px] text-muted-foreground">Derived from the linked building entrance — move the building or entrance instead.</p>
              )}
            </div>

            {/* ACTIONS */}
            <div className="pt-3 mt-3 border-t border-border">
              <button onClick={() => onDeleteNavNode?.(selNavNode.id)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Waypoint</span>
              </button>
            </div>
          </div>
        )}

        {/* ── NAV EDGE PROPERTIES (Navigation layer) ── */}
        {selNavEdge && !isMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-3">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation Path</span>
            </div>

            {/* CONNECTION */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Connection</span>
              </div>
              <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>From</span>
                  <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.startNodeId)?.name ?? "Waypoint"}</span>
                </div>
                <div className="flex justify-between">
                  <span>To</span>
                  <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.endNodeId)?.name ?? "Waypoint"}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span>Distance</span>
                  <span className="font-bold">{selNavEdge.distance} units</span>
                </div>
              </div>
            </div>

            {/* DIRECTION — compact segmented control */}
            <div className="pt-3 mt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Route className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Direction</span>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-border bg-muted/30">
                <button
                  onClick={() => onUpdateNavEdge?.(selNavEdge.id, { bidirectional: true })}
                  aria-pressed={selNavEdge.bidirectional !== false}
                  className={cn(
                    "h-7 rounded-lg text-[10px] font-bold transition-all",
                    selNavEdge.bidirectional !== false
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  ⇄ Bidirectional
                </button>
                <button
                  onClick={() => onUpdateNavEdge?.(selNavEdge.id, { bidirectional: false })}
                  aria-pressed={selNavEdge.bidirectional === false}
                  className={cn(
                    "h-7 rounded-lg text-[10px] font-bold transition-all",
                    selNavEdge.bidirectional === false
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  → One Way
                </button>
              </div>
            </div>

            {/* ROUTE AVAILABILITY — one shared graph, routing flags per edge */}
            <div className="pt-3 mt-3 border-t border-border space-y-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Accessibility className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Route Availability</span>
              </div>
              {/* Accessible — segmented Yes/No + custom reason (no native select) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> Accessible</span>
                  <BoolSegmented
                    value={selNavEdge.accessible}
                    onYes={() => onUpdateNavEdge?.(selNavEdge.id, { accessible: true, inaccessibleReason: undefined })}
                    onNo={() => onUpdateNavEdge?.(selNavEdge.id, { accessible: false, inaccessibleReason: selNavEdge.inaccessibleReason ?? "other" })}
                    label="Accessible"
                  />
                </div>
                {selNavEdge.accessible === false && (
                  <ReasonMenu
                    value={selNavEdge.inaccessibleReason ?? "other"}
                    options={INACCESSIBLE_REASONS}
                    onChange={(r) => onUpdateNavEdge?.(selNavEdge.id, { inaccessibleReason: r as NavigationEdge["inaccessibleReason"] })}
                    placeholder="Why is this not accessible?"
                  />
                )}
              </div>
              {/* Emergency Safe — segmented Yes/No + custom reason */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-foreground flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" /> Emergency Safe</span>
                  <BoolSegmented
                    value={selNavEdge.emergencySafe !== false}
                    onYes={() => onUpdateNavEdge?.(selNavEdge.id, { emergencySafe: true, emergencyReason: undefined })}
                    onNo={() => onUpdateNavEdge?.(selNavEdge.id, { emergencySafe: false, emergencyReason: selNavEdge.emergencyReason ?? "hazard" })}
                    label="Emergency Safe"
                  />
                </div>
                {selNavEdge.emergencySafe === false && (
                  <ReasonMenu
                    value={selNavEdge.emergencyReason ?? "hazard"}
                    options={EMERGENCY_REASONS}
                    onChange={(r) => onUpdateNavEdge?.(selNavEdge.id, { emergencyReason: r as NavigationEdge["emergencyReason"] })}
                    placeholder="Why not emergency-safe?"
                  />
                )}
              </div>
              {/* Closed — Open / Closed segmented */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-foreground flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" /> Closed</span>
                  <BoolSegmented
                    value={selNavEdge.closed === true}
                    onYes={() => onUpdateNavEdge?.(selNavEdge.id, { closed: false })}
                    onNo={() => onUpdateNavEdge?.(selNavEdge.id, { closed: true })}
                    label="Closed"
                    yesLabel="Open"
                    noLabel="Closed"
                  />
                </div>
                <p className="px-1 text-[9px] text-muted-foreground">Closed paths are excluded from routing (temporarily unavailable for all route modes).</p>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="pt-3 mt-3 border-t border-border">
              <button onClick={() => onDeleteNavEdge?.(selNavEdge.id)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Path</span>
              </button>
            </div>
          </>
        )}

        {/* ── ROUTE PROPERTIES (Navigation layer) ── */}
        {selRoute && layer === "navigation" && !isMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Route Info</span>
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <input value={selRoute.name} onChange={(e) => onUpdateRoute?.(selRoute.id, { name: e.target.value })} className={inputCls} placeholder="Route name" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={selRoute.type} onChange={(e) => onUpdateRoute?.(selRoute.id, { type: e.target.value as any })}
                className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select">
                <option value="walking">Walking</option>
                <option value="accessible">Accessible</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <ColorPicker value={selRoute.color} onChange={(c) => onUpdateRoute?.(selRoute.id, { color: c })} />
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Distance</span>
                <span className="font-bold">{selRoute.distanceM}m</span>
              </div>
              <div className="flex justify-between">
                <span>Duration</span>
                <span className="font-bold">{selRoute.durationMin} min</span>
              </div>
              <div className="flex justify-between">
                <span>Waypoints</span>
                <span className="font-bold">{selRoute.waypoints.length}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <button onClick={() => setDeleteConfirm({ type: "route", id: selRoute.id, label: selRoute.name })}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Route</span>
              </button>
            </div>
          </>
        )}

        {/* ── ACCESSIBILITY LAYER (building selected) ── */}
        {layer === "accessibility" && selBldg && !isMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Accessibility className="h-3 w-3 text-blue-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Accessibility</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Accessibility features for {selBldg.code}
            </p>
            <div className="space-y-1">
              {[
                { key: "ramp", label: "Wheelchair Ramp" },
                { key: "elevator", label: "Elevator Access" },
                { key: "accessible_entrance", label: "Accessible Entrance" },
                { key: "accessible_restroom", label: "Accessible Restroom" },
                { key: "wide_corridor", label: "Wide Corridors" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-border">
                  <span className="text-[11px] text-foreground">{label}</span>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── EVENT OVERLAY PROPERTIES ── */}
        {selEventOverlay && !isMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="h-3 w-3 text-amber-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Event Details</span>
            </div>
            <div>
              <label htmlFor="evt-title" className={labelCls}>Title</label>
              <input id="evt-title" value={selEventOverlay.title}
                onChange={(e) => onUpdateEventOverlay?.(selEventOverlay.id, { title: e.target.value })}
                className={inputCls} placeholder="Event name" />
            </div>
            <div>
              <label htmlFor="evt-desc" className={labelCls}>Description</label>
              <textarea id="evt-desc" value={selEventOverlay.description}
                onChange={(e) => onUpdateEventOverlay?.(selEventOverlay.id, { description: e.target.value })}
                rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Event description..." />
            </div>
            <div>
              <label htmlFor="evt-organizer" className={labelCls}>Organizer</label>
              <input id="evt-organizer" value={selEventOverlay.organizer}
                onChange={(e) => onUpdateEventOverlay?.(selEventOverlay.id, { organizer: e.target.value })}
                className={inputCls} placeholder="Organizer name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="evt-start" className={labelCls}>Start Date</label>
                <input id="evt-start" type="date" value={selEventOverlay.dateStart}
                  onChange={(e) => onUpdateEventOverlay?.(selEventOverlay.id, { dateStart: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <label htmlFor="evt-end" className={labelCls}>End Date</label>
                <input id="evt-end" type="date" value={selEventOverlay.dateEnd}
                  onChange={(e) => onUpdateEventOverlay?.(selEventOverlay.id, { dateEnd: e.target.value })}
                  className={inputCls} />
              </div>
            </div>

            {/* ── Location selector ── */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Location</span>
              </div>
              {/* Building selector */}
              <div className="mb-1">
                <label className={labelCls}>Building</label>
                <select
                  value={selEventOverlay.locationRef?.buildingId ?? ""}
                  onChange={(e) => {
                    const bldgId = e.target.value;
                    if (!bldgId) {
                      onUpdateEventOverlay?.(selEventOverlay.id, { locationRef: undefined });
                      return;
                    }
                    const b = allBuildings.find(x => x.id === bldgId);
                    const ref: EventLocationRef = {
                      type: "building",
                      buildingId: bldgId,
                      label: b ? `${b.code} — ${b.name}` : bldgId,
                    };
                    onUpdateEventOverlay?.(selEventOverlay.id, { locationRef: ref });
                  }}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
                >
                  <option value="">None — no location</option>
                  {allBuildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>
              {/* Room selector (shown when a building is selected) */}
              {selEventOverlay.locationRef?.buildingId && (
                <div>
                  <label className={labelCls}>Room (optional)</label>
                  <select
                    value={selEventOverlay.locationRef?.roomId ?? ""}
                    onChange={(e) => {
                      const roomId = e.target.value;
                      const bldg = allBuildings.find(x => x.id === selEventOverlay.locationRef!.buildingId);
                      if (!bldg) return;
                      if (!roomId) {
                        // Switch to building-level location
                        const ref: EventLocationRef = {
                          type: "building",
                          buildingId: selEventOverlay.locationRef!.buildingId,
                          label: `${bldg.code} — ${bldg.name}`,
                        };
                        onUpdateEventOverlay?.(selEventOverlay.id, { locationRef: ref });
                        return;
                      }
                      // Find the room in any floor
                      for (const floor of bldg.floors) {
                        const room = floor.rooms.find(r => r.id === roomId);
                        if (room) {
                          const ref: EventLocationRef = {
                            type: "room",
                            buildingId: bldg.id,
                            floorId: floor.id,
                            roomId: room.id,
                            label: `${bldg.code} — ${floor.label} — ${room.name}`,
                          };
                          onUpdateEventOverlay?.(selEventOverlay.id, { locationRef: ref });
                          return;
                        }
                      }
                    }}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
                  >
                    <option value="">Entire Building (no specific room)</option>
                    {(() => {
                      const bldg = allBuildings.find(x => x.id === selEventOverlay.locationRef!.buildingId);
                      if (!bldg) return null;
                      return bldg.floors.flatMap(floor =>
                        floor.rooms.map(room => (
                          <option key={room.id} value={room.id}>{floor.label} — {room.name}</option>
                        ))
                      );
                    })()}
                  </select>
                </div>
              )}
              {/* Current location summary */}
              {selEventOverlay.locationRef ? (
                <div className="mt-2 px-2.5 py-2 rounded-xl border border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-[10px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span className="font-bold text-green-600 dark:text-green-400">
                      {selEventOverlay.locationRef.type === "room" ? "Room Location" : "Building Location"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{selEventOverlay.locationRef.label}</p>
                </div>
              ) : (
                <div className="mt-2 px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="font-bold text-amber-600 dark:text-amber-400">No Location</span>
                  </div>
                  <p className="text-muted-foreground">No building or room assigned. Students won't be able to navigate to this event. Select a building above.</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-border">
              <button onClick={() => onDeleteEventOverlay?.(selEventOverlay.id)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Event</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation (single or batch) */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirm?.type === "batch" ? "Delete Selected Objects?" : `Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : deleteConfirm?.type === "decorAsset" ? "Asset" : "Route"}?`}
        message={deleteConfirm?.type === "batch"
          ? `This action cannot be undone. "${deleteConfirm?.label}" will be permanently removed from the map.`
          : `This action cannot be undone. "${deleteConfirm?.label ?? "this item"}" will be permanently removed from the map.`}
        confirmLabel={deleteConfirm?.type === "batch" ? "Delete All" : `Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : deleteConfirm?.type === "decorAsset" ? "Asset" : "Route"}`}
        variant="danger"
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === "batch") {
            onBatchDeleteBuildings(multiSelected);
            onClearMultiSelect();
          } else if (deleteConfirm.type === "building") onDeleteBuilding(deleteConfirm.id);
          else if (deleteConfirm.type === "marker") onDeleteMarker(deleteConfirm.id);
          else if (deleteConfirm.type === "decorAsset") onDeleteDecorAsset(deleteConfirm.id);
          else onDeleteRoute?.(deleteConfirm.id);
          setDeleteConfirm(null);
          if (deleteConfirm.type !== "batch") onClose();
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

// ── Committed controls (B2 Phase 3) ──
// Local draft + commit on blur/Enter/pointer-release, so each meaningful change
// produces exactly ONE undoable history state instead of one per keystroke/tick.

function CommittedNumberInput({ id, value, min, max, step, onCommit, className, placeholder }: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const raw = draft;
    setDraft(null);
    if (raw === null) return;
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    let v = num;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onCommit(v);
  };
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={className}
      placeholder={placeholder}
    />
  );
}

function CommittedTextInput({ id, value, onCommit, className, placeholder, disabled }: {
  id: string;
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  useEffect(() => { setDraft(value); draftRef.current = value; }, [value]);
  const commit = (currentValue?: string) => {
    const raw = currentValue ?? draftRef.current;
    setDraft(raw);
    draftRef.current = raw;
    if (raw !== value) onCommit(raw);
  };
  const updateDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };
  return (
    <input
      id={id}
      type="text"
      value={draft}
      onChange={(e) => updateDraft(e.target.value)}
      onInput={(e) => updateDraft((e.target as HTMLInputElement).value)}
      onBlur={(e) => commit(e.currentTarget.value || draftRef.current)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function CommittedSlider({ id, value, min, max, step, onCommit, format, className, disabled }: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  format: (v: number) => string;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const display = draft ?? value;
  const commit = () => {
    const d = draft;
    setDraft(null);
    if (d !== null && d !== value) onCommit(d);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => setDraft(parseFloat(e.target.value))}
        onBlur={commit}
        onPointerUp={commit}
        className={cn("h-1.5 accent-primary", className)}
        disabled={disabled}
      />
      <span className="text-xs font-mono text-muted-foreground w-12 text-right shrink-0">{format(display)}</span>
    </div>
  );
}
