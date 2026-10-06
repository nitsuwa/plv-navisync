import type {
  FloorDoor,
  FloorElevatorItem,
  FloorExtension,
  FloorFurniture,
  FloorLabel,
  FloorPlan,
  FloorPath,
  FloorRamp,
  FloorRoom,
  FloorSelection,
  FloorStairs,
  FloorWindow,
  FloorWall,
  FloorWallEndpointAnchor,
  NavigationNode,
} from "../components/map-builder/types";
import { exteriorZoneGeometry } from "./exteriorFloorZones";
import { roomOutlinePoints, roomShapeBounds, type RoomShapePoint } from "./roomShape";
import { constrainRectToFloorShape, floorShapeContainsPoint, floorShapeContainsPolygon, floorShapeContainsRect, floorShapeContainsSegment, getFloorExtensionRect, getFloorShapeBounds, getFloorShapeRegions, type FloorShapeRect } from "./floorShape";

export const DEFAULT_FLOOR_CANVAS = { w: 600, h: 450 };
export const MIN_FLOOR_CANVAS = { w: 120, h: 100 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  selection?: FloorSelection;
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function normalizeRotation(rotation: number) {
  const safe = Number.isFinite(rotation) ? rotation : 0;
  return Math.round(((safe % 360) + 360) % 360);
}

export function rotatePoint(point: { x: number; y: number }, cx: number, cy: number, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Resolve a point authored in an object's local top-left coordinate frame
 * into world coordinates. Transform controls and small status badges use
 * this instead of independently guessing positions for cardinal rotations.
 */
export function rotateObjectLocalPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  localX: number,
  localY: number,
  rotationDeg = 0,
) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return rotatePoint({ x: x + localX, y: y + localY }, cx, cy, rotationDeg);
}

function nearestPointOnLineSegment(point: { x: number; y: number }, segment: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: segment.x1, y: segment.y1, t: 0 };
  const t = clamp(((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lenSq, 0, 1);
  return { x: segment.x1 + t * dx, y: segment.y1 + t * dy, t };
}

export function roomAnchorSegments(room: FloorRoom) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const points = [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ].map((point) => rotatePoint(point, cx, cy, room.rotation ?? 0));
  const edges: FloorWallEndpointAnchor["edge"][] = ["top", "right", "bottom", "left"];
  return edges.map((edge, index) => ({
    edge,
    x1: points[index].x,
    y1: points[index].y,
    x2: points[(index + 1) % points.length].x,
    y2: points[(index + 1) % points.length].y,
  }));
}

export function resolveRoomAnchorPoint(room: FloorRoom | undefined, anchor: FloorWallEndpointAnchor | undefined) {
  if (!room || !anchor || anchor.targetType !== "room") return null;
  const segment = roomAnchorSegments(room).find((candidate) => candidate.edge === anchor.edge);
  if (!segment) return null;
  const offset = clamp(anchor.offset, 0, 1);
  return {
    x: segment.x1 + (segment.x2 - segment.x1) * offset,
    y: segment.y1 + (segment.y2 - segment.y1) * offset,
  };
}

export function roomAnchorAtPoint(room: FloorRoom, point: { x: number; y: number }, threshold: number): ({ anchor: FloorWallEndpointAnchor; x: number; y: number; d: number } | null) {
  let bestCorner: { anchor: FloorWallEndpointAnchor; x: number; y: number; d: number } | null = null;
  let bestEdge: { anchor: FloorWallEndpointAnchor; x: number; y: number; d: number } | null = null;
  for (const segment of roomAnchorSegments(room)) {
    for (const endpoint of [
      { x: segment.x1, y: segment.y1, offset: 0 },
      { x: segment.x2, y: segment.y2, offset: 1 },
    ]) {
      const d = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);
      if (d <= threshold && (!bestCorner || d < bestCorner.d)) {
        bestCorner = {
          x: endpoint.x,
          y: endpoint.y,
          d,
          anchor: { targetType: "room", roomId: room.id, edge: segment.edge, offset: endpoint.offset },
        };
      }
    }
    const edgePoint = nearestPointOnLineSegment(point, segment);
    const d = Math.hypot(point.x - edgePoint.x, point.y - edgePoint.y);
    if (d <= threshold && (!bestEdge || d < bestEdge.d)) {
      bestEdge = {
        x: edgePoint.x,
        y: edgePoint.y,
        d,
        anchor: { targetType: "room", roomId: room.id, edge: segment.edge, offset: edgePoint.t },
      };
    }
  }
  return bestCorner ?? bestEdge;
}

