import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X, Eye, EyeOff, Lock, Unlock, Info, Palette, Settings2,
  Route, Accessibility, Star, CheckCircle2, XCircle, AlertTriangle,
  PaintBucket, Trash2, MapPin, Calendar, Plus, Minus, GripVertical,
  Layers, Copy,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
  DoorOpen, ArrowRightLeft, ArrowLeft, Navigation as NavigationIcon,
  Search as SearchIcon,
} from "lucide-react";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { polylineCrossesObstacle } from "../../lib/editorPlacement";
import type { BulkRoutingAction } from "../../lib/navigationGraph";
import { normalizeRotation, clampDecorScale, DECOR_SCALE_MIN, DECOR_SCALE_MAX } from "../../lib/decorAsset";
import { createDefaultFloor } from "../../lib/floorPlanNormalization";
import { nextFloorNumberForBuilding, countFloorAuthoredItems, deleteFloorFromBuilding } from "../../lib/floorManagement";
import { DecorAssetVisual } from "./DecorAssetVisual";
import { ObjectIssueSection, type ObjectIssueItem } from "./ObjectIssueSection";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import { LAYERS, LAYER_TOOLS, DECOR_ASSET_MAP, DECOR_ASSET_TYPES, genId } from "./constants";
import { Combobox } from "../ui/Combobox";
import { ColorPicker } from "../ui/ColorPicker";
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
  CampusEntrance, CampusPath,
} from "./types";
import type { DoorOption, EntranceIndoorLinkStatus } from "../../lib/entranceTransitions";
import { pathwayHasLegacyNavigationChain, pathwayHasOwnedNavigation } from "../../lib/campusPathNavigation";
import {
  isPathwayGeneratedEdge,
  navigationEdgePermissions,
  navigationNodePermissions,
  pathNetworkNavigationStatus,
} from "../../lib/campusPathNetwork";

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
  /** B7 Phase 2: live validation issues for the currently selected object. */
  issueItems?: ObjectIssueItem[];
  selBldg: CampusBuilding | undefined;
  selEntrance?: CampusEntrance | undefined;
  selEntranceParent?: CampusBuilding | undefined;
  selMkr: CampusMarker | undefined;
  selPath?: CampusPath | undefined;
  allPaths?: CampusPath[];
  selectedPathPoint?: { pathId: string; pointIndex: number } | null;
  selectedPathPointIsJunction?: boolean;
  selectedPathPointCanBeRemoved?: boolean;
  selDecorAsset?: CampusDecorAsset | undefined;
  /** All decorative assets — used to detect reorderable multi-selections. */
  allDecorAssets: CampusDecorAsset[];
  selRoute: CampusRoute | undefined;
  selNavNode?: NavigationNode | undefined;
  selNavEdge?: NavigationEdge | undefined;
  /** B5 Phase 6.10: the selected outdoor nav edge is blocked by an obstacle. */
  navEdgeBlocked?: boolean;
  selEventOverlay?: CampusEventOverlay | undefined;
  allNavNodes?: NavigationNode[];
  allNavEdges?: NavigationEdge[];
  entranceLinkStatus?: EntranceIndoorLinkStatus;
  entranceDoorOptions?: DoorOption[];
  allBuildings: CampusBuilding[];
  layer: EditorLayer;
  // Multi-select props
  multiSelected: string[];
  multiSelectedBuildings: CampusBuilding[];
  selectedOutdoorCount: number;
  onBatchUpdateBuildings: (ids: string[], changes: Partial<CampusBuilding>) => void;
  onBatchDeleteBuildings: (ids: string[]) => void;
  onBatchUpdatePaths?: (ids: string[], changes: Partial<CampusPath>) => void;
  onBatchDeletePaths?: (ids: string[]) => void;
  onGroupPaths?: (ids: string[]) => void;
  onUngroupPaths?: (ids: string[]) => void;
  onAddPathNetworkToNavigation?: (ids: string[]) => void;
  /** B5 Phase 5.12 — true while editing one path inside its network (member
   *  edit mode): the panel shows the single-path controls + a Back-to-Network
   *  affordance instead of the network batch section. */
  pathMemberEditing?: boolean;
  onExitPathMemberEdit?: () => void;
  onClearMultiSelect: () => void;
  /** Layer-ordering action (B2): bring forward/backward, bring to front/back. */
  onLayerOrder?: (action: LayerOrderAction) => void;
  // Individual item callbacks
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onAddEntrance: (buildingId: string) => void;
  onSelectEntrance: (buildingId: string, entranceId: string) => void;
  onUpdateEntrance: (buildingId: string, entranceId: string, changes: Partial<CampusEntrance>) => void;
  onDeleteEntrance: (buildingId: string, entranceId: string) => void;
  onConnectEntranceToDoor?: (buildingId: string, entranceId: string, doorNodeId: string) => void;
  onConnectEntranceToWalkingNetwork?: (buildingId: string, entranceId: string) => void;
  onRemoveEntranceConnection?: (buildingId: string, entranceId: string) => void;
  onViewEntranceIndoorDoor?: (buildingId: string, floorId: string, doorId: string) => void;
  onUpdateMarker: (id: string, changes: Partial<CampusMarker>) => void;
  onUpdatePath?: (id: string, changes: Partial<CampusPath>) => void;
  /** Select a physical Pathway from generated navigation provenance. */
  onSelectPath?: (id: string) => void;
  onAddPathBend?: (id: string) => void;
  onRemoveSelectedPathPoint?: () => void;
  onDisconnectSelectedPathPoint?: () => void;
  onAddWaypointAtSelectedPathPoint?: () => void;
  onAddPathToNavigation?: (id: string) => void;
  /** Conservative warning for old conversions that have no persisted provenance. */
  pathNavigationLegacy?: boolean;
  onDeletePath?: (id: string) => void;
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
  onAddNavEdgeBend?: (id: string) => void;
  onRemoveNavEdgeBend?: (id: string) => void;
  /** B5 Phase 6.8: remove ALL bends unless the direct A→B line crosses an obstacle. */
  onStraightenNavEdge?: (id: string) => void;
  /** B5 Phase 1.6 + final fix: bulk edge routing-flag update for graph
   *  multi-selection. The action is SEMANTIC — positive/negative routing
   *  classifications reopen the connections (closed=false). */
  onBatchUpdateNavEdges?: (ids: string[], action: BulkRoutingAction) => void;
  /** B5 Phase 1.6: delete a set of nodes+edges as one history action. */
  onDeleteNavSelection?: (nodeIds: string[], edgeIds: string[]) => void;
  onClose: () => void;
}

const inputCls = "w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
const labelCls = "block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground";

type PathNavigationState = "unused" | "used" | "legacy";

/**
 * Legacy detection is intentionally conservative: it is only a status hint and
 * never claims ownership of nearby manual navigation objects.
 */
