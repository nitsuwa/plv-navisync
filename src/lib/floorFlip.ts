import type {
  FloorDoor,
  FloorFurniture,
  FloorRoom,
  FloorWall,
  FloorWindow,
} from "../components/map-builder/types";
import { isValidRoomShape } from "./roomShape";

export type FlipAxis = "horizontal" | "vertical";

function mirrorPoint(point: { x: number; y: number }, center: { x: number; y: number }, axis: FlipAxis) {
  return {
    x: axis === "horizontal" ? 2 * center.x - point.x : point.x,
    y: axis === "vertical" ? 2 * center.y - point.y : point.y,
  };
}

/** A local visual mirror for one Furniture item. Rotation remains the Floor
 * orientation while the optional flip flags mirror the shared artwork. */
export function flipFurnitureVisual(item: FloorFurniture, axis: FlipAxis): FloorFurniture {
  return {
    ...item,
    ...(axis === "horizontal" ? { flipX: !item.flipX } : { flipY: !item.flipY }),
  };
}

/** Mirror a custom Room outline around the Room's stable rectangular reference
 * center. Rectangular Rooms intentionally remain unchanged. */
export function flipRoomShape(room: FloorRoom, axis: FlipAxis): FloorRoom {
  if (!Array.isArray(room.shapePoints) || room.shapePoints.length < 3) return room;
  const center = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const shapePoints = room.shapePoints.map((point) => mirrorPoint(point, center, axis));
  return isValidRoomShape(shapePoints) ? { ...room, shapePoints } : room;
}

function flipAnchor(anchor: FloorWall["startAnchor"], axis: FlipAxis) {
  if (!anchor) return anchor;
  const edge = axis === "horizontal"
    ? (anchor.edge === "left" ? "right" : anchor.edge === "right" ? "left" : anchor.edge)
    : (anchor.edge === "top" ? "bottom" : anchor.edge === "bottom" ? "top" : anchor.edge);
  return { ...anchor, edge, offset: (axis === "horizontal" && (anchor.edge === "top" || anchor.edge === "bottom"))
    || (axis === "vertical" && (anchor.edge === "left" || anchor.edge === "right"))
    ? 1 - anchor.offset
    : anchor.offset };
}

export function flipWallGeometry(wall: FloorWall, center: { x: number; y: number }, axis: FlipAxis): FloorWall {
  const start = mirrorPoint({ x: wall.x1, y: wall.y1 }, center, axis);
  const end = mirrorPoint({ x: wall.x2, y: wall.y2 }, center, axis);
  return {
    ...wall,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    startAnchor: flipAnchor(wall.startAnchor, axis),
    endAnchor: flipAnchor(wall.endAnchor, axis),
  };
}

function flipOpening<T extends FloorDoor | FloorWindow>(opening: T): T {
  // Wall endpoint order is mirrored by the same geometric transform. Keeping
  // the physical point on that wall therefore requires reversing its normalized
  // attachment offset. The existing wall sync helper recomputes x/y/angle.
  const mirrored = opening.wallId && typeof opening.offset === "number"
    ? { ...opening, offset: 1 - opening.offset }
    : { ...opening };
  if ("direction" in opening) {
    const door = mirrored as FloorDoor;
    return {
      ...door,
      hinge: door.hinge === "left" ? "right" : door.hinge === "right" ? "left" : door.hinge,
      swingSide: door.swingSide === "a" ? "b" : door.swingSide === "b" ? "a" : door.swingSide,
      direction: door.direction === "left" ? "right" : door.direction === "right" ? "left" : door.direction,
    } as T;
  }
  return mirrored;
}

/** Mirror an item's world position and local artwork orientation around a
 * Room/selection axis. Reflection reverses the local angle and toggles the
 * corresponding artwork axis so rotated asymmetric Furniture faces correctly. */
export function mirrorFurnitureAcrossAxis(item: FloorFurniture, axis: FlipAxis, center: { x: number; y: number }): FloorFurniture {
  const itemCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
  const nextCenter = mirrorPoint(itemCenter, center, axis);
  return {
    ...item,
    x: nextCenter.x - item.width / 2,
    y: nextCenter.y - item.height / 2,
    rotation: ((-(item.rotation ?? 0) % 360) + 360) % 360,
    ...(axis === "horizontal" ? { flipX: !item.flipX } : { flipY: !item.flipY }),
  };
}

export function flipRoomSetupGeometry(
  room: FloorRoom,
  walls: FloorWall[],
  doors: FloorDoor[],
  windows: FloorWindow[],
  furniture: FloorFurniture[],
  axis: FlipAxis,
) {
  const center = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const roomResult = room.shapePoints && room.shapePoints.length >= 3
    ? flipRoomShape(room, axis)
    : { ...room, rotation: ((-(room.rotation ?? 0) % 360) + 360) % 360 };
  const wallResult = walls.map((wall) => flipWallGeometry(wall, center, axis));
  const doorResult = doors.map((door) => flipOpening(door));
  const windowResult = windows.map((window) => flipOpening(window));
  const furnitureResult = furniture.map((item) => mirrorFurnitureAcrossAxis(item, axis, center));
  return { room: roomResult, walls: wallResult, doors: doorResult, windows: windowResult, furniture: furnitureResult };
}

export function flipFurnitureAroundCenter(items: FloorFurniture[], axis: FlipAxis, center: { x: number; y: number }) {
  return items.map((item) => mirrorFurnitureAcrossAxis(item, axis, center));
}

export function furnitureBoundsCenter(items: FloorFurniture[]) {
  if (items.length === 0) return { x: 0, y: 0 };
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
