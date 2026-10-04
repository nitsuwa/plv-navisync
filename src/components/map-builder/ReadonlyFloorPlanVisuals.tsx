/**
 * ReadonlyFloorPlanVisuals — Presentation-only rendering of the authored
 * FloorPlan data for the student-facing CampusMapPage.
 *
 * Renders walls, doors, windows, stairs, ramps, elevators, labels, rooms,
 * and walking paths from the actual admin-created floor plan — not the
 * simplified legacy room-only format.
 */

import { memo, useMemo, useState } from "react";
import type {
  FloorPlan,
  FloorRoom,
  FloorWall,
  FloorDoor,
  FloorWindow,
  FloorStairs,
  FloorRamp,
  FloorElevatorItem,
  FloorLabel,
  FloorFurniture,
  FloorPath,
  FloorEntranceSteps,
  FloorEntranceRamp,
  BuildingEntranceEdge,
  CampusEntrance,
  ExteriorEmergencyStair,
} from "./types";
import { FloorGroundSurface } from "./FloorGroundSurface";
import { FloorAccessibleRampArtwork, FloorEntranceStepsArtwork, FloorExteriorZoneArtwork } from "./FloorExteriorVisuals";
import { getFloorShapeBounds, getFloorShapeRegions } from "../../lib/floorShape";
import { FloorFurnitureSymbol } from "./FloorFurnitureSymbol";
import { ElevatorSymbol, FloorLabelArtwork, FloorPathArtwork, FloorRoomArtwork, FloorRoomLabelArtwork, FloorWallArtwork, RampSymbol, StairsSymbol, WallOpeningSymbol } from "./FloorMapVisuals";
import { resolveWallOpeningGeometry } from "../../lib/floorGeometry";
import { EntranceDirectionBadge, entranceDirectionBadgePlacement } from "./EntranceDirectionBadge";
import { ExteriorEmergencyFloorModule, exteriorStairPresentationBounds } from "./ExteriorEmergencyFloorModule";
import {
  exteriorZoneAccessFeatureGeometry,
  exteriorZoneGeometry,
  exteriorZoneTypeLabel,
} from "../../lib/exteriorFloorZones";

const DEFAULT_FLOOR_CANVAS_W = 440;
const DEFAULT_FLOOR_CANVAS_H = 290;
const FLOOR_VIEWPORT_PADDING = 8;

export interface ReadonlyFloorPlanViewport {
  /** Width/height used by the student SVG viewBox. */
  width: number;
  height: number;
  /** Translation that places authored floor coordinates inside that viewBox. */
  offsetX: number;
  offsetY: number;
}

/**
 * Return a viewBox that includes authored semi-outdoor floor content.
 * Exterior zones intentionally live outside the indoor canvas, so a
 * student-facing SVG using only `0 0 canvasW canvasH` would clip verandas and
 * their entrance steps/ramp even though the Admin editor shows them.
 */
