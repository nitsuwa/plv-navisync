import type {
  FloorDoor,
  FloorElevatorItem,
  FloorFurniture,
  FloorLabel,
  FloorPlan,
  FloorRamp,
  FloorRoom,
  FloorSelection,
  FloorStairs,
  FloorWindow,
  FloorWall,
  FloorWallEndpointAnchor,
} from "../components/map-builder/types";

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
export function constrainLabelToFloor(label: FloorLabel, canvasW: number, canvasH: number): FloorLabel {
  const bounds = labelBounds(label);
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
  if (type === "label") {
    return labelBounds(value as FloorLabel);
  }
  return null;
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

export function translateFloorItem(type: FloorSelection["type"], item: any, dx: number, dy: number, canvasW: number, canvasH: number) {
  const bounds = itemBounds(type, item);
  const delta = bounds ? constrainDeltaForBounds([bounds], dx, dy, canvasW, canvasH) : { dx, dy };
  if (type === "wall") return { ...item, x1: item.x1 + delta.dx, y1: item.y1 + delta.dy, x2: item.x2 + delta.dx, y2: item.y2 + delta.dy };
  return { ...item, x: item.x + delta.dx, y: item.y + delta.dy };
}

export function resizeRoomWithinFloor(room: FloorRoom, corner: string, dx: number, dy: number, canvasW: number, canvasH: number): FloorRoom {
  if ((room.rotation ?? 0) % 360 === 0) {
    let x = room.x;
    let y = room.y;
    let w = room.w;
    let h = room.h;
    if (corner.includes("e")) w = clamp(room.w + dx, 20, canvasW - room.x);
    if (corner.includes("s")) h = clamp(room.h + dy, 15, canvasH - room.y);
    if (corner.includes("w")) {
      const nextX = clamp(room.x + dx, 0, room.x + room.w - 20);
      w = room.w + (room.x - nextX);
      x = nextX;
    }
    if (corner.includes("n")) {
      const nextY = clamp(room.y + dy, 0, room.y + room.h - 15);
      h = room.h + (room.y - nextY);
      y = nextY;
    }
    return { ...room, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }
  const base = { ...room, width: room.w, height: room.h, rotation: room.rotation ?? 0 };
  const resized = resizeRectLocal(base, corner, dx, dy, canvasW, canvasH, 20, 15, canvasW, canvasH);
  const { width, height, ...rest } = resized;
  return { ...rest, x: Math.round(resized.x), y: Math.round(resized.y), w: Math.round(width), h: Math.round(height) };
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
  preserveAspect = false
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
  return clampRotatedRectPosition({ ...item, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height }, canvasW, canvasH);
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
  preserveAspect = false
): FloorFurniture {
  const maxWidth = item.type.includes("chair") || item.type.includes("plant") ? 32
    : item.type.includes("bench") || item.type.includes("sofa") ? 86
    : item.type.includes("cabinet") || item.type.includes("shelf") || item.type.includes("bookshelf") ? 54
    : 74;
  const maxHeight = item.type.includes("chair") || item.type.includes("plant") ? 32
    : item.type.includes("bench") ? 28
    : item.type.includes("sofa") ? 44
    : item.type.includes("cabinet") || item.type.includes("shelf") || item.type.includes("bookshelf") ? 42
    : 48;
  const resized = resizeRectLocal(item, corner, dx, dy, canvasW, canvasH, 8, 8, maxWidth, maxHeight, preserveAspect);
  return { ...resized, width: Math.round(resized.width), height: Math.round(resized.height) };
  let x = item.x;
  let y = item.y;
  let width = item.width;
  let height = item.height;
  const isCorner = corner.length === 2;

  if (isCorner && preserveAspect) {
    // Aspect-ratio corner resize: the horizontal delta drives the width and the
    // height follows the original ratio (clamped to its own ceiling).
    const ratio = item.height / item.width;
    if (corner.includes("e")) {
      width = clamp(item.width + dx, 8, Math.min(maxWidth, canvasW - item.x));
    } else {
      width = clamp(item.width - dx, 8, Math.min(maxWidth, item.x + item.width - 8));
      x = item.x + (item.width - width);
    }
    height = clamp(width * ratio, 8, maxHeight);
    if (corner.includes("n")) y = item.y + (item.height - height);
  } else {
    if (corner.includes("e")) width = clamp(item.width + dx, 8, Math.min(maxWidth, canvasW - item.x));
    if (corner.includes("s")) height = clamp(item.height + dy, 8, Math.min(maxHeight, canvasH - item.y));
    if (corner.includes("w")) {
      const nextX = clamp(item.x + dx, 0, item.x + item.width - 8);
      width = item.width + (item.x - nextX);
      x = nextX;
    }
    if (corner.includes("n")) {
      const nextY = clamp(item.y + dy, 0, item.y + item.height - 8);
      height = item.height + (item.y - nextY);
      y = nextY;
    }
  }
  width = clamp(width, 8, Math.min(maxWidth, canvasW - x));
  height = clamp(height, 8, Math.min(maxHeight, canvasH - y));

  // Rotated bounds: if the transformed AABB would poke outside the floor, pull
  // the whole item back in (dimensions are kept — only position shifts).
  if (item.rotation % 360 !== 0) {
    const aabb = rotatedRectBounds(x, y, width, height, item.rotation);
    if (aabb.x < 0) x += -aabb.x;
    if (aabb.y < 0) y += -aabb.y;
    if (aabb.x + aabb.w > canvasW) x -= aabb.x + aabb.w - canvasW;
    if (aabb.y + aabb.h > canvasH) y -= aabb.y + aabb.h - canvasH;
  }
  return { ...item, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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
  preserveAspect = false
): T {
  const minWidth = "doorWidth" in item ? 14 : 16;
  const minHeight = "doorWidth" in item ? 14 : 12;
  const maxWidth = "doorWidth" in item ? 58 : 96;
  const maxHeight = "doorWidth" in item ? 58 : 64;
  const resized = resizeRectLocal(item, corner, dx, dy, canvasW, canvasH, minWidth, minHeight, maxWidth, maxHeight, preserveAspect);
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
  canvasH: number
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
    const clamped = clampRotatedRectPosition({ ...next, width: next.w, height: next.h, rotation: next.rotation ?? 0 }, canvasW, canvasH);
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
    return constrainLabelToFloor(scaled, canvasW, canvasH);
  }
  if (type === "furniture" || type === "stairs" || type === "ramp" || type === "elevator") {
    const next = {
      ...item,
      x: Math.round(mapX(item.x)),
      y: Math.round(mapY(item.y)),
      width: Math.max(type === "elevator" ? 14 : type === "furniture" ? 8 : 16, Math.round(item.width * sx)),
      height: Math.max(type === "elevator" ? 14 : type === "furniture" ? 8 : 12, Math.round(item.height * sy)),
    };
    return clampRotatedRectPosition(next, canvasW, canvasH);
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
  canvasH: number
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
    const next = {
      ...item,
      x: Math.round(nextCenter.x - item.w / 2),
      y: Math.round(nextCenter.y - item.h / 2),
      rotation: normalizeRotation((item.rotation ?? 0) + deltaDeg),
    };
    const clamped = clampRotatedRectPosition({ ...next, width: next.w, height: next.h }, canvasW, canvasH);
    return { ...next, x: clamped.x, y: clamped.y };
  }
  if (type === "door") return { ...item, x: Math.round(nextCenter.x), y: Math.round(nextCenter.y) };
  if (type === "window") return { ...item, x: Math.round(nextCenter.x - item.width / 2), y: Math.round(nextCenter.y - item.height / 2) };
  if (type === "label") return constrainLabelToFloor({ ...item, x: Math.round(nextCenter.x), y: Math.round(nextCenter.y), rotation: normalizeRotation((item.rotation ?? 0) + deltaDeg) }, canvasW, canvasH);
  if (type === "furniture" || type === "stairs" || type === "ramp" || type === "elevator") {
    return clampRotatedRectPosition({
      ...item,
      x: Math.round(nextCenter.x - item.width / 2),
      y: Math.round(nextCenter.y - item.height / 2),
      rotation: normalizeRotation((item.rotation ?? 0) + deltaDeg),
    }, canvasW, canvasH);
  }
  return item;
}

export function selectionIdsInRect(floor: FloorPlan, rect: Rect) {
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
  ];
  return pairs.flatMap(([type, items]) =>
    items
      .filter((item) => {
        const bounds = itemBounds(type, item);
        return bounds ? rectsIntersect(rect, bounds) : false;
      })
      .map((item) => item.id as string)
  );
}

export function validateFloorGeometry(floor: FloorPlan): FloorIssue[] {
  const canvasW = floor.canvasW ?? DEFAULT_FLOOR_CANVAS.w;
  const canvasH = floor.canvasH ?? DEFAULT_FLOOR_CANVAS.h;
  const issues: FloorIssue[] = [];
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
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
      if (bounds && !isRectInsideFloor(bounds, canvasW, canvasH)) {
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
