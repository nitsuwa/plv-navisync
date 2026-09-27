import { describe, expect, it } from "vitest";
import type { FloorDoor, FloorFurniture, FloorRoom, FloorWall, FloorWindow } from "../../components/map-builder/types";
import {
  flipFurnitureAroundCenter,
  flipFurnitureVisual,
  flipRoomSetupGeometry,
  flipRoomShape,
} from "../floorFlip";

const room: FloorRoom = {
  id: "room-1",
  name: "Study Room",
  type: "classroom",
  x: 100,
  y: 40,
  w: 200,
  h: 160,
  floorId: "floor-1",
  buildingId: "building-1",
  shapePoints: [
    { x: 100, y: 40 },
    { x: 300, y: 40 },
    { x: 300, y: 200 },
    { x: 100, y: 180 },
  ],
};

const furniture: FloorFurniture = {
  id: "desk-1",
  type: "desk",
  name: "Desk",
  category: "tables",
  x: 140,
  y: 90,
  width: 40,
  height: 20,
  rotation: 90,
  color: "#7a5c3a",
};

const wall: FloorWall = {
  id: "wall-1",
  x1: 100,
  y1: 40,
  x2: 100,
  y2: 180,
  thickness: 4,
  color: "#555",
  startAnchor: { targetType: "room", roomId: room.id, edge: "left", offset: 0.2 },
};

const door: FloorDoor = {
  id: "door-1",
  x: 100,
  y: 110,
  width: 14,
  wallId: wall.id,
  offset: 0.5,
  hinge: "left",
  swingSide: "a",
  direction: "left",
  color: "#c00",
};

const window: FloorWindow = {
  id: "window-1",
  x: 100,
  y: 140,
  width: 18,
  height: 4,
  wallId: wall.id,
  offset: 0.7,
  color: "#0af",
};

describe("Floor visual flip geometry", () => {
  it("toggles optional Furniture visual mirror state without moving it", () => {
    const flipped = flipFurnitureVisual(furniture, "horizontal");
    expect(flipped.flipX).toBe(true);
    expect(flipped.x).toBe(furniture.x);
    expect(flipped.y).toBe(furniture.y);
    expect(flipFurnitureVisual(flipped, "horizontal").flipX).toBe(false);
  });

  it("mirrors custom Room vertices while preserving the Room bounds", () => {
    const flipped = flipRoomShape(room, "horizontal");
    expect(flipped.x).toBe(room.x);
    expect(flipped.w).toBe(room.w);
    expect(flipped.shapePoints).toEqual([
      { x: 300, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 200 },
      { x: 300, y: 180 },
    ]);
    expect(flipRoomShape(flipped, "horizontal").shapePoints).toEqual(room.shapePoints);
  });

  it("mirrors a Furniture selection around one bounding-box center", () => {
    const second = { ...furniture, id: "desk-2", x: 220 };
    const flipped = flipFurnitureAroundCenter([furniture, second], "horizontal", { x: 200, y: 100 });
    expect(flipped.map((item) => item.x)).toEqual([220, 140]);
    expect(flipped.every((item) => item.flipX)).toBe(true);
  });

  it("keeps Room Setup members together and remaps physical attachments", () => {
    const result = flipRoomSetupGeometry(room, [wall], [door], [window], [furniture], "horizontal");
    expect(result.walls[0]).toMatchObject({ x1: 300, x2: 300, startAnchor: { edge: "right", offset: 0.2 } });
    expect(result.doors[0]).toMatchObject({ wallId: wall.id, offset: 0.5, hinge: "right", swingSide: "b", direction: "right" });
    expect(result.windows[0].wallId).toBe(wall.id);
    expect(result.windows[0].offset).toBeCloseTo(0.3);
    expect(result.furniture[0]).toMatchObject({ x: 220, y: 90, rotation: 270, flipX: true });
    expect(result.room.shapePoints?.[0]).toEqual({ x: 300, y: 40 });
  });
});