export function readonlyFloorPlanViewport(
  floor?: FloorPlan | null,
  exteriorEmergencyStairs: readonly ExteriorEmergencyStair[] = [],
): ReadonlyFloorPlanViewport {
  const canvasW = Math.max(1, floor?.canvasW || DEFAULT_FLOOR_CANVAS_W);
  const canvasH = Math.max(1, floor?.canvasH || DEFAULT_FLOOR_CANVAS_H);
  let minX = 0;
  let minY = 0;
  let maxX = canvasW;
  let maxY = canvasH;

  const includeRect = (x: number, y: number, width: number, height: number) => {
    if (![x, y, width, height].every(Number.isFinite)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.max(0, width));
    maxY = Math.max(maxY, y + Math.max(0, height));
  };

  const includeRotatedRect = (x: number, y: number, width: number, height: number, rotation = 0) => {
    const angle = (rotation * Math.PI) / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ].map((point) => ({
      x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle),
      y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle),
    }));
    includeRect(
      Math.min(...corners.map((point) => point.x)),
      Math.min(...corners.map((point) => point.y)),
      Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
      Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
    );
  };

  const zones = floor?.exteriorZones ?? [];
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  zones.forEach((zone) => {
    const geometry = exteriorZoneGeometry(zone, canvasW, canvasH);
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  });

  const includeAccessFeature = (feature: FloorEntranceSteps | FloorEntranceRamp) => {
    const parent = feature.parentZoneId ? zoneById.get(feature.parentZoneId) : undefined;
    const geometry = parent
      ? exteriorZoneAccessFeatureGeometry(parent, feature, canvasW, canvasH)
      : { x: feature.x, y: feature.y, width: feature.width, height: feature.height };
    if (!geometry) return;
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  };
  (floor?.entranceSteps ?? []).forEach(includeAccessFeature);
  (floor?.entranceRamps ?? []).forEach(includeAccessFeature);

  // Legacy floors can contain a free-standing item beyond the indoor canvas.
  // Include those authored bounds too, while preserving the normal viewBox for
  // the common case where every object is inside the floor.
  (floor?.furniture ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.stairs ?? []).forEach((item) => {
    if (item.exteriorEmergencyStairId) {
      const owner = exteriorEmergencyStairs.find((stair) => stair.id === item.exteriorEmergencyStairId);
      const bounds = exteriorStairPresentationBounds(item, canvasW, canvasH, owner?.visualSize);
      includeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      return;
    }
    includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation);
  });
  (floor?.ramps ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.elevators ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));

  const viewMinX = minX < 0 ? minX - FLOOR_VIEWPORT_PADDING : 0;
  const viewMinY = minY < 0 ? minY - FLOOR_VIEWPORT_PADDING : 0;
  const viewMaxX = maxX > canvasW ? maxX + FLOOR_VIEWPORT_PADDING : canvasW;
  const viewMaxY = maxY > canvasH ? maxY + FLOOR_VIEWPORT_PADDING : canvasH;
  return {
    width: viewMaxX - viewMinX,
    height: viewMaxY - viewMinY,
    offsetX: viewMinX === 0 ? 0 : -viewMinX,
    offsetY: viewMinY === 0 ? 0 : -viewMinY,
  };
}
import { roomOutlinePoints, roomShapePath } from "../../lib/roomShape";
import { sortFloorItemsByLocalZ } from "../../lib/floorRenderLayers";

// ── Room rendering ──────────────────────────────────────────────────────────

interface RoomVisualProps {
  room: FloorRoom;
  interactive?: boolean;
  hovered?: boolean;
  highlighted?: boolean;
  mapMode?: "standard" | "accessible" | "emergency";
  showLabels?: boolean;
  onClick?: (roomId: string) => void;
  onMouseEnter?: (roomId: string) => void;
  onMouseLeave?: () => void;
}

export const RoomVisual = memo(function RoomVisual({ room, onClick, onMouseEnter, onMouseLeave, interactive = Boolean(onClick || onMouseEnter), hovered, highlighted, mapMode }: RoomVisualProps) {
  const rotation = room.rotation ?? 0;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;

  return (
    <g
      data-testid="readonly-room"
      data-room-id={room.id}
      data-room-interactive={interactive ? "true" : "false"}
      data-room-hovered={hovered ? "true" : "false"}
      data-room-highlighted={highlighted ? "true" : "false"}
      role={interactive && onClick ? "button" : undefined}
      aria-label={interactive && onClick ? room.name : undefined}
      aria-pressed={interactive && onClick ? highlighted : undefined}
      tabIndex={interactive && onClick ? 0 : undefined}
      style={{ cursor: interactive ? "pointer" : "default" }}
      transform={Array.isArray(room.shapePoints) && room.shapePoints.length >= 3 ? undefined : `rotate(${rotation}, ${cx}, ${cy})`}
      onClick={interactive && onClick ? (e) => { e.stopPropagation(); onClick(room.id); } : undefined}
      onKeyDown={interactive && onClick ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onClick(room.id);
      } : undefined}
      onMouseEnter={interactive && onMouseEnter ? () => onMouseEnter(room.id) : undefined}
      onMouseLeave={interactive ? onMouseLeave : undefined}
    >
      <FloorRoomArtwork room={room} fillOpacity={hovered && !highlighted ? 0.62 : 0.58}
        strokeColor={hovered && !highlighted ? "#60a5fa" : undefined} strokeWidth={hovered && !highlighted ? 1.5 : 1} />
    </g>
  );
});