export function wallLength(wall: FloorWall) {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

export function formatWallLength(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export type WallLengthAnchor = "start" | "center" | "end";

export type WallStraightenAxis = "horizontal" | "vertical" | "nearest";

/**
 * Make an authored Wall exactly horizontal or vertical while preserving its
 * current length.  This is deliberately a geometry-only helper: callers own
 * Floor bounds, opening, and anchor validation, just as they do for
 * resizeWallToLength.
 */
export function straightenWall(
  wall: FloorWall,
  axis: WallStraightenAxis,
  keepFixed: WallLengthAnchor = "start",
): FloorWall {
  const length = wallLength(wall);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const resolvedAxis = axis === "nearest"
    ? Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical"
    : axis;
  const direction = resolvedAxis === "horizontal"
    ? (Math.sign(dx) || Math.sign(dy) || 1)
    : (Math.sign(dy) || Math.sign(dx) || 1);
  const ux = resolvedAxis === "horizontal" ? direction : 0;
  const uy = resolvedAxis === "vertical" ? direction : 0;
  const centerX = (wall.x1 + wall.x2) / 2;
  const centerY = (wall.y1 + wall.y2) / 2;

  if (keepFixed === "end") {
    return {
      ...wall,
      x1: wall.x2 - ux * length,
      y1: wall.y2 - uy * length,
    };
  }
  if (keepFixed === "center") {
    const half = length / 2;
    return {
      ...wall,
      x1: centerX - ux * half,
      y1: centerY - uy * half,
      x2: centerX + ux * half,
      y2: centerY + uy * half,
    };
  }
  return {
    ...wall,
    x2: wall.x1 + ux * length,
    y2: wall.y1 + uy * length,
  };
}

/**
 * Resize a Wall to an exact authored length while preserving its direction.
 * The caller is responsible for validating Floor bounds and attached
 * openings; this helper intentionally performs no grid quantization.
 */
export function resizeWallToLength(
  wall: FloorWall,
  requestedLength: number,
  keepFixed: WallLengthAnchor = "start",
): FloorWall {
  const length = Math.max(0, Number(requestedLength));
  const currentLength = wallLength(wall);
  const unitX = currentLength > 0.000001 ? (wall.x2 - wall.x1) / currentLength : 1;
  const unitY = currentLength > 0.000001 ? (wall.y2 - wall.y1) / currentLength : 0;
  const centerX = (wall.x1 + wall.x2) / 2;
  const centerY = (wall.y1 + wall.y2) / 2;

  if (keepFixed === "end") {
    return {
      ...wall,
      x1: wall.x2 - unitX * length,
      y1: wall.y2 - unitY * length,
    };
  }
  if (keepFixed === "center") {
    const half = length / 2;
    return {
      ...wall,
      x1: centerX - unitX * half,
      y1: centerY - unitY * half,
      x2: centerX + unitX * half,
      y2: centerY + unitY * half,
    };
  }
  return {
    ...wall,
    x2: wall.x1 + unitX * length,
    y2: wall.y1 + unitY * length,
  };
}

export function nearestEqualWallLength(
  walls: FloorWall[],
  candidateLength: number,
  excludedWallId: string,
  tolerance = 1.5,
) {
  let best: { wallId: string; length: number; distance: number } | null = null;
  for (const candidate of walls) {
    if (candidate.id === excludedWallId || candidate.managedKind === "perimeter") continue;
    const targetLength = wallLength(candidate);
    const distance = Math.abs(targetLength - candidateLength);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance || (distance === best.distance && targetLength < best.length)) {
      best = { wallId: candidate.id, length: targetLength, distance };
    }
  }
  return best;
}

export function nearestPointOnWall(point: { x: number; y: number }, wall: FloorWall) {
  const nearest = nearestPointOnLineSegment(point, wall);
  return {
    ...nearest,
    d: Math.hypot(point.x - nearest.x, point.y - nearest.y),
  };
}

export function normalizeWallRoomAnchors(wall: FloorWall, rooms: FloorRoom[], threshold = 8) {
  const shouldEvaluate = !!wall.startAnchor || !!wall.endAnchor;
  if (!shouldEvaluate) return wall;
  const endpointAnchor = (point: { x: number; y: number }) => {
    let best: ReturnType<typeof roomAnchorAtPoint> = null;
    for (const room of rooms) {
      const candidate = roomAnchorAtPoint(room, point, threshold);
      if (candidate && (!best || candidate.d < best.d)) best = candidate;
    }
    return best;
  };
  const start = endpointAnchor({ x: wall.x1, y: wall.y1 });
  const end = endpointAnchor({ x: wall.x2, y: wall.y2 });
  let next = { ...wall };
  if (start) {
    next.x1 = start.x;
    next.y1 = start.y;
    next.startAnchor = start.anchor;
  } else {
    delete next.startAnchor;
  }
  if (end) {
    next.x2 = end.x;
    next.y2 = end.y;
    next.endAnchor = end.anchor;
  } else {
    delete next.endAnchor;
  }
  return next;
}

export interface WallOpeningGeometry {
  x: number;
  y: number;
  offset: number;
  width: number;
  length: number;
  angle: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  wall: FloorWall;
}

export function wallOpeningSafetyUnits(openingWidth: number, wallThickness: number) {
  return Math.max(6, wallThickness + 6, openingWidth * 0.08);
}

function doorOpeningType(door: FloorDoor) {
  return door.doorType ?? (door.direction === "double" ? "double" : "single");
}

function doorOpeningMinWidth(door: FloorDoor) {
  return doorOpeningType(door) === "double" ? 28 : 10;
}

function doorOpeningMaxWidth(door: FloorDoor) {
  return doorOpeningType(door) === "double" ? 72 : 48;
}

export function maxOpeningWidthForWall(wall: FloorWall, requestedMax: number, minWidth: number) {
  const length = wallLength(wall);
  if (length < 1) return minWidth;
  const safety = wallOpeningSafetyUnits(minWidth, wall.thickness);
  return Math.max(minWidth, Math.min(requestedMax, length - safety * 2));
}

export function clampWallOpeningOffset(wall: FloorWall, width: number, requestedOffset: number) {
  const length = wallLength(wall);
  if (length < 1) return 0.5;
  const safety = wallOpeningSafetyUnits(width, wall.thickness);
  const inset = Math.min(0.5, (width / 2 + safety) / length);
  return clamp(requestedOffset, inset, 1 - inset);
}

export function resolveWallOpeningGeometry(opening: FloorDoor | FloorWindow, wall: FloorWall | undefined): WallOpeningGeometry | null {
  if (!wall) return null;
  const length = wallLength(wall);
  if (length < 1) return null;
  const minWidth = "direction" in opening ? doorOpeningMinWidth(opening as FloorDoor) : Math.min(4, length);
  const width = clamp(opening.width, Math.min(minWidth, length), Math.max(Math.min(minWidth, length), length - wallOpeningSafetyUnits(opening.width, wall.thickness) * 2));
  const requestedOffset = Number.isFinite(opening.offset) ? opening.offset! : nearestPointOnWall({ x: opening.x, y: opening.y }, wall).t;
  const offset = clampWallOpeningOffset(wall, width, requestedOffset);
  const tx = (wall.x2 - wall.x1) / length;
  const ty = (wall.y2 - wall.y1) / length;
  const x = wall.x1 + (wall.x2 - wall.x1) * offset;
  const y = wall.y1 + (wall.y2 - wall.y1) * offset;
  return {
    x,
    y,
    offset,
    width,
    length,
    angle: (Math.atan2(ty, tx) * 180) / Math.PI,
    tx,
    ty,
    nx: -ty,
    ny: tx,
    wall,
  };
}

/**
 * Returns the physical aperture interval measured along a wall's local axis.
 * Interaction affordances (selection handles, labels, swing arcs, and hit
 * padding) deliberately do not participate in this span.
 */
export function wallOpeningSpan(opening: FloorDoor | FloorWindow, wall: FloorWall | undefined) {
  const geometry = resolveWallOpeningGeometry(opening, wall);
  if (!geometry) return null;
  const center = geometry.offset * geometry.length;
  return {
    start: center - geometry.width / 2,
    end: center + geometry.width / 2,
    width: geometry.width,
  };
}

/**
 * Tests whether two wall-mounted apertures overlap on the same physical wall.
 * A small tolerance permits adjacent openings to touch at their jambs without
 * treating a shared edge as an overlap.
 */
export function wallOpeningSpansOverlap(
  first: FloorDoor | FloorWindow,
  second: FloorDoor | FloorWindow,
  wall: FloorWall | undefined,
  tolerance = 0.5,
) {
  if (!wall || first.wallId !== wall.id || second.wallId !== wall.id) return false;
  const firstSpan = wallOpeningSpan(first, wall);
  const secondSpan = wallOpeningSpan(second, wall);
  if (!firstSpan || !secondSpan) return false;
  const overlap = Math.min(firstSpan.end, secondSpan.end) - Math.max(firstSpan.start, secondSpan.start);
  return overlap > Math.max(0, tolerance);
}

export function syncOpeningsToWalls(doors: FloorDoor[], windows: FloorWindow[], walls: FloorWall[]) {
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  return {
    doors: doors.map((door) => {
      const geom = door.wallId ? resolveWallOpeningGeometry(door, wallById.get(door.wallId)) : null;
      return geom ? { ...door, x: Math.round(geom.x), y: Math.round(geom.y), offset: geom.offset, width: Math.round(geom.width) } : door;
    }),
    windows: windows.map((win) => {
      const geom = win.wallId ? resolveWallOpeningGeometry(win, wallById.get(win.wallId)) : null;
      return geom ? { ...win, x: Math.round(geom.x), y: Math.round(geom.y), offset: geom.offset, width: Math.round(geom.width) } : win;
    }),
  };
}

export interface PerimeterOpeningProjection<T extends FloorDoor | FloorWindow> {
  openings: T[];
  /** Openings whose old perimeter host no longer has a deterministic physical continuation. */
  unresolved: Array<{ id: string; type: "door" | "window"; reason: string }>;
}

type PerimeterEdge = "top" | "right" | "bottom" | "left";
type PerimeterHostFeature =
  | { kind: "extension"; extensionId: string; edge: PerimeterEdge; position: number }
  | { kind: "base"; edge: PerimeterEdge; position: number }
  | { kind: "side"; edge: PerimeterEdge; position: number };

function perimeterFeatureSegment(
  edge: PerimeterEdge,
  rect: { x: number; y: number; width: number; height: number },
) {
  if (edge === "top") return { x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y };
  if (edge === "right") return { x1: rect.x + rect.width, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height };
  if (edge === "bottom") return { x1: rect.x, y1: rect.y + rect.height, x2: rect.x + rect.width, y2: rect.y + rect.height };
  return { x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.height };
}

function segmentAxisOverlap(wall: FloorWall, segment: { x1: number; y1: number; x2: number; y2: number }, epsilon = 0.1) {
  const wallHorizontal = Math.abs(wall.y2 - wall.y1) <= epsilon;
  const segmentHorizontal = Math.abs(segment.y2 - segment.y1) <= epsilon;
  if (wallHorizontal !== segmentHorizontal) return 0;
  const lineDelta = wallHorizontal ? Math.abs(wall.y1 - segment.y1) : Math.abs(wall.x1 - segment.x1);
  if (lineDelta > epsilon) return 0;
  const wallLow = wallHorizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
  const wallHigh = wallHorizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
  const segmentLow = wallHorizontal ? Math.min(segment.x1, segment.x2) : Math.min(segment.y1, segment.y2);
  const segmentHigh = wallHorizontal ? Math.max(segment.x1, segment.x2) : Math.max(segment.y1, segment.y2);
  return Math.max(0, Math.min(wallHigh, segmentHigh) - Math.max(wallLow, segmentLow));
}

function openingCenterOnWall(opening: FloorDoor | FloorWindow, wall: FloorWall) {
  const t = Number.isFinite(opening.offset) ? clamp(opening.offset!, 0, 1) : nearestPointOnWall({ x: opening.x, y: opening.y }, wall).t;
  return { x: wall.x1 + (wall.x2 - wall.x1) * t, y: wall.y1 + (wall.y2 - wall.y1) * t };
}

function perimeterHostFeature(
  wall: FloorWall,
  center: { x: number; y: number },
  extensions: FloorExtension[],
  canvasW: number,
  canvasH: number,
): PerimeterHostFeature {
  const extensionMatches = extensions.flatMap((extension) => {
    const rect = getFloorExtensionRect(extension, canvasW, canvasH);
    return (["top", "right", "bottom", "left"] as const).map((edge) => ({
      extension,
      edge,
      overlap: segmentAxisOverlap(wall, perimeterFeatureSegment(edge, rect)),
    })).filter((match) => match.overlap > 0.1);
  }).sort((a, b) => b.overlap - a.overlap || a.extension.id.localeCompare(b.extension.id));
  const horizontal = Math.abs(wall.y2 - wall.y1) <= 0.1;
  const position = horizontal ? center.x : center.y;
  const extensionMatch = extensionMatches[0];
  if (extensionMatch) return { kind: "extension", extensionId: extensionMatch.extension.id, edge: extensionMatch.edge, position };

  const baseEdges: Array<{ edge: PerimeterEdge; line: number; delta: number }> = horizontal
    ? [{ edge: "top", line: 0, delta: Math.abs(wall.y1) }, { edge: "bottom", line: canvasH, delta: Math.abs(wall.y1 - canvasH) }]
    : [{ edge: "left", line: 0, delta: Math.abs(wall.x1) }, { edge: "right", line: canvasW, delta: Math.abs(wall.x1 - canvasW) }];
  const base = baseEdges.find((candidate) => candidate.delta <= 0.1);
  if (base) return { kind: "base", edge: base.edge, position };
  return { kind: "side", edge: (wall.perimeterSide as PerimeterEdge | undefined) ?? (horizontal ? "top" : "left"), position };
}

function pointAtAxisPosition(wall: FloorWall, position: number) {
  if (Math.abs(wall.y2 - wall.y1) <= 0.1) return { x: position, y: (wall.y1 + wall.y2) / 2 };
  return { x: (wall.x1 + wall.x2) / 2, y: position };
}

/**
 * Reprojects existing Door/Window records from their current managed
 * perimeter host onto the matching edge of a draft outline. It keeps the
 * opening identity and all non-geometric fields. If the physical host edge
 * vanished, the opening is retained and returned as a specific blocker.
 */
export function reprojectManagedPerimeterOpenings<T extends FloorDoor | FloorWindow>(
  openings: T[],
  previousWalls: FloorWall[],
  nextWalls: FloorWall[],
  previousExtensions: FloorExtension[] | undefined,
  nextExtensions: FloorExtension[] | undefined,
  canvasW: number,
  canvasH: number,
): PerimeterOpeningProjection<T> {
  const previousExtensionList = previousExtensions ?? [];
  const nextExtensionList = nextExtensions ?? [];
  const previousWallById = new Map(previousWalls.map((wall) => [wall.id, wall]));
  const nextPerimeter = nextWalls.filter((wall) => wall.managedKind === "perimeter");
  const unresolved: PerimeterOpeningProjection<T>["unresolved"] = [];
  const projected = openings.map((opening) => {
    const oldHost = opening.wallId ? previousWallById.get(opening.wallId) : undefined;
    if (!oldHost || oldHost.managedKind !== "perimeter") return opening;

    const sourceCenter = openingCenterOnWall(opening, oldHost);
    const feature = perimeterHostFeature(oldHost, sourceCenter, previousExtensionList, canvasW, canvasH);
    let candidateWalls: FloorWall[] = [];
    let desired = sourceCenter;
    if (feature.kind === "extension") {
      const nextExtension = nextExtensionList.find((extension) => extension.id === feature.extensionId);
      if (nextExtension) {
        const segment = perimeterFeatureSegment(feature.edge, getFloorExtensionRect(nextExtension, canvasW, canvasH));
        const horizontal = Math.abs(segment.y2 - segment.y1) <= 0.1;
        const start = horizontal ? segment.x1 : segment.y1;
        const end = horizontal ? segment.x2 : segment.y2;
        const oldRect = getFloorExtensionRect(previousExtensionList.find((extension) => extension.id === feature.extensionId)!, canvasW, canvasH);
        const oldSegment = perimeterFeatureSegment(feature.edge, oldRect);
        const oldStart = horizontal ? oldSegment.x1 : oldSegment.y1;
        const oldEnd = horizontal ? oldSegment.x2 : oldSegment.y2;
        const oldPosition = horizontal ? sourceCenter.x : sourceCenter.y;
        const ratio = Math.max(0, Math.min(1, (oldPosition - oldStart) / Math.max(1, oldEnd - oldStart)));
        const targetPosition = start + (end - start) * ratio;
        desired = pointAtAxisPosition(segment as FloorWall, targetPosition);
        candidateWalls = nextPerimeter.filter((wall) => segmentAxisOverlap(wall, segment) > 0.1);
      }
    } else if (feature.kind === "base") {
      const baseRect = { x: 0, y: 0, width: canvasW, height: canvasH };
      const segment = perimeterFeatureSegment(feature.edge, baseRect);
      const horizontal = Math.abs(segment.y2 - segment.y1) <= 0.1;
      const targetPosition = horizontal ? sourceCenter.x : sourceCenter.y;
      desired = pointAtAxisPosition(segment as FloorWall, targetPosition);
      candidateWalls = nextPerimeter.filter((wall) => segmentAxisOverlap(wall, oldHost) > 0.1
        && segmentAxisOverlap(wall, segment) > 0.1);
    } else {
      candidateWalls = nextPerimeter.filter((wall) => wall.perimeterSide === feature.edge
        && segmentAxisOverlap(wall, oldHost) > 0.1);
    }

    const candidate = candidateWalls
      .map((wall) => ({ wall, projection: nearestPointOnWall(desired, wall) }))
      .sort((a, b) => a.projection.d - b.projection.d
        || Number(b.wall.id === opening.wallId) - Number(a.wall.id === opening.wallId)
        || a.wall.id.localeCompare(b.wall.id))[0]?.wall;
    if (!candidate) {
      unresolved.push({
        id: opening.id,
        type: "direction" in opening ? "door" : "window",
        reason: `${"direction" in opening ? "Door" : "Window"} “${"label" in opening && opening.label ? opening.label : opening.id}” needs to be reattached to the new Floor perimeter.`,
      });
      return opening;
    }

    const length = wallLength(candidate);
    const width = Math.max(0, Number(opening.width) || 0);
    const safety = wallOpeningSafetyUnits(width, candidate.thickness);
    if (length + 0.01 < width + safety * 2) {
      unresolved.push({
        id: opening.id,
        type: "direction" in opening ? "door" : "window",
        reason: `${"direction" in opening ? "Door" : "Window"} “${"label" in opening && opening.label ? opening.label : opening.id}” no longer fits its perimeter segment.`,
      });
      return opening;
    }
    const nearest = nearestPointOnWall(desired, candidate);
    const offset = clampWallOpeningOffset(candidate, width, nearest.t);
    return {
      ...opening,
      wallId: candidate.id,
      x: Math.round(candidate.x1 + (candidate.x2 - candidate.x1) * offset),
      y: Math.round(candidate.y1 + (candidate.y2 - candidate.y1) * offset),
      offset,
    } as T;
  });
  return { openings: projected, unresolved };
}

export function floorResizeIssues(floor: FloorPlan, canvasW: number, canvasH: number) {
  const synced = syncOpeningsToWalls(floor.doors, floor.windows, floor.walls);
  const candidate = { ...floor, canvasW, canvasH, doors: synced.doors, windows: synced.windows };
  return validateFloorGeometry(candidate);
}

export function summarizeFloorResizeIssues(issues: FloorIssue[]) {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const type = issue.selection?.type;
    const label = type === "room" ? "rooms"
      : type === "wall" ? "walls"
        : type === "door" ? "doors"
          : type === "window" ? "windows"
            : type === "furniture" ? "furniture"
              : type === "stairs" ? "stairs"
                : type === "ramp" ? "ramps"
                  : type === "elevator" ? "elevators"
                    : type === "label" ? "labels"
                      : "objects";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) => `${count} ${label}`).join(", ");
}

