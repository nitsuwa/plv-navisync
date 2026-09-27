import { describe, expect, it } from "vitest";
import { nextRoomName } from "../FloorEditor";
import { normalizeFloor } from "../../../lib/floorPlanNormalization";
import type { FloorDoor, FloorRoom, FloorWall, NavigationNode } from "../types";
import { roomDoorLinkTargetIsValid } from "../FloorEditor";

describe("Room authoring names", () => {
  it("fills the lowest available numbered Room name", () => {
    expect(nextRoomName([{ name: "Room 1" }, { name: "Room 3" }])).toBe("Room 2");
  });

  it("gives a duplicated numbered Room the next unique number", () => {
    expect(nextRoomName([{ name: "Room 1" }], "Room 1")).toBe("Room 2");
  });

  it("keeps explicit names readable while avoiding exact duplicates", () => {
    expect(nextRoomName([{ name: "Chemistry Lab" }], "Chemistry Lab")).toBe("Chemistry Lab Copy");
    expect(nextRoomName([{ name: "Chemistry Lab" }, { name: "Chemistry Lab Copy" }], "Chemistry Lab")).toBe("Chemistry Lab Copy 2");
  });

  it("deduplicates multi-door Room access IDs during floor hydration", () => {
    const floor = normalizeFloor({ id: "f1", rooms: [{ id: "r1", accessDoorId: "d1", accessDoorIds: ["d1", "d2", "d1"] }] });
    expect(floor.rooms[0].accessDoorIds).toEqual(["d1", "d2"]);
  });

  it("only accepts a same-floor, navigation-enabled, physically associated unlinked Door", () => {
    const room = { id: "room-a", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" } as FloorRoom;
    const wall = { id: "wall-a", x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: room.id, edge: "right", offset: 0.5 } } as FloorWall;
    const door = { id: "door-a", x: 80, y: 40, width: 12, direction: "left", color: "#d97706", wallId: wall.id } as FloorDoor;
    const doorNode = { id: "door-node-a", doorId: door.id, buildingId: "b1", floorId: "f1", x: 80, y: 40 } as NavigationNode;
    expect(roomDoorLinkTargetIsValid(room, door, [wall], [doorNode], "b1", "f1")).toBe(true);
    expect(roomDoorLinkTargetIsValid(room, door, [wall], [], "b1", "f1")).toBe(false);
    expect(roomDoorLinkTargetIsValid(room, door, [wall], [doorNode], "b1", "f1", [door.id])).toBe(false);
    expect(roomDoorLinkTargetIsValid(room, door, [wall], [{ ...doorNode, floorId: "f2" }], "b1", "f1")).toBe(false);
  });

  it("allows a genuinely shared boundary Door for either Room", () => {
    const roomB = { id: "room-b", name: "Room B", type: "classroom", x: 80, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" } as FloorRoom;
    const wall = { id: "shared-wall", x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: roomB.id, edge: "left", offset: 0.5 } } as FloorWall;
    const door = { id: "shared-door", x: 80, y: 40, width: 12, direction: "left", color: "#d97706", wallId: wall.id } as FloorDoor;
    const doorNode = { id: "shared-door-node", doorId: door.id, buildingId: "b1", floorId: "f1", x: 80, y: 40 } as NavigationNode;
    const roomA = { id: "room-a", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" } as FloorRoom;
    expect(roomDoorLinkTargetIsValid(roomA, door, [wall], [doorNode], "b1", "f1", [], [roomA, roomB])).toBe(true);
    expect(roomDoorLinkTargetIsValid(roomB, door, [wall], [doorNode], "b1", "f1", [], [roomA, roomB])).toBe(true);
  });

  it("rejects a nearby Door whose parent Wall is on the neighboring Room boundary", () => {
    const roomA = { id: "room-a", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" } as FloorRoom;
    const roomB = { id: "room-b", name: "Room B", type: "classroom", x: 80, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" } as FloorRoom;
    const wallA = { id: "wall-a", x1: 20, y1: 60, x2: 80, y2: 60, thickness: 4, color: "#64748b" } as FloorWall;
    const wallB = { id: "wall-b", x1: 80, y1: 60, x2: 140, y2: 60, thickness: 4, color: "#64748b" } as FloorWall;
    const doorA = { id: "door-a", x: 50, y: 60, width: 12, direction: "left", color: "#d97706", wallId: wallA.id } as FloorDoor;
    const doorB = { id: "door-b", x: 95, y: 60, width: 12, direction: "left", color: "#d97706", wallId: wallB.id } as FloorDoor;
    const nodes = [doorA, doorB].map((door) => ({
      id: `${door.id}-node`, doorId: door.id, buildingId: "b1", floorId: "f1", x: door.x, y: door.y,
    } as NavigationNode));

    expect(roomDoorLinkTargetIsValid(roomA, doorA, [wallA, wallB], nodes, "b1", "f1", [], [roomA, roomB])).toBe(true);
    expect(roomDoorLinkTargetIsValid(roomA, doorB, [wallA, wallB], nodes, "b1", "f1", [], [roomA, roomB])).toBe(false);
  });

  it("uses a custom Room polygon boundary instead of its bounding rectangle", () => {
    const room = {
      id: "custom-room", name: "Custom", type: "classroom", x: 20, y: 20, w: 80, h: 80,
      shapePoints: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 100 }],
      floorId: "f1", buildingId: "b1",
    } as FloorRoom;
    const outsideWall = { id: "outside-wall", x1: 100, y1: 60, x2: 100, y2: 100, thickness: 4, color: "#64748b" } as FloorWall;
    const outsideDoor = { id: "outside-door", x: 100, y: 80, width: 12, direction: "left", color: "#d97706", wallId: outsideWall.id } as FloorDoor;
    const boundaryWall = { id: "boundary-wall", x1: 100, y1: 20, x2: 60, y2: 60, thickness: 4, color: "#64748b" } as FloorWall;
    const boundaryDoor = { id: "boundary-door", x: 80, y: 40, width: 12, direction: "left", color: "#d97706", wallId: boundaryWall.id } as FloorDoor;
    const nodes = [outsideDoor, boundaryDoor].map((door) => ({
      id: `${door.id}-node`, doorId: door.id, buildingId: "b1", floorId: "f1", x: door.x, y: door.y,
    } as NavigationNode));

    expect(roomDoorLinkTargetIsValid(room, outsideDoor, [outsideWall], nodes, "b1", "f1")).toBe(false);
    expect(roomDoorLinkTargetIsValid(room, boundaryDoor, [boundaryWall], nodes, "b1", "f1")).toBe(true);
  });
});
