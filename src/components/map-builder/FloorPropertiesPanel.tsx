import { useState, useEffect, lazy, Suspense } from "react";
import { X, Info, Palette, Settings2, AlertTriangle, Navigation, Unlink } from "lucide-react";
import { cn } from "../../lib/utils";
import { ROOM_TYPES, ROOM_MAP, WALL_THICKNESSES } from "./constants";
import type {
  FloorRoom, FloorWall, FloorDoor, FloorWindow,
  FloorFurniture, FloorStairs, FloorRamp, FloorElevatorItem,
  FloorLabel, FloorSelection, FloorEditorMode,
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

interface FloorPropertiesPanelProps {
  selected: FloorSelection | null;
  mode: FloorEditorMode;
  rooms: FloorRoom[];
  walls: FloorWall[];
  doors: FloorDoor[];
  windows: FloorWindow[];
  furniture: FloorFurniture[];
  stairs: FloorStairs[];
  ramps: FloorRamp[];
  elevators: FloorElevatorItem[];
  labels: FloorLabel[];
  onUpdateRoom: (id: string, changes: Partial<FloorRoom>) => void;
  onUpdateWall: (id: string, changes: Partial<FloorWall>) => void;
  onUpdateDoor: (id: string, changes: Partial<FloorDoor>) => void;
  onUpdateWindow: (id: string, changes: Partial<FloorWindow>) => void;
  onUpdateFurniture: (id: string, changes: Partial<FloorFurniture>) => void;
  onUpdateStairs: (id: string, changes: Partial<FloorStairs>) => void;
  onUpdateRamp: (id: string, changes: Partial<FloorRamp>) => void;
  onUpdateElevator: (id: string, changes: Partial<FloorElevatorItem>) => void;
  onUpdateLabel: (id: string, changes: Partial<FloorLabel>) => void;
  onToggleNavConnection: (room: FloorRoom) => void;
  onDeleteSelected: () => void;
  onClose: () => void;
}

const inputCls = "w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
const labelCls = "block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  );
}