export function clearWallRoomAnchors(wall: FloorWall, roomIds: Set<string>) {
  const next = { ...wall };
  if (next.startAnchor?.targetType === "room" && roomIds.has(next.startAnchor.roomId)) delete next.startAnchor;
  if (next.endAnchor?.targetType === "room" && roomIds.has(next.endAnchor.roomId)) delete next.endAnchor;
  return next;
}

export function applyRoomAnchorsToWalls(rooms: FloorRoom[], walls: FloorWall[], changedRoomIds: Set<string>, skipWallIds = new Set<string>()) {
  if (changedRoomIds.size === 0) return walls;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return walls.map((wall) => {
    if (skipWallIds.has(wall.id)) return wall;
    let next = wall;
    const start = wall.startAnchor?.targetType === "room" && changedRoomIds.has(wall.startAnchor.roomId)
      ? resolveRoomAnchorPoint(roomById.get(wall.startAnchor.roomId), wall.startAnchor)
      : null;
    const end = wall.endAnchor?.targetType === "room" && changedRoomIds.has(wall.endAnchor.roomId)
      ? resolveRoomAnchorPoint(roomById.get(wall.endAnchor.roomId), wall.endAnchor)
      : null;
    if (start) next = { ...next, x1: start.x, y1: start.y };
    if (end) next = { ...next, x2: end.x, y2: end.y };
    return next;
  });
}

