import { useState, useEffect, useRef } from "react";
import { X, Info, Palette, Settings2, AlertTriangle, Navigation, Copy, Eye, EyeOff, Lock, Unlock, Layers, FlipHorizontal } from "lucide-react";
import { NavigationRelationshipCard } from "./NavigationRelationshipCard";
import { ObjectIssueSection, type ObjectIssueItem } from "./ObjectIssueSection";
import { cn } from "../../lib/utils";
import { ColorPicker } from "../ui/ColorPicker";
import { ROOM_MAP, WALL_THICKNESSES } from "./constants";
import { stairContinuationDirectionAllows, stairDirectionsForFloorInOrder } from "../../lib/floorManagement";
import type {
  FloorRoom, FloorWall, FloorDoor, FloorWindow,
  FloorFurniture, FloorStairs, FloorRamp, FloorElevatorItem,
  FloorLabel, FloorSelection, FloorEditorMode,
} from "./types";
import { elevatorSystemNumberOf } from "./types";
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
  onApplyWallStyleToFloor?: (style: { color: string; thickness: number; material: string }) => void;
  /** @deprecated compatibility for existing embedders; style action is preferred. */
  onApplyWallColorToFloor?: (color: string) => void;
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
    directionBlockedFloors?: { id: string; label: string }[];
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
  roomDoorStatus?: {
    state: "not_added" | "door_needed" | "door_invalid" | "door_not_connected" | "ready";
    doorId?: string;
    doorName?: string;
    doorIds?: string[];
    doorNames?: string[];
    connectionCount: number;
  };
  entranceConnectionStatus?: EntranceIndoorLinkStatus;
  onAddPhysicalToNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onViewPhysicalInNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onRemovePhysicalFromNavigation: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onLinkRoomDoor?: (roomId: string, mode?: "replace" | "add") => void;
  onSelectRoomDoor?: (doorId: string) => void;
  onRemoveRoomDoor?: (roomId: string, doorId: string) => void;
  onHoverRoomDoor?: (doorId: string | null) => void;
  onCirculationGroupChange?: (type: "stairs" | "elevator", objectId: string, sharedId: string | undefined) => void;
  onElevatorConnectionChange?: (elevatorId: string, targetFloorId: string, targetElevatorId: string) => void;
  onElevatorConnectionsChange?: (elevatorId: string, targets: Array<{ targetFloorId: string; targetElevatorId: string }>) => void;
  onElevatorConnectionDisconnect?: (elevatorId: string, targetFloorId: string, targetElevatorId: string) => void;
  onElevatorConnectionsDisconnectAll?: (elevatorId: string) => void;
  /** Stair-only relationship operations target one exact occurrence on one floor. */
  onStairConnectionChange?: (stairId: string, targetFloorId: string, targetStairId: string) => void;
  /** Commit several explicitly confirmed adjacent Stair links as one action. */
  onStairConnectionsChange?: (stairId: string, targets: Array<{ targetFloorId: string; targetStairId: string }>) => void;
  onStairConnectionDisconnect?: (stairId: string, targetFloorId: string, targetStairId: string) => void;
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
  usedFloors: { id: string; label: string; objectId: string; objectLabel?: string; systemNumber?: number }[];
}

type StairConnectionCandidate = CirculationGroupOption["usedFloors"][number] & {
  groupId: string;
  identityMatch: boolean;
  labelMatch: boolean;
  /** This occurrence is already part of a different multi-floor identity. */
  ownedByOther?: boolean;
  /** The destination shaft already has another occurrence on the current floor. */
  floorAlreadyOccupied?: boolean;
};

interface StairConnectionDraft {
  objectId: string;
  changingFloorId: string | null;
  pending: {
    floorId: string;
    floorLabel: string;
    candidate: StairConnectionCandidate;
  } | null;
}

interface StairMatchingConnection {
  targetFloorId: string;
  targetFloorLabel: string;
  targetStairId: string;
  targetStairLabel: string;
  relation: "above" | "below";
}

interface StairMatchingDraft {
  objectId: string;
  connections: StairMatchingConnection[];
}

interface ElevatorConnectionDraft {
  objectId: string;
  changingFloorId: string | null;
  /** Change detaches this exact occurrence; normal browsing must not merge shafts. */
  changeMode?: boolean;
  pending: {
    floorId: string;
    floorLabel: string;
    candidate: StairConnectionCandidate;
  } | null;
}

interface ElevatorRemovalDraft {
  objectId: string;
  floorId: string;
  floorLabel: string;
  targetElevatorId: string;
  targetElevatorLabel: string;
}

interface ElevatorDisconnectAllDraft {
  objectId: string;
  label: string;
  floorCount: number;
}

interface ElevatorMatchingConnection {
  targetFloorId: string;
  targetFloorLabel: string;
  targetElevatorId: string;
  targetElevatorLabel: string;
}

interface ElevatorMatchingDraft {
  objectId: string;
  connections: ElevatorMatchingConnection[];
}

/** Keep repeated generic Stair labels distinguishable without exposing IDs. */
function stairUsageLabel(
  usage: { objectId: string; objectLabel?: string },
  peers: { objectId: string; objectLabel?: string }[],
): string {
  const raw = usage.objectLabel?.trim() || "Stair";
  const sameLabel = peers.filter((peer) => (peer.objectLabel?.trim() || "Stair").toLowerCase() === raw.toLowerCase());
  if (sameLabel.length <= 1) return raw;
  const ordinal = sameLabel.findIndex((peer) => peer.objectId === usage.objectId) + 1;
  const generic = /^stairs?$/i.test(raw);
  return `${generic ? "Stair" : raw} ${ordinal > 0 ? ordinal : ""}`.trim();
}

