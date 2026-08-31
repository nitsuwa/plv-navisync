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
});