export function lockedWallsAffectedByRoomAnchors(rooms: FloorRoom[], walls: FloorWall[], changedRoomIds: Set<string>, skipWallIds = new Set<string>()) {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return walls.some((wall) => {
    if (!wall.locked || skipWallIds.has(wall.id)) return false;
    const start = wall.startAnchor?.targetType === "room" && changedRoomIds.has(wall.startAnchor.roomId)
      ? resolveRoomAnchorPoint(roomById.get(wall.startAnchor.roomId), wall.startAnchor)
      : null;
    const end = wall.endAnchor?.targetType === "room" && changedRoomIds.has(wall.endAnchor.roomId)
      ? resolveRoomAnchorPoint(roomById.get(wall.endAnchor.roomId), wall.endAnchor)
      : null;
    return (start && Math.hypot(start.x - wall.x1, start.y - wall.y1) > 0.1) ||
      (end && Math.hypot(end.x - wall.x2, end.y - wall.y2) > 0.1);
  });
}

export function wallLengthLabelPosition(wall: FloorWall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx *= -1;
    ny *= -1;
  }
  const offset = wall.thickness / 2 + 12;
  const x = (wall.x1 + wall.x2) / 2 + nx * offset;
  const y = (wall.y1 + wall.y2) / 2 + ny * offset;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  angle = normalizeRotation(angle);
  return { x, y, angle };
}

export function worldDeltaToLocal(dx: number, dy: number, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dx * cos + dy * sin, dy: -dx * sin + dy * cos };
}

/**
 * CSS only exposes four resize-cursor families. Map a local transform handle
 * into the closest screen-space family so the cursor follows rotated
 * circulation objects while the resize math continues to operate in local
 * coordinates.
 */
export function rotationAwareResizeCursor(handle: string, rotationDeg = 0) {
  const normalized = ((Number(rotationDeg) || 0) % 180 + 180) % 180;
  if (handle === "n" || handle === "s" || handle === "e" || handle === "w") {
    const localAngle = handle === "n" || handle === "s" ? 90 : 0;
    const angle = (localAngle + normalized) % 180;
    return angle >= 45 && angle < 135 ? "ns-resize" : "ew-resize";
  }
  const localAngle = handle === "nw" || handle === "se" ? 45 : 135;
  const angle = (localAngle + normalized) % 180;
  return angle < 90 ? "nwse-resize" : "nesw-resize";
}

/** Approximate rendered width of a label at its current font size. */
export function labelWidth(label: FloorLabel) {
  return Math.max(10, label.text.length * label.fontSize * 0.6);
}

/** World bounds of a label, honoring its horizontal alignment anchor. */
export function labelBounds(label: FloorLabel) {
  const w = labelWidth(label);
  const h = label.fontSize + 4;
  const x = label.align === "center" ? label.x - w / 2 : label.align === "right" ? label.x - w : label.x;
  return { x, y: label.y - label.fontSize, w, h };
}

/** Keep a label fully inside the floor canvas after text/font-size changes. */
export function constrainLabelToFloor(label: FloorLabel, canvasW: number, canvasH: number, shapeRegions?: FloorShapeRect[]): FloorLabel {
  const bounds = labelBounds(label);
  if (shapeRegions) {
    if (floorShapeContainsRect(shapeRegions, { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h })) return label;
    const position = constrainRectToFloorShape(shapeRegions, { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h });
    const dx = position.x - bounds.x;
    const dy = position.y - bounds.y;
    const candidate = { ...label, x: Math.round(label.x + dx), y: Math.round(label.y + dy) };
    return floorItemFitsFloorShape("label", candidate, shapeRegions) ? candidate : label;
  }
  let x = label.x;
  let y = label.y;
  if (bounds.x < 0) x += -bounds.x;
  if (bounds.x + bounds.w > canvasW) x -= bounds.x + bounds.w - canvasW;
  if (bounds.y < 0) y += -bounds.y;
  if (bounds.y + bounds.h > canvasH) y -= bounds.y + bounds.h - canvasH;
  return { ...label, x: Math.round(x), y: Math.round(y) };
}

export function normalizeFloorCanvasSize(w: unknown, h: unknown) {
  const width = typeof w === "number" ? w : Number(w);
  const height = typeof h === "number" ? h : Number(h);
  return {
    w: Number.isFinite(width) && width >= MIN_FLOOR_CANVAS.w ? Math.round(width) : DEFAULT_FLOOR_CANVAS.w,
    h: Number.isFinite(height) && height >= MIN_FLOOR_CANVAS.h ? Math.round(height) : DEFAULT_FLOOR_CANVAS.h,
  };
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function isRectInsideFloor(rect: Rect, canvasW: number, canvasH: number) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= canvasW && rect.y + rect.h <= canvasH;
}

export function itemBounds(type: FloorSelection["type"], item: unknown): Rect | null {
  const value = item as any;
  if (!value) return null;
  if (type === "wall") {
    const wall = value as FloorWall;
    return {
      x: Math.min(wall.x1, wall.x2),
      y: Math.min(wall.y1, wall.y2),
      w: Math.abs(wall.x2 - wall.x1),
      h: Math.abs(wall.y2 - wall.y1),
    };
  }
  if (type === "room") {
    const room = value as FloorRoom;
    return rotatedRectBounds(room.x, room.y, room.w, room.h, room.rotation ?? 0);
  }
  if (type === "door") {
    const door = value as FloorDoor;
    return { x: door.x - door.width / 2, y: door.y - 4, w: door.width, h: 8 };
  }
  if (type === "window") {
    const win = value as FloorWindow;
    if (win.wallId) return { x: win.x - win.width / 2, y: win.y - 4, w: win.width, h: 8 };
    return { x: win.x, y: win.y, w: win.width, h: win.height };
  }
  if (type === "furniture") {
    const furniture = value as FloorFurniture;
    return rotatedRectBounds(furniture.x, furniture.y, furniture.width, furniture.height, furniture.rotation);
  }
  if (type === "stairs") {
    const stairs = value as FloorStairs;
    return rotatedRectBounds(stairs.x, stairs.y, stairs.width, stairs.height, stairs.rotation ?? 0);
  }
  if (type === "ramp") {
    const ramp = value as FloorRamp;
    return rotatedRectBounds(ramp.x, ramp.y, ramp.width, ramp.height, ramp.rotation ?? 0);
  }
  if (type === "elevator") {
    const elevator = value as FloorElevatorItem;
    return rotatedRectBounds(elevator.x, elevator.y, elevator.width, elevator.height, elevator.rotation ?? 0);
  }
  if (type === "entranceSteps" || type === "entranceRamp") {
    return rotatedRectBounds(value.x, value.y, value.width, value.height, value.rotation ?? 0);
  }
  if (type === "exteriorZone") {
    if (typeof value.x !== "number" || typeof value.y !== "number") return null;
    return { x: value.x, y: value.y, w: value.width ?? 0, h: value.depth ?? 0 };
  }
  if (type === "label") {
    return labelBounds(value as FloorLabel);
  }
  return null;
}

function rectanglePolygon(x: number, y: number, width: number, height: number, rotation = 0) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
  ].map((point) => rotatePoint(point, cx, cy, rotation));
}

/** Returns true when an item's actual footprint lies in the combined Floor
 * shape. Rotated rectangular objects and custom Rooms use their real polygon,
 * rather than the larger axis-aligned box around them. */
export function floorItemFitsFloorShape(type: FloorSelection["type"], item: any, regions: FloorShapeRect[]) {
  if (!item || type === "exteriorZone" || type === "entranceSteps" || type === "entranceRamp") return true;
  if (type === "wall") {
    return floorShapeContainsSegment(regions, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 });
  }
  if (type === "path") {
    const points = (item as FloorPath).points ?? [];
    return points.every((point) => floorShapeContainsPoint(regions, point.x, point.y))
      && points.slice(1).every((point, index) => floorShapeContainsSegment(regions, points[index], point));
  }
  if (type === "door") return floorShapeContainsPoint(regions, Number(item.x), Number(item.y));
  if (type === "window" && item.wallId) return floorShapeContainsPoint(regions, Number(item.x), Number(item.y));
  if (type === "room") return floorShapeContainsPolygon(regions, roomOutlinePoints(item as FloorRoom));
  if (["furniture", "stairs", "ramp", "elevator", "entranceSteps", "entranceRamp"].includes(type)) {
    return floorShapeContainsPolygon(regions, rectanglePolygon(
      Number(item.x), Number(item.y), Number(item.width), Number(item.height), Number(item.rotation ?? 0),
    ));
  }
  const bounds = itemBounds(type, item);
  return !bounds || floorShapeContainsRect(regions, { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h });
}

