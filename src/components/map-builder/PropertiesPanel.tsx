import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Lock, Unlock, Info, Palette, Settings2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import { LAYERS } from "./constants";
import { Combobox } from "../ui/Combobox";
import type { CampusBuilding, CampusMarker, CampusSelection } from "./types";

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
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onUpdateMarker: (id: string, changes: Partial<CampusMarker>) => void;
  onDeleteBuilding: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onClose: () => void;
}

const inputCls = "w-full h-8 px-2.5 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20";
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
  selected, selBldg, selMkr,
  onUpdateBuilding, onUpdateMarker,
  onDeleteBuilding, onDeleteMarker, onClose,
}: PropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
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
          {selBldg ? "Building" : selMkr ? "Marker" : "Properties"}
        </span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar (only for buildings - markers are simpler) */}
      {selBldg && <TabBar active={tab} onChange={setTab} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-3">
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
                  <input id="bldg-name" value={selBldg.name} onChange={(e) => onUpdateBuilding(selBldg.id, { name: e.target.value })} className={inputCls} placeholder="Building name" />
                </div>
                <div>
                  <label htmlFor="bldg-code" className={labelCls}>Code</label>
                  <input id="bldg-code" value={selBldg.code} onChange={(e) => onUpdateBuilding(selBldg.id, { code: e.target.value.toUpperCase().slice(0, 5) })} className={inputCls} placeholder="e.g. MAB" />
                </div>
                <div>
                  <label htmlFor="bldg-category" className={labelCls}>Category</label>
                  <input id="bldg-category" value={selBldg.category} onChange={(e) => onUpdateBuilding(selBldg.id, { category: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="bldg-description" className={labelCls}>Description</label>
                  <textarea id="bldg-description" value={selBldg.description ?? ""} rows={2} onChange={(e) => onUpdateBuilding(selBldg.id, { description: e.target.value })} placeholder="Optional description..." className="w-full px-2.5 py-2 rounded-lg border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
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
                    <input id="bldg-color" type="color" value={selBldg.color} onChange={(e) => onUpdateBuilding(selBldg.id, { color: e.target.value })} className="w-9 h-9 rounded-xl border border-border cursor-pointer shrink-0" />
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
                      <input id={`bldg-${k}`} type="number" value={(selBldg as any)[k]} onChange={(e) => onUpdateBuilding(selBldg.id, { [k]: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[["width", "Width"], ["height", "Height"]].map(([k, l]) => (
                    <div key={k}>
                      <label htmlFor={`bldg-${k}`} className={labelCls}>{l}</label>
                      <input id={`bldg-${k}`} type="number" min={20} value={(selBldg as any)[k]} onChange={(e) => onUpdateBuilding(selBldg.id, { [k]: Math.max(20, parseInt(e.target.value) || 40) })} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-border">
                  <button onClick={() => { onDeleteBuilding(selBldg.id); onClose(); }} className="w-full h-8 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Building
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
              <input id="mkr-name" value={selMkr.name} onChange={(e) => onUpdateMarker(selMkr.id, { name: e.target.value })} className={inputCls} />
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
              <button onClick={() => { onDeleteMarker(selMkr.id); onClose(); }} className="w-full h-8 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                Delete Marker
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
