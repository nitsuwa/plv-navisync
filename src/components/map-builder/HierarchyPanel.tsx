import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, Layers, Plus, Pencil, Trash2, Copy, GripVertical,
  ChevronRight, ChevronDown, FolderOpen, Search, Eye, EyeOff, Lock, TreePine, Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId, BUILDING_TYPES, DECOR_PALETTE_TYPES, DECOR_ASSET_MAP } from "./constants";
import { DecorAssetVisual } from "./DecorAssetVisual";
import { ContextMenu } from "./ContextMenu";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { createDefaultFloor, duplicateFloorForBuilding, normalizeFloor } from "../../lib/floorPlanNormalization";
import type { Campus, CampusBuilding, CampusSelection, FloorPlan, BuildingTypeDescriptor, CampusDecorAsset, DecorAssetType } from "./types";

interface HierarchyPanelProps {
  campus: Campus;
  selected: CampusSelection | null;
  onSelect: (sel: CampusSelection | null) => void;
  onOpenFloor: (buildingId: string, floorId: string) => void;
  onAddBuilding: () => void;
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onUpdate: (c: Partial<Campus>) => void;
  pushHistory: () => void;
  toast: {
    success: (msg: string, detail?: string) => void;
    error: (msg: string, detail?: string) => void;
    info: (msg: string) => void;
  };
  /** Called when a building type is selected for placement on canvas */
  onSelectBuildingType?: (type: BuildingTypeDescriptor) => void;
  /** Currently active building type ID (if any) */
  activeBuildingType?: string | null;
  /** Called when a decorative asset should be placed */
  onPlaceDecorAsset?: (asset: CampusDecorAsset) => void;
  /** Number of decorative assets placed */
  decorAssetCount?: number;
}