export interface FloorShapeFitIssueDetail {
  id: string;
  type: FloorSelection["type"] | "navigation";
  label: string;
  name: string;
  position: { x: number; y: number };
  reason: string;
}

function floorShapeItemPosition(type: FloorSelection["type"], item: any): { x: number; y: number } {
  if (type === "wall") return { x: (Number(item.x1) + Number(item.x2)) / 2, y: (Number(item.y1) + Number(item.y2)) / 2 };
  if (type === "path") {
    const points = item.points ?? [];
    return points.length ? { x: points[0].x, y: points[0].y } : { x: 0, y: 0 };
  }
  const bounds = itemBounds(type, item);
  return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : { x: Number(item.x) || 0, y: Number(item.y) || 0 };
}

function openingFitsWall(opening: FloorDoor | FloorWindow, wall: FloorWall) {
  return wallLength(wall) + 0.01 >= Math.max(0, Number(opening.width) || 0)
    + wallOpeningSafetyUnits(Math.max(0, Number(opening.width) || 0), wall.thickness) * 2;
}

/**
 * Classifies only authored physical Floor data and independent indoor
 * navigation points. Hosted Door/Window graphics and generated physical
 * navigation anchors are validated through their hosts rather than through
 * rendered bounds that intentionally straddle the perimeter.
 */
export function collectFloorShapeFitIssues(
  floor: FloorPlan,
  regions: FloorShapeRect[],
  options: {
    exteriorEmergencyStairIds?: ReadonlySet<string>;
    navNodes?: NavigationNode[];
    unresolvedOpenings?: Array<{ id: string; type: "door" | "window"; reason: string }>;
  } = {},
): FloorShapeFitIssueDetail[] {
  const invalid: FloorShapeFitIssueDetail[] = [];
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const unresolvedById = new Map((options.unresolvedOpenings ?? []).map((opening) => [opening.id, opening]));
  const addIssue = (type: FloorShapeFitIssueDetail["type"], item: any, label: string, reason: string) => {
    const position = type === "navigation" ? { x: Number(item.x) || 0, y: Number(item.y) || 0 } : floorShapeItemPosition(type, item);
    invalid.push({
      id: String(item.id),
      type,
      label,
      name: String(item.name ?? item.label ?? item.text ?? item.id),
      position,
      reason,
    });
  };
  const check = (type: FloorSelection["type"], items: any[], label: string) => {
    for (const item of items ?? []) {
      if (!item?.id || (type === "wall" && item.managedKind === "perimeter")) continue;
      if (type === "furniture" && item.exteriorZoneId) continue;
      if (type === "stairs" && options.exteriorEmergencyStairIds?.has(item.id)) continue;
      if (type === "door" || type === "window") {
        const unresolved = unresolvedById.get(item.id);
        if (unresolved) {
          addIssue(type, item, label, unresolved.reason);
          continue;
        }
        const host = item.wallId ? wallById.get(item.wallId) : undefined;
        if (item.wallId && !host) {
          addIssue(type, item, label, `${label} “${item.label || item.id}” refers to a missing host Wall.`);
          continue;
        }
        if (host && !openingFitsWall(item, host)) {
          addIssue(type, item, label, `${label} “${item.label || item.id}” does not fit its host Wall.`);
          continue;
        }
        if (!floorShapeContainsPoint(regions, Number(item.x), Number(item.y), 0.01)) {
          addIssue(type, item, label, `${label} center is outside the draft Floor perimeter.`);
        }
        continue;
      }
      if (!floorItemFitsFloorShape(type, item, regions)) {
        const reason = type === "wall" ? "Wall segment crosses outside the draft Floor perimeter."
          : type === "path" ? "Path geometry crosses outside the draft Floor perimeter."
            : `${label} footprint is not contained by the draft Floor union.`;
        addIssue(type, item, label, reason);
      }
    }
  };

  check("room", floor.rooms, "Room");
  check("wall", floor.walls, "Wall");
  check("door", floor.doors, "Door");
  check("window", floor.windows, "Window");
  check("furniture", floor.furniture, "Furniture");
  check("stairs", floor.stairs, "Stair");
  check("ramp", floor.ramps, "Ramp");
  check("elevator", floor.elevators, "Elevator");
  check("label", floor.labels, "Label");
  check("path", floor.paths, "Path");

  (options.navNodes ?? []).filter((node) => node.buildingId === floor.buildingId && node.floorId === floor.id).forEach((node) => {
    // A node already hosted by an authored object, Entrance, exterior feature,
    // or generated path vertex follows that owner's validation above.
    const hasPhysicalHost = Boolean(node.roomId || node.doorId || node.stairId || node.elevatorId || node.rampId
      || node.buildingEntranceId || node.entranceId || node.exteriorEmergencyStairId || node.exteriorZoneId
      || node.derivedOwnerType || node.derivedOwnerId || node.generatedFromPathVertices?.length);
    if (hasPhysicalHost) return;
    if (!floorShapeContainsPoint(regions, node.x, node.y, 0.01)) {
      addIssue("navigation", node, "Navigation point", "Authored indoor navigation point is outside the draft Floor perimeter.");
    }
  });
  return invalid;
}

