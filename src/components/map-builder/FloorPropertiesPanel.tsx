import { useState, useEffect } from "react";
import { X, Info, Palette, Settings2, AlertTriangle, Navigation, Copy, Eye, EyeOff, Lock, Unlock, Layers } from "lucide-react";
import { NavigationRelationshipCard } from "./NavigationRelationshipCard";
import { ObjectIssueSection, type ObjectIssueItem } from "./ObjectIssueSection";
import { cn } from "../../lib/utils";
import { ColorPicker } from "../ui/ColorPicker";
import { ROOM_TYPES, ROOM_MAP, WALL_THICKNESSES } from "./constants";
import { stairDirectionsForFloorInOrder } from "../../lib/floorManagement";
import type {
  FloorRoom, FloorWall, FloorDoor, FloorWindow,
  FloorFurniture, FloorStairs, FloorRamp, FloorElevatorItem,
  FloorLabel, FloorSelection, FloorEditorMode,
} from "./types";
import { doorDisplayName, type EntranceIndoorLinkStatus } from "../../lib/entranceTransitions";

type TabId = "basic" | "style" | "advanced";

interface FloorPropertiesPanelProps {
  selected: FloorSelection | null;
  mode: FloorEditorMode;
  /** B7 Phase 2: live validation issues for the currently selected object. */
  issueItems?: ObjectIssueItem[];
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
  /** B5 Phase 3.2: floor-position context from canonical building floor order. */
  floorId?: string;
  buildingFloors?: Array<{ id: string; label: string; number: number }>;
  circulationGroups?: {
    stairs: CirculationGroupOption[];
    elevators: CirculationGroupOption[];
  };
  circulationNavStatus?: {
    kind: "stairs" | "elevator" | "ramp";
    linked: boolean;
    connectedFloors: { id: string; label: string }[];
    waitingFloors: { id: string; label: string }[];
    servedFloors?: { id: string; label: string; hasPhysical: boolean; linked: boolean; isLocal: boolean }[];
    title?: string;
    detail?: string;
    groupLabel?: string;
    connectionCount?: number;
  };
  physicalNavStatus?: {
    kind: "room" | "door" | "stairs" | "elevator" | "ramp";
    linked: boolean;
    title: string;
    detail: string;
    groupLabel?: string;
    connectionCount?: number;
  };
  entranceConnectionStatus?: EntranceIndoorLinkStatus;
  onAddPhysicalToNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onViewPhysicalInNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onRemovePhysicalFromNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onCirculationGroupChange?: (type: "stairs" | "elevator", objectId: string, sharedId: string | undefined) => void;
  onCreateCirculationGroup?: (type: "stairs" | "elevator", objectId: string, name: string) => void;
  onRenameCirculationGroup?: (type: "stairs" | "elevator", sharedId: string, name: string) => void;
  /** B5 Phase 3.2: jump straight to another floor (normal dirty-state rules). */
  onGoToFloor?: (floorId: string) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onSetSelectedState: (changes: { visible?: boolean; locked?: boolean }) => void;
  onLayerAction: (action: "bring-forward" | "send-backward" | "bring-front" | "send-back") => void;
  onClose: () => void;
}

