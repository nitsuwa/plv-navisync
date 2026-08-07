import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  X, Eye, EyeOff, Lock, Unlock, Info, Palette, Settings2,
  Route, Accessibility, Star, CheckCircle2, AlertTriangle,
  PaintBucket, Trash2, MapPin, Calendar, Plus, Minus, GripVertical,
  Layers, Copy,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
} from "lucide-react";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { normalizeRotation, clampDecorScale, DECOR_SCALE_MIN, DECOR_SCALE_MAX } from "../../lib/decorAsset";
import { DecorAssetVisual } from "./DecorAssetVisual";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import { LAYERS, LAYER_TOOLS, DECOR_ASSET_MAP, DECOR_ASSET_TYPES, genId } from "./constants";
import { Combobox } from "../ui/Combobox";
import type {
  CampusBuilding, CampusMarker, CampusSelection, EditorLayer,
  CampusRoute, NavigationNode, NavigationEdge, CampusEventOverlay,
  EventLocationRef, FloorPlan, CampusDecorAsset, DecorAssetType,
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
  onClose: () => void;
}

const inputCls = "w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
const labelCls = "block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground";

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
  selected, selBldg, selMkr, selRoute,
  selDecorAsset, allDecorAssets,
  selNavNode, selNavEdge, selEventOverlay, allNavNodes, allNavEdges,
  allBuildings,
  layer,
  multiSelected, multiSelectedBuildings, selectedOutdoorCount,
  onBatchUpdateBuildings, onBatchDeleteBuildings, onClearMultiSelect, onLayerOrder,
  onUpdateBuilding, onUpdateMarker, onUpdateRoute,
  onUpdateEventOverlay,
  onDeleteBuilding, onDeleteMarker, onDeleteRoute,
  onDeleteEventOverlay,
  onUpdateDecorAsset, onDeleteDecorAsset, onDuplicateDecorAsset,
  onUpdateNavNode, onDeleteNavNode, onUpdateNavEdge, onDeleteNavEdge,
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
          {isMultiMode
            ? `Multi-Select (${selectedOutdoorCount})`
            : selBldg ? "Building" : selMkr ? "Marker" : selDecorAsset ? "Decorative Asset" : selRoute ? "Route" : selected?.type === "navNode" ? "Waypoint" : selected?.type === "navEdge" ? "Navigation Edge" : "Properties"}
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
                        const newFloor: FloorPlan = {
                          id: genId("fl"),
                          buildingId: selBldg.id,
                          number: nextNum,
                          label: nextNum === 1 ? "Ground Floor" : `Floor ${nextNum}`,
                          rooms: [],
                          paths: [],
                          walls: [],
                          doors: [],
                          windows: [],
                          furniture: [],
                          stairs: [],
                          elevators: [],
                          labels: [],
                        };
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
                {/* Entrance section */}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin className="h-3 w-3 text-green-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Entrance</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mb-2">Set the main entrance location on the campus map.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="bldg-ent-x" className={labelCls}>X</label>
                      <input id="bldg-ent-x" type="number" value={selBldg.entrance?.x ?? Math.round(selBldg.x + selBldg.width / 2)} onChange={(e) => onUpdateBuilding(selBldg.id, { entrance: { ...(selBldg.entrance || { label: undefined }), x: parseInt(e.target.value) || 0, y: selBldg.entrance?.y ?? Math.round(selBldg.y + selBldg.height), label: selBldg.entrance?.label }})} className={`${inputCls} font-mono`} />
                    </div>
                    <div>
                      <label htmlFor="bldg-ent-y" className={labelCls}>Y</label>
                      <input id="bldg-ent-y" type="number" value={selBldg.entrance?.y ?? Math.round(selBldg.y + selBldg.height)} onChange={(e) => onUpdateBuilding(selBldg.id, { entrance: { ...(selBldg.entrance || { label: undefined }), x: selBldg.entrance?.x ?? Math.round(selBldg.x + selBldg.width / 2), y: parseInt(e.target.value) || 0, label: selBldg.entrance?.label }})} className={`${inputCls} font-mono`} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label htmlFor="bldg-ent-label" className={labelCls}>Label</label>
                    <input id="bldg-ent-label" value={selBldg.entrance?.label ?? ""} onChange={(e) => onUpdateBuilding(selBldg.id, { entrance: { x: selBldg.entrance?.x ?? Math.round(selBldg.x + selBldg.width / 2), y: selBldg.entrance?.y ?? Math.round(selBldg.y + selBldg.height), label: e.target.value || undefined }})} className={inputCls} placeholder="e.g. Main Gate" />
                  </div>
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
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Waypoint</span>
            </div>
            <div>
              <label htmlFor="nav-name" className={labelCls}>Name</label>
              <input id="nav-name" value={selNavNode.name} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { name: e.target.value })}
                className={inputCls} placeholder="Waypoint name" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={selNavNode.type} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { type: e.target.value as any })}
                className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select">
                <option value="outdoor">Outdoor Path</option>
                <option value="entrance">Building Entrance</option>
                <option value="hallway">Hallway</option>
                <option value="room_access">Room Access</option>
                <option value="stair">Staircase</option>
                <option value="elevator">Elevator</option>
                <option value="transition">Floor Transition</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Position</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>X</label>
                  <input type="number" value={selNavNode.x} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { x: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>Y</label>
                  <input type="number" value={selNavNode.y} onChange={(e) => onUpdateNavNode?.(selNavNode.id, { y: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} font-mono`} />
                </div>
              </div>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Connections</span>
                <span className="font-bold">
                  {allNavEdges?.filter(e => e.startNodeId === selNavNode.id || e.endNodeId === selNavNode.id).length ?? 0}
                </span>
              </div>
              {selNavNode.buildingId && (
                <div className="flex justify-between">
                  <span>Building</span>
                  <span className="font-bold text-[9px]">{selNavNode.buildingId}</span>
                </div>
              )}
              {selNavNode.floorId && (
                <div className="flex justify-between">
                  <span>Floor</span>
                  <span className="font-bold text-[9px]">{selNavNode.floorId}</span>
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Accessible</label>
              <button
                onClick={() => onUpdateNavNode?.(selNavNode.id, { accessible: !selNavNode.accessible })}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                  selNavNode.accessible
                    ? "border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-green-600"
                    : "border-border text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {selNavNode.accessible ? "Accessible" : "Not Accessible"}
              </button>
            </div>
            {/* Isolated warning */}
            {allNavEdges && allNavEdges.filter(e => e.startNodeId === selNavNode.id || e.endNodeId === selNavNode.id).length === 0 && (
              <div className="px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/10 text-[10px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="font-bold text-amber-600 dark:text-amber-400">Isolated Node</span>
                </div>
                <p className="text-muted-foreground">This waypoint has no connections. Use the Path tool to connect it to other waypoints.</p>
              </div>
            )}
            <div className="pt-3 border-t border-border">
              <button onClick={() => onDeleteNavNode?.(selNavNode.id)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Waypoint</span>
              </button>
            </div>
          </>
        )}

        {/* ── NAV EDGE PROPERTIES (Navigation layer) ── */}
        {selNavEdge && !isMultiMode && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="h-3 w-3 text-green-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation Edge</span>
            </div>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>From</span>
                <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.startNodeId)?.name ?? selNavEdge.startNodeId}</span>
              </div>
              <div className="flex justify-between">
                <span>To</span>
                <span className="font-bold text-[9px]">{allNavNodes?.find(n => n.id === selNavEdge.endNodeId)?.name ?? selNavEdge.endNodeId}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span>Distance (auto)</span>
                <span className="font-bold">{selNavEdge.distance}m</span>
              </div>
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <button
                onClick={() => onUpdateNavEdge?.(selNavEdge.id, { bidirectional: !selNavEdge.bidirectional })}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                  selNavEdge.bidirectional
                    ? "border-primary/30 bg-primary/8 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {selNavEdge.bidirectional ? "⇄ Bidirectional" : "→ One Way"}
              </button>
            </div>
            <div>
              <label className={labelCls}>Accessible</label>
              <button
                onClick={() => onUpdateNavEdge?.(selNavEdge.id, { accessible: !selNavEdge.accessible, inaccessibleReason: selNavEdge.accessible ? undefined : selNavEdge.inaccessibleReason })}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                  selNavEdge.accessible
                    ? "border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-green-600"
                    : "border-border text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {selNavEdge.accessible ? "Accessible ✓" : "Not Accessible"}
              </button>
            </div>
            {/* ── Inaccessible reason (only shown when accessible=false) ── */}
            {!selNavEdge.accessible && (
              <div>
                <label className={labelCls}>Reason</label>
                <select
                  value={selNavEdge.inaccessibleReason ?? "other"}
                  onChange={(e) => onUpdateNavEdge?.(selNavEdge.id, { inaccessibleReason: e.target.value as any })}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
                >
                  <option value="stairs">Stairs</option>
                  <option value="narrow_path">Narrow Path</option>
                  <option value="restricted_access">Restricted Access</option>
                  <option value="uneven_surface">Uneven Surface</option>
                  <option value="other">Other</option>
                </select>
                {selNavEdge.inaccessibleReason && (
                  <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                        {selNavEdge.inaccessibleReason === 'stairs' ? 'Contains stairs — not wheelchair accessible' :
                         selNavEdge.inaccessibleReason === 'narrow_path' ? 'Path is too narrow for wheelchairs' :
                         selNavEdge.inaccessibleReason === 'restricted_access' ? 'Restricted access area' :
                         selNavEdge.inaccessibleReason === 'uneven_surface' ? 'Uneven surface — difficult for wheelchairs' :
                         'Marked as inaccessible'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* ── Emergency Safety ── */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Emergency</span>
              </div>
              <div>
                <label className={labelCls}>Safe During Emergency</label>
                <button
                  onClick={() => onUpdateNavEdge?.(selNavEdge.id, {
                    emergencySafe: selNavEdge.emergencySafe === false ? true : false,
                    emergencyReason: selNavEdge.emergencySafe === false ? undefined : (selNavEdge.emergencyReason || "hazard")
                  })}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[10px] font-bold transition-all",
                    selNavEdge.emergencySafe !== false
                      ? "border-green-200 dark:border-green-700/30 bg-green-50 dark:bg-green-900/10 text-green-600"
                      : "border-red-200 dark:border-red-700/30 bg-red-50 dark:bg-red-900/10 text-red-600"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selNavEdge.emergencySafe !== false ? "Safe ✓" : "Unsafe"}
                </button>
              </div>
              {/* ── Emergency unsafe reason (only shown when unsafe) ── */}
              {selNavEdge.emergencySafe === false && (
                <div className="mt-2">
                  <label className={labelCls}>Reason</label>
                  <select
                    value={selNavEdge.emergencyReason ?? "hazard"}
                    onChange={(e) => onUpdateNavEdge?.(selNavEdge.id, { emergencyReason: e.target.value as any })}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
                  >
                    <option value="hazard">Hazard</option>
                    <option value="blocked">Blocked</option>
                    <option value="restricted">Restricted Access</option>
                    <option value="construction">Under Construction</option>
                    <option value="other">Other</option>
                  </select>
                  <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-700/30">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="text-[9px] text-red-600 dark:text-red-400 font-medium">
                        {selNavEdge.emergencyReason === 'hazard' ? 'Hazard area — avoid during evacuation' :
                         selNavEdge.emergencyReason === 'blocked' ? 'Blocked path — not usable during emergency' :
                         selNavEdge.emergencyReason === 'restricted' ? 'Restricted access area' :
                         selNavEdge.emergencyReason === 'construction' ? 'Under construction — unsafe during emergency' :
                         'Marked as unsafe for emergency'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-border">
              <button onClick={() => onDeleteNavEdge?.(selNavEdge.id)}
                className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Edge</span>
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

function CommittedTextInput({ id, value, onCommit, className, placeholder }: {
  id: string;
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const raw = draft;
    setDraft(null);
    if (raw !== null && raw !== value) onCommit(raw);
  };
  return (
    <input
      id={id}
      type="text"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={className}
      placeholder={placeholder}
    />
  );
}

function CommittedSlider({ id, value, min, max, step, onCommit, format, className }: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  format: (v: number) => string;
  className?: string;
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
      />
      <span className="text-xs font-mono text-muted-foreground w-12 text-right shrink-0">{format(display)}</span>
    </div>
  );
}