// ── B5 Phase 1.6: human-readable waypoint types (custom selector options) ──

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
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl border border-border bg-muted/30 w-[140px] shrink-0">
      <button
        type="button"
        onClick={onYes}
        aria-pressed={value}
        className={cn(
          "h-10 rounded-lg text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          value ? "bg-card text-primary shadow-sm border border-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
        )}
      >{yesLabel}</button>
      <button
        type="button"
        onClick={onNo}
        aria-pressed={!value}
        className={cn(
          "h-10 rounded-lg text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
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
        className="w-full min-h-8 px-3 py-1.5 rounded-lg border border-border bg-input-background text-foreground text-[11px] font-semibold flex items-center justify-between gap-2 hover:border-primary/40 transition-colors"
      >
        {/* B5 Final: the placeholder + selected reason BOTH wrap fully (no
            truncate) so emergency/accessibility reasons are never cut off. */}
        <span className="min-w-0 flex flex-col items-start leading-snug">
          <span className="text-[9px] text-muted-foreground">{placeholder}</span>
          <span className={cn("min-w-0", current ? "text-foreground" : "text-muted-foreground")}>
            {current?.label ?? "Select…"}
          </span>
        </span>
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

/** Advanced Routing collapsible for nav edge properties — collapsed by default. */
function NavEdgeAdvancedRouting({ edge, onUpdateEdge }: {
  edge: NavigationEdge;
  onUpdateEdge?: (id: string, changes: Partial<NavigationEdge>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-3 mt-3 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Accessibility className="h-3 w-3" /> Advanced Routing
        </span>
        <span className={cn("text-[8px] transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div className="space-y-4 mt-2 pr-1">
          {/* Accessible */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> Accessible</span>
              <BoolSegmented
                value={edge.accessible}
                onYes={() => onUpdateEdge?.(edge.id, { accessible: true, inaccessibleReason: undefined })}
                onNo={() => onUpdateEdge?.(edge.id, { accessible: false, inaccessibleReason: edge.inaccessibleReason ?? "other" })}
                label="Accessible"
              />
            </div>
            {edge.accessible === false && (
              <ReasonMenu
                value={edge.inaccessibleReason ?? "other"}
                options={INACCESSIBLE_REASONS}
                onChange={(r) => onUpdateEdge?.(edge.id, { inaccessibleReason: r as NavigationEdge["inaccessibleReason"] })}
                placeholder="Why is this not accessible?"
              />
            )}
          </div>
          {/* Emergency Safe */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" /> Emergency Safe</span>
              <BoolSegmented
                value={edge.emergencySafe !== false}
                onYes={() => onUpdateEdge?.(edge.id, { emergencySafe: true, emergencyReason: undefined })}
                onNo={() => onUpdateEdge?.(edge.id, { emergencySafe: false, emergencyReason: edge.emergencyReason ?? "hazard" })}
                label="Emergency Safe"
              />
            </div>
            {edge.emergencySafe === false && (
              <ReasonMenu
                value={edge.emergencyReason ?? "hazard"}
                options={EMERGENCY_REASONS}
                onChange={(r) => onUpdateEdge?.(edge.id, { emergencyReason: r as NavigationEdge["emergencyReason"] })}
                placeholder="Why not emergency-safe?"
              />
            )}
          </div>
          {/* Closed / Open */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" /> Availability</span>
              <BoolSegmented
                value={edge.closed !== true}
                onYes={() => onUpdateEdge?.(edge.id, { closed: false })}
                onNo={() => onUpdateEdge?.(edge.id, { closed: true })}
                label="Availability"
                yesLabel="Open"
                noLabel="Closed"
              />
            </div>
            <p className="px-1 text-[9px] text-muted-foreground">Closed paths are temporarily excluded from routing.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Advanced Routing collapsible for nav node properties — collapsed by default. */
function NavNodeAdvancedRouting({ node, buildingName, onUpdateNode, allNavEdges, allPaths, onSelectPath, labelCls, inputCls }: {
  node: NavigationNode;
  buildingName?: string;
  onUpdateNode?: (id: string, changes: Partial<NavigationNode>) => void;
  allNavEdges?: NavigationEdge[];
  allPaths?: CampusPath[];
  onSelectPath?: (id: string) => void;
  labelCls: string;
  inputCls: string;
}) {
  const [open, setOpen] = useState(false);
  const pathwayGenerated = Boolean(node.generatedFromPathVertices?.length);
  return (
    <div className="pt-3 mt-3 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="h-3 w-3" /> Advanced Routing
        </span>
        <span className={cn("text-[8px] transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div className="space-y-3 mt-2 pr-1">
          {pathwayGenerated && (
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-2.5 py-2 text-[10px] text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-300">
              This Walking Point follows its physical Pathway. Edit the Pathway vertex instead.
              {onSelectPath && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...new Set((node.generatedFromPathVertices ?? []).map((ref) => ref.pathId))].map((pathId) => (
                    <button
                      key={pathId}
                      type="button"
                      onClick={() => onSelectPath(pathId)}
                      className="rounded-md border border-emerald-300/70 px-2 py-1 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100/70 dark:border-emerald-700/60 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                    >
                      {allPaths?.find((path) => path.id === pathId)?.name ?? "Select physical Pathway"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Type badge — read-only for special/existing nodes */}
          {node.entranceId ? (
            <div className="w-full h-8 px-2.5 rounded-lg border border-blue-200 dark:border-blue-700/30 bg-blue-50 dark:bg-blue-900/10 text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <DoorOpen className="h-3 w-3" />
              Building Entrance
              <span className="ml-auto text-[9px] font-medium text-blue-500/60">Linked</span>
            </div>
          ) : node.type === "destination" ? (
            <div className="w-full h-8 px-2.5 rounded-lg border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              Destination
            </div>
          ) : node.type === "assembly" ? (
            <div className="w-full h-8 px-2.5 rounded-lg border border-red-200 dark:border-red-700/30 bg-red-50 dark:bg-red-900/10 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
              Assembly Area
            </div>
          ) : node.type === "safe_area" ? (
            <div className="w-full h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-700/30 bg-emerald-50 dark:bg-emerald-900/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              Safe Area
            </div>
          ) : node.type === "emergency_exit" ? (
            <div className="w-full h-8 px-2.5 rounded-lg border border-orange-200 dark:border-orange-700/30 bg-orange-50 dark:bg-orange-900/10 text-[10px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
              Emergency Exit
            </div>
          ) : null}
          {/* Accessible */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-semibold text-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> Accessible</span>
              <BoolSegmented
                value={node.accessible}
                onYes={() => onUpdateNode?.(node.id, { accessible: true, inaccessibleReason: undefined })}
                onNo={() => onUpdateNode?.(node.id, { accessible: false, inaccessibleReason: node.inaccessibleReason ?? "other" })}
                label="Accessible"
              />
            </div>
            {node.accessible === false && (
              <ReasonMenu
                value={node.inaccessibleReason ?? "other"}
                options={INACCESSIBLE_REASONS}
                onChange={(r) => onUpdateNode?.(node.id, { inaccessibleReason: r as NavigationNode["inaccessibleReason"] })}
                placeholder="Why is this not accessible?"
              />
            )}
          </div>
          {node.type === "entrance" && node.buildingId && (
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground">
              Linked to building entrance — outdoor routes enter the building through here.
            </div>
          )}
          {/* Generated vertices expose no independent coordinates: the physical Pathway owns them. */}
          {!pathwayGenerated && <div>
            <label className={labelCls}>Position</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>X</label>
                <input type="number" value={node.x} disabled={!!node.entranceId || pathwayGenerated}
                  onChange={(e) => onUpdateNode?.(node.id, { x: parseInt(e.target.value) || 0 })}
                  className={`${inputCls} font-mono ${node.entranceId || pathwayGenerated ? "opacity-60 cursor-not-allowed" : ""}`} />
              </div>
              <div>
                <label className={labelCls}>Y</label>
                <input type="number" value={node.y} disabled={!!node.entranceId || pathwayGenerated}
                  onChange={(e) => onUpdateNode?.(node.id, { y: parseInt(e.target.value) || 0 })}
                  className={`${inputCls} font-mono ${node.entranceId || pathwayGenerated ? "opacity-60 cursor-not-allowed" : ""}`} />
              </div>
            </div>
            {node.entranceId && (
              <p className="px-1 pt-1.5 text-[9px] text-muted-foreground">Derived from the linked building entrance — move the building or entrance instead.</p>
            )}
          </div>}
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
  selected, selBldg, selEntrance, selEntranceParent, selMkr, selPath, selRoute, allPaths = [],
  issueItems = [],
  selectedPathPoint, selectedPathPointIsJunction, selectedPathPointCanBeRemoved,
  selDecorAsset, allDecorAssets,
  selNavNode, selNavEdge, navEdgeBlocked, selEventOverlay, allNavNodes, allNavEdges, entranceLinkStatus, entranceDoorOptions,
  allBuildings,
  layer,
  multiSelected, multiSelectedBuildings, selectedOutdoorCount,
  onBatchUpdateBuildings, onBatchDeleteBuildings, onBatchUpdatePaths, onBatchDeletePaths, onGroupPaths, onUngroupPaths, onAddPathNetworkToNavigation, pathMemberEditing = false, onExitPathMemberEdit, onClearMultiSelect, onLayerOrder,
  onUpdateBuilding, onAddEntrance, onSelectEntrance, onUpdateEntrance, onDeleteEntrance,
  onConnectEntranceToDoor, onConnectEntranceToWalkingNetwork, onRemoveEntranceConnection, onViewEntranceIndoorDoor,
  onUpdateMarker, onUpdatePath, onSelectPath, onAddPathBend, onRemoveSelectedPathPoint,
  onDisconnectSelectedPathPoint, onAddWaypointAtSelectedPathPoint, onAddPathToNavigation, pathNavigationLegacy,
  onDeletePath, onUpdateRoute,
  onUpdateEventOverlay,
  onDeleteBuilding, onDeleteMarker, onDeleteRoute,
  onDeleteEventOverlay,
  onUpdateDecorAsset, onDeleteDecorAsset, onDuplicateDecorAsset,
  onUpdateNavNode, onDeleteNavNode, onUpdateNavEdge, onDeleteNavEdge, onAddNavEdgeBend, onRemoveNavEdgeBend,
  onStraightenNavEdge,
  onBatchUpdateNavEdges, onDeleteNavSelection,
  onClose,
}: PropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "path" | "route" | "batch" | "decorAsset" | "floor"; id: string; label: string; buildingId?: string; itemCount?: number } | null>(null);
  const [entranceDoorPickerOpen, setEntranceDoorPickerOpen] = useState(false);
  const [entranceDoorSearch, setEntranceDoorSearch] = useState("");
  const visible = !!selected || multiSelected.length > 0;
  const selectedPathPointForPath = selPath && selectedPathPoint?.pathId === selPath.id ? selectedPathPoint : null;
  const selectedPathPointCoord = selectedPathPointForPath ? selPath?.points[selectedPathPointForPath.pointIndex] : undefined;
  const selectedPathPointHasWaypoint = !!selectedPathPointCoord && (allNavNodes ?? []).some((node) =>
    (node.type === "outdoor" || node.type === "entrance") &&
    Math.hypot(node.x - selectedPathPointCoord.x, node.y - selectedPathPointCoord.y) <= 1
  );
  const selectedPathPointIsEndpoint = !!selPath && !!selectedPathPointForPath
    && (selectedPathPointForPath.pointIndex === 0 || selectedPathPointForPath.pointIndex === selPath.points.length - 1);
  const selectedPathPointContextLabel = selectedPathPointForPath
    ? selectedPathPointIsJunction
      ? "Path Junction"
      : selectedPathPointIsEndpoint
        ? "Selected Endpoint"
        : "Selected Bend"
    : "Path Editing";

  // B5 Phase 6.8: outdoor Straighten is disabled when the direct A→B line
  // would cross a building footprint or a solid asset (never route through one).
  const straightenBlocked = useMemo(() => {
    if (!selNavEdge) return false;
    const a = allNavNodes?.find((n) => n.id === selNavEdge.startNodeId);
    const b = allNavNodes?.find((n) => n.id === selNavEdge.endNodeId);
    if (!a || !b) return false;
    return polylineCrossesObstacle([{ x: a.x, y: a.y }, { x: b.x, y: b.y }], allBuildings, allDecorAssets);
  }, [selNavEdge, allNavNodes, allBuildings, allDecorAssets]);

  // Reset to basic tab when selection changes
  useEffect(() => { setTab("basic"); setEntranceDoorPickerOpen(false); setEntranceDoorSearch(""); }, [selected]);

  // ── Multi-select mode ──
  const multiSelectedDecorAssets = allDecorAssets.filter((d) => multiSelected.includes(d.id));
  const multiSelectedPaths = allPaths.filter((path) => multiSelected.includes(path.id));
  // B5 Phase 5.12 — while editing ONE path inside its network, the panel shows
  // the single-path (member) controls instead of the network batch section.
  const isMultiMode = selectedOutdoorCount > 0 && !pathMemberEditing;
  const isBuildingOnlyMultiMode = isMultiMode && selectedOutdoorCount === multiSelectedBuildings.length;
  const isPathOnlyMultiMode = isMultiMode && selectedOutdoorCount === multiSelectedPaths.length && multiSelectedPaths.length > 1;

  const handleBatchColor = useCallback((color: string) => {
    onBatchUpdateBuildings(multiSelected, { color });
  }, [multiSelected, onBatchUpdateBuildings]);

  // Check if all selected are visible / locked for batch toggle clarity
  const allVisible = multiSelectedBuildings.length > 0 && multiSelectedBuildings.every((b) => b.visible !== false);
  const allLocked = multiSelectedBuildings.length > 0 && multiSelectedBuildings.every((b) => b.locked === true);
  const allPathsVisible = multiSelectedPaths.length > 0 && multiSelectedPaths.every((path) => path.visible !== false);
  const allPathsLocked = multiSelectedPaths.length > 0 && multiSelectedPaths.every((path) => path.locked === true);
  const selectedPathNetworkIds = Array.from(new Set(multiSelectedPaths.map((path) => path.pathNetworkId).filter(Boolean)));
  const selectedPathsAreOneExplicitNetwork = multiSelectedPaths.length > 1
    && selectedPathNetworkIds.length === 1
    && multiSelectedPaths.every((path) => path.pathNetworkId === selectedPathNetworkIds[0]);
  const selectedPathNavigationStatus = pathNetworkNavigationStatus(multiSelectedPaths, allNavNodes, allNavEdges);
  const generatedNavEdgePaths = selNavEdge?.generatedFromPathIds?.length
    ? allPaths.filter((path) => selNavEdge.generatedFromPathIds?.includes(path.id))
    : [];
  const generatedNavEdge = isPathwayGeneratedEdge(selNavEdge);
  // B5 — Width draft state: local string while typing, commit on Enter/blur only.
  const [batchWidthDraft, setBatchWidthDraft] = useState<string>(String(multiSelectedPaths[0]?.width ?? 12));
  const [singleWidthDraft, setSingleWidthDraft] = useState<string>(String(selPath?.width ?? 12));
  useEffect(() => { if (selPath) setSingleWidthDraft(String(selPath.width)); }, [selPath?.id, selPath?.width]);
  const lastCommittedPathBatchWidthRef = useRef<string | null>(null);
  const commitPathBatchWidth = useCallback((rawValue: string) => {
    const trimmed = rawValue.trim();
    const parsed = parseInt(trimmed, 10);
    const width = Number.isFinite(parsed) ? Math.max(3, Math.min(32, parsed)) : (multiSelectedPaths[0]?.width ?? 12);
    const ids = multiSelectedPaths.map((path) => path.id);
    const commitKey = `${ids.join("|")}:${width}`;
    if (lastCommittedPathBatchWidthRef.current === commitKey) {
      setBatchWidthDraft(String(width));
      return;
    }
    lastCommittedPathBatchWidthRef.current = commitKey;
    onBatchUpdatePaths?.(ids, { width });
    setBatchWidthDraft(String(width));
  }, [multiSelectedPaths, onBatchUpdatePaths]);

  // ── B5 Phase 1.6: navigation multi-selection ──
  // A marquee/shift-selection over graph elements selects nav nodes + edges.
  // This is distinct from outdoor multi-mode (buildings/decor): show a compact
  // graph summary + routing bulk flags + delete instead of layer/align tools.
  const multiNavNodeIds = multiSelected.filter((id) => allNavNodes?.some((n) => n.id === id) ?? false);
  const multiNavEdgeIds = multiSelected.filter((id) => allNavEdges?.some((e) => e.id === id) ?? false);
  const independentlyDeletableNavNodeIds = multiNavNodeIds.filter((id) =>
    navigationNodePermissions(allNavNodes?.find((node) => node.id === id)).independentlyDeletable
  );
  const independentlyDeletableNavEdgeIds = multiNavEdgeIds.filter((id) =>
    navigationEdgePermissions(allNavEdges?.find((edge) => edge.id === id)).independentlyDeletable
  );
  const isNavMultiMode = layer === "navigation" && multiSelected.length > 0 && selectedOutdoorCount === 0
    && (multiNavNodeIds.length > 0 || multiNavEdgeIds.length > 0)
    && multiNavNodeIds.length + multiNavEdgeIds.length === multiSelected.length;

  // B5 final bulk-routing fix: derive the CURRENT bulk state of the selected
  // edges so the Bulk Routing buttons show active/mixed feedback and refresh
  // immediately after any action (the panel re-renders from the live campus).
  const bulkSelEdges = (allNavEdges ?? []).filter((e) => multiNavEdgeIds.includes(e.id));
  const bulkAllClosed = bulkSelEdges.length > 0 && bulkSelEdges.every((e) => e.closed === true);
  const bulkAllOpen = bulkSelEdges.length > 0 && bulkSelEdges.every((e) => e.closed !== true);
  const bulkClosedMixed = bulkSelEdges.length > 0 && !bulkAllClosed && !bulkAllOpen;
  const bulkAllAccessible = bulkSelEdges.length > 0 && bulkSelEdges.every((e) => e.accessible === true);
  const bulkAllNotAccessible = bulkSelEdges.length > 0 && bulkSelEdges.every((e) => e.accessible === false);
  // emergencySafe is optional and defaults to safe (matches the single-edge
  // inspector where undefined === safe).
  const bulkAllEmergencySafe = bulkSelEdges.length > 0 && bulkSelEdges.every((e) => e.emergencySafe !== false);
  const entranceDoorQuery = entranceDoorSearch.trim().toLowerCase();
  const filteredEntranceDoorOptions = (entranceDoorOptions ?? []).filter((option) =>
    !entranceDoorQuery || `${option.doorLabel} ${option.floorLabel}`.toLowerCase().includes(entranceDoorQuery)
  );
  const groupedEntranceDoorOptions = filteredEntranceDoorOptions.reduce<Record<string, DoorOption[]>>((groups, option) => {
    const key = option.floorLabel;
    groups[key] = [...(groups[key] ?? []), option];
    return groups;
  }, {});
  const entranceHasEligibleDoor = (entranceDoorOptions ?? []).some((option) => option.eligible);
  const selectedEntranceName = selEntrance && selEntranceParent
    ? entranceDisplayName(selEntrance, (selEntranceParent.entrances ?? []).findIndex((en) => en.id === selEntrance.id))
    : undefined;
  const entranceDoorDetail = (option: DoorOption) => option.usedByEntrance
    ? `Already connected to ${option.usedByEntrance.name}`
    : !option.linked ? "Add this Door to navigation first"
    : !option.entryFloor ? "Not on the building entry floor"
    : option.hidden ? "Linked Door is hidden"
    : "Navigation linked";
  const selectedEntranceNavNode = selEntrance && selEntranceParent
    ? (allNavNodes ?? []).find((node) => node.entranceId === selEntrance.id && node.buildingId === selEntranceParent.id)
    : undefined;
  const selectedEntranceIsConnected = !!selectedEntranceNavNode
    && (allNavEdges ?? []).some((edge) =>
      edge.type !== "entrance_transition" &&
      (edge.startNodeId === selectedEntranceNavNode.id || edge.endNodeId === selectedEntranceNavNode.id)
    );
  const pathNavigationState: PathNavigationState = pathwayHasOwnedNavigation(selPath)
    ? "used"
    : (pathNavigationLegacy || pathwayHasLegacyNavigationChain(selPath, allNavNodes, allNavEdges))
      ? "legacy"
      : "unused";

  return (
    <>
    <div
      className="absolute top-0 right-0 bottom-0 z-30 flex flex-col border-l border-border shadow-2xl overflow-hidden"
      style={{
        width: 248,
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
            : isPathOnlyMultiMode && selectedPathsAreOneExplicitNetwork
              ? `Path Network (${multiSelectedPaths.length})`
            : isMultiMode
              ? `Multi-Select (${selectedOutdoorCount})`
              : selBldg ? "Building" : selEntrance ? "Entrance" : selMkr ? "Marker" : selPath ? (pathMemberEditing ? "Edit Pathway" : "Pathway") : selDecorAsset ? "Decorative Asset" : selRoute ? "Route" : selected?.type === "navNode" ? "Walking Point" : selected?.type === "navEdge" ? "Walking Path" : "Properties"}
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-show-on-hover scroll-smooth p-4 space-y-4 min-w-0">
        {/* ── B7 Phase 2: contextual issue guidance for the selected object ── */}
        <ObjectIssueSection items={issueItems} />

        {/* ── NAVIGATION MULTI-SELECT (B5 Phase 1.6) ── */}
        {isNavMultiMode && (
          <div data-testid="nav-multi-props">
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Graph Selection</span>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Walking Points</span>
                <span className="font-bold">{multiNavNodeIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Paths</span>
                <span className="font-bold">{multiNavEdgeIds.length}</span>
              </div>
              <p className="text-[9px] pt-1 border-t border-border">Drag a walking point to move the selected nodes together. Paths follow their walking points.</p>
            </div>
            {multiNavEdgeIds.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border space-y-2">
                <div className="flex items-center gap-1.5">
                  <Accessibility className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Bulk Routing</span>
                </div>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, "mark_accessible")}
                  className={cn(
                    "w-full h-8 rounded-xl border text-[10px] font-bold transition-colors",
                    bulkAllAccessible
                      ? "border-green-400 dark:border-green-500/60 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      : "border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
                  )}
                >
                  Mark accessible
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, "mark_emergency_safe")}
                  className={cn(
                    "w-full h-8 rounded-xl border text-[10px] font-bold transition-colors",
                    bulkAllEmergencySafe
                      ? "border-emerald-400 dark:border-emerald-500/60 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                      : "border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
                  )}
                >
                  Mark emergency safe
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, "mark_not_accessible")}
                  className={cn(
                    "w-full h-8 rounded-xl border text-[10px] font-bold transition-colors",
                    bulkAllNotAccessible
                      ? "border-amber-400 dark:border-amber-500/60 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                      : "border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                  )}
                >
                  Mark not accessible
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, "mark_open")}
                  className={cn(
                    "w-full h-8 rounded-xl border text-[10px] font-bold transition-colors",
                    bulkAllOpen
                      ? "border-sky-400 dark:border-sky-500/60 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                      : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  Mark open
                </button>
                <button
                  onClick={() => onBatchUpdateNavEdges?.(multiNavEdgeIds, "mark_closed")}
                  className={cn(
                    "w-full h-8 rounded-xl border text-[10px] font-bold transition-colors",
                    bulkAllClosed
                      ? "border-red-400 dark:border-red-500/60 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                      : "border-red-200 dark:border-red-700/30 bg-red-50 dark:bg-red-900/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                  )}
                >
                  Mark closed
                </button>
                {bulkClosedMixed && (
                  <p className="px-1 text-[9px] text-muted-foreground">Selection has mixed open/closed states.</p>
                )}
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-border">
              {independentlyDeletableNavNodeIds.length + independentlyDeletableNavEdgeIds.length > 0 ? <button
                onClick={() => onDeleteNavSelection?.(independentlyDeletableNavNodeIds, independentlyDeletableNavEdgeIds)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors"
              >
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Selected</span>
              </button> : (
                <p className="text-[9px] text-muted-foreground">Generated navigation is removed only with its owning physical Pathway.</p>
              )}
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
              {multiSelectedPaths.map((path) => (
                <div key={path.id} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/50 bg-muted/20">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-400" />
                  <span className="text-[10px] font-semibold truncate text-foreground">{path.name || "Pathway"}</span>
                </div>
              ))}
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

            {isPathOnlyMultiMode && (
              <div className="border-t border-border pt-3 space-y-3" data-testid="path-multi-properties-panel">
                <div className="flex items-center gap-1.5">
                  <Route className="h-3 w-3 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">{selectedPathsAreOneExplicitNetwork ? `Path Network (${multiSelectedPaths.length})` : "Pathway Batch Actions"}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {selectedPathsAreOneExplicitNetwork ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onUngroupPaths?.(multiSelectedPaths.map((path) => path.id))}
                        className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Copy className="h-3 w-3" />
                        Ungroup Paths
                      </button>
                      <p className="px-1 text-[9px] leading-snug text-muted-foreground">Double-click a Pathway to edit it individually without ungrouping.</p>
                      <div className="rounded-xl border border-border bg-muted/20 px-2.5 py-2 space-y-2" data-testid="path-network-navigation-status">
                        <div className="flex items-center gap-1.5">
                          <NavigationIcon className="h-3 w-3 text-primary" />
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation</span>
                        </div>
                        <p className={cn(
                          "text-[10px] font-bold",
                          selectedPathNavigationStatus.state === "complete" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                        )}>
                          {selectedPathNavigationStatus.enabled} of {selectedPathNavigationStatus.total} Pathways enabled{selectedPathNavigationStatus.state === "complete" ? " ✓" : ""}
                        </p>
                        {selectedPathNavigationStatus.state === "complete" ? (
                          <p className="text-[9px] text-muted-foreground">Network used for navigation</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAddPathNetworkToNavigation?.(multiSelectedPaths.map((path) => path.id))}
                            className="w-full h-9 rounded-xl border border-primary/30 bg-primary/5 text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <NavigationIcon className="h-3 w-3" />
                            {selectedPathNavigationStatus.state === "partial" ? "Add Missing Pathways to Navigation" : "Enable Pathways for Navigation"}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onGroupPaths?.(multiSelectedPaths.map((path) => path.id))}
                      className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Copy className="h-3 w-3" />
                      Group Paths
                    </button>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Path Type</label>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl border border-border bg-muted/30">
                    {[["walkway", "Walkway"], ["road", "Road / Driveway"], ["accessible", "Accessible Path"]].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onBatchUpdatePaths?.(multiSelectedPaths.map((path) => path.id), { type: value })}
                        className="h-8 rounded-lg text-[10px] font-bold text-muted-foreground hover:bg-card hover:text-primary transition-all"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="path-batch-width" className={labelCls}>Width</label>
                  <input
                    id="path-batch-width"
                    type="number"
                    min={3}
                    max={32}
                    value={batchWidthDraft}
                    onChange={(e) => setBatchWidthDraft(e.target.value)}
                    onFocus={(e) => setBatchWidthDraft(String(multiSelectedPaths[0]?.width ?? 12))}
                    onBlur={(e) => commitPathBatchWidth(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitPathBatchWidth(e.currentTarget.value);
                      } else if (e.key === "Escape") {
                        setBatchWidthDraft(String(multiSelectedPaths[0]?.width ?? 12));
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={inputCls}
                  />
                </div>
                {selectedPathsAreOneExplicitNetwork && (() => {
                  const roads = multiSelectedPaths.filter((p) => p.type === "road" || p.type === "driveway");
                  if (roads.length < 2) return null;
                  const widths = roads.map((p) => Math.max(3, p.width ?? 18));
                  const maxW = Math.max(...widths);
                  const minW = Math.min(...widths);
                  if (maxW - minW < 6) return null;
                  return (
                    <p className="text-[9px] leading-snug text-muted-foreground italic px-1">
                      Tip: Connected roads look smoothest when their widths are similar.
                    </p>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onBatchUpdatePaths?.(multiSelectedPaths.map((path) => path.id), { visible: !allPathsVisible })}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      allPathsVisible ? "border-primary/30 bg-primary/8 text-primary" : "border-border text-muted-foreground"
                    )}
                  >
                    {allPathsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {allPathsVisible ? "Hide All" : "Show All"}
                  </button>
                  <button
                    onClick={() => onBatchUpdatePaths?.(multiSelectedPaths.map((path) => path.id), { locked: !allPathsLocked })}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      allPathsLocked
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {allPathsLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {allPathsLocked ? "Unlock All" : "Lock All"}
                  </button>
                </div>
                <p className="text-[9px] leading-snug text-muted-foreground">
                  Corner handles scale selected pathway geometry only; authored widths stay unchanged.
                </p>
              </div>
            )}

            {/* Batch Delete */}
            <div className="pt-3 border-t border-border">
              <button
                onClick={() => isPathOnlyMultiMode
                  ? onBatchDeletePaths?.(multiSelectedPaths.map((path) => path.id))
                  : setDeleteConfirm({
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
                        // B5 Phase 3.1: next number = max existing + 1 (NEVER
                        // array length + 1) so a non-contiguous building such as
                        // [1, 3] cannot produce a duplicate floor number that
                        // the DB unique constraint would reject on save.
                        const nextNum = nextFloorNumberForBuilding(selBldg.floors);
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
                            setDeleteConfirm({
                              type: "floor",
                              id: floor.id,
                              label: floor.label,
                              buildingId: selBldg.id,
                              itemCount: countFloorAuthoredItems(floor),
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
                {/* Navigation summary */}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Route className="h-3 w-3 text-blue-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation</span>
                  </div>
                  <div className="px-2.5 py-2 rounded-xl border border-border bg-muted/20 text-[10px] text-muted-foreground space-y-1.5">
                    <div className="flex justify-between">
                      <span>Primary Entrance</span>
                      <span className="font-bold text-foreground truncate ml-2">
                        {selBldg.entrances?.find(e => e.isPrimary)?.name ?? selBldg.entrances?.[0]?.name ?? 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Outdoor Network</span>
                      <span className={cn("font-bold", selBldg.entranceNodeId ? "text-green-600" : "text-amber-600")}>
                        {selBldg.entranceNodeId ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Indoor Connection</span>
                      <span className={cn("font-bold", (selBldg.entrances?.length ?? 0) > 0 ? "text-green-600" : "text-amber-600")}>
                        {(selBldg.entrances?.length ?? 0) > 0 ? `${selBldg.entrances.length} entrance(s)` : 'None'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1.5 px-1">Navigation is configured through building entrances. Select an entrance to manage its connections.</p>
                </div>
                {/* Accessibility summary */}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Accessibility className="h-3 w-3 text-blue-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Accessibility</span>
                  </div>
                  <div className="px-2.5 py-2 rounded-xl border border-border bg-muted/20 text-[10px] text-muted-foreground space-y-1.5">
                    <div className="flex justify-between">
                      <span>Accessible entrance</span>
                      <span className={cn("font-bold", selBldg.accessibility?.accessibleEntrance ? "text-green-600" : "text-amber-600")}>
                        {selBldg.accessibility?.accessibleEntrance ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Elevator</span>
                      <span className={cn("font-bold", selBldg.accessibility?.hasElevator ? "text-green-600" : "text-muted-foreground")}>
                        {selBldg.accessibility?.hasElevator ? 'Available' : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wheelchair ramp</span>
                      <span className={cn("font-bold", selBldg.accessibility?.hasRamp ? "text-green-600" : "text-muted-foreground")}>
                        {selBldg.accessibility?.hasRamp ? 'Available' : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                      <span className="font-semibold">Overall</span>
                      <span className={cn("font-bold",
                        selBldg.accessibility?.wheelchairAccessible ? "text-green-600" : "text-amber-600")}>
                        {selBldg.accessibility?.wheelchairAccessible ? 'Accessible' : 'Limited'}
                      </span>
                    </div>
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
            <div className="pt-3 border-t border-border space-y-2" data-testid="entrance-indoor-navigation">
              <div className="flex items-center gap-1.5">
                <NavigationIcon className="h-3 w-3 text-primary" />
                <span className={labelCls}>Navigation</span>
              </div>
              {/* Outdoor Network Status */}
              <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-muted-foreground">Outdoor Network</span>
                  <span className={cn("font-bold", selectedEntranceIsConnected ? "text-green-600" : "text-amber-600")}>
                    {selectedEntranceIsConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                {!selectedEntranceIsConnected && (
                  <>
                    <p className="text-[9px] text-muted-foreground mb-2">Connect this entrance to the outdoor walking network.</p>
                    <button
                      type="button"
                      onClick={() => onConnectEntranceToWalkingNetwork?.(selEntranceParent.id, selEntrance.id)}
                      className="w-full h-8 rounded-lg border border-primary/30 bg-primary/5 text-[10px] font-extrabold text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <NavigationIcon className="h-3 w-3" /> Connect to Walking Network
                    </button>
                  </>
                )}
              </div>
              {/* Indoor Connection */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Indoor Connection</span>
              </div>
              {entranceLinkStatus?.state === "linked" ? (
                <div className={cn(
                  "rounded-xl border px-3 py-3 space-y-3",
                  entranceLinkStatus.warning
                    ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/10"
                    : "border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-900/10"
                )}>
                  <div className={cn(
                    "flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide",
                    entranceLinkStatus.warning ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {entranceLinkStatus.warning ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {entranceLinkStatus.warning ? "Needs review" : "Connected indoors"}
                  </div>
                  <p className={cn("text-[10px] leading-snug", entranceLinkStatus.warning ? "text-amber-800 dark:text-amber-300" : "text-emerald-700/80 dark:text-emerald-300/80")}>
                    {entranceLinkStatus.floorLabel} - {entranceLinkStatus.doorLabel}
                  </p>
                  {entranceLinkStatus.warning && (
                    <p className="text-[9px] leading-snug font-semibold text-amber-800/80 dark:text-amber-300/80">
                      {entranceLinkStatus.warning}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => entranceLinkStatus.floorId && entranceLinkStatus.doorId && onViewEntranceIndoorDoor?.(selEntranceParent.id, entranceLinkStatus.floorId, entranceLinkStatus.doorId)}
                      className="h-8 rounded-lg border border-emerald-300/70 bg-background/60 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition-all flex items-center justify-center gap-1.5"
                    >
                      <DoorOpen className="h-3 w-3" /> View Indoor Door
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntranceDoorPickerOpen(true)}
                      className="h-8 rounded-lg border border-border bg-background/60 text-[10px] font-bold text-foreground hover:bg-muted transition-all flex items-center justify-center gap-1.5"
                    >
                      <ArrowRightLeft className="h-3 w-3" /> Change
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveEntranceConnection?.(selEntranceParent.id, selEntrance.id)}
                      className="h-8 rounded-lg border border-destructive/30 bg-background/60 text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-all flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="h-3 w-3" /> Remove Connection
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "rounded-xl border px-3 py-3 space-y-3",
                  entranceLinkStatus?.state === "missing"
                    ? "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300"
                    : "border-border bg-muted/20"
                )}>
                  <p className="text-[10px] leading-snug font-semibold">
                    {entranceLinkStatus?.state === "missing" ? "Indoor connection missing" : "Not connected indoors"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEntranceDoorPickerOpen(true)}
                    className="w-full h-9 rounded-xl border border-primary/30 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 transition-all flex items-center justify-center gap-1.5"
                  >
                    <DoorOpen className="h-3.5 w-3.5" /> Connect to Indoor Door
                  </button>
                </div>
              )}
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
        {selPath && !isMultiMode && (
          <>
            {pathMemberEditing && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-primary">Pathway · Part of Path Network</span>
                </div>
                <p className="text-[9px] text-muted-foreground">Editing this Pathway individually.</p>
                <button
                  type="button"
                  onClick={() => onExitPathMemberEdit?.()}
                  className="w-full h-7 rounded-lg border border-primary/30 text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to Network
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Pathway Info</span>
            </div>
            <div>
              <label htmlFor="path-name" className={labelCls}>Name</label>
              <input id="path-name" value={selPath.name ?? ""} onChange={(e) => onUpdatePath?.(selPath.id, { name: e.target.value })} className={inputCls} placeholder="Pathway name" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl border border-border bg-muted/30">
                {[["walkway", "Walkway"], ["road", "Road / Driveway"], ["accessible", "Accessible Path"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdatePath?.(selPath.id, { type: value })}
                    aria-pressed={selPath.type === value}
                    className={cn(
                      "h-8 rounded-lg text-[10px] font-bold transition-all",
                      selPath.type === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="path-width" className={labelCls}>Width</label>
                <input id="path-width" type="number" min={3} max={32} value={singleWidthDraft}
                  onChange={(e) => setSingleWidthDraft(e.target.value)}
                  onFocus={() => setSingleWidthDraft(String(selPath.width))}
                  onBlur={(e) => {
                    const trimmed = e.currentTarget.value.trim();
                    const parsed = parseInt(trimmed, 10);
                    const width = Number.isFinite(parsed) ? Math.max(3, Math.min(32, parsed)) : selPath.width;
                    onUpdatePath?.(selPath.id, { width });
                    setSingleWidthDraft(String(width));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = (e.target as HTMLInputElement).value.trim();
                      const parsed = parseInt(trimmed, 10);
                      const width = Number.isFinite(parsed) ? Math.max(3, Math.min(32, parsed)) : selPath.width;
                      onUpdatePath?.(selPath.id, { width });
                      setSingleWidthDraft(String(width));
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setSingleWidthDraft(String(selPath.width));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Points</label>
                <div className="h-10 px-3 rounded-xl border border-border bg-muted/30 text-xs font-mono flex items-center">{selPath.points.length}</div>
              </div>
            </div>
            <div className="space-y-2 pt-3 border-t border-border" data-testid="pathway-navigation-section">
              <div className="flex items-center gap-1.5">
                <NavigationIcon className="h-3 w-3 text-primary" />
                <span className={labelCls}>Navigation</span>
              </div>
              {pathNavigationState === "used" ? (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-2 dark:border-emerald-800/50 dark:bg-emerald-900/10">
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Used for navigation ✓
                  </div>
                  <p className="mt-1 text-[9px] leading-snug text-emerald-700/80 dark:text-emerald-300/80">
                    Walking network created from and following this pathway.
                  </p>
                </div>
              ) : pathNavigationState === "legacy" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold">
                    <AlertTriangle className="h-3.5 w-3.5" /> Legacy navigation needs reconnecting.
                  </div>
                  <p className="mt-1 text-[9px] leading-snug">
                    This pathway was converted before ownership tracking was available. Existing walking data is preserved; rebuild it explicitly before relying on automatic geometry updates.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-muted/20 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground">
                    Not used for navigation
                  </div>
                  <p className="text-[9px] leading-snug text-muted-foreground">Create the walking network along this physical pathway.</p>
                  <button
                    type="button"
                    onClick={() => onAddPathToNavigation?.(selPath.id)}
                    className="w-full h-9 rounded-xl border border-primary/30 bg-primary/5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <NavigationIcon className="h-3 w-3" /> Use for Navigation
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => onUpdatePath?.(selPath.id, { visible: selPath.visible === false })}
                className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
              >
                {selPath.visible === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {selPath.visible === false ? "Hidden" : "Visible"}
              </button>
              <button
                type="button"
                onClick={() => onUpdatePath?.(selPath.id, { locked: !selPath.locked })}
                className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
              >
                {selPath.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {selPath.locked ? "Locked" : "Unlocked"}
              </button>
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {selectedPathPointContextLabel}
                </span>
                {selectedPathPointForPath && (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {selectedPathPointIsJunction ? "Connected paths: 2+" : `Point ${selectedPathPointForPath.pointIndex + 1}`}
                  </span>
                )}
              </div>
              {!selectedPathPointForPath && (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => onAddPathBend?.(selPath.id)}
                  title="Use the inline segment midpoint controls, or this button to add a bend on the longest segment."
                  className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3 w-3" />
                  Add Bend
                </button>
              </div>
              )}
              {selectedPathPointForPath && !selectedPathPointIsJunction && !selectedPathPointIsEndpoint && (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={!selectedPathPointCanBeRemoved}
                  onClick={() => onRemoveSelectedPathPoint?.()}
                  className={cn(
                    "h-9 rounded-xl border border-border text-xs font-bold transition-colors flex items-center justify-center gap-1.5",
                    selectedPathPointCanBeRemoved ? "hover:bg-muted" : "opacity-45 cursor-not-allowed"
                  )}
                >
                  <Minus className="h-3 w-3" />
                  Remove Bend
                </button>
                <button
                  type="button"
                  onClick={() => onAddWaypointAtSelectedPathPoint?.()}
                  title="Creates or reuses a navigation walking point exactly at this pathway point."
                  className="h-9 rounded-xl border border-border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <MapPin className="h-3 w-3" />
                  {selectedPathPointHasWaypoint ? "View Walking Point" : "Add Walking Point Here"}
                </button>
              </div>
              )}
              {selectedPathPointForPath && selectedPathPointIsEndpoint && !selectedPathPointIsJunction && (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => onAddWaypointAtSelectedPathPoint?.()}
                  title="Creates or reuses a navigation walking point exactly at this pathway endpoint."
                  className="h-9 rounded-xl border border-border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <MapPin className="h-3 w-3" />
                  {selectedPathPointHasWaypoint ? "View Walking Point" : "Add Walking Point Here"}
                </button>
                <p className="text-[9px] leading-snug text-muted-foreground">Use the endpoint handle on the canvas to extend this path.</p>
              </div>
              )}
              {selectedPathPointForPath && selectedPathPointIsJunction && (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => onAddWaypointAtSelectedPathPoint?.()}
                  title="Creates or reuses a navigation walking point exactly at this shared junction."
                  className="h-9 rounded-xl border border-border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <MapPin className="h-3 w-3" />
                  {selectedPathPointHasWaypoint ? "View Walking Point" : "Add Walking Point Here"}
                </button>
                {selectedPathPointHasWaypoint && <p className="text-[9px] leading-snug text-emerald-600 font-semibold">Walking Point linked</p>}
                <button
                  type="button"
                  onClick={() => onDisconnectSelectedPathPoint?.()}
                  title="Separates the connected paths at this junction."
                  className="h-9 rounded-xl border border-border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Disconnect Junction
                </button>
              </div>
              )}
            </div>
            <div className="pt-3 border-t border-border">
              <button onClick={() => setDeleteConfirm({ type: "path", id: selPath.id, label: selPath.name ?? "Pathway" })} className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Pathway</span>
              </button>
            </div>
          </>
        )}

        {selDecorAsset && !isMultiMode && (
          (() => {
            const template = DECOR_ASSET_MAP[selDecorAsset.type];
            const rot = normalizeRotation(selDecorAsset.rotation ?? 0);
            const scale = clampDecorScale(selDecorAsset.scale ?? 1);
            const isGroundArea = selDecorAsset.type === "ground-area";
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
                {isGroundArea ? (
                  <div className="rounded-xl border border-border bg-muted/25 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
                    Legacy ground-area data is preserved for old campuses but is no longer an active authoring asset.
                  </div>
                ) : (
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
                )}

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
                  {!isGroundArea && <div className="mt-2">
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
                  </div>}
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
                  <button
                    onClick={() => onUpdateDecorAsset(selDecorAsset.id, { locked: !selDecorAsset.locked })}
                    className={cn(
                      "w-full mt-2 flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                      selDecorAsset.locked
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {selDecorAsset.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {selDecorAsset.locked ? "Locked" : "Unlocked"}
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
        {selNavNode && !isMultiMode && !isNavMultiMode && (
          <div data-testid="nav-node-props">
            <div className="flex items-center gap-1.5 mb-3">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Walking Point</span>
            </div>

            {/* GENERAL */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">General</span>
              </div>
              <div>
                <label htmlFor="nav-name" className={labelCls}>Name (optional)</label>
                <input id="nav-name" value={selNavNode.name} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { name: e.target.value })}
                  className={inputCls} placeholder="Walking Point name" />
              </div>
              {/* Type only shown for entrance-linked nodes as read-only indicator */}
              {selNavNode.entranceId && (
                <div>
                  <div className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-foreground text-[10px] font-semibold flex items-center gap-2">
                    <DoorOpen className="h-3.5 w-3.5 text-blue-500" />
                    <span className="truncate">Building Entrance</span>
                    <span className="ml-auto text-[9px] text-muted-foreground font-medium">Linked</span>
                  </div>
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
                  <p className="text-muted-foreground">This walking point has no connections. Use Connect to link it into the walking network.</p>
                </div>
              )}
            </div>

            {/* ADVANCED ROUTING — collapsed by default; contains Type, Accessible, Position */}
            <NavNodeAdvancedRouting
              node={selNavNode}
              buildingName={selNavNode.buildingId ? (allBuildings.find((b) => b.id === selNavNode.buildingId)?.name ?? selNavNode.buildingId) : undefined}
              onUpdateNode={onUpdateNavNode}
              allNavEdges={allNavEdges}
              allPaths={allPaths}
              onSelectPath={onSelectPath}
              labelCls={labelCls}
              inputCls={inputCls}
            />

            {/* ACTIONS */}
            <div className="pt-3 mt-3 border-t border-border">
              {selNavNode.generatedFromPathVertices?.length ? (
                <p className="text-[9px] text-muted-foreground">Generated walking points are removed with their owning Pathway.</p>
              ) : (
                <button onClick={() => onDeleteNavNode?.(selNavNode.id)}
                  className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                  <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Walking Point</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── NAV EDGE PROPERTIES (Navigation layer) ── */}
        {selNavEdge && !isMultiMode && !isNavMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-3">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Walking Path</span>
            </div>

            {generatedNavEdge && (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-2 text-[10px] text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-300" data-testid="generated-nav-edge-status">
                <p className="font-extrabold">Generated from:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {generatedNavEdgePaths.map((path) => (
                    <button
                      key={path.id}
                      type="button"
                      onClick={() => onSelectPath?.(path.id)}
                      className="rounded-md border border-emerald-300/70 px-2 py-1 text-[9px] font-bold hover:bg-emerald-100/70 dark:border-emerald-700/60 dark:hover:bg-emerald-900/30"
                    >
                      {path.name || (path.type === "accessible" ? "Accessible Path" : path.type === "road" || path.type === "driveway" ? "Road / Driveway" : "Walkway")}
                    </button>
                  ))}
                  {generatedNavEdgePaths.length === 0 && <span>Physical Pathway</span>}
                </div>
              </div>
            )}

            {/* CONNECTION */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Connection</span>
              </div>
              <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>From</span>
                  <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.startNodeId)?.name ?? "Walking Point"}</span>
                </div>
                <div className="flex justify-between">
                  <span>To</span>
                  <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.endNodeId)?.name ?? "Walking Point"}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span>Distance</span>
                  <span className="font-bold">{selNavEdge.distance} units</span>
                </div>
              </div>
            </div>

            {/* B5 Phase 6.10: blocked-edge warning */}
            {navEdgeBlocked && (
              <div data-testid="nav-edge-blocked-warning" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 mb-3">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-destructive leading-snug">
                  {generatedNavEdge
                    ? "Connection blocked by obstacle. Edit the owning physical Pathway to repair it."
                    : "Connection blocked by obstacle. Move a walking point, segment, or bend to repair it."}
                </p>
              </div>
            )}

            {/* GEOMETRY — Add Bend / Remove Bend / Straighten (Floor Editor
                parity). Straighten is disabled when the direct A→B line would
                cross a building or solid obstacle. */}
            <div className="pt-3 mt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Geometry</span>
              </div>
              {generatedNavEdge ? (
                <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2 text-[10px] text-muted-foreground" data-testid="generated-nav-edge-geometry-lock">
                  Geometry follows the physical Pathway.
                </div>
              ) : (
              <>
              {/* B5 Phase 6.10: responsive geometry layout — bend count on row 1,
                  Add/Remove on row 2, Straighten on row 3. No horizontal overflow. */}
              <div className="px-2.5 py-2 rounded-xl border border-border bg-muted/30 text-[10px] text-muted-foreground mb-1.5">
                <span className="font-bold text-foreground">{selNavEdge.bendPoints?.length ?? 0}</span> bends
              </div>
              <div className="grid grid-cols-2 gap-1 mb-1.5">
                <button type="button" data-testid="nav-edge-add-bend" onClick={() => onAddNavEdgeBend?.(selNavEdge.id)}
                  className="h-8 rounded-xl border border-border text-[10px] font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1 min-w-0">
                  <Plus className="h-3 w-3 shrink-0" /> <span className="truncate">Add Bend</span>
                </button>
                <button type="button" data-testid="nav-edge-remove-bend" onClick={() => onRemoveNavEdgeBend?.(selNavEdge.id)}
                  disabled={!selNavEdge.bendPoints || selNavEdge.bendPoints.length === 0}
                  className="h-8 rounded-xl border border-border text-[10px] font-bold hover:bg-muted transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:hover:bg-transparent min-w-0">
                  <Minus className="h-3 w-3 shrink-0" /> <span className="truncate">Remove Bend</span>
                </button>
              </div>
              <button type="button" data-testid="nav-edge-straighten" onClick={() => onStraightenNavEdge?.(selNavEdge.id)}
                disabled={(!selNavEdge.bendPoints || selNavEdge.bendPoints.length === 0) || straightenBlocked}
                className={cn("w-full h-9 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1",
                  straightenBlocked
                    ? "border-amber-200/70 bg-amber-50/40 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400"
                    : "border-border text-foreground hover:bg-muted",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent")}
                title={straightenBlocked ? "Can't straighten — the direct route would cross an obstacle." : undefined}>
                Straighten
              </button>
              {straightenBlocked && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold leading-snug mt-1">
                  Can't straighten — the direct route would cross an obstacle.
                </p>
              )}
              </>
              )}
            </div>

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
                  ⇄ Two-way
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
                  → One-way
                </button>
              </div>
              {selNavEdge.bidirectional === false && (
                <button
                  data-testid="nav-edge-reverse-direction"
                  onClick={() => onUpdateNavEdge?.(selNavEdge.id, {
                    // B5 correction: reversing a ONE-WAY edge must preserve the
                    // exact visible polyline — swap the semantic endpoints AND
                    // reverse the bendPoints order (A→b1→b2→B becomes
                    // B→b2→b1→A). Never re-orthogonalize or straighten here:
                    // Reverse Direction is a direction-only operation.
                    startNodeId: selNavEdge.endNodeId,
                    endNodeId: selNavEdge.startNodeId,
                    bendPoints: selNavEdge.bendPoints && selNavEdge.bendPoints.length > 0
                      ? [...selNavEdge.bendPoints].reverse()
                      : selNavEdge.bendPoints,
                  })}
                  className="w-full h-7 mt-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex items-center justify-center gap-1"
                >
                  ↺ Reverse Direction
                </button>
              )}
            </div>

            {/* ADVANCED ROUTING — collapsed by default */}
            <NavEdgeAdvancedRouting edge={selNavEdge} onUpdateEdge={onUpdateNavEdge} />

            {/* ACTIONS */}
            <div className="pt-3 mt-3 border-t border-border">
              {generatedNavEdge ? (
                <p className="text-[9px] text-muted-foreground">Generated Walking Paths are removed with their owning physical Pathway.</p>
              ) : (
                <button onClick={() => onDeleteNavEdge?.(selNavEdge.id)}
                  className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                  <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Path</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* ── ROUTE PROPERTIES (Navigation layer) ── */}
        {selRoute && layer === "navigation" && !isMultiMode && !isNavMultiMode && (
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
                <span>Walking Points</span>
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
        title={deleteConfirm?.type === "batch" ? "Delete Selected Objects?"
          : deleteConfirm?.type === "floor" ? "Delete Floor"
          : `Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : deleteConfirm?.type === "path" ? "Pathway" : deleteConfirm?.type === "decorAsset" ? "Asset" : "Route"}?`}
        message={deleteConfirm?.type === "batch"
          ? `This action cannot be undone. "${deleteConfirm?.label}" will be permanently removed from the map.`
          : deleteConfirm?.type === "floor"
          ? `Delete "${deleteConfirm?.label}" and its ${deleteConfirm?.itemCount ?? 0} authored ${(deleteConfirm?.itemCount ?? 0) === 1 ? "item" : "items"}? This action cannot be undone.`
          : `This action cannot be undone. "${deleteConfirm?.label ?? "this item"}" will be permanently removed from the map.`}
        confirmLabel={deleteConfirm?.type === "batch" ? "Delete All"
          : deleteConfirm?.type === "floor" ? "Delete Floor"
          : `Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : deleteConfirm?.type === "path" ? "Pathway" : deleteConfirm?.type === "decorAsset" ? "Asset" : "Route"}`}
        variant="danger"
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === "batch") {
            onBatchDeleteBuildings(multiSelected);
            onClearMultiSelect();
          } else if (deleteConfirm.type === "floor") {
            // Delete floor + re-number remaining floors
            const floors = (selBldg?.floors ?? []).filter((f) => f.id !== deleteConfirm.id);
            onUpdateBuilding(deleteConfirm.buildingId!, {
              floors: floors.map((f, i) => ({
                ...f,
                number: i + 1,
                label: i === 0 ? "Ground Floor" : `Floor ${i + 1}`,
              })),
            });
          } else if (deleteConfirm.type === "building") onDeleteBuilding(deleteConfirm.id);
          else if (deleteConfirm.type === "marker") onDeleteMarker(deleteConfirm.id);
          else if (deleteConfirm.type === "path") onDeletePath?.(deleteConfirm.id);
          else if (deleteConfirm.type === "decorAsset") onDeleteDecorAsset(deleteConfirm.id);
          else onDeleteRoute?.(deleteConfirm.id);
          setDeleteConfirm(null);
          if (deleteConfirm.type !== "batch" && deleteConfirm.type !== "floor") onClose();
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
    {entranceDoorPickerOpen && selEntrance && selEntranceParent && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" data-testid="entrance-door-picker">
        <div className="w-full max-w-2xl max-h-[min(720px,calc(100vh-2rem))] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border bg-card/95 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-foreground">Connect to Indoor Door</h3>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  Choose the navigation-linked indoor Door that represents where this exterior Entrance leads.
                </p>
                <p className="mt-2 text-[10px] font-bold text-foreground truncate">
                  {selectedEntranceName} - {selEntranceParent.name}
                </p>
                {entranceLinkStatus?.state === "linked" && (
                  <p className="mt-1 text-[10px] font-semibold text-primary">
                    Current connection: {entranceLinkStatus.floorLabel} - {entranceLinkStatus.doorLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEntranceDoorPickerOpen(false)}
                className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
                aria-label="Close Door picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(entranceDoorOptions ?? []).length > 6 && (
              <div className="relative mt-3">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={entranceDoorSearch}
                  onChange={(event) => setEntranceDoorSearch(event.target.value)}
                  placeholder="Search Doors or floors..."
                  className="w-full h-9 rounded-xl border border-border bg-input-background pl-9 pr-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}
            {(entranceDoorOptions ?? []).length > 0 && !entranceHasEligibleDoor && (
              <p className="mt-2 text-[10px] leading-snug font-semibold text-amber-700 dark:text-amber-300">
                No eligible navigation-linked Doors found on the building entry floor.
              </p>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto p-3">
            {(entranceDoorOptions ?? []).length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
                  <DoorOpen className="h-6 w-6" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No indoor Doors yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-snug text-muted-foreground">
                  Add a Door to navigation on the building entry floor before connecting this Entrance.
                </p>
                <p className="mt-3 text-[10px] font-semibold text-muted-foreground">
                  Open the entry floor, select the Door, then choose Add to Navigation.
                </p>
              </div>
            ) : filteredEntranceDoorOptions.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground">
                  <SearchIcon className="h-5 w-5" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No Doors match your search</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-snug text-muted-foreground">
                  Try a Door name or floor name from this building.
                </p>
              </div>
            ) : (
              Object.entries(groupedEntranceDoorOptions).map(([floorLabel, options]) => (
                <div key={floorLabel} className="mb-3 last:mb-0 rounded-xl border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    {floorLabel}
                  </div>
                  <div className="divide-y divide-border">
                    {options.map((option) => {
                      const current = entranceLinkStatus?.state === "linked" && entranceLinkStatus.nodeId === option.nodeId;
                      const currentNeedsReview = current && !option.eligible;
                      const disabled = !option.eligible || current;
                      return (
                        <div key={`${option.floorId}-${option.doorId}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-foreground truncate">{option.doorLabel}</p>
                            <p className={cn("text-[10px] font-semibold truncate", option.eligible ? "text-emerald-700" : currentNeedsReview ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                              {current ? `Current${currentNeedsReview ? ` - ${entranceDoorDetail(option)}` : ""}` : entranceDoorDetail(option)}
                            </p>
                          </div>
                          {current ? (
                            <span className={cn(
                              "h-7 px-2.5 rounded-lg text-[10px] font-extrabold flex items-center shrink-0",
                              currentNeedsReview ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : "bg-primary/10 text-primary"
                            )}>
                              {currentNeedsReview ? "Needs review" : "Current"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                if (!option.eligible || !option.nodeId) return;
                                onConnectEntranceToDoor?.(selEntranceParent.id, selEntrance.id, option.nodeId);
                                setEntranceDoorPickerOpen(false);
                              }}
                              className="h-8 px-3 rounded-lg border border-border bg-background text-[10px] font-extrabold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                              Select
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    </>
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