export interface CirculationGroupOption {
  id: string;
  name: string;
  usedFloors: { id: string; label: string; objectId: string }[];
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

function SegmentControl<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-xl border border-border bg-muted/20 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-lg text-[10px] font-extrabold transition-all",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background hover:text-foreground",
            option.disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function effectiveDoorType(door: FloorDoor): "single" | "double" {
  return door.doorType ?? (door.direction === "double" ? "double" : "single");
}export function FloorPropertiesPanel({
  selected,
  mode,
  issueItems = [],
  rooms, walls, doors, windows, furniture, stairs, ramps, elevators, labels,
  onUpdateRoom, onUpdateWall, onUpdateDoor, onUpdateWindow,
  onUpdateFurniture,  onUpdateStairs, onUpdateRamp, onUpdateElevator, onUpdateLabel,
  onToggleNavConnection,
  onDeleteSelected, onDuplicateSelected, onSetSelectedState, onLayerAction, onClose,
  floorId, buildingFloors, circulationGroups, circulationNavStatus, physicalNavStatus,
  entranceConnectionStatus,
  onAddPhysicalToNavigation, onViewPhysicalInNavigation, onRemovePhysicalFromNavigation,
  onCirculationGroupChange, onCreateCirculationGroup, onRenameCirculationGroup, onGoToFloor,
}: FloorPropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  useEffect(() => { setTab("basic"); }, [selected]);

  if (!selected) return null;

  const selRoom = selected.type === "room" ? rooms.find((r) => r.id === selected.id) : undefined;
  const selWall = selected.type === "wall" ? walls.find((w) => w.id === selected.id) : undefined;
  const selDoor = selected.type === "door" ? doors.find((d) => d.id === selected.id) : undefined;
  const selWindow = selected.type === "window" ? windows.find((w) => w.id === selected.id) : undefined;
  const selDoorWall = selDoor?.wallId ? walls.find((w) => w.id === selDoor.wallId) : undefined;
  const selWindowWall = selWindow?.wallId ? walls.find((w) => w.id === selWindow.wallId) : undefined;
  const selFurniture = selected.type === "furniture" ? furniture.find((f) => f.id === selected.id) : undefined;
  const selStairs = selected.type === "stairs" ? stairs.find((s) => s.id === selected.id) : undefined;
  const selRamp = selected.type === "ramp" ? ramps.find((r) => r.id === selected.id) : undefined;
  const selElevator = selected.type === "elevator" ? elevators.find((e) => e.id === selected.id) : undefined;
  const selLabel = selected.type === "label" ? labels.find((l) => l.id === selected.id) : undefined;

  const selItem = selRoom || selWall || selDoor || selWindow || selFurniture || selStairs || selRamp || selElevator || selLabel;
  const openingInspector = !!(selDoor || selWindow);
  const compactInspector = !!(selWall || openingInspector || selFurniture || selStairs || selRamp || selElevator || selLabel);

  const contentType = selRoom ? "Room" : selWall ? "Wall" : selDoor ? "Door" : selWindow ? "Window"
    : selFurniture ? "Furniture" : selStairs ? "Stairs" : selRamp ? "Ramp" : selElevator ? "Elevator" : selLabel ? "Label" : "Item";
  const contentTitle = selDoor ? doorDisplayName(selDoor, { doors }) : contentType;
  const contentSubtitle = selDoor ? "Door" : undefined;

  const circulationSelection = selStairs
    ? { type: "stairs" as const, id: selStairs.id }
    : selRamp
      ? { type: "ramp" as const, id: selRamp.id }
      : selElevator
        ? { type: "elevator" as const, id: selElevator.id }
        : null;

  const physicalNavSelection = selRoom
    ? { type: "room" as const, id: selRoom.id }
    : selDoor
      ? { type: "door" as const, id: selDoor.id }
      : circulationSelection;

  const goToFloorButtons = (floors: { id: string; label: string }[]) => {
    if (!onGoToFloor || floors.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {floors.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid="nav-go-to-floor"
            onClick={() => onGoToFloor(f.id)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border bg-background/70 text-[9px] font-bold text-foreground hover:bg-muted hover:border-primary/40 transition-all"
          >
            Go to {f.label}
          </button>
        ))}
      </div>
    );
  };

  // B5 Phase 6.8: ONE shared NavigationRelationshipCard for every supported
  // physical object (Room/Door/Stair/Elevator/Ramp) — the SAME component the
  // Navigation-mode PhysicalNavPropertiesPanel renders, wired to the SAME
  // canonical add/view/remove callbacks. Only the View button label differs by
  // mode ("View in Navigation" vs "View Linked Node").
  const NavRelationshipCard = ({ kind }: { kind: "room" | "door" | "stairs" | "elevator" | "ramp" }) => {
    if (!physicalNavSelection) return null;
    const status = kind === "room" || kind === "door" ? physicalNavStatus : circulationNavStatus;
    if (!status || status.kind !== kind) return null;
    return (
      <NavigationRelationshipCard
        linked={status.linked}
        detail={status.detail}
        groupLabel={status.groupLabel}
        title={status.title}
        mode="design"
        connectionCount={status.connectionCount}
        onView={() => onViewPhysicalInNavigation(kind, physicalNavSelection.id)}
        onAdd={() => onAddPhysicalToNavigation(kind, physicalNavSelection.id)}
        onRemove={() => onRemovePhysicalFromNavigation(kind, physicalNavSelection.id)}
      />
    );
  };

