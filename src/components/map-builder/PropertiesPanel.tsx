import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Lock, Unlock, Info, Palette, Settings2, Route, Accessibility, Star, CheckCircle2, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import { LAYERS, LAYER_TOOLS } from "./constants";
import { Combobox } from "../ui/Combobox";
import type { CampusBuilding, CampusMarker, CampusSelection, EditorLayer, CampusRoute } from "./types";

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
  selRoute: CampusRoute | undefined;
  layer: EditorLayer;
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onUpdateMarker: (id: string, changes: Partial<CampusMarker>) => void;
  onUpdateRoute?: (id: string, changes: Partial<CampusRoute>) => void;
  onDeleteBuilding: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onDeleteRoute?: (id: string) => void;
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
  selected, selBldg, selMkr, selRoute, layer,
  onUpdateBuilding, onUpdateMarker, onUpdateRoute,
  onDeleteBuilding, onDeleteMarker, onDeleteRoute, onClose,
}: PropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "route"; id: string; label: string } | null>(null);
  const visible = !!selected;

  // Reset to basic tab when selection changes
  useEffect(() => { setTab("basic"); }, [selected]);

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
          {selBldg ? "Building" : selMkr ? "Marker" : selRoute ? "Route" : "Properties"}
        </span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar (only for buildings) */}
      {selBldg && <TabBar active={tab} onChange={setTab} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-4">
        {/* ── BUILDING PROPERTIES ── */}
        {selBldg && (
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
                <div>
                  <label htmlFor="bldg-category" className={labelCls}>Category</label>
                  <input id="bldg-category" value={selBldg.category} onChange={(e) => onUpdateBuilding(selBldg.id, { category: e.target.value })} className={inputCls} placeholder="e.g. academic, admin" />
                </div>
                <div>
                  <label htmlFor="bldg-description" className={labelCls}>Description</label>
                  <textarea id="bldg-description" value={selBldg.description ?? ""} rows={2} onChange={(e) => onUpdateBuilding(selBldg.id, { description: e.target.value })} placeholder="Optional description..." className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200" />
                </div>
                <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground">
                  {selBldg.floors.length} floor plan{selBldg.floors.length !== 1 ? "s" : ""} — click floor in hierarchy to edit
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
                  <label htmlFor="bldg-color" className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <input id="bldg-color" type="color" value={selBldg.color} onChange={(e) => onUpdateBuilding(selBldg.id, { color: e.target.value })} className="w-9 h-9 rounded-lg border border-border cursor-pointer shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground">{selBldg.color}</span>
                  </div>
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
        {selMkr && (
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
              <label htmlFor="mkr-color" className={labelCls}>Color</label>
              <div className="flex items-center gap-2">
                <input id="mkr-color" type="color" value={selMkr.color || "#0e2a6e"} onChange={(e) => onUpdateMarker(selMkr.id, { color: e.target.value })} className="w-9 h-9 rounded-xl border border-border cursor-pointer shrink-0" />
                <span className="text-xs font-mono text-muted-foreground">{selMkr.color}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <button onClick={() => setDeleteConfirm({ type: "marker", id: selMkr.id, label: selMkr.name })} className="w-full h-10 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors duration-200">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Marker</span>
              </button>
            </div>
          </>
        )}

        {/* ── ROUTE PROPERTIES (Navigation layer) ── */}
        {selRoute && layer === "navigation" && (
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
        {layer === "accessibility" && selBldg && (
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

        {/* ── EVENTS LAYER (marker selected) ── */}
        {layer === "events" && selMkr && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              <Star className="h-3 w-3 text-amber-500" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Event Marker</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              This marker is part of an event overlay. Event properties can be managed from the Events layer panel.
            </p>
            <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground">
              Marker is visible on the map while this event is active.
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title={`Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : "Route"}?`}
        message={`This action cannot be undone. "${deleteConfirm?.label ?? "this item"}" will be permanently removed from the map.`}
        confirmLabel={`Delete ${deleteConfirm?.type === "building" ? "Building" : deleteConfirm?.type === "marker" ? "Marker" : "Route"}`}
        variant="danger"
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === "building") onDeleteBuilding(deleteConfirm.id);
          else if (deleteConfirm.type === "marker") onDeleteMarker(deleteConfirm.id);
          else onDeleteRoute?.(deleteConfirm.id);
          setDeleteConfirm(null);
          onClose();
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