/** Student-only selection treatment follows the room polygon and sits above
 * neighboring fills while staying below furniture, walls, doors, and labels. */
function RoomSelectionOverlay({ room }: { room: FloorRoom }) {
  const points = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3 ? roomOutlinePoints(room) : null;
  const rotation = room.rotation ?? 0;
  const transform = points ? undefined : `rotate(${rotation}, ${room.x + room.w / 2}, ${room.y + room.h / 2})`;

  return (
    <g
      data-testid="readonly-room-selection"
      data-semantic-layer="room-selection"
      data-room-id={room.id}
      className="student-room-selection"
      pointerEvents="none"
      transform={transform}
      aria-hidden="true"
    >
      {points ? (
        <path data-testid="readonly-room-selection-halo" className="student-room-selection-halo" d={roomShapePath(points)} fill="none" stroke="#10b981" strokeOpacity={0.045} strokeWidth={4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ) : (
        <rect data-testid="readonly-room-selection-halo" className="student-room-selection-halo" x={room.x} y={room.y} width={room.w} height={room.h} rx={1} fill="none" stroke="#10b981" strokeOpacity={0.045} strokeWidth={4} vectorEffect="non-scaling-stroke" />
      )}
      {points ? (
        <path data-testid="readonly-room-selection-outline" className="student-room-selection-outline" d={roomShapePath(points)} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ) : (
        <rect data-testid="readonly-room-selection-outline" className="student-room-selection-outline" x={room.x} y={room.y} width={room.w} height={room.h} rx={1} fill="none" stroke="#059669" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      )}
      {points ? (
        <path data-testid="readonly-room-selection-trace" className="student-room-selection-trace" d={roomShapePath(points)} pathLength={1} fill="none" stroke="#34d399" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ) : (
        <rect data-testid="readonly-room-selection-trace" className="student-room-selection-trace" x={room.x} y={room.y} width={room.w} height={room.h} rx={1} pathLength={1} fill="none" stroke="#34d399" strokeWidth={3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}

// ── Wall rendering ──────────────────────────────────────────────────────────

const WallVisual = memo(function WallVisual({ wall }: { wall: FloorWall }) {
  if (wall.visible === false) return null;
  if (Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) < 1) return null;

  return (
    <g data-testid="readonly-wall" data-wall-id={wall.id}>
      <FloorWallArtwork wall={wall} />
    </g>
  );
});

// ── Door rendering ──────────────────────────────────────────────────────────

function openingTransform(opening: FloorDoor | FloorWindow, wall?: FloorWall) {
  const geometry = resolveWallOpeningGeometry(opening, wall);
  if (!geometry) return { geometry: null, transform: `translate(${opening.x},${opening.y})` };
  const side = geometry.wall.managedKind === "perimeter" ? " scale(1 -1)" : "";
  return { geometry, transform: `translate(${geometry.x},${geometry.y}) rotate(${geometry.angle})${side}` };
}

const DoorVisual = memo(function DoorVisual({ door, wall, entrances, onClick, background, interactiveExit }: { door: FloorDoor; wall?: FloorWall; entrances: ReadonlyMap<string, CampusEntrance>; onClick?: (doorId: string) => void; background: string; interactiveExit?: boolean }) {
  const [emphasized, setEmphasized] = useState(false);
  if (door.visible === false) return null;
  const { geometry, transform } = openingTransform(door, wall);
  const width = geometry?.width ?? door.width;
  const wallThickness = geometry?.wall.thickness ?? 4;
  const swingSide = door.swingSide ?? (geometry?.wall.managedKind === "perimeter" ? "b" : "a");
  const entrance = door.buildingEntranceId ? entrances?.get(door.buildingEntranceId) : undefined;
  const exitCanBeActivated = Boolean(interactiveExit && entrance && onClick);
  const entranceBadgePoint = entrance
    ? entranceDirectionBadgePlacement(geometry?.x ?? door.x, geometry?.y ?? door.y, entrance.edge)
    : undefined;
  const badgeInverseTransform = geometry
    ? `${geometry.wall.managedKind === "perimeter" ? "scale(1 -1) " : ""}rotate(${-geometry.angle}) translate(${-geometry.x},${-geometry.y})`
    : `translate(${-door.x},${-door.y})`;
  return (
    <g data-testid="readonly-door" data-opening-type={door.openingType ?? "door"} data-door-id={door.id}
      role={exitCanBeActivated ? "button" : undefined}
      tabIndex={exitCanBeActivated ? 0 : undefined}
      aria-label={exitCanBeActivated ? "Exit to campus view" : undefined}
      onKeyDown={exitCanBeActivated ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onClick?.(door.id);
      } : undefined}
      onFocus={exitCanBeActivated ? () => setEmphasized(true) : undefined}
      onBlur={exitCanBeActivated ? () => setEmphasized(false) : undefined}
      onMouseEnter={exitCanBeActivated ? () => setEmphasized(true) : undefined}
      onMouseLeave={exitCanBeActivated ? () => setEmphasized(false) : undefined}
      transform={transform} style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick ? (event) => { event.stopPropagation(); onClick(door.id); } : undefined}>
      {exitCanBeActivated && (
        <rect data-testid="readonly-exit-door-hit-target" x={-Math.max(width, 40) / 2} y={-18}
          width={Math.max(width, 40)} height={36} fill="transparent" pointerEvents="all" />
      )}
      <WallOpeningSymbol kind={door.openingType === "open_passage" ? "open_passage" : "door"}
        width={width} wallThickness={wallThickness} color={door.color} background={background}
        direction={door.direction} doorType={door.doorType} hinge={door.hinge} swingSide={swingSide} testIdPrefix="readonly-" />
      {entrance && <g transform={badgeInverseTransform}><EntranceDirectionBadge x={geometry?.x ?? door.x} y={geometry?.y ?? door.y}
        edge={entrance.edge} direction={entrance.direction} type={entrance.type} /></g>}
      {exitCanBeActivated && entranceBadgePoint && (
        <g data-testid="student-exit-campus-indicator" transform={badgeInverseTransform} pointerEvents="all">
          {emphasized && <circle cx={entranceBadgePoint.x} cy={entranceBadgePoint.y} r={10.5} fill="#60a5fa" opacity={0.32} />}
          <g transform={`translate(${entranceBadgePoint.x + 9},${entranceBadgePoint.y - 9})`}>
            <rect data-testid="readonly-exit-indicator-hit-target" x={-3} y={-13} width={82} height={44}
              rx={12} fill="transparent" pointerEvents="all" />
            <rect data-testid="student-exit-campus-pill" width={76} height={18} rx={9} fill={emphasized ? "#dbeafe" : "#eff6ff"}
              stroke={emphasized ? "#1d4ed8" : "#3b82f6"} strokeWidth={emphasized ? 1.4 : 1} />
            <path d="M5.5 12.5 12 6m-5.5 0H12v5.5" fill="none" stroke="#1e40af" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
            <text x={16} y={11.8} fill="#1e3a8a" fontSize={7.2} fontWeight={700} fontFamily="inherit">Exit to Campus</text>
          </g>
          <title>Exit to Campus — return to the outdoor map</title>
        </g>
      )}
    </g>
  );
});
const WindowVisual = memo(function WindowVisual({ window: win, wall, background }: { window: FloorWindow; wall?: FloorWall; background: string }) {
  if (win.visible === false) return null;
  const { geometry, transform } = openingTransform(win, wall);
  return (
    <g data-testid="readonly-window" data-window-id={win.id} transform={transform}>
      <WallOpeningSymbol kind="window" width={geometry?.width ?? win.width}
        wallThickness={geometry?.wall.thickness ?? 4} color={win.color} background={background} testIdPrefix="readonly-" />
    </g>
  );
});
// ── Stairs rendering ────────────────────────────────────────────────────────

const StairsVisual = memo(function StairsVisual({ stairs, floorIndex, floorCount, canvasW, canvasH, exteriorEmergencyStairs }: {
  stairs: FloorStairs;
  floorIndex: number;
  floorCount: number;
  canvasW: number;
  canvasH: number;
  exteriorEmergencyStairs: readonly ExteriorEmergencyStair[];
}) {
  const cx = stairs.x + stairs.width / 2;
  const cy = stairs.y + stairs.height / 2;
  const generatedExteriorStair = Boolean(stairs.exteriorEmergencyStairId);
  const owner = generatedExteriorStair
    ? exteriorEmergencyStairs.find((stair) => stair.id === stairs.exteriorEmergencyStairId)
    : undefined;
  return (
    <g data-testid="readonly-stairs" data-stairs-id={stairs.id} data-floor-title={stairs.label}
      transform={generatedExteriorStair ? undefined : `rotate(${stairs.rotation ?? 0},${cx},${cy})`}>
      {generatedExteriorStair
        ? <ExteriorEmergencyFloorModule item={stairs} canvasW={canvasW} canvasH={canvasH} visualSize={owner?.visualSize} selected={false} interactive={false} />
        : <StairsSymbol item={stairs} floorIndex={floorIndex} floorCount={floorCount} />}
    </g>
  );
});
const RampVisual = memo(function RampVisual({ ramp }: { ramp: FloorRamp }) {
  const cx = ramp.x + ramp.width / 2;
  const cy = ramp.y + ramp.height / 2;
  return (
    <g data-testid="readonly-ramp" data-ramp-id={ramp.id} data-floor-title={ramp.label}
      transform={`rotate(${ramp.rotation ?? 0},${cx},${cy})`}>
      <RampSymbol item={ramp} />
    </g>
  );
});
const ElevatorVisual = memo(function ElevatorVisual({ elevator }: { elevator: FloorElevatorItem }) {
  const cx = elevator.x + elevator.width / 2;
  const cy = elevator.y + elevator.height / 2;
  return (
    <g data-testid="readonly-elevator" data-elevator-id={elevator.id} data-floor-title={elevator.label}
      transform={`rotate(${elevator.rotation ?? 0},${cx},${cy})`}>
      <ElevatorSymbol item={elevator} />
    </g>
  );
});
const LabelVisual = memo(function LabelVisual({ label }: { label: FloorLabel }) {
  return (
    <g data-testid="readonly-label" data-label-id={label.id}
      transform={label.rotation ? `rotate(${label.rotation},${label.x},${label.y})` : undefined}>
      <FloorLabelArtwork label={label} />
    </g>
  );
});

// ── Path rendering ──────────────────────────────────────────────────────────

const PathVisual = memo(function PathVisual({ path }: { path: FloorPath }) {
  if (!path.points || path.points.length < 2) return null;
  return (
    <g data-testid="readonly-floor-path" data-path-id={path.id}>
      <FloorPathArtwork path={path} />
    </g>
  );
});

// ── Semi-outdoor floor rendering ───────────────────────────────────────────

const FurnitureVisual = memo(function FurnitureVisual({ item }: { item: FloorFurniture }) {
  if (item.visible === false) return null;
  const rotation = item.rotation ?? 0;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return (
    <g data-testid="readonly-furniture" data-furniture-id={item.id}
      transform={`rotate(${rotation}, ${centerX}, ${centerY})`}>
      <FloorFurnitureSymbol type={item.type} assetKey={item.assetKey} x={item.x} y={item.y}
        width={item.width} height={item.height} color={item.color} flipX={item.flipX} flipY={item.flipY} />
    </g>
  );
});

const RoomLabelVisual = memo(function RoomLabelVisual({ room, hovered, highlighted }: Pick<RoomVisualProps, "room" | "hovered" | "highlighted">) {
  return <FloorRoomLabelArtwork room={room} emphasized={hovered || highlighted} studentSelected={highlighted} opacity={highlighted ? 1 : hovered ? 0.95 : 0.78} />;
});
export interface ReadonlyFloorPlanSceneProps {
  floor: FloorPlan;
  exteriorEmergencyStairs?: readonly ExteriorEmergencyStair[];
  floorIndex?: number;
  floorCount?: number;
  /** Building entrances are supplied separately because FloorPlan stores only
   * the stable buildingEntranceId on generated doors. */
  entrances?: readonly CampusEntrance[];
  /** Door IDs that have a working indoor-to-campus transition in the published graph. */
  interactiveExitDoorIds?: ReadonlySet<string>;
  mapMode?: "standard" | "accessible" | "emergency";
  showLabels?: boolean;
  highlightedRoomId?: string | null;
  /** When provided, only these authored-navigation rooms expose Student room
   * interaction. Omitted for legacy visual snapshots and renderer-only uses. */
  interactiveRoomIds?: ReadonlySet<string>;
  hoveredRoomId?: string | null;
  onRoomClick?: (roomId: string) => void;
  onRoomHover?: (roomId: string) => void;
  onRoomHoverEnd?: () => void;
  onDoorClick?: (doorId: string) => void;
}

/**
 * Read-only scene that renders the full authored FloorPlan data. The Student
 * camera transform lives on its parent SVG group, so camera frames never enter
 * these props; memo keeps the authored scene static during pan/zoom commits.
 */
export const ReadonlyFloorPlanScene = memo(function ReadonlyFloorPlanScene({
  floor,
  exteriorEmergencyStairs = [],
  floorIndex = 0,
  floorCount = 1,
  entrances = [],
  interactiveExitDoorIds,
  mapMode = "standard",
  showLabels = true,
  highlightedRoomId,
  interactiveRoomIds,
  hoveredRoomId,
  onRoomClick,
  onRoomHover,
  onRoomHoverEnd,
  onDoorClick,
}: ReadonlyFloorPlanSceneProps) {
  const canvasW = floor.canvasW || 440;
  const canvasH = floor.canvasH || 290;
  const floorShapeRegions = useMemo(() => getFloorShapeRegions(floor), [floor]);
  const floorShapeBounds = useMemo(() => getFloorShapeBounds(floorShapeRegions), [floorShapeRegions]);
  const floorShapeClipId = `readonly-floor-shape-${floor.id}`.replace(/[^A-Za-z0-9_-]/g, "-");

  const sortedRooms = useMemo(() => sortFloorItemsByLocalZ(floor.rooms || []), [floor.rooms]);
  const selectableHighlightedRoomId = highlightedRoomId
    && (!interactiveRoomIds || interactiveRoomIds.has(highlightedRoomId))
    ? highlightedRoomId
    : null;

  // Keep geometry filtering/sorting tied to authored data, not camera commits
  // or lightweight hover/selection changes.
  const visibleWalls = useMemo(() => sortFloorItemsByLocalZ((floor.walls || []).filter((w) => w.visible !== false)), [floor.walls]);
  const visibleDoors = useMemo(() => sortFloorItemsByLocalZ((floor.doors || []).filter((d) => d.visible !== false)), [floor.doors]);
  const visibleWindows = useMemo(() => sortFloorItemsByLocalZ((floor.windows || []).filter((w) => w.visible !== false)), [floor.windows]);
  const visibleStairs = useMemo(() => sortFloorItemsByLocalZ((floor.stairs || []).filter((s) => s.visible !== false)), [floor.stairs]);
  const visibleRamps = useMemo(() => sortFloorItemsByLocalZ((floor.ramps || []).filter((r) => r.visible !== false)), [floor.ramps]);
  const visibleElevators = useMemo(() => sortFloorItemsByLocalZ((floor.elevators || []).filter((e) => e.visible !== false)), [floor.elevators]);
  const visibleLabels = useMemo(() => sortFloorItemsByLocalZ(floor.labels || []), [floor.labels]);
  const visibleFurniture = useMemo(() => sortFloorItemsByLocalZ((floor.furniture || []).filter((f) => f.visible !== false)), [floor.furniture]);
  const visiblePaths = floor.paths || [];
  const exteriorZones = useMemo(() => [...(floor.exteriorZones || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  ), [floor.exteriorZones]);
  const entranceSteps = useMemo(() => [...(floor.entranceSteps || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  ), [floor.entranceSteps]);
  const entranceRamps = useMemo(() => [...(floor.entranceRamps || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  ), [floor.entranceRamps]);
  const exteriorZoneById = useMemo(() => new Map(exteriorZones.map((zone) => [zone.id, zone])), [exteriorZones]);
  const entranceById = useMemo(() => new Map(entrances.map((entrance) => [entrance.id, entrance])), [entrances]);
  const wallById = useMemo(() => new Map((floor.walls || []).map((wall) => [wall.id, wall])), [floor.walls]);

  return (
    <g data-testid="readonly-floor-plan-scene">
      <defs><clipPath id={floorShapeClipId}><path d={floorShapeRegions.map((region) => `M ${region.x} ${region.y} h ${region.width} v ${region.height} h ${-region.width} Z`).join(" ")} /></clipPath></defs>
      {/* Published/read-only view shows the authored surface only; the
          authoring grid intentionally never leaks into the student map. */}
      <g clipPath={`url(#${floorShapeClipId})`}>
        <FloorGroundSurface
          x={floorShapeBounds.x}
          y={floorShapeBounds.y}
          width={floorShapeBounds.width}
          height={floorShapeBounds.height}
          appearance={floor.appearance}
          legacyColor={floor.backgroundColor}
          idPrefix={`readonly-floor-${floor.id}`}
          dataTestId="readonly-floor-surface"
        />
      </g>

      {/* Mode tints */}
      {mapMode === "emergency" && (
        <rect x={floorShapeBounds.x} y={floorShapeBounds.y} width={floorShapeBounds.width} height={floorShapeBounds.height} fill="var(--map-route, #dc2626)" opacity={0.05} clipPath={`url(#${floorShapeClipId})`} />
      )}
      {mapMode === "accessible" && (
        <rect x={floorShapeBounds.x} y={floorShapeBounds.y} width={floorShapeBounds.width} height={floorShapeBounds.height} fill="var(--map-route-start, #16a34a)" opacity={0.05} clipPath={`url(#${floorShapeClipId})`} />
      )}

      {/* Semi-outdoor authored spaces are part of the published floor scene.
          They are drawn before paths/furniture so a veranda remains a surface
          beneath its chairs, tables, and walking connections. */}
      {exteriorZones.map((zone) => (
        <g key={zone.id} data-testid="readonly-exterior-zone" data-exterior-zone-id={zone.id} data-floor-title={zone.label ?? exteriorZoneTypeLabel(zone.type)} aria-label={zone.label ?? exteriorZoneTypeLabel(zone.type)} opacity={zone.visible === false ? 0.35 : 1}><FloorExteriorZoneArtwork zone={zone} bounds={exteriorZoneGeometry(zone, canvasW, canvasH)} /></g>
      ))}
      {entranceSteps.map((item) => {
        const parent = item.parentZoneId ? exteriorZoneById.get(item.parentZoneId) : undefined;
        const geometry = parent
          ? exteriorZoneAccessFeatureGeometry(parent, item, canvasW, canvasH)
          : { x: item.x, y: item.y, width: item.width, height: item.height };
        if (!geometry) return null;
        const featureSide: BuildingEntranceEdge = parent && "side" in geometry ? geometry.side : "bottom";
        return (
          <g
            key={item.id}
            data-testid="readonly-entrance-steps"
            data-entrance-steps-id={item.id}
            data-edge={featureSide}
            opacity={item.visible === false ? 0.35 : 1}
          >
            <FloorEntranceStepsArtwork
              testId="readonly-entrance-steps-symbol"
              bounds={geometry}
              side={featureSide}
              direction={item.direction}
              flipHorizontal={item.flipHorizontal}
              flipVertical={item.flipVertical}
            />
          </g>
        );
      })}
      {entranceRamps.map((item) => {
        const parent = item.parentZoneId ? exteriorZoneById.get(item.parentZoneId) : undefined;
        const geometry = parent
          ? exteriorZoneAccessFeatureGeometry(parent, item, canvasW, canvasH)
          : { x: item.x, y: item.y, width: item.width, height: item.height };
        if (!geometry) return null;
        const featureSide: BuildingEntranceEdge = parent && "side" in geometry ? geometry.side : "bottom";
        return (
          <g
            key={item.id}
            data-testid="readonly-entrance-ramp"
            data-entrance-ramp-id={item.id}
            data-edge={featureSide}
            opacity={item.visible === false ? 0.35 : 1}
          >
            <FloorAccessibleRampArtwork
              testId="readonly-entrance-ramp-symbol"
              bounds={geometry}
              side={featureSide}
              direction={item.direction}
              layout={item.layout}
              flipHorizontal={item.flipHorizontal}
              flipVertical={item.flipVertical}
            />
          </g>
        );
      })}

      {/* Walking paths */}
      {visiblePaths.map((path) => (
        <PathVisual key={path.id} path={path} />
      ))}

      {/* Room fills form the back physical band. */}
      <g data-semantic-layer="room-fills">
        {sortedRooms.map((room) => (
          (() => {
            const interactive = interactiveRoomIds
              ? interactiveRoomIds.has(room.id)
              : Boolean(onRoomClick || onRoomHover);
            return <RoomVisual
              key={room.id}
              room={room}
              interactive={interactive}
              hovered={interactive && hoveredRoomId === room.id}
              highlighted={selectableHighlightedRoomId === room.id}
              mapMode={mapMode}
              onClick={interactive ? onRoomClick : undefined}
              onMouseEnter={interactive ? onRoomHover : undefined}
              onMouseLeave={interactive ? onRoomHoverEnd : undefined}
            />;
          })()
        ))}
      </g>

      {/* Selection is a separate student-only overlay above every room fill,
          but below authored furniture and architecture. */}
      {sortedRooms.filter((room) => room.id === selectableHighlightedRoomId).map((room) => (
        <RoomSelectionOverlay key={`readonly-room-selection-${room.id}`} room={room} />
      ))}

      {/* Furniture remains in its own local ordering band below architecture. */}
      <g data-semantic-layer="furniture">
        {visibleFurniture.map((item) => (
          <FurnitureVisual key={item.id} item={item} />
        ))}
      </g>

      {/* Walls cover Furniture, then attached openings cover the Wall strokes. */}
      <g data-semantic-layer="walls">
        {visibleWalls.map((wall) => (
          <WallVisual key={wall.id} wall={wall} />
        ))}
      </g>

      <g data-semantic-layer="openings">
        {visibleWindows.map((win) => (
          <WindowVisual key={win.id} window={win} wall={win.wallId ? wallById.get(win.wallId) : undefined} background={floor.backgroundColor ?? "#e8e1d7"} />
        ))}
        {visibleDoors.map((door) => (
          <DoorVisual
            key={door.id}
            door={door}
            wall={door.wallId ? wallById.get(door.wallId) : undefined}
            entrances={entranceById}
            background={floor.backgroundColor ?? "#e8e1d7"}
            onClick={onDoorClick}
            interactiveExit={interactiveExitDoorIds?.has(door.id)}
          />
        ))}
      </g>

      {/* Stairs */}
      {visibleStairs.map((stair) => (
        <StairsVisual key={stair.id} stairs={stair} floorIndex={floorIndex} floorCount={floorCount}
          canvasW={canvasW} canvasH={canvasH} exteriorEmergencyStairs={exteriorEmergencyStairs} />
      ))}

      {/* Ramps */}
      {visibleRamps.map((ramp) => (
        <RampVisual key={ramp.id} ramp={ramp} />
      ))}

      {/* Elevators */}
      {visibleElevators.map((elevator) => (
        <ElevatorVisual key={elevator.id} elevator={elevator} />
      ))}

      {/* Room names are an overlay, so physical content cannot obscure them. */}
      {sortedRooms.filter((room) => showLabels || room.id === selectableHighlightedRoomId).map((room) => (
        <RoomLabelVisual
          key={`readonly-room-label-${room.id}`}
          room={room}
          hovered={interactiveRoomIds ? interactiveRoomIds.has(room.id) && hoveredRoomId === room.id : hoveredRoomId === room.id}
          highlighted={selectableHighlightedRoomId === room.id}
        />
      ))}

      {/* Labels (rendered last, on top) */}
      {showLabels && visibleLabels.map((label) => (
        <LabelVisual key={label.id} label={label} />
      ))}
    </g>
  );
});