  const EntranceConnectionStatus = () => {
    if (selected?.type !== "door" || !entranceConnectionStatus || entranceConnectionStatus.state === "not_linked") return null;
    return (
      <div className="pt-3 border-t border-border space-y-2">
        <span className={labelCls}>Entrance Connection</span>
        <div className={cn(
          "rounded-xl border px-3 py-3 space-y-2",
          entranceConnectionStatus.state === "linked" && !entranceConnectionStatus.warning
            ? "border-emerald-200/80 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300"
        )}>
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide">
            {entranceConnectionStatus.state === "linked" && !entranceConnectionStatus.warning ? <Navigation className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {entranceConnectionStatus.state === "linked" ? "Connected to" : "Indoor connection missing"}
          </div>
          {entranceConnectionStatus.state === "linked" && (
            <>
              <p className="text-[10px] leading-snug font-semibold">{entranceConnectionStatus.entranceName}</p>
              {entranceConnectionStatus.warning && (
                <p className="text-[9px] leading-snug font-semibold">{entranceConnectionStatus.warning}</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const CirculationNavigationStatus = () => {
    if (!circulationSelection || !circulationNavStatus) return null;
    const kind = circulationNavStatus.kind;
    const servedFloors = circulationNavStatus.servedFloors ?? [];
    const renderElevatorServedFloors = () => servedFloors.length > 0 ? (
      <div className="space-y-2">
        <div className="space-y-0.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Served Floors</p>
          <p className="text-[10px] leading-snug text-muted-foreground">
            {servedFloors.filter((f) => f.linked).length} of {servedFloors.length} served floors added to navigation.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {servedFloors.map((f) => (
            <span
              key={f.id}
              className={cn(
                "inline-flex items-center min-h-5 px-2 py-0.5 rounded-md border text-[9px] font-bold leading-tight",
                f.linked
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-400"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {f.linked ? "✓ " : "○ "}{f.label}{f.isLocal ? " (current)" : ""}{!f.linked ? " — Not added to navigation" : ""}
            </span>
          ))}
        </div>
      </div>
    ) : null;
    // B5 Phase 6.8: the shared card carries the link state + canonical actions;
    // the circulation-specific metadata (served floors / connected / waiting
    // floors + Go-to-floor shortcuts) stays as supplementary authoring info.
    return (
      <div className="space-y-2">
        <NavRelationshipCard kind={kind} />
        {kind === "stairs" && circulationNavStatus.linked && circulationNavStatus.connectedFloors.length > 0 && (
          <div className="pt-1">{goToFloorButtons(circulationNavStatus.connectedFloors)}</div>
        )}
        {kind === "elevator" && renderElevatorServedFloors()}
        {kind !== "ramp" && circulationNavStatus.waitingFloors.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <p className="text-[10px] leading-snug text-muted-foreground">
              {kind === "elevator"
                ? (circulationNavStatus.linked
                    ? `Waiting for linked elevator stops on ${circulationNavStatus.waitingFloors.map((f) => f.label).join(", ")}.`
                    : `Matches elevator stops on ${circulationNavStatus.waitingFloors.map((f) => f.label).join(", ")}.`)
                : `Matching stair on ${circulationNavStatus.waitingFloors.map((f) => f.label).join(", ")} is not added to navigation.`}
            </p>
            {goToFloorButtons(circulationNavStatus.waitingFloors)}
          </div>
        )}
      </div>
    );
  };

  const CirculationGroupControl = ({
    type,
    objectId,
    sharedId,
  }: {
    type: "stairs" | "elevator";
    objectId: string;
    sharedId?: string;
  }) => {
    const groups = type === "stairs" ? (circulationGroups?.stairs ?? []) : (circulationGroups?.elevators ?? []);
    const current = sharedId ? groups.find((g) => g.id === sharedId) : undefined;
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [renameName, setRenameName] = useState("");
    const noun = type === "stairs" ? "Stair Connection" : "Elevator Shaft";
    const duplicateMessage = (group: CirculationGroupOption) => {
      const duplicate = group.usedFloors.find((usage) => usage.id === floorId && usage.objectId !== objectId);
      return duplicate ? `${group.name} is already assigned to another ${type === "stairs" ? "stair" : "elevator"} on this floor.` : null;
    };
    const create = () => {
      const trimmed = newName.trim();
      if (!trimmed || !onCreateCirculationGroup) return;
      onCreateCirculationGroup(type, objectId, trimmed);
      setNewName("");
      setCreating(false);
      setOpen(false);
    };
    const rename = () => {
      const trimmed = renameName.trim();
      if (!trimmed || !current || !onRenameCirculationGroup) return;
      onRenameCirculationGroup(type, current.id, trimmed);
      setRenameName("");
    };
    return (
      <Field label={noun}>
        <div className="space-y-2">
          <button
            type="button"
            data-testid={`circulation-group-trigger-${type}`}
            onClick={() => setOpen((v) => !v)}
            className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs font-bold flex items-center justify-between hover:bg-muted/60 transition-colors"
          >
            <span className="truncate">{current?.name ?? "Not assigned"}</span>
            <span className="text-[9px] text-muted-foreground">Change</span>
          </button>
          {open && (
            <div className="rounded-xl border border-border bg-card p-2 shadow-xl space-y-1" data-testid="circulation-group-picker">
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                {type === "stairs" ? "Stair Connections" : "Elevator Shafts"}
              </div>
              <button
                type="button"
                onClick={() => { onCirculationGroupChange?.(type, objectId, undefined); setOpen(false); }}
                className="w-full text-left rounded-lg px-2 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted"
              >
                Not assigned
              </button>
              {groups.map((group) => {
                const duplicate = duplicateMessage(group);
                return (
                  <button
                    key={group.id}
                    type="button"
                    disabled={!!duplicate}
                    title={duplicate ?? undefined}
                    onClick={() => { onCirculationGroupChange?.(type, objectId, group.id); setOpen(false); }}
                    className={cn(
                      "w-full text-left rounded-lg px-2 py-1.5 transition-colors",
                      group.id === sharedId ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
                      duplicate && "opacity-50 cursor-not-allowed hover:bg-transparent"
                    )}
                  >
                    <div className="text-[10px] font-extrabold">{group.name}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {duplicate ?? (group.usedFloors.length > 0 ? `Used on: ${group.usedFloors.map((f) => f.label).join(", ")}` : "Not used yet")}
                    </div>
                  </button>
                );
              })}
              <div className="border-t border-border pt-1 mt-1">
                {creating ? (
                  <div className="space-y-1.5">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className={inputCls}
                      placeholder={type === "stairs" ? "East Stair" : "Main Elevator"}
                    />
                    <button type="button" onClick={create}
                      className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-[10px] font-extrabold">
                      Create
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCreating(true)}
                    className="w-full text-left rounded-lg px-2 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary/10">
                    + Create New {noun}
                  </button>
                )}
              </div>
            </div>
          )}
          {current && (
            <div className="grid grid-cols-[1fr_auto] gap-1">
              <input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className={inputCls}
                placeholder={`Rename ${current.name}`}
              />
              <button type="button" onClick={rename}
                className="h-9 px-3 rounded-xl border border-border text-[10px] font-extrabold text-foreground hover:bg-muted">
                Rename
              </button>
            </div>
          )}
        </div>
      </Field>
    );
  };

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

  const StateLayerControls = selItem ? (
    <div className="pt-3 border-t border-border space-y-2">
      <span className={labelCls}>State & Layer</span>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" onClick={() => onSetSelectedState({ visible: (selItem as any).visible === false })}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          {(selItem as any).visible === false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {(selItem as any).visible === false ? "Show" : "Hide"}
        </button>
        <button type="button" onClick={() => onSetSelectedState({ locked: !(selItem as any).locked })}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          {(selItem as any).locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {(selItem as any).locked ? "Unlock" : "Lock"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" onClick={() => onLayerAction("send-back")}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          <Layers className="h-3 w-3" /> Back
        </button>
        <button type="button" onClick={() => onLayerAction("bring-front")}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          <Layers className="h-3 w-3" /> Front
        </button>
        <button type="button" onClick={() => onLayerAction("send-backward")}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          <Layers className="h-3 w-3" /> Down
        </button>
        <button type="button" onClick={() => onLayerAction("bring-forward")}
          className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1">
          <Layers className="h-3 w-3" /> Up
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      data-testid="floor-properties-panel"
      className="w-64 shrink-0 flex flex-col border-l border-border overflow-hidden bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-foreground truncate">{contentTitle}</p>
          {contentSubtitle && <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{contentSubtitle}</p>}
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar — Furniture and Label objects use ONE unified inspector instead,
          so their few fields stay in a single scrollable panel for faster editing. */}
      {!compactInspector && (
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
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-4">
        {/* B7 Phase 2: contextual issue guidance for the selected object */}
        <ObjectIssueSection items={issueItems} />

        {StateLayerControls}

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
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width">
                    <input type="number" min={20} value={selRoom.w} onChange={(e) => onUpdateRoom(selRoom.id, { w: Math.max(20, parseInt(e.target.value) || 20) })} className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Height">
                    <input type="number" min={15} value={selRoom.h} onChange={(e) => onUpdateRoom(selRoom.id, { h: Math.max(15, parseInt(e.target.value) || 15) })} className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selRoom.rotation ?? 0}
                      onChange={(e) => onUpdateRoom(selRoom.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selRoom.rotation ?? 0} deg</span>
                  </div>
                </Field>
                <div className="pt-3 border-t border-border">
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Room</span>
                  </button>
                </div>
              </>
            )}
            <NavRelationshipCard kind="room" />
          </>
        )}

        {/* ═══ WALL ═══ */}
        {selWall && (
          <>
            {tab === "basic" && (
              <>
                {selWall.managedKind === "perimeter" && (
                  <div className="px-3 py-2 rounded-xl border border-primary/25 bg-primary/5 text-[10px] text-primary leading-relaxed">
                    <div className="font-extrabold uppercase tracking-wider">Managed Perimeter Wall</div>
                    <div className="mt-0.5 text-primary/80">Position follows Floor Settings; material, color, and thickness can be edited here.</div>
                  </div>
                )}
                <Field label="Thickness">
                  <div className="grid grid-cols-3 gap-1">
                    {WALL_THICKNESSES.map((t) => (
                      <button key={t.value} type="button" onClick={() => onUpdateWall(selWall.id, { thickness: t.value })}
                        className={cn("h-8 rounded-lg border text-[10px] font-bold transition-colors",
                          selWall.thickness === t.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted text-foreground")}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Material">
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      ["concrete", "Concrete", "#64748b", undefined],
                      ["brick", "Brick", "#991b1b", "2 2"],
                      ["wood", "Wood", "#92400e", "8 2 1 2"],
                      ["glass", "Glass", "#38bdf8", "5 3"],
                      ["drywall", "Drywall", "#64748b", "9 3"],
                    ].map(([value, label, color, dash]) => (
                      <button key={value} type="button" onClick={() => onUpdateWall(selWall.id, { material: value })}
                        className={cn("h-8 rounded-lg border px-2 text-left text-[10px] font-bold transition-colors flex items-center gap-1.5",
                          (selWall.material ?? "concrete") === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted text-foreground")}>
                        <svg viewBox="0 0 18 8" className="h-3.5 w-6 shrink-0" aria-hidden="true">
                          <line x1={1} y1={4} x2={17} y2={4} stroke={color} strokeWidth={3} strokeLinecap="butt" strokeDasharray={dash} />
                        </svg>
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Color">
                  <ColorPicker value={selWall.color} onChange={(c) => onUpdateWall(selWall.id, { color: c })} />
                </Field>
                <div className="px-2.5 py-2 rounded-xl border border-border text-[10px] bg-muted/30 text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Length</span><span className="font-mono font-bold">{Math.round(Math.sqrt((selWall.x2 - selWall.x1) ** 2 + (selWall.y2 - selWall.y1) ** 2))}</span></div>
                  <div className="flex justify-between"><span>Angle</span><span className="font-mono font-bold">{Math.round((Math.atan2(selWall.y2 - selWall.y1, selWall.x2 - selWall.x1) * 180) / Math.PI)}°</span></div>
                </div>
                <div className="pt-3 border-t border-border space-y-2">
                  <button onClick={onDuplicateSelected}
                    className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
                  </button>
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Wall</span>
                  </button>
                </div>
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
            {(openingInspector || tab === "basic") && (
              <>
                <Field label="Label">
                  <input value={selDoor.label ?? ""} onChange={(e) => onUpdateDoor(selDoor.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. Main Entrance" />
                </Field>
                {selDoor.wallId ? (
                  <>
                    <Field label="Attached Wall">
                      <div className="h-9 px-3 rounded-xl border border-border bg-muted/20 text-[11px] font-mono text-muted-foreground flex items-center">
                        {selDoorWall ? selDoor.wallId : "Missing wall"}
                      </div>
                    </Field>
                    <Field label="Position Along Wall">
                      <input type="number" min={0} max={100} value={Math.round((selDoor.offset ?? 0.5) * 100)}
                        onChange={(e) => onUpdateDoor(selDoor.id, { offset: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)) })}
                        className={`${inputCls} font-mono`} />
                    </Field>
                  </>
                ) : (
                  <PositionFields x={selDoor.x} y={selDoor.y} onChange={(k, v) => onUpdateDoor(selDoor.id, { [k]: v })} />
                )}
                <Field label="Width">
                  <input type="number" min={effectiveDoorType(selDoor) === "double" ? 28 : 10} max={effectiveDoorType(selDoor) === "double" ? 72 : 48} value={selDoor.width} onChange={(e) => onUpdateDoor(selDoor.id, { width: parseInt(e.target.value) || (effectiveDoorType(selDoor) === "double" ? 36 : 18) })}
                    className={`${inputCls} font-mono`} />
                </Field>
                <Field label="Door Type">
                  <SegmentControl
                    value={effectiveDoorType(selDoor)}
                    options={[{ value: "single", label: "Single" }, { value: "double", label: "Double" }]}
                    onChange={(doorType) => onUpdateDoor(selDoor.id, { doorType, direction: doorType === "double" ? "double" : (selDoor.hinge ?? "left") })}
                  />
                </Field>
                {effectiveDoorType(selDoor) === "single" && (
                  <Field label="Hinge">
                    <SegmentControl
                      value={(selDoor.hinge ?? (selDoor.direction === "right" ? "right" : "left")) as "left" | "right"}
                      options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]}
                      onChange={(hinge) => onUpdateDoor(selDoor.id, { hinge, direction: hinge })}
                    />
                  </Field>
                )}
                <Field label="Swing Side">
                  <SegmentControl
                    value={(selDoor.swingSide ?? "a") as "a" | "b"}
                    options={[{ value: "a", label: "Side A" }, { value: "b", label: "Side B" }]}
                    onChange={(swingSide) => onUpdateDoor(selDoor.id, { swingSide })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-1">
                  {effectiveDoorType(selDoor) === "single" && <button type="button" onClick={() => {
                    const current = (selDoor.hinge ?? (selDoor.direction === "right" ? "right" : "left")) as "left" | "right";
                    const hinge = current === "left" ? "right" : "left";
                    onUpdateDoor(selDoor.id, { hinge, direction: hinge });
                  }}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    Flip Hinge
                  </button>}
                  <button type="button" onClick={() => onUpdateDoor(selDoor.id, { swingSide: (selDoor.swingSide ?? "a") === "a" ? "b" : "a" })}
                    className={cn("h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors", effectiveDoorType(selDoor) === "double" && "col-span-2")}>
                    Flip Swing
                  </button>
                </div>
                <Field label="Color">
                  <ColorPicker value={selDoor.color} onChange={(c) => onUpdateDoor(selDoor.id, { color: c })} />
                </Field>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => onSetSelectedState({ visible: selDoor.visible === false })}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
                    {selDoor.visible === false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {selDoor.visible === false ? "Show" : "Hide"}
                  </button>
                  <button type="button" onClick={() => onSetSelectedState({ locked: !selDoor.locked })}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
                    {selDoor.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {selDoor.locked ? "Unlock" : "Lock"}
                  </button>
                </div>
                <NavRelationshipCard kind="door" />
                <EntranceConnectionStatus />
                <div className="pt-3 border-t border-border grid grid-cols-2 gap-1">
                  <button onClick={onDuplicateSelected}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    Copy Door
                  </button>
                  <button onClick={onDeleteSelected}
                    className="h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
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
            {(openingInspector || tab === "basic") && (
              <>
                {selWindow.wallId ? (
                  <>
                    <Field label="Attached Wall">
                      <div className="h-9 px-3 rounded-xl border border-border bg-muted/20 text-[11px] font-mono text-muted-foreground flex items-center">
                        {selWindowWall ? selWindow.wallId : "Missing wall"}
                      </div>
                    </Field>
                    <Field label="Position Along Wall">
                      <input type="number" min={0} max={100} value={Math.round((selWindow.offset ?? 0.5) * 100)}
                        onChange={(e) => onUpdateWindow(selWindow.id, { offset: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)) })}
                        className={`${inputCls} font-mono`} />
                    </Field>
                  </>
                ) : (
                  <PositionFields x={selWindow.x} y={selWindow.y} onChange={(k, v) => onUpdateWindow(selWindow.id, { [k]: v })} />
                )}
                <Field label="Width">
                  <input type="number" min={10} max={72} value={selWindow.width} onChange={(e) => onUpdateWindow(selWindow.id, { width: parseInt(e.target.value) || 28 })}
                    className={`${inputCls} font-mono`} />
                </Field>
                <Field label="Color">
                  <ColorPicker value={selWindow.color} onChange={(c) => onUpdateWindow(selWindow.id, { color: c })} />
                </Field>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => onSetSelectedState({ visible: selWindow.visible === false })}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
                    {selWindow.visible === false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {selWindow.visible === false ? "Show" : "Hide"}
                  </button>
                  <button type="button" onClick={() => onSetSelectedState({ locked: !selWindow.locked })}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
                    {selWindow.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {selWindow.locked ? "Unlock" : "Lock"}
                  </button>
                </div>
                <div className="pt-3 border-t border-border grid grid-cols-2 gap-1">
                  <button onClick={onDuplicateSelected}
                    className="h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    Copy Window
                  </button>
                  <button onClick={onDeleteSelected}
                    className="h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Window
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ FURNITURE ═══ — one unified inspector: Identity, Appearance & Size, Actions */}
        {selFurniture && (
          <>
            <Field label="Name">
              <input value={selFurniture.name} onChange={(e) => onUpdateFurniture(selFurniture.id, { name: e.target.value })}
                className={inputCls} placeholder="Item name" />
            </Field>
            <Field label="Type">
              <span className="block w-full h-9 px-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground flex items-center capitalize">
                {selFurniture.type.replace(/-/g, " ")}
              </span>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Width">
                <input
                  type="number"
                  min={8}
                  value={selFurniture.width}
                  onChange={(e) => onUpdateFurniture(selFurniture.id, { width: Math.max(8, parseInt(e.target.value) || 8) })}
                  className={`${inputCls} font-mono`}
                />
              </Field>
              <Field label="Height">
                <input
                  type="number"
                  min={8}
                  value={selFurniture.height}
                  onChange={(e) => onUpdateFurniture(selFurniture.id, { height: Math.max(8, parseInt(e.target.value) || 8) })}
                  className={`${inputCls} font-mono`}
                />
              </Field>
            </div>
            <Field label="Rotation">
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={360} step={15} value={selFurniture.rotation}
                  onChange={(e) => onUpdateFurniture(selFurniture.id, { rotation: parseInt(e.target.value) })}
                  className="flex-1 h-1.5 accent-primary" />
                <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selFurniture.rotation}°</span>
              </div>
            </Field>
            <Field label="Color">
              <ColorPicker value={selFurniture.color} onChange={(c) => onUpdateFurniture(selFurniture.id, { color: c })} />
            </Field>
            <div className="pt-3 border-t border-border space-y-2">
              <button onClick={onDuplicateSelected}
                className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
              </button>
              <button onClick={onDeleteSelected}
                className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete {selFurniture.name}</span>
              </button>
            </div>
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
                {/* B5 Phase 2.3: compact custom Direction control (Up / Down /
                    Both) — no native select, matches NaviSync control language.
                    B5 Phase 3.1: options are context-aware — a stair on the
                    lowest floor cannot choose Down (no floor below), on the
                    highest floor cannot choose Up (no floor above), and a
                    single-floor building offers no cross-floor direction at all. */}
                {(() => {
                  const floors = buildingFloors && buildingFloors.length > 0 ? buildingFloors : [{ id: floorId ?? "current", label: "Current floor", number: 1 }];
                  const currentId = floorId ?? floors[0]?.id ?? "current";
                  const allowed = stairDirectionsForFloorInOrder(currentId, floors);
                  const singleFloor = floors.length <= 1;
                  const invalid = !singleFloor && !allowed.includes(selStairs.direction);
                  return (
                    <Field label="Direction">
                      {/* B5 Phase 3.1: testid scopes the Direction options so
                          tests (and users) can tell them apart from the panel's
                          layer-control Up/Down buttons. */}
                      <div data-testid="stair-direction-control">
                        <SegmentControl
                          value={selStairs.direction}
                          options={[
                            { value: "up" as const, label: "Up", disabled: !allowed.includes("up") },
                            { value: "down" as const, label: "Down", disabled: !allowed.includes("down") },
                            { value: "both" as const, label: "Both", disabled: !allowed.includes("both") },
                          ]}
                          onChange={(direction) => onUpdateStairs(selStairs.id, { direction })}
                        />
                      </div>
                      {singleFloor && !invalid && (
                        <p className="mt-1 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-snug">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          This building has only one floor — direction has no cross-floor effect.
                        </p>
                      )}
                      {invalid && (
                        <p className="mt-1 flex items-start gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-snug" data-testid="stair-direction-invalid">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          Stair direction is invalid for this floor — no floor{' '}
                          {selStairs.direction === "down" ? "below" : selStairs.direction === "up" ? "above" : "connection"} available.
                        </p>
                      )}
                    </Field>
                  );
                })()}
                {/* ── Shared ID (for linking the same stairwell across floors) ── */}
                <CirculationGroupControl type="stairs" objectId={selStairs.id} sharedId={selStairs.sharedId} />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!selStairs.accessible} onChange={(e) => onUpdateStairs(selStairs.id, { accessible: e.target.checked })}
                    className="rounded border-border accent-primary h-4 w-4" />
                  <span className="text-[11px] font-medium text-foreground">Wheelchair accessible</span>
                </label>
                <CirculationNavigationStatus />
                <PositionFields x={selStairs.x} y={selStairs.y} onChange={(k, v) => onUpdateStairs(selStairs.id, { [k]: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width">
                    <input type="number" min={16} value={selStairs.width} onChange={(e) => onUpdateStairs(selStairs.id, { width: Math.max(16, parseInt(e.target.value) || 16) })} className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Height">
                    <input type="number" min={12} value={selStairs.height} onChange={(e) => onUpdateStairs(selStairs.id, { height: Math.max(12, parseInt(e.target.value) || 12) })} className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selStairs.rotation ?? 0}
                      onChange={(e) => onUpdateStairs(selStairs.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selStairs.rotation ?? 0}Â°</span>
                  </div>
                </Field>
                <div className="pt-3 border-t border-border space-y-2">
                  <button onClick={onDuplicateSelected}
                    className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
                  </button>
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Stairs
                  </button>
                </div>
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
                {/* ── Shared ID (for linking the same ramp across floors) ── */}
                <CirculationNavigationStatus />
                <PositionFields x={selRamp.x} y={selRamp.y} onChange={(k, v) => onUpdateRamp(selRamp.id, { [k]: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width">
                    <input type="number" min={16} value={selRamp.width} onChange={(e) => onUpdateRamp(selRamp.id, { width: Math.max(16, parseInt(e.target.value) || 16) })} className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Height">
                    <input type="number" min={12} value={selRamp.height} onChange={(e) => onUpdateRamp(selRamp.id, { height: Math.max(12, parseInt(e.target.value) || 12) })} className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selRamp.rotation ?? 0}
                      onChange={(e) => onUpdateRamp(selRamp.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selRamp.rotation ?? 0}Â°</span>
                  </div>
                </Field>
                <div className="pt-3 border-t border-border space-y-2">
                  <button onClick={onDuplicateSelected}
                    className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
                  </button>
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Ramp
                  </button>
                </div>
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
                <CirculationGroupControl type="elevator" objectId={selElevator.id} sharedId={selElevator.sharedId} />
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
                <CirculationNavigationStatus />
                <PositionFields x={selElevator.x} y={selElevator.y} onChange={(k, v) => onUpdateElevator(selElevator.id, { [k]: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width">
                    <input type="number" min={14} value={selElevator.width} onChange={(e) => onUpdateElevator(selElevator.id, { width: Math.max(14, parseInt(e.target.value) || 14) })} className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Height">
                    <input type="number" min={14} value={selElevator.height} onChange={(e) => onUpdateElevator(selElevator.id, { height: Math.max(14, parseInt(e.target.value) || 14) })} className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Rotation">
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={360} step={15} value={selElevator.rotation ?? 0}
                      onChange={(e) => onUpdateElevator(selElevator.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 accent-primary" />
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{selElevator.rotation ?? 0}Â°</span>
                  </div>
                </Field>
                <div className="pt-3 border-t border-border space-y-2">
                  <button onClick={onDuplicateSelected}
                    className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                    <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
                  </button>
                  <button onClick={onDeleteSelected}
                    className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                    Delete Elevator
                  </button>
                </div>
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

        {/* ═══ LABEL ═══ — one unified inspector with real text controls */}
        {selLabel && (
          <>
            <Field label="Text">
              <textarea autoFocus aria-label="Label text" value={selLabel.text} rows={2} onChange={(e) => onUpdateLabel(selLabel.id, { text: e.target.value })}
                placeholder="Type annotation text…"
                className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </Field>
            <Field label="Font Size">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Decrease label font size"
                  onClick={() => onUpdateLabel(selLabel.id, { fontSize: Math.max(6, selLabel.fontSize - 1) })}
                  className="h-8 w-8 rounded-lg border border-border text-[11px] font-extrabold text-foreground hover:bg-muted transition-colors"
                >
                  A-
                </button>
                <input aria-label="Label font size" type="range" min={6} max={24} step={1} value={selLabel.fontSize}
                  onChange={(e) => onUpdateLabel(selLabel.id, { fontSize: parseInt(e.target.value) })}
                  className="flex-1 h-1.5 accent-primary" />
                <input
                  aria-label="Exact label font size"
                  type="number"
                  min={6}
                  max={24}
                  value={selLabel.fontSize}
                  onChange={(e) => onUpdateLabel(selLabel.id, { fontSize: Math.max(6, Math.min(24, parseInt(e.target.value) || 12)) })}
                  className="h-8 w-12 rounded-lg border border-border bg-input-background px-1.5 text-center text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  aria-label="Increase label font size"
                  onClick={() => onUpdateLabel(selLabel.id, { fontSize: Math.min(24, selLabel.fontSize + 1) })}
                  className="h-8 w-8 rounded-lg border border-border text-[11px] font-extrabold text-foreground hover:bg-muted transition-colors"
                >
                  A+
                </button>
              </div>
            </Field>
            <Field label="Text Color">
              <ColorPicker value={selLabel.color} onChange={(c) => onUpdateLabel(selLabel.id, { color: c })} />
            </Field>
            <Field label="Alignment">
              <SegmentControl
                value={selLabel.align ?? "left"}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(align) => onUpdateLabel(selLabel.id, { align })}
              />
            </Field>
            <Field label="Rotation">
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={360} step={15} value={selLabel.rotation}
                  onChange={(e) => onUpdateLabel(selLabel.id, { rotation: parseInt(e.target.value) })}
                  className="flex-1 h-1.5 accent-primary" />
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">{selLabel.rotation}°</span>
              </div>
            </Field>
            <div className="pt-3 border-t border-border space-y-2">
              <button onClick={onDuplicateSelected}
                className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                <span className="flex items-center justify-center gap-1.5"><Copy className="h-3 w-3" /> Duplicate</span>
              </button>
              <button onClick={onDeleteSelected}
                className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                Delete Label
              </button>
            </div>
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