/** Labels are only a picker hint.  Shared identity remains authoritative. */
function normalizedStairLabel(label?: string): string {
  return label?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function isUsefulStairLabel(label?: string): boolean {
  const normalized = normalizedStairLabel(label);
  return !!normalized && !/^(?:stair|stairs|staircase)$/.test(normalized);
}

function stairLabelsMatch(selected?: string, candidate?: string): boolean {
  if (!isUsefulStairLabel(selected) || !isUsefulStairLabel(candidate)) return false;
  return normalizedStairLabel(selected) === normalizedStairLabel(candidate);
}

/** Shared inspector primitives. Exterior architecture inspectors consume the
 * same label/value language as the room/door/stair inspector instead of
 * maintaining a second, oversized typography scale. */
export const FLOOR_PROPERTY_INPUT_CLASS = "w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
export const FLOOR_PROPERTY_LABEL_CLASS = "block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground";

const inputCls = FLOOR_PROPERTY_INPUT_CLASS;
const labelCls = FLOOR_PROPERTY_LABEL_CLASS;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
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
  onApplyWallStyleToFloor,
  onApplyWallColorToFloor,
  onUpdateFurniture,  onUpdateStairs, onUpdateRamp, onUpdateElevator, onUpdateLabel,
  onToggleNavConnection,
  onDeleteSelected, onDuplicateSelected, onSetSelectedState, onLayerAction, onClose,
  floorId, buildingFloors, circulationGroups, circulationNavStatus, physicalNavStatus,
  entranceConnectionStatus,
  roomDoorStatus,
  onAddPhysicalToNavigation, onViewPhysicalInNavigation, onRemovePhysicalFromNavigation,
  onLinkRoomDoor, onSelectRoomDoor, onRemoveRoomDoor, onHoverRoomDoor,
  onCirculationGroupChange, onElevatorConnectionChange, onElevatorConnectionsChange, onElevatorConnectionDisconnect,
  onElevatorConnectionsDisconnectAll,
  onStairConnectionChange, onStairConnectionsChange, onStairConnectionDisconnect, onCreateCirculationGroup, onRenameCirculationGroup, onGoToFloor,
}: FloorPropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("basic");
  const [confirmWallStyleApply, setConfirmWallStyleApply] = useState(false);
  // Keep the connection-manager mode in the stable parent component.  The
  // control below is declared inline for its existing data access, so storing
  // this state there would remount it (and close the panel) on any parent
  // refresh.
  const [openCirculationType, setOpenCirculationType] = useState<"stairs" | "elevator" | null>(null);
  // Candidate confirmation belongs to the parent as well. The circulation
  // control is declared inline for legacy data access and can remount when
  // the floor refreshes; keeping the draft here prevents a pending Connect
  // action from disappearing before the admin confirms it.
  const [stairConnectionDraft, setStairConnectionDraft] = useState<StairConnectionDraft | null>(null);
  const [stairMatchingDraft, setStairMatchingDraft] = useState<StairMatchingDraft | null>(null);
  const [elevatorConnectionDraft, setElevatorConnectionDraft] = useState<ElevatorConnectionDraft | null>(null);
  const [elevatorMatchingDraft, setElevatorMatchingDraft] = useState<ElevatorMatchingDraft | null>(null);
  const [elevatorRemovalDraft, setElevatorRemovalDraft] = useState<ElevatorRemovalDraft | null>(null);
  const [elevatorDisconnectAllDraft, setElevatorDisconnectAllDraft] = useState<ElevatorDisconnectAllDraft | null>(null);
  // The manager is declared inline for access to the current floor data. Keep
  // collapse state above it so a parent refresh/floor hydration cannot reopen
  // every row or discard the administrator's current view.
  const [elevatorCollapsedFloors, setElevatorCollapsedFloors] = useState<Record<string, boolean>>({});
  const applyWallStyle = onApplyWallStyleToFloor ?? ((style: { color: string; thickness: number; material: string }) => onApplyWallColorToFloor?.(style.color));
  useEffect(() => {
    setTab("basic");
    setOpenCirculationType(null);
    setStairConnectionDraft(null);
    setStairMatchingDraft(null);
    setElevatorConnectionDraft(null);
    setElevatorMatchingDraft(null);
    setElevatorRemovalDraft(null);
    setElevatorDisconnectAllDraft(null);
    setElevatorCollapsedFloors({});
  }, [selected?.type, selected?.id]);

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
  const selectedElevatorGroup = selElevator?.sharedId
    ? circulationGroups?.elevators.find((group) => group.id === selElevator.sharedId)
    : undefined;

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
  // canonical add/view/remove callbacks. Door Properties already has the Door
  // selected, so it intentionally omits the disruptive camera-jump action.
  const NavRelationshipCard = ({ kind }: { kind: "room" | "door" | "stairs" | "elevator" | "ramp" }) => {
    if (!physicalNavSelection) return null;
    const status = kind === "room" || kind === "door" ? physicalNavStatus : circulationNavStatus;
    if (!status || status.kind !== kind) return null;
    return (
      <NavigationRelationshipCard
        linked={status.linked}
        detail={status.detail}
        groupLabel={kind === "stairs" ? undefined : status.groupLabel}
        title={status.title}
        mode="design"
        connectionCount={status.connectionCount}
        showView={false}
        onView={() => onViewPhysicalInNavigation(kind, physicalNavSelection.id)}
        onAdd={() => onAddPhysicalToNavigation(kind, physicalNavSelection.id)}
        onRemove={() => onRemovePhysicalFromNavigation(kind, physicalNavSelection.id)}
      />
    );
  };

  const RoomNavigationCard = () => {
    if (!selRoom || !physicalNavStatus || physicalNavStatus.kind !== "room") return null;
    if (!physicalNavStatus.linked) {
      return (
        <NavigationRelationshipCard
          linked={false}
          detail="This Room is not available as a navigation destination."
          title="Room"
          mode="design"
          showView={false}
          onAdd={() => onAddPhysicalToNavigation("room", selRoom.id)}
          onRemove={() => onRemovePhysicalFromNavigation("room", selRoom.id)}
        />
      );
    }
    const state = roomDoorStatus?.state ?? "door_needed";
    const ready = state === "ready";
    const linkedDoor = roomDoorStatus?.doorName;
    const linkedDoors = roomDoorStatus?.doorNames ?? (linkedDoor ? [linkedDoor] : []);
    const linkedDoorIds = roomDoorStatus?.doorIds ?? (roomDoorStatus?.doorId ? [roomDoorStatus.doorId] : []);
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-3" data-testid="room-navigation-card">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Navigation</p>
          <p className="mt-1 text-[11px] font-extrabold text-foreground">
            {ready ? "Ready for routing ✓" : state === "door_needed" ? "Room entrance needed" : state === "door_invalid" ? "Room Door needs attention" : "Indoor connection needed"}
          </p>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            {ready
              ? "Door connected to the Walking Network ✓"
              : state === "door_needed"
                ? "Choose the Door used to enter this Room."
                : state === "door_invalid"
                  ? "Choose a Door on this Room's boundary."
                  : "The Room Door is not connected to the Walking Network."}
          </p>
        </div>
        {linkedDoors.length > 0 && (
          <div className="rounded-lg border border-border bg-background/60 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Room access · {linkedDoors.length} Door{linkedDoors.length === 1 ? "" : "s"}</p>
            {linkedDoors.map((name, index) => <div key={`${linkedDoorIds[index] ?? name}`} className="mt-0.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-primary/5" onMouseEnter={() => linkedDoorIds[index] && onHoverRoomDoor?.(linkedDoorIds[index])} onMouseLeave={() => onHoverRoomDoor?.(null)}>
              <button type="button" className="min-w-0 flex-1 text-left text-[11px] font-bold text-foreground truncate hover:text-primary" onClick={() => linkedDoorIds[index] && onSelectRoomDoor?.(linkedDoorIds[index])}>{name}</button>
              {linkedDoorIds[index] && onRemoveRoomDoor && <button type="button" aria-label={`Remove ${name} from Room`} onClick={() => onRemoveRoomDoor(selRoom.id, linkedDoorIds[index])} className="shrink-0 rounded px-1 text-[9px] font-bold text-destructive hover:bg-destructive/10">Remove</button>}
            </div>)}
          </div>
        )}
        <div className="space-y-1.5">
          {linkedDoors.length === 0 && (
            <button type="button" data-testid="link-room-door" onClick={() => onLinkRoomDoor?.(selRoom.id)}
              className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-[10px] font-extrabold hover:opacity-90 transition-opacity">
              Link Room Door
            </button>
          )}
          {linkedDoors.length > 0 && (
            <>
              <button type="button" data-testid="add-room-door" onClick={() => onLinkRoomDoor?.(selRoom.id, "add")}
                className="w-full h-8 rounded-lg border border-primary/30 bg-primary/5 text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors">
                Add Door
              </button>
            </>
          )}
          <button type="button" data-testid="remove-room-navigation" onClick={() => onRemovePhysicalFromNavigation("room", selRoom.id)}
            className="w-full h-8 rounded-lg border border-destructive/30 text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-colors">
            Remove from Navigation
          </button>
        </div>
      </div>
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
    const directionBlockedFloors = circulationNavStatus.directionBlockedFloors ?? [];
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
        {kind === "stairs" && directionBlockedFloors.length > 0 && (
          <p className="pt-1 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            Direction does not allow travel to {directionBlockedFloors.map((f) => f.label).join(", ")}.
          </p>
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
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const stairDraft = type === "stairs" && stairConnectionDraft?.objectId === objectId
      ? stairConnectionDraft
      : null;
    const changingFloorId = stairDraft?.changingFloorId ?? null;
    const pendingStairCandidate = stairDraft?.pending ?? null;
    const confirmationRef = useRef<HTMLDivElement | null>(null);
    const matchingConfirmationRef = useRef<HTMLDivElement | null>(null);
    const open = openCirculationType === type;
    const noun = type === "stairs" ? "Continues To" : "Elevator Connections";
    const selectedStair = type === "stairs" ? stairs.find((stair) => stair.id === objectId) : undefined;
    const currentFloorIndex = type === "stairs"
      ? (buildingFloors ?? []).findIndex((floor) => floor.id === floorId)
      : -1;
    const stairDirection = selectedStair?.direction ?? "both";
    const isAdjacentFloor = (candidateFloorId: string) => {
      if (currentFloorIndex < 0) return true;
      const candidateIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === candidateFloorId);
      return candidateIndex >= 0 && Math.abs(candidateIndex - currentFloorIndex) === 1;
    };
    const canContinueToFloor = (candidateFloorId: string) => type !== "stairs"
      || (currentFloorIndex < 0
        ? true
        : isAdjacentFloor(candidateFloorId) && stairContinuationDirectionAllows(
          stairDirection,
          currentFloorIndex,
          (buildingFloors ?? []).findIndex((floor) => floor.id === candidateFloorId),
        ));
    const continuationRows = type === "stairs"
      ? (current?.usedFloors ?? []).filter((usage) => usage.id !== floorId && usage.objectId !== objectId)
      : [];
    const validContinuationRows = continuationRows.filter((usage) => canContinueToFloor(usage.id));
    const invalidContinuationRows = continuationRows.filter((usage) => !canContinueToFloor(usage.id));
    // Only adjacent rows blocked by the authored direction are actionable
    // issues.  A shared Stair identity can legitimately include occurrences
    // farther away in the chain, and a valid upper/lower continuation means
    // the opposite side is not a missing requirement for this occurrence.
    const directionBlockedRows = continuationRows.filter((usage) => {
      if (currentFloorIndex < 0 || !isAdjacentFloor(usage.id)) return false;
      const targetIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === usage.id);
      return !stairContinuationDirectionAllows(stairDirection, currentFloorIndex, targetIndex);
    });
    const selectedStairLabel = selectedStair?.label;
    const stairTargetSections = type === "stairs"
      ? (buildingFloors ?? [])
        .filter((floor) => floor.id !== floorId)
        .map((floor) => {
          const rawCandidates = [...new Map(groups.flatMap((group) => group.usedFloors
            .filter((usage) => usage.id === floor.id && usage.objectId !== objectId)
            .map((usage) => ({ ...usage, groupId: group.id })))
            .map((candidate) => [candidate.objectId, candidate])).values()];
          const adjacent = currentFloorIndex < 0 || isAdjacentFloor(floor.id);
          const eligible = canContinueToFloor(floor.id);
          const sourceGroup = sharedId ? groups.find((group) => group.id === sharedId) : undefined;
          const hasIdentityCandidate = !!sharedId && rawCandidates.some((candidate) => candidate.groupId === sharedId);
          // A newly placed Stair has a provisional one-occurrence sharedId.
          // Treat that as unestablished for recommendation purposes so an
          // unambiguous same-name candidate is helpful without becoming an
          // implicit connection. Once an identity spans floors, sharedId wins.
          const establishedIdentity = hasIdentityCandidate || (!!sharedId && (sourceGroup?.usedFloors.length ?? 0) > 1);
          const matchingLabelCount = rawCandidates.filter((candidate) => stairLabelsMatch(selectedStairLabel, candidate.objectLabel)).length;
          const ranked = rawCandidates.map((candidate) => {
            const identityMatch = !!sharedId && candidate.groupId === sharedId;
            // A label is deliberately only a recommendation when there is no
            // established shared identity.  It never changes the persisted
            // relationship without the admin selecting the candidate.
            const labelMatch = !establishedIdentity
              && matchingLabelCount === 1
              && stairLabelsMatch(selectedStairLabel, candidate.objectLabel);
            return { ...candidate, identityMatch, labelMatch };
          });
          return {
            floor,
            adjacent,
            eligible,
            candidates: ranked,
            recommended: ranked.filter((candidate) => candidate.identityMatch || candidate.labelMatch),
            other: ranked.filter((candidate) => !candidate.identityMatch && !candidate.labelMatch),
          };
        })
        // The side panel follows the canonical Building floor order (highest first);
        // only eligible adjacent target Floors are offered as connection rows.
        .filter((entry) => entry.eligible || entry.adjacent)
        .sort((a, b) => {
          const aIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === a.floor.id);
          const bIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === b.floor.id);
          return bIndex - aIndex;
        })
      : [];
    const stairPickerRows = stairTargetSections;
    const elevatorDraft = type === "elevator" && elevatorConnectionDraft?.objectId === objectId
      ? elevatorConnectionDraft
      : null;
    const pendingElevatorCandidate = elevatorDraft?.pending ?? null;
    const pendingElevatorRemoval = type === "elevator" && elevatorRemovalDraft?.objectId === objectId
      ? elevatorRemovalDraft
      : null;
    const selectedElevator = type === "elevator" ? elevators.find((elevator) => elevator.id === objectId) : undefined;
    const selectedElevatorGroup = type === "elevator" && sharedId
      ? groups.find((group) => group.id === sharedId)
      : undefined;
    const selectedElevatorSystemNumber = elevatorSystemNumberOf(selectedElevator);
    const elevatorCandidateSystemNumber = (candidate: { objectLabel?: string; systemNumber?: number }) =>
      elevatorSystemNumberOf({ label: candidate.objectLabel, systemNumber: candidate.systemNumber });
    const elevatorFloorRows = type === "elevator"
      ? (buildingFloors ?? [])
        .map((floor) => {
          const usages = [...new Map(groups.flatMap((group) => group.usedFloors
            .filter((usage) => usage.id === floor.id && usage.objectId !== objectId)
            .map((usage) => ({ ...usage, groupId: group.id })))
            .map((candidate) => [candidate.objectId, candidate])).values()];
           const sourceIdentityEstablished = (selectedElevatorGroup?.usedFloors.length ?? 0) > 1;
           const matchingSystemNumberCount = selectedElevatorSystemNumber === undefined
             ? 0
             : usages.filter((candidate) => elevatorCandidateSystemNumber(candidate) === selectedElevatorSystemNumber).length;
           const candidates = usages.map((candidate) => {
             const identityMatch = !!sharedId && candidate.groupId === sharedId;
             const candidateGroup = groups.find((group) => group.id === candidate.groupId);
             const candidateIsEstablished = (candidateGroup?.usedFloors.length ?? 0) > 1;
             return {
               ...candidate,
               identityMatch,
               // A provisional, one-floor occurrence may join an established
               // shaft. Only a source that already belongs to an established
               // shaft treats another established shaft as incompatible.
               ownedByOther: sourceIdentityEstablished && !identityMatch && candidateIsEstablished,
               floorAlreadyOccupied: !identityMatch && !!candidateGroup?.usedFloors.some((usage) => usage.id === floorId && usage.objectId !== objectId),
               // Matching labels are recommendations only. An established
               // shaft is still a valid recommendation when it is the sole
               // same-label candidate on this target floor.
               labelMatch: matchingSystemNumberCount === 1
                 && elevatorCandidateSystemNumber(candidate) === selectedElevatorSystemNumber
                 // An established shaft may still recommend a provisional
                 // one-floor occurrence with the same label. Established
                 // *other* shafts remain explicitly blocked above.
                 && (!sourceIdentityEstablished || !candidateIsEstablished),
             };
           });
          const served = !selectedElevator?.floors?.length || selectedElevator.floors.includes(floor.number);
          return {
            floor,
            isCurrent: floor.id === floorId,
            served,
            candidates,
            connected: candidates.filter((candidate) => candidate.identityMatch),
            recommended: candidates.filter((candidate) => candidate.identityMatch || candidate.labelMatch),
            other: candidates.filter((candidate) => !candidate.identityMatch && !candidate.labelMatch),
          };
        })
        .sort((a, b) => {
          const aIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === a.floor.id);
          const bIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === b.floor.id);
          return aIndex - bIndex;
        })
      : [];
    const elevatorMatchingConnections: ElevatorMatchingConnection[] = type === "elevator"
      ? (() => {
        const proposed = elevatorFloorRows.flatMap((row) => {
          if (row.isCurrent || !row.served || row.connected.length > 0) return [];
          const matching = row.candidates.filter((candidate) => candidate.labelMatch);
          if (matching.length !== 1) return [];
          const group = groups.find((entry) => entry.id === matching[0].groupId);
          if (!group) return [];
          return [{
            groupId: matching[0].groupId,
            targetFloorId: row.floor.id,
            targetFloorLabel: row.floor.label,
            targetElevatorId: matching[0].objectId,
            targetElevatorLabel: matching[0].objectLabel?.trim() || "Elevator",
          }];
        });
        // A single confirmation may join several provisional occurrences,
        // or several stops from one established shaft, but it must never
        // combine two unrelated established Elevator identities.
        const groupIds = new Set(proposed.map((connection) => connection.groupId));
        const groupById = new Map(groups.map((group) => [group.id, group]));
        if (groupIds.size > 1 && [...groupIds].some((groupId) => (groupById.get(groupId)?.usedFloors.length ?? 0) > 1)) return [];
        return proposed.map(({ groupId: _groupId, ...connection }) => connection);
      })()
      : [];
    const canonicalElevatorFloorCount = type === "elevator" && selectedElevatorGroup
      ? new Set(selectedElevatorGroup.usedFloors.map((usage) => usage.id)).size
      : 0;
    const isElevatorFloorCollapsed = (row: { floor: { id: string }; isCurrent?: boolean }) =>
      elevatorCollapsedFloors[row.floor.id] ?? !row.isCurrent;
    const toggleElevatorFloor = (floorIdToToggle: string) => {
      setElevatorCollapsedFloors((previous) => ({
        ...previous,
        [floorIdToToggle]: !(previous[floorIdToToggle] ?? floorIdToToggle !== floorId),
      }));
    };
    const elevatorMatchingConfirmationRef = useRef<HTMLDivElement | null>(null);
    const elevatorConfirmationRef = useRef<HTMLDivElement | null>(null);
    const elevatorRemovalConfirmationRef = useRef<HTMLDivElement | null>(null);
    const elevatorDisconnectAllConfirmationRef = useRef<HTMLDivElement | null>(null);
    const currentFloorForDialog = type === "stairs"
      ? (buildingFloors ?? []).find((floor) => floor.id === floorId)
      : undefined;
    const stairDialogSections = type === "stairs"
      ? [
        ...stairPickerRows.map((row) => ({ ...row, isCurrent: false })),
        ...(currentFloorForDialog ? [{
          floor: currentFloorForDialog,
          adjacent: true,
          eligible: true,
          candidates: [],
          recommended: [],
          other: [],
          isCurrent: true,
        }] : []),
      ].sort((a, b) => {
        const aIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === a.floor.id);
        const bIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === b.floor.id);
        return bIndex - aIndex;
      })
      : [];
    const continuationSummary = validContinuationRows.length > 0
      ? validContinuationRows.map((row) => `${row.label} · ${stairUsageLabel(row, validContinuationRows.filter((peer) => peer.id === row.id))}`).join(", ")
      : "No connected Stair on another Floor";
    const invalidContinuationSummary = directionBlockedRows.length > 0 && validContinuationRows.length === 0
      ? `Current direction does not allow travel to ${directionBlockedRows.map((row) => row.label).join(", ")}. Change Direction or choose another Stair.`
      : null;
    const duplicateMessage = (group: CirculationGroupOption) => {
      const duplicate = group.usedFloors.find((usage) => usage.id === floorId && usage.objectId !== objectId);
      return duplicate ? `${group.name} is already assigned to another ${type === "stairs" ? "stair" : "elevator"} on this floor.` : null;
    };
    // Offer the convenience action only for an unambiguous, same-system-number
    // candidate on an eligible floor.  Display labels are never authoritative;
    // the explicit confirmation below still establishes the shaft identity.
    const matchingStairConnections: StairMatchingConnection[] = type === "stairs"
      ? stairTargetSections.flatMap((section) => {
        if (!section.eligible || !section.adjacent) return [];
        const connected = section.candidates.some((candidate) => candidate.identityMatch);
        if (connected) return [];
        const matching = section.candidates.filter((candidate) => {
          if (!stairLabelsMatch(selectedStairLabel, candidate.objectLabel)) return false;
          const group = groups.find((entry) => entry.id === candidate.groupId);
          if (!group || duplicateMessage(group)) return false;
          // A multi-floor group is already an established physical chain. Do
          // not offer a shortcut that could silently merge it; use the normal
          // per-floor Change/Connect workflow for that deliberate choice.
          if (group.usedFloors.length > 1) return false;
          return true;
        });
        if (matching.length !== 1) return [];
        const targetIndex = (buildingFloors ?? []).findIndex((floor) => floor.id === section.floor.id);
        return [{
          targetFloorId: section.floor.id,
          targetFloorLabel: section.floor.label,
          targetStairId: matching[0].objectId,
          targetStairLabel: matching[0].objectLabel?.trim() || "Stair",
          relation: targetIndex > currentFloorIndex ? "above" : "below",
        } satisfies StairMatchingConnection];
      })
      : [];
    const currentStairMatchingDraft = type === "stairs" && stairMatchingDraft?.objectId === objectId
      ? stairMatchingDraft
      : null;
    const commitStairCandidate = (
      candidate: StairConnectionCandidate,
      targetFloorId: string,
    ) => {
      if (type === "stairs" && onStairConnectionChange) {
        onStairConnectionChange(objectId, targetFloorId, candidate.objectId);
      } else {
        onCirculationGroupChange?.(type, objectId, candidate.groupId);
      }
      setStairConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, pending: null, changingFloorId: null }
        : draft);
      setStairMatchingDraft((draft) => draft?.objectId === objectId ? null : draft);
    };
    const requestStairCandidate = (
      floorId: string,
      floorLabel: string,
      candidate: StairConnectionCandidate,
    ) => {
      const group = groups.find((entry) => entry.id === candidate.groupId);
      if (group && duplicateMessage(group)) return;
      setStairMatchingDraft(null);
      // A label match is only a recommendation, never an implicit identity
      // assignment. Every non-established candidate therefore gets the same
      // explicit confirmation before the relationship is persisted.
      if (!candidate.identityMatch) {
        setStairConnectionDraft({
          objectId,
          changingFloorId: floorId,
          pending: { floorId, floorLabel, candidate },
        });
        return;
      }
      commitStairCandidate(candidate, floorId);
    };
    const commitElevatorCandidate = (candidate: StairConnectionCandidate, targetFloorId: string) => {
      // The candidate objectId is the authoritative occurrence selected by
      // the admin. Never re-resolve this action from a display label or the
      // recommendation list after confirmation.
      if ((candidate.ownedByOther && !elevatorDraft?.changeMode) || candidate.floorAlreadyOccupied) return;
      if (onElevatorConnectionChange) onElevatorConnectionChange(objectId, targetFloorId, candidate.objectId);
      else onCirculationGroupChange?.("elevator", objectId, candidate.groupId);
      setElevatorConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, pending: null, changingFloorId: null }
        : draft);
      setElevatorMatchingDraft((draft) => draft?.objectId === objectId ? null : draft);
    };
    const requestElevatorCandidate = (floorId: string, floorLabel: string, candidate: StairConnectionCandidate) => {
      if ((candidate.ownedByOther && !elevatorDraft?.changeMode) || candidate.floorAlreadyOccupied) return;
      setElevatorMatchingDraft(null);
      setElevatorConnectionDraft({ objectId, changingFloorId: floorId, changeMode: elevatorDraft?.changeMode, pending: { floorId, floorLabel, candidate } });
    };
    const requestElevatorRemoval = (floorId: string, floorLabel: string, candidate: StairConnectionCandidate) => {
      setElevatorConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, changingFloorId: null, pending: null }
        : draft);
      setElevatorMatchingDraft(null);
      setElevatorRemovalDraft({
        objectId,
        floorId,
        floorLabel,
        targetElevatorId: candidate.objectId,
        targetElevatorLabel: candidate.objectLabel?.trim() || "Elevator",
      });
    };
    const commitElevatorRemoval = () => {
      if (!pendingElevatorRemoval) return;
      onElevatorConnectionDisconnect?.(objectId, pendingElevatorRemoval.floorId, pendingElevatorRemoval.targetElevatorId);
      setElevatorRemovalDraft(null);
    };
    const requestElevatorDisconnectAll = () => {
      if (type !== "elevator" || canonicalElevatorFloorCount <= 1) return;
      setElevatorConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, changingFloorId: null, pending: null }
        : draft);
      setElevatorMatchingDraft(null);
      setElevatorRemovalDraft(null);
      setElevatorDisconnectAllDraft({
        objectId,
        label: selectedElevator?.label?.trim() || "Elevator",
        floorCount: canonicalElevatorFloorCount,
      });
    };
    const commitElevatorDisconnectAll = () => {
      if (!elevatorDisconnectAllDraft || elevatorDisconnectAllDraft.objectId !== objectId) return;
      onElevatorConnectionsDisconnectAll?.(objectId);
      setElevatorDisconnectAllDraft(null);
    };
    const create = () => {
      const trimmed = newName.trim();
      if (!trimmed || !onCreateCirculationGroup) return;
      onCreateCirculationGroup(type, objectId, trimmed);
      setNewName("");
      setCreating(false);
      setOpenCirculationType(null);
    };
    const closeStairDialog = () => {
      setStairConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, pending: null, changingFloorId: null }
        : draft);
      setOpenCirculationType(null);
      setStairMatchingDraft((draft) => draft?.objectId === objectId ? null : draft);
    };
    const closeElevatorDialog = () => {
      setElevatorConnectionDraft((draft) => draft?.objectId === objectId
        ? { ...draft, pending: null, changingFloorId: null }
        : draft);
      setElevatorMatchingDraft((draft) => draft?.objectId === objectId ? null : draft);
      setElevatorRemovalDraft((draft) => draft?.objectId === objectId ? null : draft);
      setElevatorDisconnectAllDraft((draft) => draft?.objectId === objectId ? null : draft);
      setOpenCirculationType(null);
    };
    useEffect(() => {
      if (!open || (type !== "stairs" && type !== "elevator")) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        if (type === "stairs") closeStairDialog();
        else closeElevatorDialog();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, type]);
    useEffect(() => {
      if ((!pendingStairCandidate && !currentStairMatchingDraft) || type !== "stairs") return;
      const confirmation = pendingStairCandidate ? confirmationRef.current : matchingConfirmationRef.current;
      if (!confirmation || typeof confirmation.scrollIntoView !== "function") return;
      const reducedMotion = typeof window !== "undefined"
        && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const frame = window.requestAnimationFrame(() => {
        confirmation.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      });
      return () => window.cancelAnimationFrame(frame);
    }, [currentStairMatchingDraft, pendingStairCandidate, type]);
    const currentElevatorMatchingDraft = type === "elevator" && elevatorMatchingDraft?.objectId === objectId
      ? elevatorMatchingDraft
      : null;
    useEffect(() => {
      if ((!pendingElevatorCandidate && !currentElevatorMatchingDraft && !pendingElevatorRemoval && !elevatorDisconnectAllDraft) || type !== "elevator") return;
      const confirmation = pendingElevatorCandidate
        ? elevatorConfirmationRef.current
        : currentElevatorMatchingDraft
          ? elevatorMatchingConfirmationRef.current
          : pendingElevatorRemoval
            ? elevatorRemovalConfirmationRef.current
            : elevatorDisconnectAllConfirmationRef.current;
      if (!confirmation || typeof confirmation.scrollIntoView !== "function") return;
      const reducedMotion = typeof window !== "undefined"
        && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const frame = window.requestAnimationFrame(() => confirmation.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" }));
      return () => window.cancelAnimationFrame(frame);
    }, [currentElevatorMatchingDraft, elevatorDisconnectAllDraft, pendingElevatorCandidate, pendingElevatorRemoval, type]);
    return (
      <Field label={noun}>
        <div className="space-y-2">
          {type === "stairs" ? (
            <div className="min-w-0 rounded-xl border border-border bg-input-background/60 p-2.5">
              <div className="space-y-1.5">
                {validContinuationRows.length > 0 ? validContinuationRows.map((row) => (
                  <div
                    key={`${row.id}:${row.objectId}`}
                    className="flex min-w-0 items-start gap-1.5 text-[11px] font-semibold leading-snug text-foreground"
                  >
                    <span className="min-w-0 break-words">{row.label}</span>
                    <span className="shrink-0 text-muted-foreground">·</span>
                    <span className="min-w-0 break-words text-muted-foreground">{stairUsageLabel(row, validContinuationRows.filter((peer) => peer.id === row.id))}</span>
                  </div>
                )) : (
                  <p className="text-[10px] leading-snug text-muted-foreground">{continuationSummary}</p>
                )}
                {invalidContinuationSummary && (
                  <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-2 py-1.5 text-[10px] leading-snug text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/10 dark:text-amber-300" data-testid="stair-invalid-continuation">
                    {invalidContinuationSummary}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid={`circulation-group-trigger-${type}`}
                onClick={() => {
                  if (open) {
                    setStairConnectionDraft((draft) => draft?.objectId === objectId
                      ? { ...draft, pending: null, changingFloorId: null }
                      : draft);
                    setStairMatchingDraft((draft) => draft?.objectId === objectId ? null : draft);
                    setOpenCirculationType(null);
                  } else {
                    setOpenCirculationType(type);
                  }
                }}
                className="mt-2 inline-flex min-h-8 w-full items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-center text-[10px] font-extrabold leading-tight whitespace-normal break-words text-foreground transition-colors hover:bg-muted/60"
              >
                  Manage Connections
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid={`circulation-group-trigger-${type}`}
              aria-label="Manage Elevator Connections"
              onClick={() => setOpenCirculationType(open ? null : type)}
              className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-input-background px-3 py-2.5 text-left text-xs font-bold text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide text-foreground">Elevator Connections</span>
                <span className="mt-0.5 block break-words text-[10px] font-semibold text-muted-foreground">
                  {current?.usedFloors.length ? `${current.usedFloors.length} connected floor${current.usedFloors.length === 1 ? "" : "s"}` : "Review served floors"}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-base font-extrabold leading-none text-primary">→</span>
            </button>
          )}
          {open && type === "stairs" && (
            <div
              className="pointer-events-none fixed bottom-0 right-0 top-16 z-[160] flex w-[min(30rem,calc(100vw-1rem))] max-w-full p-2 sm:p-3"
              data-testid="stair-connections-side-panel"
            >
              <div
                className="pointer-events-auto ml-auto flex h-full max-h-screen w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm transition-[transform,opacity] duration-200 ease-out dark:ring-white/5"
                data-testid="circulation-group-picker"
                role="dialog"
                aria-labelledby="manage-stair-connections-title"
                aria-describedby="manage-stair-connections-description"
                tabIndex={-1}
                onMouseDown={(event) => event.stopPropagation()}
                onMouseLeave={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
                  <div className="min-w-0">
                    <button type="button" onClick={closeStairDialog} className="mb-2 inline-flex items-center rounded-md px-1.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" data-testid="stair-connections-back">
                      ← Stair Properties
                    </button>
                    <h2 id="manage-stair-connections-title" className="text-sm font-extrabold uppercase tracking-wide text-foreground">Stair Connections</h2>
                    <p id="manage-stair-connections-description" className="mt-1 break-words text-[11px] text-muted-foreground">
                      {selectedStairLabel?.trim() || "Stair"} · {currentFloorForDialog?.label || "Current Floor"}
                    </p>
                  </div>
                  <button type="button" aria-label="Close Stair Connections" onClick={closeStairDialog} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" data-testid="stair-connections-dialog-content">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Direction</span>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-extrabold text-primary">
                      {stairDirection === "up" ? "Up" : stairDirection === "down" ? "Down" : "Both"}
                    </span>
                    <span className="text-[10px] leading-snug text-muted-foreground">Direction controls which existing adjacent connections are usable; it does not create a connection.</span>
                  </div>
                  {matchingStairConnections.length > 0 && !currentStairMatchingDraft && !pendingStairCandidate && (onStairConnectionsChange || onStairConnectionChange) && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5" data-testid="stair-matching-shortcut">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-extrabold text-foreground">Matching Stairs found</p>
                          <p className="text-[9px] leading-snug text-muted-foreground">Review the clear same-label continuation{matchingStairConnections.length > 1 ? "s" : ""} below.</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[9px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          onClick={() => {
                            setStairConnectionDraft((draft) => draft?.objectId === objectId ? { ...draft, pending: null, changingFloorId: null } : draft);
                            setStairMatchingDraft({ objectId, connections: matchingStairConnections });
                          }}
                        >
                          Connect Matching Stairs
                        </button>
                      </div>
                    </div>
                  )}
                  {currentStairMatchingDraft && (
                    <div ref={matchingConfirmationRef} className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-3 dark:border-amber-800/50 dark:bg-amber-900/10" data-testid="stair-matching-confirmation" role="alert">
                      <p className="text-[11px] font-semibold leading-snug text-amber-900 dark:text-amber-200">Connect matching Stairs?</p>
                      <div className="space-y-1.5">
                        {currentStairMatchingDraft.connections.map((connection) => (
                          <div key={`${connection.targetFloorId}:${connection.targetStairId}`} className="rounded-lg border border-amber-200/70 bg-background/60 px-2.5 py-2 dark:border-amber-800/40">
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">{connection.relation === "above" ? "Above" : "Below"}</p>
                            <p className="text-[10px] font-bold text-foreground">{connection.targetFloorLabel} · {connection.targetStairLabel}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] leading-snug text-amber-800/80 dark:text-amber-300/80">These are explicit connections; nothing else on either Floor will be changed.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setStairMatchingDraft((draft) => draft?.objectId === objectId ? null : draft)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button>
                        <button
                          type="button"
                          onClick={() => {
                            const connections = currentStairMatchingDraft.connections;
                            if (onStairConnectionsChange) {
                              onStairConnectionsChange(objectId, connections.map((connection) => ({ targetFloorId: connection.targetFloorId, targetStairId: connection.targetStairId })));
                            } else {
                              connections.forEach((connection) => onStairConnectionChange?.(objectId, connection.targetFloorId, connection.targetStairId));
                            }
                            setStairMatchingDraft(null);
                          }}
                          className="min-h-8 rounded-lg bg-primary px-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90"
                        >Connect</button>
                      </div>
                    </div>
                  )}
                  {stairDialogSections.length > 0 ? stairDialogSections.map((section) => {
                    const { floor, candidates, recommended, other, isCurrent, eligible, adjacent } = section;
                    if (isCurrent) {
                      return (
                        <div key={floor.id} className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-3" data-testid="stair-picker-current-floor">
                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">Current Floor</p>
                          <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
                            <span className="min-w-0 break-words text-xs font-extrabold text-foreground">{floor.label}</span>
                            <span className="shrink-0 break-words text-[10px] font-semibold text-muted-foreground">{selectedStairLabel?.trim() || "Stair"}</span>
                          </div>
                          {circulationNavStatus && (!circulationNavStatus.linked || circulationNavStatus.connectionCount === 0) && (
                            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-2 dark:border-amber-800/40 dark:bg-amber-900/10" data-testid="stair-manager-issues" role="status">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-extrabold leading-snug text-amber-900 dark:text-amber-200">Navigation unavailable</p>
                                <p className="text-[10px] leading-snug text-amber-800 dark:text-amber-300">{circulationNavStatus.detail || "Connect this Stair to the local Walking Network."}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    const connected = recommended.filter((candidate) => candidate.identityMatch);
                    const availableRecommended = recommended.filter((candidate) => !candidate.identityMatch);
                    const showAlternatives = eligible && (connected.length === 0 || changingFloorId === floor.id);
                    const relationLabel = adjacent
                      ? ((buildingFloors ?? []).findIndex((candidate) => candidate.id === floor.id) > currentFloorIndex ? "Above" : "Below")
                      : "Other Floor";
                    return (
                      <div key={floor.id} className="space-y-2 rounded-xl border border-border px-3 py-3" data-testid={`stair-picker-floor-${floor.id}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">{relationLabel}</p>
                            <p className="min-w-0 break-words text-xs font-extrabold text-foreground">{floor.label}</p>
                          </div>
                          <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wider", eligible ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                            {eligible ? (adjacent ? "Adjacent" : "Available") : "Direction blocked"}
                          </span>
                        </div>
                        {connected.length > 0 && (
                          <div className="space-y-1" data-testid="stair-picker-connected">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Connected</p>
                            {connected.map((candidate, candidateIndex) => (
                              <div key={`${floor.id}:${candidate.objectId}`} className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800/40 dark:bg-emerald-900/10">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="break-words text-[11px] font-extrabold leading-snug text-foreground">{stairUsageLabel(candidate, candidates)}</div>
                                    <div className="text-[9px] leading-snug text-muted-foreground">{eligible ? "Current continuation" : `Not usable while Direction is ${stairDirection === "up" ? "Up" : stairDirection === "down" ? "Down" : "Both"}.`}</div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <button type="button" data-testid={`stair-change-floor-${floor.id}${candidateIndex > 0 ? `-${candidate.objectId}` : ""}`} onClick={() => setStairConnectionDraft({ objectId, changingFloorId: floor.id, pending: null })} className="inline-flex min-h-7 items-center rounded-md border border-border bg-background/70 px-2 text-[9px] font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Change</button>
                                    <button type="button" data-testid={`stair-disconnect-floor-${floor.id}${candidateIndex > 0 ? `-${candidate.objectId}` : ""}`} onClick={() => { onStairConnectionDisconnect?.(objectId, floor.id, candidate.objectId); if (!onStairConnectionDisconnect) onCirculationGroupChange?.(type, objectId, undefined); setStairConnectionDraft((draft) => draft?.objectId === objectId ? { ...draft, pending: null, changingFloorId: null } : draft); }} className="inline-flex min-h-7 items-center rounded-md border border-destructive/30 bg-destructive/5 px-2 text-[9px] font-bold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40">Disconnect</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!eligible && (
                          <div className="space-y-1 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/10" data-testid="stair-picker-direction-blocked">
                            <p className="text-[10px] leading-snug text-amber-800 dark:text-amber-300">Direction is {stairDirection === "up" ? "Up" : stairDirection === "down" ? "Down" : "Both"}; this Floor cannot be connected.</p>
                            {candidates.filter((candidate) => !candidate.identityMatch).map((candidate) => (
                              <div key={`${floor.id}:blocked:${candidate.objectId}`} className="rounded-md px-1 py-1 text-[10px] text-muted-foreground" aria-disabled="true">
                                {stairUsageLabel(candidate, candidates)}
                              </div>
                            ))}
                          </div>
                        )}
                        {showAlternatives && (
                          <>
                            {availableRecommended.length > 0 && (
                              <div className="space-y-1" data-testid="stair-picker-recommended">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-primary">{connected.length > 0 ? "Choose another Stair" : "Recommended"}</p>
                                {availableRecommended.map((candidate) => {
                                  const group = groups.find((entry) => entry.id === candidate.groupId);
                                  const duplicate = group ? duplicateMessage(group) : null;
                                  return (
                                    <button key={`${floor.id}:${candidate.objectId}`} type="button" disabled={!!duplicate} title={duplicate ?? undefined} onClick={() => requestStairCandidate(floor.id, floor.label, candidate)} className={cn("w-full min-w-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10", duplicate && "cursor-not-allowed opacity-50 hover:bg-primary/5")}>
                                      <div className="break-words text-[11px] font-extrabold leading-snug text-foreground">{stairUsageLabel(candidate, candidates)}</div>
                                      <div className="break-words text-[9px] leading-snug text-muted-foreground">{duplicate ?? "Matches this Stair label"}</div>
                                      {!duplicate && <div className="mt-1 text-[9px] font-bold text-primary">Connect</div>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {other.length > 0 && (
                              <div className="space-y-1" data-testid="stair-picker-other">
                                <p className="pt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Other Stairs</p>
                                {other.map((candidate) => {
                                  const group = groups.find((entry) => entry.id === candidate.groupId);
                                  const duplicate = group ? duplicateMessage(group) : null;
                                  return (
                                    <button key={`${floor.id}:${candidate.objectId}`} type="button" disabled={!!duplicate} title={duplicate ?? undefined} onClick={() => requestStairCandidate(floor.id, floor.label, candidate)} className={cn("w-full min-w-0 rounded-lg border border-border bg-background/50 px-3 py-2 text-left transition-colors hover:bg-muted", duplicate && "cursor-not-allowed opacity-50 hover:bg-background/50")}>
                                      <div className="break-words text-[11px] font-extrabold leading-snug text-foreground">{stairUsageLabel(candidate, candidates)}</div>
                                      <div className="break-words text-[9px] leading-snug text-muted-foreground">{duplicate ?? "Choose intentionally"}</div>
                                      {!duplicate && <div className="mt-1 text-[9px] font-bold text-foreground">Choose this Stair</div>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                        {candidates.length === 0 && (
                          <p className={cn("text-[10px] leading-snug", eligible ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                            {eligible ? "No Stair continuation selected on this Floor." : "No connection is usable while this Direction is active."}
                          </p>
                        )}
                      </div>
                    );
                  }) : (
                    <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[10px] leading-snug text-muted-foreground">No adjacent Floor Stairs are available yet.</p>
                  )}
                  {stairPickerRows.length === 0 && !currentFloorForDialog && (
                    <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[10px] leading-snug text-muted-foreground">No adjacent Floor Stairs are available yet.</p>
                  )}
                  {pendingStairCandidate && (
                    <div ref={confirmationRef} className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-3 dark:border-amber-800/50 dark:bg-amber-900/10" data-testid="stair-cross-pair-confirmation" role="alert">
                      <p className="text-[11px] font-semibold leading-snug text-amber-900 dark:text-amber-200">
                        Connect {selectedStairLabel?.trim() || "this Stair"} to {stairUsageLabel(pendingStairCandidate.candidate, [pendingStairCandidate.candidate])} on {pendingStairCandidate.floorLabel}?
                      </p>
                      <p className="text-[10px] leading-snug text-amber-800/80 dark:text-amber-300/80">This is an explicit continuation between these two Stairs.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setStairConnectionDraft((draft) => draft?.objectId === objectId ? { ...draft, pending: null } : draft)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button>
                        <button type="button" onClick={() => commitStairCandidate(pendingStairCandidate.candidate, pendingStairCandidate.floorId)} className="min-h-8 rounded-lg bg-primary px-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90">Connect</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end border-t border-border px-5 py-3">
                  <button type="button" onClick={closeStairDialog} className="min-h-8 rounded-lg border border-border px-3 text-[10px] font-bold text-foreground hover:bg-muted">Done</button>
                </div>
              </div>
            </div>
          )}
          {open && type === "elevator" && (
            <div className="pointer-events-none fixed bottom-0 right-0 top-16 z-[160] flex w-[min(30rem,calc(100vw-1rem))] max-w-full p-2 sm:p-3" data-testid="elevator-connections-side-panel">
              <div className="pointer-events-auto ml-auto flex h-full max-h-screen w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm dark:ring-white/5" data-testid="elevator-connections-manager" role="dialog" aria-labelledby="manage-elevator-connections-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
                  <div className="min-w-0">
                    <button type="button" onClick={closeElevatorDialog} className="mb-2 inline-flex items-center rounded-md px-1.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" data-testid="elevator-connections-back">← Elevator Properties</button>
                    <h2 id="manage-elevator-connections-title" className="text-sm font-extrabold uppercase tracking-wide text-foreground">Elevator Connections</h2>
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">{selectedElevator?.label?.trim() || "Elevator"} · {buildingFloors?.find((floor) => floor.id === floorId)?.label || "Current Floor"}</p>
                  </div>
                  <button type="button" aria-label="Close Elevator Connections" onClick={closeElevatorDialog} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" data-testid="elevator-connections-content">
                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-[10px] leading-snug text-muted-foreground">Choose the Floors served by this physical Elevator. Joining a shaft adds the selected Floor in one action.</div>
                  <div className="space-y-1.5 rounded-xl border border-border bg-background/60 px-3 py-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Elevator identity</p>
                    {current ? (
                      <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                        <p className="text-[11px] font-extrabold text-foreground">{current.name}</p>
                        <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{canonicalElevatorFloorCount > 1 ? `Connected to ${canonicalElevatorFloorCount} Floors` : "Not connected to another Floor yet."}</p>
                      </div>
                    ) : creating ? (
                      <><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} className={inputCls} placeholder="Main Elevator" /><button type="button" onClick={create} className="min-h-8 w-full rounded-lg bg-primary px-2 text-[10px] font-extrabold text-primary-foreground hover:bg-primary/90">Create Elevator</button></>
                    ) : (
                      <button type="button" onClick={() => setCreating(true)} className="min-h-8 w-full rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary/10">Create Elevator</button>
                    )}
                  </div>
                  {elevatorMatchingConnections.length > 0 && !currentElevatorMatchingDraft && !pendingElevatorCandidate && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5" data-testid="elevator-matching-shortcut">
                      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-extrabold text-foreground">Matching Elevators found</p><p className="text-[9px] leading-snug text-muted-foreground">Review the unambiguous system-number stops.</p></div><button type="button" aria-label="Connect Matching Elevators" className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[9px] font-extrabold text-primary-foreground hover:bg-primary/90" onClick={() => setElevatorMatchingDraft({ objectId, connections: elevatorMatchingConnections })}>Quick Connect Matching Elevators</button></div>
                    </div>
                  )}
                  {currentElevatorMatchingDraft && (
                    <div ref={elevatorMatchingConfirmationRef} className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-3 dark:border-amber-800/50 dark:bg-amber-900/10" data-testid="elevator-matching-confirmation" role="alert">
                      <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">Connect this Elevator across these Floors?</p>
                      {buildingFloors?.find((floor) => floor.id === floorId) && <p className="text-[10px] font-bold text-foreground">✓ {buildingFloors.find((floor) => floor.id === floorId)?.label} · {selectedElevator?.label?.trim() || "Elevator"}</p>}
                      {currentElevatorMatchingDraft.connections.map((connection) => <p key={`${connection.targetFloorId}:${connection.targetElevatorId}`} className="text-[10px] font-bold text-foreground">{connection.targetFloorLabel} · {connection.targetElevatorLabel}</p>)}
                      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setElevatorMatchingDraft(null)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button><button type="button" onClick={() => { const targets = currentElevatorMatchingDraft.connections.map((connection) => ({ targetFloorId: connection.targetFloorId, targetElevatorId: connection.targetElevatorId })); if (onElevatorConnectionsChange) onElevatorConnectionsChange(objectId, targets); else targets.forEach((target) => onElevatorConnectionChange?.(objectId, target.targetFloorId, target.targetElevatorId)); setElevatorMatchingDraft(null); }} className="min-h-8 rounded-lg bg-primary px-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90">Connect</button></div>
                    </div>
                  )}
                  {elevatorFloorRows.map((row) => {
                    const choosing = elevatorDraft?.changingFloorId === row.floor.id;
                    const collapsed = isElevatorFloorCollapsed(row);
                    const currentHasOtherFloors = row.isCurrent && canonicalElevatorFloorCount > 1;
                    const connectedCandidate = row.isCurrent
                      ? (currentHasOtherFloors && selectedElevator?.sharedId
                        ? { objectId, groupId: selectedElevator.sharedId, objectLabel: selectedElevator.label, identityMatch: true, labelMatch: false }
                        : undefined)
                      : row.connected[0];
                    const connectedFloorCount = row.isCurrent
                      ? canonicalElevatorFloorCount
                      : connectedCandidate
                        ? new Set((groups.find((group) => group.id === connectedCandidate.groupId)?.usedFloors ?? []).map((usage) => usage.id)).size
                        : 0;
                    // Candidate cards appear only after the administrator
                    // opens that Floor's chooser. This keeps the manager
                    // compact while retaining every exact candidate.
                    const candidates = choosing ? row.candidates : [];
                    const renderCandidate = (candidate: StairConnectionCandidate) => {
                      const alreadyConnected = !!candidate.identityMatch;
                      const unavailable = alreadyConnected || !!candidate.floorAlreadyOccupied || (!!candidate.ownedByOther && !elevatorDraft?.changeMode);
                      const candidateGroup = groups.find((group) => group.id === candidate.groupId);
                      const connectedFloors = candidateGroup?.usedFloors.map((usage) => usage.label).join(", ");
                      return <button key={`${row.floor.id}:${candidate.objectId}:${choosing ? "choosing" : "idle"}`} type="button" data-testid={`elevator-candidate-${row.floor.id}-${candidate.objectId}`} disabled={unavailable} onClick={() => requestElevatorCandidate(row.floor.id, row.floor.label, candidate)} className={cn("w-full rounded-lg border px-3 py-2 text-left transition-colors", unavailable ? "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground opacity-70" : candidate.labelMatch ? "border-primary/20 bg-primary/5 hover:bg-primary/10" : "border-border bg-background/50 hover:bg-muted")}><p className="text-[11px] font-extrabold text-foreground">{candidate.objectLabel?.trim() || candidateGroup?.name || "Elevator"}</p>{connectedFloors && <p className="text-[9px] text-muted-foreground">Connected floors: {connectedFloors}</p>}<p className="text-[9px] text-muted-foreground">{alreadyConnected ? "Connected" : unavailable ? (candidate.floorAlreadyOccupied ? "Already has an Elevator on this floor" : "Already connected to another Elevator") : candidate.labelMatch ? "Recommended" : "Available"}</p></button>;
                    };
                    const rowStatus = !row.served ? "Not served" : row.isCurrent ? (currentHasOtherFloors ? "Connected" : "Not connected") : connectedCandidate ? "Connected" : "Not connected";
                    return <div key={`simple-${row.floor.id}`} className={cn("rounded-xl border", row.served ? "border-border" : "border-border/60 bg-muted/20 opacity-70")} data-testid={`elevator-floor-${row.floor.id}`}>
                      <button type="button" aria-expanded={!collapsed} aria-controls={`elevator-floor-details-${row.floor.id}`} data-testid={`elevator-floor-toggle-${row.floor.id}`} onClick={() => toggleElevatorFloor(row.floor.id)} className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        <span className="w-3 shrink-0 text-[11px] text-muted-foreground" aria-hidden="true">{collapsed ? "›" : "⌄"}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-foreground">{row.floor.label}{row.isCurrent ? " · Current" : ""}</span>
                        <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wider", connectedCandidate ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{rowStatus}</span>
                      </button>
                      {!collapsed && <div id={`elevator-floor-details-${row.floor.id}`} className="space-y-2 border-t border-border/70 px-3 py-3">
                        {row.isCurrent ? <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2"><p className="text-[11px] font-extrabold text-foreground">{selectedElevator?.label?.trim() || "Elevator"}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{connectedFloorCount > 1 ? `Connected to ${connectedFloorCount} floors` : "Not connected to another Floor"}</p></div>
                          : !row.served ? <button type="button" onClick={() => { const servedFloors = selectedElevator?.floors?.length ? [...selectedElevator.floors, row.floor.number] : (buildingFloors ?? []).map((floor) => floor.number); onUpdateElevator(objectId, { floors: [...new Set(servedFloors)].sort((a, b) => a - b) }); }} className="min-h-8 rounded-lg border border-border px-2.5 text-[10px] font-bold text-foreground hover:bg-muted">Include Floor</button>
                            : connectedCandidate ? <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800/40 dark:bg-emerald-900/10"><p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">✓ Connected</p><p className="text-[11px] font-bold text-foreground">{connectedCandidate.objectLabel?.trim() || groups.find((group) => group.id === connectedCandidate.groupId)?.name || "Elevator"}</p><p className="mt-0.5 text-[9px] text-muted-foreground">Connected to {connectedFloorCount} floor{connectedFloorCount === 1 ? "" : "s"}.</p><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" aria-label={`Change Elevator for ${row.floor.label}`} onClick={() => setElevatorConnectionDraft({ objectId, changingFloorId: row.floor.id, changeMode: true, pending: null })} className="min-h-7 rounded-md border border-border bg-background/70 px-2 text-[9px] font-bold text-foreground hover:border-primary/40 hover:text-primary">Change Elevator</button><button type="button" aria-label={`Remove ${row.floor.label} from Elevator`} onClick={() => requestElevatorRemoval(row.floor.id, row.floor.label, connectedCandidate)} className="min-h-7 rounded-md border border-destructive/30 bg-destructive/5 px-2 text-[9px] font-bold text-destructive hover:bg-destructive/10">Remove</button></div></div>
                            : <div className="space-y-2"><p className="text-[10px] text-muted-foreground">This Floor is not connected to the selected Elevator.</p><button type="button" aria-label={`Choose Elevator for ${row.floor.label}`} onClick={() => setElevatorConnectionDraft({ objectId, changingFloorId: row.floor.id, changeMode: false, pending: null })} className="min-h-8 w-full rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-extrabold text-primary hover:bg-primary/10">Choose Elevator</button></div>}
                        {choosing && !row.isCurrent && <div className="space-y-1.5 border-t border-border/70 pt-2"><p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">Choose Elevator</p>{candidates.length === 0 && <p className="text-[10px] text-muted-foreground">No Elevator candidate is available on this Floor.</p>}{candidates.map(renderCandidate)}<button type="button" onClick={() => setElevatorConnectionDraft((draft) => draft?.objectId === objectId ? { ...draft, changingFloorId: null, pending: null } : draft)} className="text-[9px] font-bold text-muted-foreground hover:text-foreground">Cancel</button></div>}
                        {pendingElevatorCandidate?.floorId === row.floor.id && <div ref={elevatorConfirmationRef} className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/10" role="alert"><p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">Connect this Elevator to {pendingElevatorCandidate.candidate.objectLabel?.trim() || "Elevator"} on {pendingElevatorCandidate.floorLabel}?</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setElevatorConnectionDraft((draft) => draft?.objectId === objectId ? { ...draft, pending: null } : draft)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button><button type="button" onClick={() => commitElevatorCandidate(pendingElevatorCandidate.candidate, pendingElevatorCandidate.floorId)} className="min-h-8 rounded-lg bg-primary px-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90">Connect</button></div></div>}
                        {pendingElevatorRemoval?.floorId === row.floor.id && <div ref={elevatorRemovalConfirmationRef} className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/10" role="alert"><p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">Remove {pendingElevatorRemoval.floorLabel} from {pendingElevatorRemoval.targetElevatorLabel}?</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setElevatorRemovalDraft(null)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button><button type="button" onClick={commitElevatorRemoval} className="min-h-8 rounded-lg bg-destructive px-2 text-[10px] font-bold text-destructive-foreground hover:bg-destructive/90">Remove</button></div></div>}
                      </div>}
                    </div>;
                  })}
                  {elevatorDisconnectAllDraft?.objectId === objectId && <div ref={elevatorDisconnectAllConfirmationRef} className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3" data-testid="elevator-disconnect-all-confirmation" role="alert"><p className="text-[11px] font-semibold text-foreground">Disconnect {elevatorDisconnectAllDraft.label} from all other Floors?</p><p className="text-[10px] leading-snug text-muted-foreground">This clears cross-floor connections only. Elevator objects and local Walking Network connections remain.</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setElevatorDisconnectAllDraft(null)} className="min-h-8 rounded-lg border border-border px-2 text-[10px] font-bold text-foreground hover:bg-background">Cancel</button><button type="button" onClick={commitElevatorDisconnectAll} className="min-h-8 rounded-lg bg-destructive px-2 text-[10px] font-bold text-destructive-foreground hover:bg-destructive/90">Disconnect All</button></div></div>}
                </div>
                <div className="space-y-2 border-t border-border px-5 py-3"><div className="flex justify-end"><button type="button" onClick={closeElevatorDialog} className="min-h-8 rounded-lg border border-border px-3 text-[10px] font-bold text-foreground hover:bg-muted">Done</button></div>{canonicalElevatorFloorCount > 1 && !elevatorDisconnectAllDraft && <button type="button" onClick={requestElevatorDisconnectAll} className="w-full rounded-lg border border-destructive/30 px-3 py-2 text-left text-[10px] font-bold text-destructive hover:bg-destructive/10">Disconnect All Floors</button>}</div>
              </div>
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
      {!compactInspector && !selRoom && (
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

        {!selStairs && StateLayerControls}

        {/* ═══ ROOM ═══ */}
        {selRoom && (
          <>
            <div className="space-y-3" data-testid="room-primary-properties">
                <Field label="Name">
                  <input value={selRoom.name} onChange={(e) => onUpdateRoom(selRoom.id, { name: e.target.value })}
                    className={inputCls} placeholder="Room name" />
                </Field>
                <Field label="Color">
                  <ColorPicker
                    value={selRoom.color ?? ROOM_MAP[selRoom.type]?.fill ?? "#dbeafe"}
                    onChange={(color) => onUpdateRoom(selRoom.id, { color })}
                  />
                </Field>
                <Field label="Description">
                  <textarea value={selRoom.description ?? ""} rows={2} onChange={(e) => onUpdateRoom(selRoom.id, { description: e.target.value })}
                    placeholder="Optional..." className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </Field>
            </div>
            <div className="pt-3 border-t border-border space-y-3" data-testid="room-layout-section">
              <p className={labelCls}>Layout</p>
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
            </div>
            <RoomNavigationCard />
            <button onClick={onDeleteSelected}
              className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
              <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Delete Room</span>
            </button>
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
                <Field label="Color">
                  <ColorPicker value={selWall.color} onChange={(c) => onUpdateWall(selWall.id, { color: c })} />
                </Field>
                {applyWallStyle && (
                  <div className="space-y-2">
                    {!confirmWallStyleApply ? (
                      <button type="button" aria-label="Apply color to all Walls on this Floor" onClick={() => setConfirmWallStyleApply(true)}
                        className="w-full min-h-8 rounded-lg border border-border bg-muted/20 px-2 text-[10px] font-bold text-foreground hover:bg-muted transition-colors">
                        Apply Wall Style to All Walls on This Floor
                      </button>
                    ) : (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 space-y-2" data-testid="wall-color-confirmation">
                        <p className="text-[10px] leading-snug text-foreground">
                          Apply this Wall style to all {walls.length} Wall{walls.length === 1 ? "" : "s"} on this Floor?
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button type="button" onClick={() => setConfirmWallStyleApply(false)}
                            className="h-7 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                          <button type="button" onClick={() => { applyWallStyle({ color: selWall.color, thickness: selWall.thickness, material: selWall.material ?? "concrete" }); setConfirmWallStyleApply(false); }}
                            className="h-7 rounded-lg bg-primary text-primary-foreground text-[10px] font-extrabold hover:opacity-90">Apply</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <details className="rounded-xl border border-border bg-muted/10">
                  <summary className="cursor-pointer list-none px-2.5 py-2 text-[10px] font-bold text-muted-foreground">More settings</summary>
                  <div className="px-2.5 pb-2.5 pt-1">
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
                  </div>
                </details>
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
                <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2" data-testid="stair-entry-side-control">
                  <div className="flex items-start gap-2">
                    <FlipHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className={labelCls + " mb-0"}>Entry side</p>
                      <p className="text-[10px] leading-snug text-muted-foreground">Choose where this Stair meets the floor corridor.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-background/70 p-0.5">
                    <button
                      type="button"
                      data-testid="stair-entry-left"
                      aria-label="Entry Left"
                      aria-pressed={!selStairs.flip}
                      onClick={() => onUpdateStairs(selStairs.id, { flip: false })}
                      className={cn(
                        "min-h-8 rounded-md px-2 py-1 text-[10px] font-extrabold transition-colors",
                        !selStairs.flip ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      data-testid="stair-entry-right"
                      aria-label="Entry Right"
                      aria-pressed={!!selStairs.flip}
                      onClick={() => onUpdateStairs(selStairs.id, { flip: true })}
                      className={cn(
                        "min-h-8 rounded-md px-2 py-1 text-[10px] font-extrabold transition-colors",
                        selStairs.flip ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span data-testid="flip-stair">Right</span>
                    </button>
                  </div>
                </div>
                <CirculationGroupControl type="stairs" objectId={selStairs.id} sharedId={selStairs.sharedId} />
                <CirculationNavigationStatus />
                <details className="rounded-xl border border-border bg-muted/20">
                  <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    Advanced layout
                  </summary>
                  <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
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
                    {StateLayerControls}
                  </div>
                </details>
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
                <Field label="System Elevator">
                  <div className={`${inputCls} flex items-center bg-muted/30 font-semibold`} data-testid="elevator-system-number">
                    {elevatorSystemNumberOf(selElevator) !== undefined ? `Elevator ${elevatorSystemNumberOf(selElevator)}` : "Existing Elevator"}
                  </div>
                </Field>
                <Field label="Display label (optional)">
                  <input value={selElevator.label} onChange={(e) => onUpdateElevator(selElevator.id, { label: e.target.value })}
                    className={inputCls} placeholder="e.g. East Elevator" />
                </Field>
                <div data-testid="elevator-identity-summary" className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Elevator identity</p>
                  <p className="mt-1 text-[11px] font-semibold text-foreground">{selectedElevatorGroup && selectedElevatorGroup.usedFloors.length > 1
                    ? `Connected across ${selectedElevatorGroup.usedFloors.length} floors`
                    : "Local occurrence · connect it on other floors"}</p>
                </div>
                <Field label="Door Width">
                  <input type="number" min={4} max={12} value={selElevator.doorWidth} onChange={(e) => onUpdateElevator(selElevator.id, { doorWidth: parseInt(e.target.value) || 6 })}
                    className={inputCls} />
                </Field>
                {/* ── Shared ID (for linking the same elevator across floors) ── */}
                <CirculationGroupControl type="elevator" objectId={selElevator.id} sharedId={selElevator.sharedId} />
                {/* ── Connected floors display ── */}
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
