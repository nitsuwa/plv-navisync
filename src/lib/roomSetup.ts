import type {
  FloorDoor,
  FloorFurniture,
  FloorRoom,
  FloorWall,
  FloorWindow,
} from "../components/map-builder/types";
import { itemBounds, rotatePoint } from "./floorGeometry";
import { pointInRoomShape, roomOutlinePoints } from "./roomShape";

export interface RoomVisualSetup {
  wallIds: string[];
  doorIds: string[];
  windowIds: string[];
  furnitureIds: string[];
}

function rectContains(outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }, epsilon = 0.5) {
  return inner.x >= outer.x - epsilon
    && inner.y >= outer.y - epsilon
    && inner.x + inner.w <= outer.x + outer.w + epsilon
    && inner.y + inner.h <= outer.y + outer.h + epsilon;
}

/**
 * Authored walls are Room-owned when they are explicitly anchored to the Room
 * or when both endpoints lie within the Room's visible bounds. Perimeter walls
 * remain Floor-owned structural geometry and are never part of a Room Setup.
 */
export function wallBelongsToRoom(wall: FloorWall, room: FloorRoom) {
  if (wall.managedKind === "perimeter") return false;
  if (wall.startAnchor?.roomId === room.id || wall.endAnchor?.roomId === room.id) return true;
  const roomBounds = itemBounds("room", room);
  if (!roomBounds) return false;
  return wall.x1 >= roomBounds.x - 0.5
    && wall.x1 <= roomBounds.x + roomBounds.w + 0.5
    && wall.y1 >= roomBounds.y - 0.5
    && wall.y1 <= roomBounds.y + roomBounds.h + 0.5
    && wall.x2 >= roomBounds.x - 0.5
    && wall.x2 <= roomBounds.x + roomBounds.w + 0.5
    && wall.y2 >= roomBounds.y - 0.5
    && wall.y2 <= roomBounds.y + roomBounds.h + 0.5;
}

/** Furniture must be fully inside the Room's visible bounds, including its
 * rotated world-space footprint. Partial overlaps stay independent. */
export function furnitureFullyContainedInRoom(furniture: FloorFurniture, room: FloorRoom) {
  if (Array.isArray(room.shapePoints) && room.shapePoints.length >= 3) {
    const points = roomOutlinePoints(room);
    const cx = furniture.x + furniture.width / 2;
    const cy = furniture.y + furniture.height / 2;
    const corners = [
      { x: furniture.x, y: furniture.y },
      { x: furniture.x + furniture.width, y: furniture.y },
      { x: furniture.x + furniture.width, y: furniture.y + furniture.height },
      { x: furniture.x, y: furniture.y + furniture.height },
    ].map((point) => rotatePoint(point, cx, cy, furniture.rotation ?? 0));
    return corners.every((corner) => pointInRoomShape(corner, points));
  }
  const roomBounds = itemBounds("room", room);
  const furnitureBounds = itemBounds("furniture", furniture);
  return !!roomBounds && !!furnitureBounds && rectContains(roomBounds, furnitureBounds);
}

/** Resolve the current physical Room Setup without persisting a new grouping
 * identity. This same geometric rule is used by templates and duplication. */
export function roomVisualSetup(
  room: FloorRoom,
  walls: FloorWall[],
  doors: FloorDoor[],
  windows: FloorWindow[],
  furniture: FloorFurniture[],
): RoomVisualSetup {
  const wallIds = walls.filter((wall) => wallBelongsToRoom(wall, room)).map((wall) => wall.id);
  const wallIdSet = new Set(wallIds);
  return {
    wallIds,
    doorIds: doors.filter((door) => !!door.wallId && wallIdSet.has(door.wallId)).map((door) => door.id),
    windowIds: windows.filter((window) => !!window.wallId && wallIdSet.has(window.wallId)).map((window) => window.id),
    furnitureIds: furniture.filter((item) => furnitureFullyContainedInRoom(item, room)).map((item) => item.id),
  };
}

