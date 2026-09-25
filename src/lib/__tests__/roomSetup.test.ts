import { describe, expect, it } from "vitest";
import { furnitureFullyContainedInRoom, roomVisualSetup, wallBelongsToRoom } from "../roomSetup";
import { computeRoomAssemblyAlignmentTargets, snapRoomToNearbyWalls } from "../roomOverlap";
import { normalizedWallJointHalfSize } from "../wallJunctionVisual";
import type { FloorFurniture, FloorRoom, FloorWall } from "../../components/map-builder/types";

const room: FloorRoom = {
  id: "room-1",
  name: "Study Room",
  type: "classroom",
  x: 20,
  y: 20,
  w: 100,
  h: 80,
  floorId: "floor-1",
  buildingId: "building-1",
};

const furniture = (id: string, x: number, y: number, width: number, height: number, rotation = 0): FloorFurniture => ({
  id,
  type: "desk",
  name: id,
  category: "tables",
  x,
  y,
  width,
  height,
  rotation,
  color: "#7a5c3a",
});

describe("Room visual setup membership", () => {
  it("includes authored walls and their openings, but excludes perimeter walls", () => {
    const interiorWall: FloorWall = {
      id: "wall-in-room",
      x1: 30,
      y1: 40,
      x2: 110,
      y2: 40,
      thickness: 4,
      color: "#555",
      material: "concrete",
      startAnchor: { targetType: "room", roomId: room.id, edge: "top", offset: 0.1 },
    };
    const perimeterWall: FloorWall = {
      id: "wall-perimeter",
      x1: 0,
      y1: 0,
      x2: 140,
      y2: 0,
      thickness: 4,
      color: "#555",
      material: "concrete",
      managedKind: "perimeter",
    };
    const secondInteriorWall: FloorWall = {
      id: "wall-in-room-2",
      x1: 110,
      y1: 40,
      x2: 110,
      y2: 100,
      thickness: 4,
      color: "#555",
      material: "concrete",
    };
    expect(wallBelongsToRoom(interiorWall, room)).toBe(true);
    expect(wallBelongsToRoom(perimeterWall, room)).toBe(false);

    const setup = roomVisualSetup(
      room,
      [interiorWall, secondInteriorWall, perimeterWall],
      [{ id: "door-1", x: 70, y: 40, width: 12, direction: "left", color: "#c00", wallId: interiorWall.id }],
      [{ id: "window-1", x: 90, y: 40, width: 12, height: 4, color: "#0af", wallId: interiorWall.id }],
      [],
    );
    expect(setup.wallIds).toEqual([interiorWall.id, secondInteriorWall.id]);
    expect(setup.doorIds).toEqual(["door-1"]);
    expect(setup.windowIds).toEqual(["window-1"]);
  });

  it("requires furniture to be fully contained, using rotated visible bounds", () => {
    const inside = furniture("inside", 50, 45, 20, 12, 35);
    const partial = furniture("partial", 110, 45, 20, 12);
    const outside = furniture("outside", 140, 45, 20, 12);
    expect(furnitureFullyContainedInRoom(inside, room)).toBe(true);
    expect(furnitureFullyContainedInRoom(partial, room)).toBe(false);
    expect(furnitureFullyContainedInRoom(outside, room)).toBe(false);

    const setup = roomVisualSetup(room, [], [], [], [inside, partial, outside]);
    expect(setup.furnitureIds).toEqual([inside.id]);
  });

  it("snaps a new Room to authored wall centerlines without changing the wall", () => {
    const wall: FloorWall = {
      id: "study-wall",
      x1: 100,
      y1: 20,
      x2: 100,
      y2: 120,
      thickness: 4,
      color: "#555",
      material: "concrete",
    };
    const candidate = { x: 65, y: 40, w: 40, h: 30 };
    expect(snapRoomToNearbyWalls(candidate, [wall], 8).x).toBe(60);
    expect(wall.x1).toBe(100);
    expect(wall.x2).toBe(100);
  });

  it("prioritizes exact authored wall-to-wall alignment and keeps perimeter caps as a lower-priority reference", () => {
    const candidate = { x: 100, y: 99, w: 80, h: 50 };
    const movingWall: FloorWall = {
      id: "moving-wall",
      x1: 100,
      y1: 199,
      x2: 180,
      y2: 199,
      thickness: 4,
      color: "#555",
    };
    const authoredTarget: FloorWall = {
      id: "authored-target",
      x1: 100,
      y1: 200,
      x2: 180,
      y2: 200,
      thickness: 4,
      color: "#555",
    };
    const perimeterTarget: FloorWall = {
      id: "perimeter-target",
      x1: 0,
      y1: 198,
      x2: 300,
      y2: 198,
      thickness: 14,
      color: "#333",
      managedKind: "perimeter",
    };
    const targets = computeRoomAssemblyAlignmentTargets(
      candidate,
      [movingWall],
      [authoredTarget, perimeterTarget],
      [],
      [],
      300,
      300,
      5,
    );
    expect(targets.y?.priority).toBe(1);
    expect(targets.y?.candidatePosition).toBe(100);
  });

  it("uses the Room footprint for exact Floor-edge targets", () => {
    const targets = computeRoomAssemblyAlignmentTargets(
      { x: 2, y: 3, w: 80, h: 50 },
      [],
      [],
      [],
      [],
      300,
      300,
      5,
    );
    expect(targets.x?.candidatePosition).toBe(0);
    expect(targets.y?.candidatePosition).toBe(0);
  });

  it("snaps a single Room edge exactly to an external authored Wall centerline", () => {
    const wall: FloorWall = {
      id: "neighbor-wall",
      x1: 300,
      y1: 40,
      x2: 300,
      y2: 180,
      thickness: 4,
      color: "#555",
    };
    const targets = computeRoomAssemblyAlignmentTargets(
      { x: 219, y: 70, w: 80, h: 60 },
      [],
      [wall],
      [],
      [],
      600,
      400,
      5,
    );
    expect(targets.x?.candidatePosition).toBe(220);
    expect(targets.x?.priority).toBe(4);
  });

  it("keeps a perimeter junction cap normalized to the authored Wall", () => {
    expect(normalizedWallJointHalfSize([
      { thickness: 4, managedKind: undefined },
      { thickness: 14, managedKind: "perimeter" },
    ])).toBe(normalizedWallJointHalfSize([{ thickness: 4, managedKind: undefined }]));
    expect(normalizedWallJointHalfSize([{ thickness: 14, managedKind: "perimeter" }])).toBe(0);
  });
});