export function HierarchyPanel({
  campus, selected, onSelect, onOpenFloor, onAddBuilding,
  onUpdateBuilding, onUpdate, pushHistory, toast,
  onSelectBuildingType, activeBuildingType, onPlaceDecorAsset, decorAssetCount = 0,
}: HierarchyPanelProps) {
  // ── Panel tab: "hierarchy" | "assets" ──
  const [panelTab, setPanelTab] = useState<"hierarchy" | "assets">("hierarchy");
  // ── Asset search & category state ──
  const [assetSearch, setAssetSearch] = useState("");
  const [expandedDecorCats, setExpandedDecorCats] = useState<Set<string>>(new Set(["Greenery"]));
  const [expandedBuildingCats, setExpandedBuildingCats] = useState<Set<string>>(new Set(["Academic", "Laboratory"]));
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const dragItemRef = useRef<number | null>(null);

  const buildings = campus.buildings;
  const filteredBuildings = searchQuery
    ? buildings.filter(
        (b) =>
          b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : buildings;

  const updBuildings = (b: CampusBuilding[]) => onUpdate({ buildings: b });

  // ── Floor manager helpers ──
  const renameFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const floor = b.floors.find((f) => f.id === floorId);
    if (!floor) return;
    setRenameDialog({ buildingId, floorId, currentName: floor.label });
    setRenameValue(floor.label);
  };

  const applyRename = () => {
    if (!renameDialog || !renameValue.trim()) return;
    const { buildingId, floorId } = renameDialog;
    // Floor rename
    if (floorId) {
      const b = buildings.find((x) => x.id === buildingId);
      const floor = b?.floors.find((f) => f.id === floorId);
      if (!b || !floor) return;
      if (renameValue.trim() === floor.label) { setRenameDialog(null); return; }
      pushHistory();
      updBuildings(
        buildings.map((x) =>
          x.id === buildingId
            ? { ...x, floors: x.floors.map((f) =>
                f.id === floorId ? { ...f, label: renameValue.trim() } : f
              )}
            : x
        )
      );
      toast.success("Floor Renamed", `Renamed to "${renameValue.trim()}".`);
    } else {
      // Building rename
      const b = buildings.find((x) => x.id === buildingId);
      if (!b) return;
      if (renameValue.trim() === b.name) { setRenameDialog(null); return; }
      pushHistory();
      onUpdateBuilding(buildingId, { name: renameValue.trim() });
      toast.success("Building Renamed", `"${b.code}" is now "${renameValue.trim()}".`);
    }
    setRenameDialog(null);
  };

  const duplicateFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const floor = b.floors.find((f) => f.id === floorId);
    if (!floor) return;
    pushHistory();
    const nextNumber = Math.max(...b.floors.map((f) => f.number), 0) + 1;
    const newFloor: FloorPlan = duplicateFloorForBuilding(floor, {
      id: genId("fl"),
      buildingId,
      number: nextNumber,
      label: `${floor.label} (copy)`,
    });
    updBuildings(
      buildings.map((x) => (x.id === buildingId ? { ...x, floors: [...x.floors, newFloor] } : x))
    );
    const duplicatedFloor = buildings.find(x => x.id === buildingId)?.floors.find(f => f.id === floorId);
    toast.success("Floor Duplicated", duplicatedFloor ? `"${duplicatedFloor.label}" has been copied.` : undefined);
  };

  const confirmDeleteFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    if (b.floors.length <= 1) {
      toast.error("Cannot delete", "Building must have at least one floor.");
      return;
    }
    const floor = b.floors.find((f) => f.id === floorId);
    setDeleteConfirm({ type: "floor", id: floorId, name: floor?.label ?? "this floor", buildingId });
  };

  const executeDeleteFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    pushHistory();
    updBuildings(
      buildings.map((x) =>
        x.id === buildingId
          ? { ...x, floors: x.floors.filter((f) => f.id !== floorId) }
          : x
      )
    );
    const deletedFloor = buildings.find(x => x.id === buildingId)?.floors.find(f => f.id === floorId);
    toast.success("Floor Deleted", deletedFloor ? `"${deletedFloor.label}" has been removed.` : undefined);
  };

  const addFloor = (buildingId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const nextNum = Math.max(...b.floors.map((f) => f.number), 0) + 1;
    const newFloor: FloorPlan = createDefaultFloor({ id: genId("fl"), buildingId, number: nextNum });
    pushHistory();
    updBuildings(
      buildings.map((x) => (x.id === buildingId ? { ...x, floors: [...x.floors, newFloor] } : x))
    );
    const buildingForAdd = buildings.find(x => x.id === buildingId);
    toast.success("Floor Added", buildingForAdd ? `New floor added to ${buildingForAdd.code}.` : undefined);
  };

  // ── Building manager helpers ──
  const renameBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setRenameDialog({ buildingId: id, currentName: b.name });
    setRenameValue(b.name);
  };

  const duplicateBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    pushHistory();
    const nbId = genId("bld");
    const nb: CampusBuilding = {
      ...structuredClone(b),
      id: nbId,
      name: `${b.name} (copy)`,
      x: b.x + 25,
      y: b.y + 25,
      floors: b.floors.map((f) => duplicateFloorForBuilding(f, {
        id: genId("fl"),
        buildingId: nbId,
        number: f.number,
        label: f.label,
      })),
    };
    // Keep a final normalization pass for older building data that predates
    // complete floor collections.
    nb.floors = nb.floors.map((f) => normalizeFloor(f, { buildingId: nb.id }));
    updBuildings([...buildings, nb]);
    onSelect({ type: "building", id: nb.id });
    toast.success("Building Duplicated", `${b.code} has been copied.`);
  };

  const confirmDeleteBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setDeleteConfirm({ type: "building", id, name: `${b.code} - ${b.name}` });
  };

  const executeDeleteBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    pushHistory();
    updBuildings(buildings.filter((x) => x.id !== id));
    onSelect(null);
    toast.success("Building Deleted", `"${b.name}" has been removed.`);
  };

  const toggleLockBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    pushHistory();
    onUpdateBuilding(id, { locked: !b.locked });
    toast.success(b.locked ? "Building Unlocked" : "Building Locked", `${b.code} can ${b.locked ? 'now' : 'no longer'} be moved.`);
  };

  const toggleVisibleBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    pushHistory();
    const isVisible = b.visible ?? true;
    onUpdateBuilding(id, { visible: !isVisible });
    toast.success(isVisible ? "Building Hidden" : "Building Visible", `${b.code} is now ${isVisible ? 'hidden' : 'visible'} on the map.`);
  };

  // ── Rename dialog ──
  const [renameDialog, setRenameDialog] = useState<{
    buildingId: string;
    floorId?: string;
    currentName: string;
    label?: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Delete confirmation ──
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "building" | "floor";
    id: string;
    name: string;
    buildingId?: string;
  } | null>(null);

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; id: string;
    type: "building" | "floor";
    buildingId?: string;
  } | null>(null);

  const handleBuildingContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, id, type: "building" });
    onSelect({ type: "building", id });
  };

  const handleFloorContextMenu = (e: React.MouseEvent, buildingId: string, floorId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, id: floorId, type: "floor", buildingId });
    onSelect({ type: "building", id: buildingId });
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    const { id, type, buildingId } = contextMenu;
    if (type === "floor" && buildingId) {
      switch (action) {
        case "rename": renameFloor(buildingId, id); break;
        case "duplicate": duplicateFloor(buildingId, id); break;
        case "delete": confirmDeleteFloor(buildingId, id); break;
      }
    } else {
      switch (action) {
        case "rename": renameBuilding(id); break;
        case "duplicate": duplicateBuilding(id); break;
        case "delete": confirmDeleteBuilding(id); break;
        case "lock": toggleLockBuilding(id); break;
        case "hide": toggleVisibleBuilding(id); break;
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="w-56 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
    >
      {/* Header with tab switcher */}
      <div className="px-2 pt-2 pb-0 border-b border-border">
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/50">
          <button
            onClick={() => setPanelTab("hierarchy")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold transition-all",
              panelTab === "hierarchy" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="h-3 w-3" />
            Hierarchy
          </button>
          <button
            onClick={() => setPanelTab("assets")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold transition-all",
              panelTab === "assets" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3 w-3" />
            Assets
          </button>
        </div>
        {panelTab === "hierarchy" && (
          <div className="relative py-2">
            <Search className="absolute left-2 top-1/2 translate-y-[-25%] h-3 w-3 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search buildings..."
              className="w-full h-7 pl-6 pr-2 rounded-lg bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground/60 border border-transparent focus:outline-none focus:border-primary/30 focus:bg-muted transition-all"
            />
          </div>
        )}
        {panelTab === "assets" && (
          <div className="relative py-2">
            <Search className="absolute left-2 top-1/2 translate-y-[-25%] h-3 w-3 text-muted-foreground" />
            <input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full h-7 pl-6 pr-2 rounded-lg bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground/60 border border-transparent focus:outline-none focus:border-primary/30 focus:bg-muted transition-all"
            />
          </div>
        )}
      </div>

      {/* ═══ ASSETS TAB ═══ */}
      {panelTab === "assets" && (
        <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-2 px-2 space-y-3">
          {/* Combined Assets Grid — buildings + outdoor assets */}
          <div>
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-1.5">
              <Sparkles className="h-2.5 w-2.5" />
              Campus Objects
              {decorAssetCount > 0 && <span className="text-[8px] font-mono opacity-60">({decorAssetCount})</span>}
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(assetSearch
                ? BUILDING_TYPES.filter(t => t.label.toLowerCase().includes(assetSearch.toLowerCase()) || t.category.toLowerCase().includes(assetSearch.toLowerCase()))
                : BUILDING_TYPES
              ).map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    onSelectBuildingType?.(type);
                    // No toast here — CampusEditor handles feedback
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "buildingType", assetType: type.id, label: type.label, w: type.defaultWidth, h: type.defaultHeight }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 w-full px-1.5 py-2 rounded-lg border transition-all text-left group",
                    activeBuildingType === type.id
                      ? "border-primary/40 bg-primary/8 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/40"
                  )}
                >
                  {/* Visual preview — SVG icon */}
                  <div className="w-10 h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${type.color}12`, border: `1px solid ${type.color}25` }}>
                    <Building2 className="h-4 w-4" style={{ color: type.color }} />
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <span className="text-[9px] font-bold text-foreground block truncate group-hover:text-primary transition-colors">{type.label}</span>
                  </div>
                  {activeBuildingType === type.id && <div className="w-1 h-1 rounded-full bg-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Decorative Assets — visual grid (no categories, flat) */}
          <div className="border-t border-border pt-2">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-1.5">
              <TreePine className="h-2.5 w-2.5" />
              Outdoor Decor
              {decorAssetCount > 0 && <span className="text-[8px] font-mono opacity-60">({decorAssetCount})</span>}
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {/* Curated placement palette — a focused public-campus-map set.
                  Unlisted legacy types still render on the canvas if a saved
                  campus contains them (backward compatible). */}
              {(assetSearch
                ? DECOR_PALETTE_TYPES.map((t) => DECOR_ASSET_MAP[t]).filter(Boolean).filter(a => a.label.toLowerCase().includes(assetSearch.toLowerCase()))
                : DECOR_PALETTE_TYPES.map((t) => DECOR_ASSET_MAP[t]).filter(Boolean)
              ).map((asset) => (
                <button
                  key={asset.type}
                  onClick={() => {
                    const a: CampusDecorAsset = { id: genId("dec"), type: asset.type, x: Math.round(campus.canvasW / 2 + (Math.random() - 0.5) * 100), y: Math.round(campus.canvasH / 2 + (Math.random() - 0.5) * 100), rotation: 0, scale: 1 };
                    onPlaceDecorAsset?.(a);
                  }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-md hover:bg-muted/50 transition-all group active:scale-95"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "decorAsset", assetType: asset.type, w: asset.defaultWidth, h: asset.defaultHeight }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform" style={{ backgroundColor: `${asset.color}12`, border: `1px solid ${asset.color}25` }}>
                    <DecorAssetVisual type={asset.type} className="w-5 h-6" style={{ opacity: 0.85 }} />
                  </div>
                  <span className="text-[7px] font-semibold text-foreground/60 group-hover:text-foreground text-center leading-tight">{asset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ HIERARCHY TAB ═══ */}
      {panelTab === "hierarchy" && (
      <div
        className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverIndex(filteredBuildings.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromIdx = dragItemRef.current;
          if (fromIdx !== null && fromIdx !== buildings.length) {
            const reordered = [...buildings];
            const [moved] = reordered.splice(fromIdx, 1);
            reordered.push(moved);
            pushHistory();
            updBuildings(reordered);
            toast.success("Building Reordered", "Building order has been updated.");
          }
          dragItemRef.current = null;
          setDragOverIndex(null);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverIndex(null);
          }
        }}
      >
        {/* Campus name header */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground truncate">{campus.name}</span>
        </div>

        {filteredBuildings.map((b, idx) => (
          <div key={b.id}>
            {/* Drop indicator above item */}
            {dragOverIndex === idx && (
              <div className="h-0.5 bg-primary mx-5 rounded-full my-0.5" />
            )}
            {/* Building row */}
            <div
              draggable
              onDragStart={(e) => {
                dragItemRef.current = idx;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", b.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setDragOverIndex(idx);
              }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                const fromIdx = dragItemRef.current;
                if (fromIdx !== null && fromIdx !== idx) {
                  const reordered = [...buildings];
                  const [moved] = reordered.splice(fromIdx, 1);
                  reordered.splice(idx, 0, moved);
                  pushHistory();
                  updBuildings(reordered);
                  toast.success("Building Reordered", "Building order has been updated.");
                }
                dragItemRef.current = null;
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                dragItemRef.current = null;
                setDragOverIndex(null);
              }}
              onContextMenu={(e) => handleBuildingContextMenu(e, b.id)}
              className={cn(
                "flex items-center gap-0.5 pl-1 pr-1 py-1.5 cursor-pointer group hover:bg-muted/50 transition-colors",
                selected?.type === "building" && selected.id === b.id ? "bg-primary/8 text-primary" : "",
                dragItemRef.current === idx ? "opacity-40" : ""
              )}
              onClick={() => {
                onUpdate({ buildings: buildings.map((x) => (x.id === b.id ? { ...x, expanded: !x.expanded } : x)) });
                onSelect({ type: "building", id: b.id });
              }}
            >
              {/* Grip handle */}
              <span className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" title="Drag to reorder">
                <GripVertical className="h-3 w-3" />
              </span>
              {b.expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <Building2 className="h-3 w-3 shrink-0" style={{ color: b.color }} />
              <span className="text-xs font-semibold text-foreground ml-0.5 flex-1 min-w-0" title={b.name}>{b.name}</span>
              {b.locked && <Lock className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
              {!(b.visible ?? true) && <EyeOff className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />}
              <span className="text-[9px] text-muted-foreground shrink-0 mr-1">{b.floors.length}F</span>
              {/* Building hover actions */}
              <button
                onClick={(e) => { e.stopPropagation(); renameBuilding(b.id); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                title="Rename"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); duplicateBuilding(b.id); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                title="Duplicate"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLockBuilding(b.id); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                title={b.locked ? "Unlock" : "Lock"}
              >
                <Lock className={cn("h-2.5 w-2.5", b.locked && "text-amber-500")} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibleBuilding(b.id); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                title={(b.visible ?? true) ? "Hide" : "Show"}
              >
                {b.visible ?? true ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); confirmDeleteBuilding(b.id); }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                title="Delete"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>

            {/* Expanded floors */}
            {b.expanded && (
              <div className="pl-10">
                {b.floors.map((f) => (
                  <div key={f.id}>
                    <div className="group flex items-center" onContextMenu={(e) => handleFloorContextMenu(e, b.id, f.id)}>
                      <button
                        onClick={() => onOpenFloor(b.id, f.id)}
                        className="flex-1 flex items-center gap-2 px-2 py-1 hover:bg-muted/50 transition-colors text-left min-w-0"
                      >
                        <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                          {f.label}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {f.rooms.length}R
                        </span>
                      </button>
                      {/* Floor manager actions */}
                      <button
                        onClick={(e) => { e.stopPropagation(); renameFloor(b.id, f.id); }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                        title="Rename"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateFloor(b.id, f.id); }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                        title="Duplicate"
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDeleteFloor(b.id, f.id); }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {/* Rooms under this floor */}
                    {f.rooms.length > 0 && (
                      <div className="pl-4 space-y-0.5 py-0.5">
                        {f.rooms.map((room) => (
                          <div
                            key={room.id}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-muted/30 transition-colors cursor-default"
                            title={`${room.name} (${room.type})`}
                          >
                            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: room.type === "classroom" ? "#3b82f6" : room.type === "lab" ? "#8b5cf6" : room.type === "office" ? "#f59e0b" : "#6b7280" }} />
                            <span className="text-[10px] text-muted-foreground truncate flex-1">
                              {room.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {f.rooms.length === 0 && (
                      <div className="pl-6 py-0.5 text-[9px] text-muted-foreground/50 italic">
                        No rooms yet
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addFloor(b.id)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-primary/70 hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3 shrink-0" />
                  <span className="text-[11px] font-semibold">Add Floor</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Drop indicator at the end */}
        {dragOverIndex === buildings.length && (
          <div className="h-0.5 bg-primary mx-5 rounded-full my-0.5" />
        )}

        {/* Add building button */}
        {filteredBuildings.length === 0 && searchQuery ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            No buildings match "{searchQuery}"
          </div>
        ) : null}

        <button
          onClick={onAddBuilding}
          className="flex items-center gap-2 pl-5 pr-3 py-1.5 text-primary/70 hover:text-primary transition-colors w-full"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">Add Building</span>
        </button>
      </div>
      )}

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            type={contextMenu.type}
            onClose={() => setContextMenu(null)}
            onAction={handleContextAction}
          />
        )}
      </AnimatePresence>

      {/* Rename dialog */}
      <AnimatePresence>
        {renameDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setRenameDialog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-extrabold text-foreground">
                  {renameDialog.floorId ? "Rename Floor" : "Rename Building"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {renameDialog.floorId
                    ? `Enter a new label for "${renameDialog.currentName}".`
                    : `Enter a new name for "${renameDialog.currentName}".`
                  }
                </p>
              </div>
              <div className="px-5 py-4">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { applyRename(); }
                    if (e.key === "Escape") setRenameDialog(null);
                  }}
                  placeholder={renameDialog.floorId ? "Floor label" : "Building name"}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <button
                  onClick={() => setRenameDialog(null)}
                  className="flex-1 h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyRename}
                  disabled={!renameValue.trim() || renameValue.trim() === renameDialog.currentName}
                  className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
                >
                  {renameDialog.floorId ? "Rename Floor" : "Rename"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirm?.type === "floor" ? "Delete Floor" : "Delete Building"}
        message={
          deleteConfirm?.type === "floor"
            ? `Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`
            : `Are you sure you want to delete "${deleteConfirm?.name}"? This will also remove all its floors and rooms. This action cannot be undone.`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === "floor") {
            executeDeleteFloor(deleteConfirm.buildingId!, deleteConfirm.id);
          } else {
            executeDeleteBuilding(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </motion.div>
  );
}