function translateFloorItemRaw(type: FloorSelection["type"], item: any, dx: number, dy: number) {
  if (type === "wall") return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
  if (type === "path") return { ...item, points: (item as FloorPath).points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  if (type === "room" && Array.isArray(item.shapePoints)) {
    return { ...item, x: item.x + dx, y: item.y + dy, shapePoints: item.shapePoints.map((point: RoomShapePoint) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  return { ...item, x: item.x + dx, y: item.y + dy };
}

/** Constrains a rigid translation to the combined Floor union. The source
 * geometry is kept intact and the requested delta is reduced only when the
 * final physical footprints would leave the usable shape. */
export function constrainFloorItemsDelta(
  entries: Array<{ type: FloorSelection["type"]; item: any }>,
  dx: number,
  dy: number,
  regions: FloorShapeRect[],
) {
  const fits = (fraction: number) => entries.every(({ type, item }) =>
    floorItemFitsFloorShape(type, translateFloorItemRaw(type, item, dx * fraction, dy * fraction), regions));
  if (fits(1)) return { dx, dy };
  if (!fits(0)) return { dx: 0, dy: 0 };
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return { dx: dx * low, dy: dy * low };
}

export function constrainDeltaForBounds(bounds: Rect[], dx: number, dy: number, canvasW: number, canvasH: number) {
  let nextDx = dx;
  let nextDy = dy;
  for (const b of bounds) {
    nextDx = clamp(nextDx, -b.x, canvasW - (b.x + b.w));
    nextDy = clamp(nextDy, -b.y, canvasH - (b.y + b.h));
  }
  return { dx: nextDx, dy: nextDy };
}

export function translateFloorItem(type: FloorSelection["type"], item: any, dx: number, dy: number, canvasW: number, canvasH: number, shapeRegions?: FloorShapeRect[]) {
  if (shapeRegions) {
    const delta = constrainFloorItemsDelta([{ type, item }], dx, dy, shapeRegions);
    return translateFloorItemRaw(type, item, delta.dx, delta.dy);
  }
  const bounds = itemBounds(type, item);
  const delta = bounds ? constrainDeltaForBounds([bounds], dx, dy, canvasW, canvasH) : { dx, dy };
  if (type === "wall") return { ...item, x1: item.x1 + delta.dx, y1: item.y1 + delta.dy, x2: item.x2 + delta.dx, y2: item.y2 + delta.dy };
  if (type === "room" && Array.isArray(item.shapePoints)) {
    return {
      ...item,
      x: item.x + delta.dx,
      y: item.y + delta.dy,
      shapePoints: item.shapePoints.map((point: RoomShapePoint) => ({ x: point.x + delta.dx, y: point.y + delta.dy })),
    };
  }
  return { ...item, x: item.x + delta.dx, y: item.y + delta.dy };
}

export function resizeRoomWithinFloor(room: FloorRoom, corner: string, dx: number, dy: number, canvasW: number, canvasH: number, shapeRegions?: FloorShapeRect[]): FloorRoom {
  const baseShapePoints = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3
    ? room.shapePoints.map((point) => ({ x: point.x, y: point.y }))
    : null;
  const resizeShapeWithBounds = (next: FloorRoom) => {
    if (!baseShapePoints) return next;
    const oldBounds = roomShapeBounds(baseShapePoints);
    if (oldBounds.w < 0.001 || oldBounds.h < 0.001) return next;
    const sx = next.w / oldBounds.w;
    const sy = next.h / oldBounds.h;
    return {
      ...next,
      shapePoints: baseShapePoints.map((point) => ({
        x: next.x + (point.x - oldBounds.x) * sx,
        y: next.y + (point.y - oldBounds.y) * sy,
      })),
    };
  };
  const buildCandidate = (scale: number) => {
  if ((room.rotation ?? 0) % 360 === 0) {
    let x = room.x;
    let y = room.y;
    let w = room.w;
    let h = room.h;
    if (corner.includes("e")) w = shapeRegions ? Math.max(20, room.w + dx * scale) : clamp(room.w + dx * scale, 20, canvasW - room.x);
    if (corner.includes("s")) h = shapeRegions ? Math.max(15, room.h + dy * scale) : clamp(room.h + dy * scale, 15, canvasH - room.y);
    if (corner.includes("w")) {
      const nextX = shapeRegions ? Math.min(room.x + room.w - 20, room.x + dx * scale) : clamp(room.x + dx * scale, 0, room.x + room.w - 20);
      w = room.w + (room.x - nextX);
      x = nextX;
    }
    if (corner.includes("n")) {
      const nextY = shapeRegions ? Math.min(room.y + room.h - 15, room.y + dy * scale) : clamp(room.y + dy * scale, 0, room.y + room.h - 15);
      h = room.h + (room.y - nextY);
      y = nextY;
    }
    return resizeShapeWithBounds({ ...room, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
  const base = { ...room, width: room.w, height: room.h, rotation: room.rotation ?? 0 };
  const maxBounds = shapeRegions ? getFloorShapeBounds(shapeRegions) : undefined;
  const resized = resizeRectLocal(base, corner, dx * scale, dy * scale, canvasW, canvasH, 20, 15, maxBounds?.width ?? canvasW, maxBounds?.height ?? canvasH, false, !shapeRegions);
  const { width, height, ...rest } = resized;
  return resizeShapeWithBounds({ ...rest, x: Math.round(resized.x), y: Math.round(resized.y), w: Math.round(width), h: Math.round(height) });
  };
  const candidate = buildCandidate(1);
  if (!shapeRegions || floorItemFitsFloorShape("room", candidate, shapeRegions)) return candidate;
  if (!floorItemFitsFloorShape("room", room, shapeRegions)) return room;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (floorItemFitsFloorShape("room", buildCandidate(mid), shapeRegions)) low = mid;
    else high = mid;
  }
  return buildCandidate(low);
}

export function snapToFloorBoundary(value: number, max: number, threshold = 8) {
  if (Math.abs(value) <= threshold) return 0;
  if (Math.abs(max - value) <= threshold) return max;
  return value;
}

export function snapPointToFloorBounds(point: { x: number; y: number }, canvasW: number, canvasH: number, threshold = 8) {
  return {
    x: clamp(Math.round(snapToFloorBoundary(point.x, canvasW, threshold)), 0, canvasW),
    y: clamp(Math.round(snapToFloorBoundary(point.y, canvasH, threshold)), 0, canvasH),
  };
}

/**
 * Axis-aligned world bounds of a rotated rectangle (the smallest AABB that
 * fully contains it). Used so a rotated furniture item never visibly extends
 * outside the floor just because resize math only considered the unrotated box.
 */
export function rotatedRectBounds(x: number, y: number, w: number, h: number, rotationDeg: number) {
  const safeRotation = Number.isFinite(rotationDeg) ? rotationDeg : 0;
  const rad = ((safeRotation % 360) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

function clampRotatedRectPosition<T extends { x: number; y: number; width: number; height: number; rotation?: number }>(
  item: T,
  canvasW: number,
  canvasH: number
): T {
  let x = item.x;
  let y = item.y;
  const aabb = rotatedRectBounds(x, y, item.width, item.height, item.rotation ?? 0);
  if (aabb.x < 0) x += -aabb.x;
  if (aabb.y < 0) y += -aabb.y;
  if (aabb.x + aabb.w > canvasW) x -= aabb.x + aabb.w - canvasW;
  if (aabb.y + aabb.h > canvasH) y -= aabb.y + aabb.h - canvasH;
  return { ...item, x: Math.round(x), y: Math.round(y) };
}

function resizeRectLocal<T extends { x: number; y: number; width: number; height: number; rotation?: number }>(
  item: T,
  handle: string,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number,
  preserveAspect = false,
  constrainToCanvas = true,
): T {
  const rotation = item.rotation ?? 0;
  const local = worldDeltaToLocal(dx, dy, rotation);
  const startCx = item.x + item.width / 2;
  const startCy = item.y + item.height / 2;
  let width = item.width;
  let height = item.height;

  if (handle.includes("e")) width += local.dx;
  if (handle.includes("w")) width -= local.dx;
  if (handle.includes("s")) height += local.dy;
  if (handle.includes("n")) height -= local.dy;

  if (handle.length === 2 && preserveAspect) {
    const ratio = item.height / item.width;
    width = clamp(width, minWidth, maxWidth);
    height = clamp(width * ratio, minHeight, maxHeight);
  } else {
    width = clamp(width, minWidth, maxWidth);
    height = clamp(height, minHeight, maxHeight);
  }

  const localCx = handle.includes("w") ? item.width - width / 2 : handle.includes("e") ? width / 2 : item.width / 2;
  const localCy = handle.includes("n") ? item.height - height / 2 : handle.includes("s") ? height / 2 : item.height / 2;
  const worldCenter = rotatePoint({ x: item.x + localCx, y: item.y + localCy }, startCx, startCy, rotation);
  const resized = { ...item, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height };
  return constrainToCanvas ? clampRotatedRectPosition(resized, canvasW, canvasH) : resized;
}

/**
 * Resize furniture within the floor. `corner` accepts corner handles
 * ("nw", "ne", "sw", "se") and side handles ("n", "s", "e", "w"):
 *   - corners resize width + height together
 *   - sides resize a single dimension (n/s → height, e/w → width)
 * `preserveAspect` (Shift during a corner drag) keeps the original ratio.
 * Rotated items are post-clamped by their transformed world bounds so they
 * never visibly escape the floor.
 */
export function resizeFurnitureWithinFloor(
  item: FloorFurniture,
  corner: string,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
  preserveAspect = false,
  shapeRegions?: FloorShapeRect[],
): FloorFurniture {
  // Keep a sensible minimum, but do not cap furniture by type. The old
  // ceilings made single-object resize disagree with group scaling and could
  // shrink a previously-large legacy item on its next edit. The practical
  // maximum is the available floor side from the opposite fixed handle.
  const shapeBounds = shapeRegions ? getFloorShapeBounds(shapeRegions) : undefined;
  const maxWidth = shapeRegions ? Math.max(item.width, shapeBounds!.width)
    : corner.includes("w")
    ? Math.max(item.width, item.x + item.width)
    : Math.max(item.width, canvasW - item.x);
  const maxHeight = shapeRegions ? Math.max(item.height, shapeBounds!.height)
    : corner.includes("n")
    ? Math.max(item.height, item.y + item.height)
    : Math.max(item.height, canvasH - item.y);
  const buildCandidate = (scale: number) => resizeRectLocal(item, corner, dx * scale, dy * scale, canvasW, canvasH, 8, 8, maxWidth, maxHeight, preserveAspect, !shapeRegions);
  const resized = buildCandidate(1);
  if (shapeRegions) {
    if (floorItemFitsFloorShape("furniture", resized, shapeRegions)) return { ...resized, width: Math.round(resized.width), height: Math.round(resized.height) };
    if (!floorItemFitsFloorShape("furniture", item, shapeRegions)) return item;
    let low = 0;
    let high = 1;
    for (let index = 0; index < 24; index += 1) {
      const mid = (low + high) / 2;
      if (floorItemFitsFloorShape("furniture", buildCandidate(mid), shapeRegions)) low = mid;
      else high = mid;
    }
    const bounded = buildCandidate(low);
    return { ...bounded, width: Math.round(bounded.width), height: Math.round(bounded.height) };
  }
  return constrainFurnitureToFloor({ ...resized, width: Math.round(resized.width), height: Math.round(resized.height) }, canvasW, canvasH);
}

/** Keep an explicit furniture resize candidate inside the visible floor. */
export function constrainFurnitureToFloor(item: FloorFurniture, canvasW: number, canvasH: number, shapeRegions?: FloorShapeRect[]): FloorFurniture {
  if (shapeRegions) {
    if (floorItemFitsFloorShape("furniture", item, shapeRegions)) return item;
    const bounds = rotatedRectBounds(item.x, item.y, item.width, item.height, item.rotation ?? 0);
    const position = constrainRectToFloorShape(shapeRegions, { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h });
    const candidate = { ...item, x: Math.round(item.x + position.x - bounds.x), y: Math.round(item.y + position.y - bounds.y) };
    return floorItemFitsFloorShape("furniture", candidate, shapeRegions) ? candidate : item;
  }
  const minSize = 8;
  let width = Math.max(minSize, Number.isFinite(item.width) ? item.width : minSize);
  let height = Math.max(minSize, Number.isFinite(item.height) ? item.height : minSize);
  let x = Number.isFinite(item.x) ? item.x : 0;
  let y = Number.isFinite(item.y) ? item.y : 0;
  const rotation = item.rotation ?? 0;
  let bounds = rotatedRectBounds(x, y, width, height, rotation);
  if (bounds.w > canvasW || bounds.h > canvasH) {
    const factor = Math.min(1, canvasW / Math.max(1, bounds.w), canvasH / Math.max(1, bounds.h));
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    width = Math.max(minSize, Math.round(width * factor));
    height = Math.max(minSize, Math.round(height * factor));
    x = centerX - width / 2;
    y = centerY - height / 2;
    bounds = rotatedRectBounds(x, y, width, height, rotation);
  }
  if (bounds.x < 0) x += -bounds.x;
  if (bounds.y < 0) y += -bounds.y;
  if (bounds.x + bounds.w > canvasW) x -= bounds.x + bounds.w - canvasW;
  if (bounds.y + bounds.h > canvasH) y -= bounds.y + bounds.h - canvasH;
  return { ...item, x: Math.round(x), y: Math.round(y), width, height };
}

type ResizableCirculationItem = FloorStairs | FloorRamp | FloorElevatorItem;

/**
 * Resize a compact circulation object (stairs/ramp/elevator) using the same
 * side/corner handle language as furniture, with rotation-aware bounds.
 */
export function resizeCirculationWithinFloor<T extends ResizableCirculationItem>(
  item: T,
  corner: string,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
  preserveAspect = false,
  shapeRegions?: FloorShapeRect[],
  type: "stairs" | "ramp" | "elevator" = "stairs",
): T {
  const minWidth = "doorWidth" in item ? 14 : 16;
  const minHeight = "doorWidth" in item ? 14 : 12;
  const shapeBounds = shapeRegions ? getFloorShapeBounds(shapeRegions) : undefined;
  const maxWidth = shapeBounds ? Math.max(item.width, shapeBounds.width) : canvasW;
  const maxHeight = shapeBounds ? Math.max(item.height, shapeBounds.height) : canvasH;
  const buildCandidate = (scale: number) => resizeRectLocal(item, corner, dx * scale, dy * scale, canvasW, canvasH, minWidth, minHeight, maxWidth, maxHeight, preserveAspect, !shapeRegions);
  const resized = buildCandidate(1);
  if (shapeRegions) {
    if (floorItemFitsFloorShape(type, resized, shapeRegions)) return { ...resized, width: Math.round(resized.width), height: Math.round(resized.height) } as T;
    if (!floorItemFitsFloorShape(type, item, shapeRegions)) return item;
    let low = 0;
    let high = 1;
    for (let index = 0; index < 24; index += 1) {
      const mid = (low + high) / 2;
      if (floorItemFitsFloorShape(type, buildCandidate(mid), shapeRegions)) low = mid;
      else high = mid;
    }
    const bounded = buildCandidate(low);
    return { ...bounded, width: Math.round(bounded.width), height: Math.round(bounded.height) } as T;
  }
  return { ...resized, width: Math.round(resized.width), height: Math.round(resized.height) } as T;
  let x = item.x;
  let y = item.y;
  let width = item.width;
  let height = item.height;
  const isCorner = corner.length === 2;

  if (isCorner && preserveAspect) {
    const ratio = item.height / item.width;
    if (corner.includes("e")) {
      width = clamp(item.width + dx, minWidth, Math.min(maxWidth, canvasW - item.x));
    } else {
      width = clamp(item.width - dx, minWidth, Math.min(maxWidth, item.x + item.width - minWidth));
      x = item.x + (item.width - width);
    }
    height = clamp(width * ratio, minHeight, maxHeight);
    if (corner.includes("n")) y = item.y + (item.height - height);
  } else {
    if (corner.includes("e")) width = clamp(item.width + dx, minWidth, Math.min(maxWidth, canvasW - item.x));
    if (corner.includes("s")) height = clamp(item.height + dy, minHeight, Math.min(maxHeight, canvasH - item.y));
    if (corner.includes("w")) {
      const nextX = clamp(item.x + dx, 0, item.x + item.width - minWidth);
      width = item.width + (item.x - nextX);
      x = nextX;
    }
    if (corner.includes("n")) {
      const nextY = clamp(item.y + dy, 0, item.y + item.height - minHeight);
      height = item.height + (item.y - nextY);
      y = nextY;
    }
  }

  width = clamp(width, minWidth, Math.min(maxWidth, canvasW - x));
  height = clamp(height, minHeight, Math.min(maxHeight, canvasH - y));
  const rotation = item.rotation ?? 0;
  if (rotation % 360 !== 0) {
    const aabb = rotatedRectBounds(x, y, width, height, rotation);
    if (aabb.x < 0) x += -aabb.x;
    if (aabb.y < 0) y += -aabb.y;
    if (aabb.x + aabb.w > canvasW) x -= aabb.x + aabb.w - canvasW;
    if (aabb.y + aabb.h > canvasH) y -= aabb.y + aabb.h - canvasH;
  }

  return { ...item, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } as T;
}

export function scaleFloorItemFromBounds(
  type: FloorSelection["type"],
  item: any,
  originBounds: Rect,
  nextBounds: Rect,
  canvasW: number,
  canvasH: number,
  shapeRegions?: FloorShapeRect[],
) {
  const sx = originBounds.w === 0 ? 1 : nextBounds.w / originBounds.w;
  const sy = originBounds.h === 0 ? 1 : nextBounds.h / originBounds.h;
  const mapX = (x: number) => nextBounds.x + (x - originBounds.x) * sx;
  const mapY = (y: number) => nextBounds.y + (y - originBounds.y) * sy;
  if (type === "wall") {
    return { ...item, x1: Math.round(mapX(item.x1)), y1: Math.round(mapY(item.y1)), x2: Math.round(mapX(item.x2)), y2: Math.round(mapY(item.y2)) };
  }
  if (type === "room") {
    const next = { ...item, x: Math.round(mapX(item.x)), y: Math.round(mapY(item.y)), w: Math.max(20, Math.round(item.w * sx)), h: Math.max(15, Math.round(item.h * sy)) };
    if (Array.isArray(item.shapePoints) && item.shapePoints.length >= 3) {
      return {
        ...next,
        shapePoints: item.shapePoints.map((point: RoomShapePoint) => ({
          x: mapX(point.x),
          y: mapY(point.y),
        })),
      };
    }
    const clamped = shapeRegions ? { ...next, x: next.x, y: next.y } : clampRotatedRectPosition({ ...next, width: next.w, height: next.h, rotation: next.rotation ?? 0 }, canvasW, canvasH);
    return { ...next, x: clamped.x, y: clamped.y };
  }
  if (type === "door") {
    return { ...item, x: Math.round(mapX(item.x)), y: Math.round(mapY(item.y)), width: Math.max(6, Math.round(item.width * Math.max(Math.abs(sx), Math.abs(sy)))) };
  }
  if (type === "window") {
    return { ...item, x: Math.round(mapX(item.x)), y: Math.round(mapY(item.y)), width: Math.max(6, Math.round(item.width * sx)), height: Math.max(4, Math.round(item.height * sy)) };
  }
  if (type === "label") {
    const scaled = { ...item, x: Math.round(mapX(item.x)), y: Math.round(mapY(item.y)), fontSize: Math.max(8, Math.round(item.fontSize * Math.max(0.6, Math.min(2.4, (Math.abs(sx) + Math.abs(sy)) / 2)))) };
    return shapeRegions ? scaled : constrainLabelToFloor(scaled, canvasW, canvasH);
  }
  if (type === "furniture" || type === "stairs" || type === "ramp" || type === "elevator") {
    const next = {
      ...item,
      x: Math.round(mapX(item.x)),
      y: Math.round(mapY(item.y)),
      width: Math.max(type === "elevator" ? 14 : type === "furniture" ? 8 : 16, Math.round(item.width * sx)),
      height: Math.max(type === "elevator" ? 14 : type === "furniture" ? 8 : 12, Math.round(item.height * sy)),
    };
    if (type === "furniture") return constrainFurnitureToFloor(next as FloorFurniture, canvasW, canvasH, shapeRegions);
    return shapeRegions ? next : clampRotatedRectPosition(next, canvasW, canvasH);
  }
  if (type === "entranceSteps" || type === "entranceRamp") {
    const next = {
      ...item,
      x: Math.round(mapX(item.x)),
      y: Math.round(mapY(item.y)),
      width: Math.max(8, Math.round(item.width * sx)),
      height: Math.max(8, Math.round(item.height * sy)),
    };
    return shapeRegions ? next : clampRotatedRectPosition(next, canvasW, canvasH);
  }
  return item;
}

export function rotateFloorItem(
  type: FloorSelection["type"],
  item: any,
  cx: number,
  cy: number,
  deltaDeg: number,
  canvasW: number,
  canvasH: number,
  shapeRegions?: FloorShapeRect[],
) {
  if (type === "wall") {
    const p1 = rotatePoint({ x: item.x1, y: item.y1 }, cx, cy, deltaDeg);
    const p2 = rotatePoint({ x: item.x2, y: item.y2 }, cx, cy, deltaDeg);
    return { ...item, x1: Math.round(p1.x), y1: Math.round(p1.y), x2: Math.round(p2.x), y2: Math.round(p2.y) };
  }
  const center = type === "label"
    ? { x: item.x, y: item.y }
    : type === "room"
      ? { x: item.x + item.w / 2, y: item.y + item.h / 2 }
      : type === "door"
        ? { x: item.x, y: item.y }
        : type === "window"
          ? { x: item.x + item.width / 2, y: item.y + item.height / 2 }
          : { x: item.x + item.width / 2, y: item.y + item.height / 2 };
  const nextCenter = rotatePoint(center, cx, cy, deltaDeg);
  if (type === "room") {
    const nextRotation = normalizeRotation((item.rotation ?? 0) + deltaDeg);
    if (Array.isArray(item.shapePoints) && item.shapePoints.length >= 3) {
      // Custom Room points are local/base coordinates; the Room's rotation
      // property is the single visual rotation authority. When a Room is
      // rotated as part of a multi-selection, move its local frame with the
      // Room center and update rotation, rather than rotating the persisted
      // points and then rotating them again during render.
      const deltaX = nextCenter.x - center.x;
      const deltaY = nextCenter.y - center.y;
      return {
        ...item,
        x: Math.round(nextCenter.x - item.w / 2),
        y: Math.round(nextCenter.y - item.h / 2),
        w: item.w,
        h: item.h,
        rotation: nextRotation,
        shapePoints: item.shapePoints.map((point: RoomShapePoint) => ({ x: point.x + deltaX, y: point.y + deltaY })),
      };
    }
    const next = {
      ...item,
      x: Math.round(nextCenter.x - item.w / 2),
      y: Math.round(nextCenter.y - item.h / 2),
      rotation: nextRotation,
    };
    const clamped = shapeRegions ? next : clampRotatedRectPosition({ ...next, width: next.w, height: next.h }, canvasW, canvasH);
    return { ...next, x: clamped.x, y: clamped.y };
  }
  if (type === "door") return { ...item, x: Math.round(nextCenter.x), y: Math.round(nextCenter.y) };
  if (type === "window") return { ...item, x: Math.round(nextCenter.x - item.width / 2), y: Math.round(nextCenter.y - item.height / 2) };
  if (type === "label") {
    const next = { ...item, x: Math.round(nextCenter.x), y: Math.round(nextCenter.y), rotation: normalizeRotation((item.rotation ?? 0) + deltaDeg) };
    return shapeRegions ? next : constrainLabelToFloor(next, canvasW, canvasH);
  }
  if (type === "furniture" || type === "stairs" || type === "ramp" || type === "elevator") {
    const next = {
      ...item,
      x: Math.round(nextCenter.x - item.width / 2),
      y: Math.round(nextCenter.y - item.height / 2),
      rotation: normalizeRotation((item.rotation ?? 0) + deltaDeg),
    };
    return shapeRegions ? next : clampRotatedRectPosition(next, canvasW, canvasH);
  }
  return item;
}

export interface SelectableFloorBounds {
  type: FloorSelection["type"];
  id: string;
  bounds: Rect;
}

/** Capture selectable object bounds once at the start of a marquee gesture. */
export function selectableFloorBounds(floor: FloorPlan): SelectableFloorBounds[] {
  const pairs: Array<[FloorSelection["type"], any[]]> = [
    ["room", floor.rooms],
    ["wall", floor.walls.filter((wall) => wall.managedKind !== "perimeter")],
    ["door", floor.doors],
    ["window", floor.windows],
    ["furniture", floor.furniture],
    ["stairs", floor.stairs],
    ["ramp", floor.ramps],
    ["elevator", floor.elevators],
    ["label", floor.labels],
    ["entranceSteps", floor.entranceSteps ?? []],
    ["entranceRamp", floor.entranceRamps ?? []],
    ["exteriorZone", floor.exteriorZones ?? []],
  ];
  const selectable: SelectableFloorBounds[] = [];
  for (const [type, items] of pairs) {
    for (const item of items) {
      if (item?.locked || (type === "wall" && item.managedKind === "perimeter")) continue;
      const bounds = itemBounds(type, item);
      if (bounds) selectable.push({ type, id: item.id as string, bounds });
    }
  }
  return selectable;
}

export function selectionIdsInCachedBounds(selectable: readonly SelectableFloorBounds[], rect: Rect) {
  return selectable.filter(({ bounds }) => rectsIntersect(rect, bounds)).map(({ id }) => id);
}

export function selectionIdsInRect(floor: FloorPlan, rect: Rect) {
  return selectionIdsInCachedBounds(selectableFloorBounds(floor), rect);
}

export function validateFloorGeometry(floor: FloorPlan): FloorIssue[] {
  const canvasW = floor.canvasW ?? DEFAULT_FLOOR_CANVAS.w;
  const canvasH = floor.canvasH ?? DEFAULT_FLOOR_CANVAS.h;
  const issues: FloorIssue[] = [];
  const shapeRegions = getFloorShapeRegions(floor);
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const furnitureIsInsideExteriorZone = (item: FloorFurniture) => {
    const bounds = itemBounds("furniture", item);
    if (!bounds) return false;
    return (floor.exteriorZones ?? []).some((zone) => {
      const zoneBounds = exteriorZoneGeometry(zone, canvasW, canvasH);
      return bounds.x >= zoneBounds.x - 0.5
        && bounds.y >= zoneBounds.y - 0.5
        && bounds.x + bounds.w <= zoneBounds.x + zoneBounds.width + 0.5
        && bounds.y + bounds.h <= zoneBounds.y + zoneBounds.height + 0.5;
    });
  };
  const pairs: Array<[FloorSelection["type"], any[], string]> = [
    ["room", floor.rooms, "Room"],
    ["wall", floor.walls, "Wall"],
    ["door", floor.doors, "Door"],
    ["window", floor.windows, "Window"],
    ["furniture", floor.furniture, "Furniture"],
    ["stairs", floor.stairs, "Stairs"],
    ["ramp", floor.ramps, "Ramp"],
    ["elevator", floor.elevators, "Elevator"],
    ["label", floor.labels, "Label"],
  ];
  for (const [type, items, label] of pairs) {
    for (const item of items) {
      if (type === "furniture" && furnitureIsInsideExteriorZone(item as FloorFurniture)) continue;
      if ((type === "door" || type === "window") && item.wallId) {
        const wall = wallById.get(item.wallId);
        const openingLabel = type === "door" ? "Door" : "Window";
        if (!wall) {
          issues.push({
            id: `${type}-${item.id}-wall`,
            severity: "error",
            message: `${openingLabel} is attached to a missing wall.`,
            selection: { type, id: item.id },
          });
          continue;
        }
        const minWidth = type === "door" ? doorOpeningMinWidth(item as FloorDoor) : 10;
        const maxLimit = type === "door" ? doorOpeningMaxWidth(item as FloorDoor) : 72;
        const maxWidth = maxOpeningWidthForWall(wall, maxLimit, minWidth);
        const length = wallLength(wall);
        const fitsMinimum = length >= minWidth + wallOpeningSafetyUnits(minWidth, wall.thickness) * 2;
        const offset = Number.isFinite(item.offset) ? item.offset : nearestPointOnWall({ x: item.x, y: item.y }, wall).t;
        const clampedOffset = clampWallOpeningOffset(wall, Math.min(Math.max(item.width, minWidth), maxWidth), offset);
        if (!fitsMinimum || item.width < minWidth || item.width > maxWidth + 0.001 || offset < 0 || offset > 1 || Math.abs(clampedOffset - offset) > 0.001) {
          issues.push({
            id: `${type}-${item.id}-opening`,
            severity: "error",
            message: `${openingLabel} opening does not fit its parent wall.`,
            selection: { type, id: item.id },
          });
        }
        continue;
      }
      const bounds = itemBounds(type, item);
      const insideShape = bounds && floorItemFitsFloorShape(type, item, shapeRegions);
      if (bounds && !insideShape) {
        issues.push({
          id: `${type}-${item.id}-bounds`,
          severity: "error",
          message: `${label} is outside the floor canvas.`,
          selection: { type, id: item.id },
        });
      }
    }
  }
  return issues;
}