export function FloorPropertiesPanel({
  selected, mode,
  rooms, walls, doors, windows, furniture, stairs, ramps, elevators, labels,
  onUpdateRoom, onUpdateWall, onUpdateDoor, onUpdateWindow,
  onUpdateFurniture,  onUpdateStairs, onUpdateRamp, onUpdateElevator, onUpdateLabel,
  onToggleNavConnection,
  onDeleteSelected, onClose,
}: FloorPropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  const visible = !!selected;

  useEffect(() => { setTab("basic"); }, [selected]);

  if (!selected) return null;

  const selRoom = selected.type === "room" ? rooms.find((r) => r.id === selected.id) : undefined;
  const selWall = selected.type === "wall" ? walls.find((w) => w.id === selected.id) : undefined;
  const selDoor = selected.type === "door" ? doors.find((d) => d.id === selected.id) : undefined;
  const selWindow = selected.type === "window" ? windows.find((w) => w.id === selected.id) : undefined;
  const selFurniture = selected.type === "furniture" ? furniture.find((f) => f.id === selected.id) : undefined;
  const selStairs = selected.type === "stairs" ? stairs.find((s) => s.id === selected.id) : undefined;
  const selRamp = selected.type === "ramp" ? ramps.find((r) => r.id === selected.id) : undefined;
  const selElevator = selected.type === "elevator" ? elevators.find((e) => e.id === selected.id) : undefined;
  const selLabel = selected.type === "label" ? labels.find((l) => l.id === selected.id) : undefined;

  const selItem = selRoom || selWall || selDoor || selWindow || selFurniture || selStairs || selRamp || selElevator || selLabel;

  const contentType = selRoom ? "Room" : selWall ? "Wall" : selDoor ? "Door" : selWindow ? "Window"
    : selFurniture ? "Furniture" : selStairs ? "Stairs" : selRamp ? "Ramp" : selElevator ? "Elevator" : selLabel ? "Label" : "Item";

  // Shared field renderer for position & size
  const PositionFields = ({ x, y, onChange }: { x: number; y: number; onChange: (k: string, v: number) => void }) => (
    <div className="grid grid-cols-2 gap-2">
      {[["x", "X"], ["y", "Y"]].map(([k, l]) => (
        <Field key={k} label={l}>
          <input type="number" value={(k === "x" ? x : y)} onChange={(e) => onChange(k, parseInt(e.target.value) || 0)} className={`${inputCls} font-mono`} />
        </Field>
      ))}
    </div>
  );

  const SizeFields = ({ w, h }: { w: number; h: number }) => (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Width">
        <input type="number" value={w} className={`${inputCls} font-mono`} disabled />
      </Field>
      <Field label="Height">
        <input type="number" value={h} className={`${inputCls} font-mono`} disabled />
      </Field>
    </div>
  );

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
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">{contentType}</span>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {[["basic", Info], ["style", Palette], ["advanced", Settings2]].map(([id, Icon]) => (
          <button key={id} onClick={() => setTab(id as TabId)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold transition-all relative",
              tab === id ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="h-3 w-3" />
            {id === "basic" ? "Info" : id === "style" ? "Style" : "Size"}
            {tab === id && <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-4">

        {/* ═══ ROOM ═══ */}
        {selRoom && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Name">
                  <input value={selRoom.name} onChange={(e) => onUpdateRoom(selRoom.id, { name: e.target.value })}
                    className={inputCls} placeholder="Room name" />
                </Field>
                <Field label="Room Type">
                  <select value={selRoom.type} onChange={(e) => onUpdateRoom(selRoom.id, { type: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt.type} value={rt.type}>{rt.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Description">
                  <textarea value={selRoom.description ?? ""} rows={2} onChange={(e) => onUpdateRoom(selRoom.id, { description: e.target.value })}
                    placeholder="Optional..." className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!selRoom.accessibility} onChange={(e) => onUpdateRoom(selRoom.id, { accessibility: e.target.checked })}
                    className="rounded border-border accent-primary h-4 w-4" />
                  <span className="text-[11px] font-medium text-foreground">Wheelchair accessible</span>
                </label>
              </>
            )}
            {tab === "style" && (
              <>
                <Field label="Type Color">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-muted/20">
                    <div className="w-5 h-5 rounded border" style={{ background: ROOM_MAP[selRoom.type]?.fill || "#dbeafe", borderColor: ROOM_MAP[selRoom.type]?.stroke || "#93c5fd" }} />
                    <span className="text-xs font-medium text-foreground">{ROOM_MAP[selRoom.type]?.label || "Custom"}</span>
                  </div>
                </Field>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selRoom.x} y={selRoom.y} onChange={(k, v) => onUpdateRoom(selRoom.id, { [k]: v })} />
                <SizeFields w={selRoom.w} h={selRoom.h} />

                {/* ── Navigation Connection ── */}
                <div className="pt-3 border-t border-border space-y-2">
                  <span className={labelCls}>Navigation</span>
                  {selRoom.navConnection ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10">
                        <Navigation className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          Connected at ({selRoom.navConnection.x}, {selRoom.navConnection.y})
                        </span>
                      </div>
                      <button onClick={() => onToggleNavConnection(selRoom)}
                        className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5">
                        <Unlink className="h-3 w-3" /> Disconnect
                      </button>
                    </>
                  ) : (
                    <button onClick={() => onToggleNavConnection(selRoom)}
                      className="w-full h-9 rounded-xl border border-emerald-300 dark:border-emerald-700/40 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all flex items-center justify-center gap-1.5">
                      <Navigation className="h-3 w-3" /> Connect to Navigation
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Room</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ WALL ═══ */}
        {selWall && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Thickness">
                  <select value={selWall.thickness} onChange={(e) => onUpdateWall(selWall.id, { thickness: parseInt(e.target.value) })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {WALL_THICKNESSES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Material">
                  <select value={selWall.material ?? "concrete"} onChange={(e) => onUpdateWall(selWall.id, { material: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="concrete">Concrete</option>
                    <option value="brick">Brick</option>
                    <option value="wood">Wood</option>
                    <option value="glass">Glass</option>
                    <option value="drywall">Drywall</option>
                  </select>
                </Field>
              </>
            )}
            {tab === "style" && (
              <Field label="Color">
                <ColorPicker value={selWall.color} onChange={(c) => onUpdateWall(selWall.id, { color: c })} />
              </Field>
            )}
            {tab === "advanced" && (
              <>
                <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Start</span><span className="font-mono font-bold">({selWall.x1}, {selWall.y1})</span></div>
                  <div className="flex justify-between"><span>End</span><span className="font-mono font-bold">({selWall.x2}, {selWall.y2})</span></div>
                  <div className="flex justify-between"><span>Length</span><span className="font-mono font-bold">{Math.round(Math.sqrt((selWall.x2 - selWall.x1) ** 2 + (selWall.y2 - selWall.y1) ** 2))}</span></div>
                </div>
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Wall</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ DOOR ═══ */}
        {selDoor && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Width">
                  <input type="number" min={4} max={24} value={selDoor.width} onChange={(e) => onUpdateDoor(selDoor.id, { width: parseInt(e.target.value) || 8 })}
                    className={inputCls} />
                </Field>
                <Field label="Swing Direction">
                  <select value={selDoor.direction} onChange={(e) => onUpdateDoor(selDoor.id, { direction: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="double">Double</option>
                    <option value="sliding">Sliding</option>
                  </select>
                </Field>
                <Field label="Label">
                  <input value={selDoor.label ?? ""} onChange={(e) => onUpdateDoor(selDoor.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. Main Entrance" />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!selDoor.locked} onChange={(e) => onUpdateDoor(selDoor.id, { locked: e.target.checked })}
                    className="rounded border-border accent-primary h-4 w-4" />
                  <span className="text-[11px] font-medium text-foreground">Locked</span>
                </label>
              </>
            )}
            {tab === "style" && (
              <Field label="Color">
                <ColorPicker value={selDoor.color} onChange={(c) => onUpdateDoor(selDoor.id, { color: c })} />
              </Field>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selDoor.x} y={selDoor.y} onChange={(k, v) => onUpdateDoor(selDoor.id, { [k]: v })} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Door
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ WINDOW ═══ */}
        {selWindow && (
          <>
            {tab === "basic" && (
              <Field label="Width">
                <input type="number" min={4} max={40} value={selWindow.width} onChange={(e) => onUpdateWindow(selWindow.id, { width: parseInt(e.target.value) || 12 })}
                  className={inputCls} />
              </Field>
            )}
            {tab === "style" && (
              <Field label="Color">
                <ColorPicker value={selWindow.color} onChange={(c) => onUpdateWindow(selWindow.id, { color: c })} />
              </Field>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selWindow.x} y={selWindow.y} onChange={(k, v) => onUpdateWindow(selWindow.id, { [k]: v })} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Window
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ FURNITURE ═══ */}
        {selFurniture && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Name">
                  <input value={selFurniture.name} onChange={(e) => onUpdateFurniture(selFurniture.id, { name: e.target.value })}
                    className={inputCls} placeholder="Item name" />
                </Field>
                <Field label="Category">
                  <span className="block w-full h-9 px-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground flex items-center">
                    {selFurniture.category}
                  </span>
                </Field>
              </>
            )}
            {tab === "style" && (
              <>
                <Field label="Color">
                  <ColorPicker value={selFurniture.color} onChange={(c) => onUpdateFurniture(selFurniture.id, { color: c })} />
                </Field>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selFurniture.rotation}
                      onChange={(e) => onUpdateFurniture(selFurniture.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selFurniture.rotation}°</span>
                  </div>
                </Field>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selFurniture.x} y={selFurniture.y} onChange={(k, v) => onUpdateFurniture(selFurniture.id, { [k]: v })} />
                <SizeFields w={selFurniture.width} h={selFurniture.height} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete {selFurniture.name}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ STAIRS ═══ */}
        {selStairs && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Label">
                  <input value={selStairs.label} onChange={(e) => onUpdateStairs(selStairs.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. Staircase A" />
                </Field>
                <Field label="Direction">
                  <select value={selStairs.direction} onChange={(e) => onUpdateStairs(selStairs.id, { direction: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                {/* ── Shared ID (for linking the same stairwell across floors) ── */}
                <Field label="Shared ID">
                  <input value={selStairs.sharedId ?? ""} onChange={(e) => onUpdateStairs(selStairs.id, { sharedId: e.target.value || undefined })}
                    className={inputCls} placeholder="e.g. shared_stair_mab_1" />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!selStairs.accessible} onChange={(e) => onUpdateStairs(selStairs.id, { accessible: e.target.checked })}
                    className="rounded border-border accent-primary h-4 w-4" />
                  <span className="text-[11px] font-medium text-foreground">Wheelchair accessible</span>
                </label>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selStairs.x} y={selStairs.y} onChange={(k, v) => onUpdateStairs(selStairs.id, { [k]: v })} />
                <SizeFields w={selStairs.width} h={selStairs.height} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Stairs
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ RAMP ═══ */}
        {selRamp && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Label">
                  <input value={selRamp.label} onChange={(e) => onUpdateRamp(selRamp.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. Wheelchair Ramp" />
                </Field>
                <Field label="Direction">
                  <select value={selRamp.direction ?? "both"} onChange={(e) => onUpdateRamp(selRamp.id, { direction: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                <Field label="Slope">
                  <select value={selRamp.slope ?? "gentle"} onChange={(e) => onUpdateRamp(selRamp.id, { slope: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="gentle">Gentle</option>
                    <option value="medium">Medium</option>
                    <option value="steep">Steep</option>
                  </select>
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!selRamp.handrails} onChange={(e) => onUpdateRamp(selRamp.id, { handrails: e.target.checked })}
                    className="rounded border-border accent-primary h-4 w-4" />
                  <span className="text-[11px] font-medium text-foreground">Handrails</span>
                </label>
                {/* ── Shared ID (for linking the same ramp across floors) ── */}
                <Field label="Shared ID">
                  <input value={selRamp.sharedId ?? ""} onChange={(e) => onUpdateRamp(selRamp.id, { sharedId: e.target.value || undefined })}
                    className={inputCls} placeholder="e.g. shared_ramp_mab_1" />
                </Field>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selRamp.x} y={selRamp.y} onChange={(k, v) => onUpdateRamp(selRamp.id, { [k]: v })} />
                <SizeFields w={selRamp.width} h={selRamp.height} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Ramp
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ ELEVATOR ═══ */}
        {selElevator && (
          <>
            {tab === "basic" && (
              <>
                <Field label="Label">
                  <input value={selElevator.label} onChange={(e) => onUpdateElevator(selElevator.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. Elevator" />
                </Field>
                <Field label="Door Width">
                  <input type="number" min={4} max={12} value={selElevator.doorWidth} onChange={(e) => onUpdateElevator(selElevator.id, { doorWidth: parseInt(e.target.value) || 6 })}
                    className={inputCls} />
                </Field>
                {/* ── Shared ID (for linking the same elevator across floors) ── */}
                <Field label="Shared ID">
                  <input value={selElevator.sharedId ?? ""} onChange={(e) => onUpdateElevator(selElevator.id, { sharedId: e.target.value || undefined })}
                    className={inputCls} placeholder="e.g. shared_el_mab_1" />
                </Field>
                {/* ── Connected floors display ── */}
                <Field label="Connected Floors">
                  <div className="px-3 py-2 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground min-h-[2rem]">
                    {selElevator.floors && selElevator.floors.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selElevator.floors.map((f) => (
                          <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-[9px] font-bold">
                            {f === 1 ? "Ground" : `Floor ${f}`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 italic">All floors (default)</span>
                    )}
                  </div>
                </Field>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selElevator.x} y={selElevator.y} onChange={(k, v) => onUpdateElevator(selElevator.id, { [k]: v })} />
                <SizeFields w={selElevator.width} h={selElevator.height} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Elevator
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ LABEL ═══ */}
        {selLabel && (
          <>
            {tab === "basic" && (
              <Field label="Text">
                <textarea value={selLabel.text} rows={2} onChange={(e) => onUpdateLabel(selLabel.id, { text: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </Field>
            )}
            {tab === "style" && (
              <>
                <Field label="Color">
                  <ColorPicker value={selLabel.color} onChange={(c) => onUpdateLabel(selLabel.id, { color: c })} />
                </Field>
                <Field label="Font Size">
                  <div className="flex items-center gap-2">
                    <input type="range" min={6} max={24} step={1} value={selLabel.fontSize}
                      onChange={(e) => onUpdateLabel(selLabel.id, { fontSize: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">{selLabel.fontSize}px</span>
                  </div>
                </Field>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selLabel.rotation}
                      onChange={(e) => onUpdateLabel(selLabel.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">{selLabel.rotation}°</span>
                  </div>
                </Field>
              </>
            )}
            {tab === "advanced" && (
              <>
                <PositionFields x={selLabel.x} y={selLabel.y} onChange={(k, v) => onUpdateLabel(selLabel.id, { [k]: v })} />
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Label
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Empty state if nothing selected but panel is open */}
        {!selItem && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Info className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs text-center">Select an item on the canvas<br />to see its properties here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
