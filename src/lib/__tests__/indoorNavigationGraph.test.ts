import { describe, expect, it } from "vitest";
import {
  indoorNavNodes,
  indoorNavEdges,
  indoorNodeAccessibleDefault,
  createIndoorNavNode,
  linkedObjectRef,
  stairEntryPosition,
  resolveIndoorLinkedPosition,
  syncIndoorLinkedNodePositions,
  pruneOrphanedIndoorNodes,
  findRoomAtPoint,
  findDoorAtPoint,
  findCirculationAtPoint,
  edgeCrossesWallWithoutDoor,
  edgePolylineCrossesWallWithoutDoor,
  orthogonalBendsFor,
  normalizeBendPoints,
  pointInsideWallObstacle,
  wallObstacleRadius,
  translateOrthogonalSegment,
  navAlignSnap,
  navGroupAlignSnap,
  remapIndoorNavForFloorCopy,
  replaceBuildingFloorsAndReconcileTransitions,
  navEdgeIsBlocked,
  CROSS_FLOOR_EDGE_TYPE,
  crossFloorTransitionAccessible,
  findCrossFloorOwnerInfo,
  reconcileCrossFloorTransitions,
  roomDisplayName,
  roomDoorIsValid,
  reconcileRoomDoorEdges,
  roomAccessDoorIds,
  normalizeNavigationEdges,
  ROOM_DOOR_EDGE_TYPE,
} from "../indoorNavigationGraph";
import { createNavEdge, normalizeNavGraph } from "../navigationGraph";
import { findNavigationRoute } from "../pathfinding";
import type {
  FloorPlan, FloorWall, FloorDoor, NavigationNode, NavigationEdge,
} from "../../components/map-builder/types";

function makeFloor(): Pick<FloorPlan, "rooms" | "doors" | "stairs" | "ramps" | "elevators"> {
  return {
    rooms: [{ id: "r1", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" }],
    doors: [{ id: "d1", x: 80, y: 40, width: 8, direction: "left", color: "#d97706", wallId: "w1", offset: 0.5 }],
    stairs: [{ id: "s1", x: 100, y: 80, width: 20, height: 16, direction: "both", label: "Stairs" }],
    ramps: [{ id: "r1c", x: 140, y: 80, width: 20, height: 12, label: "Ramp" }],
    elevators: [{ id: "e1", x: 170, y: 60, width: 14, height: 14, doorWidth: 6, label: "Elevator" }],
  };
}

function freeNode(id: string, x: number, y: number): NavigationNode {
  return createIndoorNavNode({ id, x, y, buildingId: "b1", floorId: "f1", campusId: "c1", name: "Waypoint", type: "hallway" });
}

describe("B5 Phase 2 — indoorNavNodes / indoorNavEdges (floor scoping)", () => {
  it("filters nodes to the current building+floor", () => {
    const nodes = [
      freeNode("n1", 10, 10),
      { ...freeNode("n2", 20, 20), floorId: "f2" },
      { ...freeNode("n3", 30, 30), buildingId: "b2" },
    ];
    expect(indoorNavNodes(nodes, "b1", "f1").map((n) => n.id)).toEqual(["n1"]);
    expect(indoorNavNodes(undefined, "b1", "f1")).toEqual([]);
  });

  it("only includes edges whose BOTH endpoints are indoor nodes of this floor", () => {
    const nodes = [freeNode("n1", 0, 0), freeNode("n2", 50, 50)];
    const edges = [
      { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 70, bidirectional: true, accessible: true, type: "hallway", color: "#3f6212", width: 1.6 },
      { id: "e2", startNodeId: "n1", endNodeId: "n-other-floor", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#3f6212", width: 1.6 },
    ];
    expect(indoorNavEdges(edges, nodes, "b1", "f1").map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("B5 Phase 2 — node creation + accessibility defaults", () => {
  it("applies canonical defaults per linked kind", () => {
    expect(indoorNodeAccessibleDefault("stair")).toBe(false);
    expect(indoorNodeAccessibleDefault("elevator")).toBe(true);
    expect(indoorNodeAccessibleDefault("ramp")).toBe(true);
    expect(indoorNodeAccessibleDefault("hallway")).toBe(true);
  });

  it("createIndoorNavNode stamps floor/building + linked refs + accessibility default", () => {
    const node = createIndoorNavNode({ id: "n1", x: 10, y: 12, buildingId: "b1", floorId: "f1", campusId: "c1", type: "stair", stairId: "s1" });
    expect(node.floorId).toBe("f1");
    expect(node.buildingId).toBe("b1");
    expect(node.stairId).toBe("s1");
    expect(node.accessible).toBe(false);
    expect(node.name).toBe("Waypoint");
  });

  it("linkedObjectRef reports exactly one linked owner", () => {
    expect(linkedObjectRef(freeNode("n1", 0, 0))).toBeNull();
    expect(linkedObjectRef(createIndoorNavNode({ id: "n2", x: 0, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" }))).toEqual({ kind: "room", id: "r1" });
    expect(linkedObjectRef(createIndoorNavNode({ id: "n3", x: 0, y: 0, buildingId: "b1", floorId: "f1", doorId: "d1" }))).toEqual({ kind: "door", id: "d1" });
    expect(linkedObjectRef(createIndoorNavNode({ id: "n4", x: 0, y: 0, buildingId: "b1", floorId: "f1", elevatorId: "e1" }))).toEqual({ kind: "elevator", id: "e1" });
    expect(linkedObjectRef(createIndoorNavNode({ id: "n5", x: 0, y: 0, buildingId: "b1", floorId: "f1", rampId: "r1c" }))).toEqual({ kind: "ramp", id: "r1c" });
  });
});

describe("B5 Phase 2 — linked position resolution + sync", () => {
  const floor = makeFloor();

  it("resolves the room anchor (offset from center), door position, and circulation centers", () => {
    // Room r1 (x:20 y:20 w:60 h:40, rotation 0) → anchor = (50, 30), a
    // deterministic offset above the center so edges never land on the label.
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n1", x: 0, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" }), floor)).toEqual({ x: 50, y: 30 });
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n2", x: 0, y: 0, buildingId: "b1", floorId: "f1", doorId: "d1" }), floor)).toEqual({ x: 80, y: 40 });
    // Stairs use one neutral access point at the centred floor-facing edge,
    // not a flight-specific point inside the footprint.
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n3", x: 0, y: 0, buildingId: "b1", floorId: "f1", stairId: "s1" }), floor)).toEqual({ x: 110, y: 96 });
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n4", x: 0, y: 0, buildingId: "b1", floorId: "f1", elevatorId: "e1" }), floor)).toEqual({ x: 177, y: 74 });
    // B5 Phase 2.6: the ramp's LOGICAL routing anchor is the object CENTER
    // (route edges terminate there); the visual badge may offset separately.
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n5", x: 0, y: 0, buildingId: "b1", floorId: "f1", rampId: "r1c" }), floor)).toEqual({ x: 150, y: 86 });
  });

  it("keeps one neutral stair anchor through mirror and rotation", () => {
    const stair = { x: 100, y: 80, width: 20, height: 16, rotation: 0, flip: false };
    expect(stairEntryPosition(stair)).toEqual({ x: 110, y: 96 });
    expect(stairEntryPosition({ ...stair, flip: true })).toEqual({ x: 110, y: 96 });
    expect(stairEntryPosition({ ...stair, rotation: 90 })).toEqual({ x: 102, y: 88 });
  });

  it("keeps the same anchor for Up, Down, Both, and either Entry Side", () => {
    const stair = { x: 100, y: 80, width: 20, height: 16, rotation: 0, flip: false, direction: "up" as const };
    expect(stairEntryPosition(stair)).toEqual({ x: 110, y: 96 });
    expect(stairEntryPosition({ ...stair, direction: "down" })).toEqual({ x: 110, y: 96 });
    expect(stairEntryPosition({ ...stair, flip: true, direction: "down" })).toEqual({ x: 110, y: 96 });
    expect(stairEntryPosition({ ...stair, direction: "both", rotation: 90 })).toEqual({ x: 102, y: 88 });
  });

  it("moves the existing linked Stair node when its direction changes", () => {
    const stair = { id: "s1", x: 100, y: 80, width: 20, height: 16, rotation: 0, flip: false, direction: "up" as const, label: "Stairs" };
    const linked = createIndoorNavNode({ id: "stair-node", x: 110, y: 96, buildingId: "b1", floorId: "f1", stairId: "s1", type: "stair" });
    const synced = syncIndoorLinkedNodePositions([linked], { ...floor, stairs: [stair] });
    const down = syncIndoorLinkedNodePositions(synced, { ...floor, stairs: [{ ...stair, direction: "down" }] });
    expect(down).toHaveLength(1);
    expect(down[0].id).toBe("stair-node");
    expect(down[0]).toMatchObject({ x: 110, y: 96 });
  });

  it("re-resolves the same Stair node when floor-order reconciliation changes its direction", () => {
    const stair = { id: "s1", x: 100, y: 80, width: 20, height: 16, rotation: 0, flip: false, direction: "both" as const, label: "Stairs" };
    const floors = [
      { ...makeFloor(), id: "f1", number: 1, label: "Ground Floor", stairs: [] },
      { ...makeFloor(), id: "f2", number: 2, label: "Floor 2", stairs: [stair] },
      { ...makeFloor(), id: "f3", number: 3, label: "Floor 3", stairs: [] },
    ] as unknown as FloorPlan[];
    const stairNode = createIndoorNavNode({ id: "stair-node", x: 110, y: 96, buildingId: "b1", floorId: "f2", stairId: "s1", type: "stair" });
    const corridorNode = createIndoorNavNode({ id: "corridor-node", x: 130, y: 96, buildingId: "b1", floorId: "f2", type: "hallway" });
    const campus = {
      id: "c1",
      buildings: [{ id: "b1", floors }],
      navNodes: [stairNode, corridorNode],
      navEdges: [{ id: "edge-1", startNodeId: "stair-node", endNodeId: "corridor-node", distance: 25, bidirectional: true, accessible: true, type: "hallway", color: "#475569", width: 1 }],
    } as unknown as import("../../components/map-builder/types").Campus;
    const reordered = [floors[0], floors[2], { ...floors[1], stairs: [{ ...stair, direction: "down" as const }] }];
    const updated = replaceBuildingFloorsAndReconcileTransitions(campus, "b1", reordered);
    const updatedNode = updated.navNodes.find((node) => node.id === "stair-node");
    expect(updatedNode).toMatchObject({ id: "stair-node", x: 110, y: 96 });
    expect(updated.navEdges.find((edge) => edge.id === "edge-1")?.distance).toBe(25);
  });

  it("syncs linked nodes to their owner after the owner moves; free nodes untouched", () => {
    const linked = createIndoorNavNode({ id: "n1", x: 0, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" });
    const free = freeNode("n2", 33, 44);
    const moved = { ...floor, rooms: [{ ...floor.rooms[0], x: 100, y: 60 }] };
    const synced = syncIndoorLinkedNodePositions([linked, free], moved);
    const syncedRoom = synced.find((n) => n.id === "n1")!;
    expect(syncedRoom.x).toBe(130);
    expect(syncedRoom.y).toBe(70); // room routing anchor (offset above the moved center)
    expect(synced.find((n) => n.id === "n2")).toEqual(free);
  });
});

describe("Room navigation display identity", () => {
  it("uses the explicit Room name and a stable floor-local fallback", () => {
    expect(roomDisplayName({ name: "  Library  " }, 0)).toBe("Library");
    expect(roomDisplayName({ name: "" }, 0)).toBe("Room 1");
    expect(roomDisplayName({ name: "   " }, 2)).toBe("Room 3");
    expect(roomDisplayName({ name: "" })).toBe("Room");
  });
});

describe("Room Door access relationship", () => {
  const room = { id: "r1", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1", accessDoorId: "d1" } as FloorPlan["rooms"][number];
  const door = { id: "d1", x: 80, y: 40, width: 8, direction: "left", color: "#d97706", wallId: "w1", offset: 0.5 } as FloorDoor;
  const wall = { id: "w1", x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: "r1", edge: "right", offset: 0.5 } } as FloorWall;

  it("accepts only a Door physically associated with the Room boundary", () => {
    expect(roomDoorIsValid(room, door, [wall])).toBe(true);
    expect(roomDoorIsValid(room, { ...door, x: 160 }, [wall])).toBe(true); // wall anchor is authoritative
    expect(roomDoorIsValid(room, { ...door, wallId: "other" }, [wall])).toBe(false);
    expect(roomDoorIsValid(room, door, [{ ...wall, startAnchor: { ...wall.startAnchor!, roomId: "other-room" } }])).toBe(false);
  });

  it("derives one semantic Room-to-Door edge without merging identities", () => {
    const roomNode = createIndoorNavNode({ id: "room-node", x: 0, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" });
    const doorNode = createIndoorNavNode({ id: "door-node", x: 0, y: 0, buildingId: "b1", floorId: "f1", doorId: "d1", type: "hallway" });
    const edges = reconcileRoomDoorEdges([roomNode, doorNode], [], [room], [door], [wall]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ startNodeId: "room-node", endNodeId: "door-node", type: ROOM_DOOR_EDGE_TYPE });
    expect(reconcileRoomDoorEdges([roomNode, doorNode], edges, [room], [door], [wall])).toHaveLength(1);
  });
});

describe("B5 Phase 2 — orphan pruning on physical-object deletion", () => {
  const floor = makeFloor();

  it("removes linked nodes whose owner is gone plus every connected edge", () => {
    const roomNode = createIndoorNavNode({ id: "n1", x: 0, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" });
    const doorNode = createIndoorNavNode({ id: "n2", x: 0, y: 0, buildingId: "b1", floorId: "f1", doorId: "d1" });
    const free = freeNode("n3", 5, 5);
    const edges: NavigationEdge[] = [
      { id: "e1", startNodeId: "n1", endNodeId: "n3", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#3f6212", width: 1.6 },
      { id: "e2", startNodeId: "n2", endNodeId: "n3", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#3f6212", width: 1.6 },
    ];
    // Both the room AND the door are deleted — both linked nodes become orphaned.
    const floorNoOwners = { ...floor, rooms: [], doors: [] };
    const pruned = pruneOrphanedIndoorNodes([roomNode, doorNode, free], edges, floorNoOwners);
    expect(pruned.nodes.map((n) => n.id)).toEqual(["n3"]);
    expect(pruned.edges).toEqual([]);
  });

  it("is a no-op when every linked owner still exists", () => {
    const node = createIndoorNavNode({ id: "n1", x: 0, y: 0, buildingId: "b1", floorId: "f1", stairId: "s1" });
    const pruned = pruneOrphanedIndoorNodes([node], [], floor);
    expect(pruned.nodes).toHaveLength(1);
    expect(pruned.edges).toEqual([]);
  });
});

describe("B5 Phase 2 — point target finders", () => {
  const floor = makeFloor();

  it("findRoomAtPoint only matches inside room bounds", () => {
    expect(findRoomAtPoint(floor.rooms, { x: 50, y: 40 })).not.toBeNull();
    expect(findRoomAtPoint(floor.rooms, { x: 200, y: 140 })).toBeNull();
  });

  it("findDoorAtPoint uses distance tolerance", () => {
    expect(findDoorAtPoint(floor.doors, { x: 80, y: 42 })).not.toBeNull();
    expect(findDoorAtPoint(floor.doors, { x: 20, y: 120 })).toBeNull();
  });

  it("findCirculationAtPoint resolves the nearest circulation center", () => {
    expect(findCirculationAtPoint(floor.stairs, floor.elevators, floor.ramps, { x: 110, y: 88 })).toEqual({ kind: "stairs", id: "s1" });
    expect(findCirculationAtPoint(floor.stairs, floor.elevators, floor.ramps, { x: 110, y: 96 })).toEqual({ kind: "stairs", id: "s1" });
    expect(findCirculationAtPoint(floor.stairs, floor.elevators, floor.ramps, { x: 177, y: 67 })).toEqual({ kind: "elevator", id: "e1" });
    expect(findCirculationAtPoint(floor.stairs, floor.elevators, floor.ramps, { x: 5, y: 5 })).toBeNull();
  });
});

describe("B5 Phase 2 — wall-crossing safety", () => {
  const wall: FloorWall = { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" };
  const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };

  it("rejects an edge crossing a wall without a door", () => {
    const blocked = edgeCrossesWallWithoutDoor({ x: 70, y: 30 }, { x: 70, y: 120 }, [wall], []);
    expect(blocked).not.toBeNull();
    expect(blocked?.wall.id).toBe("w1");
  });

  it("allows the crossing when a door opens the wall at the crossing point", () => {
    const result = edgeCrossesWallWithoutDoor({ x: 90, y: 30 }, { x: 90, y: 120 }, [wall], [door]);
    expect(result).toBeNull();
  });

  it("does not block edges that never intersect a wall", () => {
    expect(edgeCrossesWallWithoutDoor({ x: 10, y: 10 }, { x: 30, y: 30 }, [wall], [])).toBeNull();
  });
});

describe("B5 Phase 2 — floor duplication graph remap", () => {
  it("remaps ids, floorId, linked refs and edge endpoints with no back-references", () => {
    const nodes = [
      createIndoorNavNode({ id: "n1", x: 10, y: 10, buildingId: "b1", floorId: "f1", roomId: "r1", type: "room_access" }),
      freeNode("n2", 60, 60),
    ];
    const edges: NavigationEdge[] = [
      { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 70, bidirectional: true, accessible: true, type: "hallway", color: "#3f6212", width: 1.6 },
    ];
    const idMaps = {
      rooms: new Map([["r1", "r1-copy"]]),
      doors: new Map<string, string>(),
      stairs: new Map<string, string>(),
      elevators: new Map<string, string>(),
      ramps: new Map<string, string>(),
    };
    const { navNodes, navEdges } = remapIndoorNavForFloorCopy(nodes, edges, "f1", "f1-copy", idMaps);
    expect(navNodes).toHaveLength(2);
    expect(navNodes.every((n) => n.id !== "n1" && n.id !== "n2")).toBe(true);
    expect(navNodes.every((n) => n.floorId === "f1-copy")).toBe(true);
    expect(navNodes.find((n) => n.roomId)?.roomId).toBe("r1-copy");
    expect(navEdges).toHaveLength(1);
    expect(navEdges[0].id).not.toBe("e1");
    expect(navEdges[0].startNodeId).toBe(navNodes[0].id);
    expect(navEdges[0].endNodeId).toBe(navNodes[1].id);
  });

  it("leaves other floors untouched", () => {
    const otherFloor = freeNode("n9", 1, 1);
    const other = { ...otherFloor, floorId: "f2" };
    const { navNodes } = remapIndoorNavForFloorCopy([other], [], "f1", "f1-copy", {
      rooms: new Map(), doors: new Map(), stairs: new Map(), elevators: new Map(), ramps: new Map(),
    });
    expect(navNodes).toHaveLength(0);
  });
});

describe("B5 Phase 2.8 — wall-aware orthogonal connector", () => {
  const wall: FloorWall = { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" };

  it("rejects a segment running ALONG a wall (wall-hug) without a door", () => {
    // Horizontal segment that overlaps the wall line from x=50..110 → blocked.
    const blocked = edgeCrossesWallWithoutDoor({ x: 50, y: 70 }, { x: 110, y: 70 }, [wall], []);
    expect(blocked).not.toBeNull();
    expect(blocked?.wall.id).toBe("w1");
  });

  it("a wall-hug is passable ONLY within a Door's opening span (LOCAL exception)", () => {
    const door: FloorDoor = { id: "d1", x: 80, y: 70, width: 40, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
    // B5 Phase 2.10: the opening only spans 60..100 — the hug's overhang
    // (50..60 and 100..110) is still solid wall → the WHOLE segment is blocked.
    const blocked = edgeCrossesWallWithoutDoor({ x: 50, y: 70 }, { x: 110, y: 70 }, [wall], [door]);
    expect(blocked).not.toBeNull();
    // A hug entirely inside the opening is a legal passage through the gap.
    expect(edgeCrossesWallWithoutDoor({ x: 65, y: 70 }, { x: 95, y: 70 }, [wall], [door])).toBeNull();
  });

  it("still allows brief endpoint contact with a wall (leaving a linked anchor)", () => {
    // Short segment ending on the wall — under the overlap threshold → valid.
    expect(edgeCrossesWallWithoutDoor({ x: 60, y: 70 }, { x: 63, y: 70 }, [wall], [])).toBeNull();
  });

  it("chooses the L candidate that leaves the wall toward open space", () => {
    // A sits ON the wall (y=70). Horizontal-first would run along the wall;
    // vertical-first leaves perpendicularly → the connector must pick it.
    const bends = orthogonalBendsFor({ x: 70, y: 70 }, { x: 140, y: 120 }, [wall], []);
    expect(bends).toEqual([{ x: 70, y: 120 }]);
  });

  it("chooses the OTHER L candidate when vertical-first is wall-blocked", () => {
    // B below-right; vertical-first (x=60) would cross the wall → horizontal-first wins.
    const bends = orthogonalBendsFor({ x: 60, y: 30 }, { x: 140, y: 120 }, [wall], []);
    expect(bends).toEqual([{ x: 140, y: 30 }]);
  });

  it("tries a deterministic detour when both L candidates are blocked", () => {
    // Axis-aligned pairs stay straight (empty bends) — no detour needed.
    expect(orthogonalBendsFor({ x: 70, y: 30 }, { x: 70, y: 120 }, [wall], [])).toEqual([]);
    // A long horizontal wall blocks BOTH simple L shapes → a deterministic 2-bend
    // U-detour around the wall's open side is returned and stays wall-safe.
    const longWall: FloorWall = { id: "w2", x1: 40, y1: 70, x2: 260, y2: 70, thickness: 6, color: "#64748b" };
    const detour = orthogonalBendsFor({ x: 60, y: 30 }, { x: 140, y: 130 }, [longWall], []);
    expect(detour.length).toBeGreaterThanOrEqual(2);
    expect(edgePolylineCrossesWallWithoutDoor([{ x: 60, y: 30 }, ...detour, { x: 140, y: 130 }], [longWall], [])).toBeNull();
  });

  it("rejects cleanly ([]) when no safe orthogonal geometry exists", () => {
    // Two crossing walls trap the destination — every L candidate AND every
    // deterministic detour is blocked → reject rather than draw through a wall.
    const longWall: FloorWall = { id: "w2", x1: 40, y1: 70, x2: 260, y2: 70, thickness: 6, color: "#64748b" };
    const verticalWall: FloorWall = { id: "w3", x1: 100, y1: 20, x2: 100, y2: 160, thickness: 6, color: "#64748b" };
    expect(orthogonalBendsFor({ x: 60, y: 30 }, { x: 140, y: 130 }, [longWall, verticalWall], [])).toEqual([]);
  });
});

describe("B5 Phase 2.9 — wall clearance routing", () => {
  const wall: FloorWall = { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b" };

  it("rejects a segment running ALONG a wall just OFF the wall face (clearance band)", () => {
    // 5 units below the centerline (thickness 6 → face at +3): the segment is
    // outside the rendered thickness but still reads as embedded in the wall —
    // the clearance band (thickness/2 + 6 = 9) must reject it.
    const blocked = edgeCrossesWallWithoutDoor({ x: 50, y: 75 }, { x: 110, y: 75 }, [wall], []);
    expect(blocked).not.toBeNull();
    expect(blocked?.wall.id).toBe("w1");
  });

  it("allows a parallel segment that clears the wall's effective band", () => {
    // 12 units below the centerline — genuinely walkable floor space.
    expect(edgeCrossesWallWithoutDoor({ x: 50, y: 82 }, { x: 110, y: 82 }, [wall], [])).toBeNull();
  });

  it("endpoint contact is allowed only very close to the anchor", () => {
    // Anchor 3 units off the wall: the vertical exit crosses the wall right at
    // the anchor (within WALL_ENDPOINT_TOLERANCE) → legal linked-anchor contact.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 67 }, { x: 90, y: 130 }, [wall], [])).toBeNull();
    // 10 units off the wall: the crossing is NOT endpoint contact → blocked.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 60 }, { x: 90, y: 130 }, [wall], [])).not.toBeNull();
  });

  it("a wall-side anchor never produces a segment collinear with the wall", () => {
    // A on the wall centerline: horizontal-first L runs ALONG the wall → the
    // connector must leave perpendicularly (vertical-first).
    const bends = orthogonalBendsFor({ x: 70, y: 70 }, { x: 140, y: 120 }, [wall], []);
    expect(bends).toEqual([{ x: 70, y: 120 }]);
    expect(edgePolylineCrossesWallWithoutDoor([{ x: 70, y: 70 }, ...bends, { x: 140, y: 120 }], [wall], [])).toBeNull();
  });

  it("prefers the perpendicular exit when BOTH L candidates are geometrically safe", () => {
    // Short wall (x 40..44) near A: the along-wall L overlap is under the
    // min-overlap so both Ls are technically safe — the wall-exit preference
    // must still pick the vertical-first candidate (leave the wall first).
    const shortWall: FloorWall = { id: "ws", x1: 40, y1: 70, x2: 44, y2: 70, thickness: 6, color: "#64748b" };
    const bends = orthogonalBendsFor({ x: 42, y: 75 }, { x: 120, y: 120 }, [shortWall], []);
    expect(bends).toEqual([{ x: 42, y: 120 }]);
  });

  it("detour geometry also respects the clearance band (wall-safe U-shape)", () => {
    const longWall: FloorWall = { id: "w2", x1: 40, y1: 70, x2: 260, y2: 70, thickness: 6, color: "#64748b" };
    const detour = orthogonalBendsFor({ x: 60, y: 30 }, { x: 140, y: 130 }, [longWall], []);
    expect(detour.length).toBeGreaterThanOrEqual(2);
    const pts = [{ x: 60, y: 30 }, ...detour, { x: 140, y: 130 }];
    // Every detour segment must stay in open floor — no along-wall hugs.
    expect(edgePolylineCrossesWallWithoutDoor(pts, [longWall], [])).toBeNull();
    // The horizontal detour legs must clear the wall's effective band.
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y === pts[i - 1].y) {
        expect(Math.abs(pts[i].y - longWall.y1)).toBeGreaterThan(longWall.thickness / 2);
      }
    }
  });

  it("a Door opening stays a legal wall passage under the clearance rule (LOCAL only)", () => {
    const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
    // Straight crossing through the door.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 30 }, { x: 90, y: 120 }, [wall], [door])).toBeNull();
    // Wall-hug fully inside the opening stays valid.
    expect(edgeCrossesWallWithoutDoor({ x: 80, y: 70 }, { x: 100, y: 70 }, [wall], [door])).toBeNull();
    // B5 Phase 2.10: a hug whose overlap extends OUTSIDE the opening → blocked
    // (the exception is LOCAL to the opening; the wall beside it stays solid).
    expect(edgeCrossesWallWithoutDoor({ x: 75, y: 70 }, { x: 105, y: 70 }, [wall], [door])).not.toBeNull();
  });
});

describe("B5 Phase 2.10 — strict thick-wall collision (ONE authoritative rule)", () => {
  const wall: FloorWall = { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b" };

  it("a horizontal segment centered on the wall thickness is INVALID", () => {
    // Exactly ON the centerline — collinear overlap with the wall body.
    expect(edgeCrossesWallWithoutDoor({ x: 50, y: 70 }, { x: 110, y: 70 }, [wall], [])).not.toBeNull();
    // Even a shorter on-wall run (10 units) is blocked — not just long hugs.
    expect(edgeCrossesWallWithoutDoor({ x: 60, y: 70 }, { x: 70, y: 70 }, [wall], [])).not.toBeNull();
  });

  it("a vertical segment centered on the wall thickness is INVALID", () => {
    // Perpendicular crossing right through the wall body.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 30 }, { x: 90, y: 120 }, [wall], [])).not.toBeNull();
  });

  it("a parallel segment inside the wall thickness is INVALID", () => {
    // On the wall FACE (thickness 6 → face at +3 from the centerline): the
    // segment sits inside the rendered thickness for its whole length.
    expect(edgeCrossesWallWithoutDoor({ x: 50, y: 73 }, { x: 110, y: 73 }, [wall], [])).not.toBeNull();
  });

  it("a DIAGONAL segment through the wall thickness is INVALID", () => {
    // Diagonal A→B crossing the wall at an angle — caught like an orthogonal
    // crossing (thick obstacle, never a thin line).
    expect(edgeCrossesWallWithoutDoor({ x: 60, y: 30 }, { x: 130, y: 120 }, [wall], [])).not.toBeNull();
  });

  it("a point inside a wall body is rejected as a bend location", () => {
    expect(pointInsideWallObstacle({ x: 90, y: 71 }, [wall], [])).not.toBeNull();
  });

  it("a point exactly on the wall centerline is rejected as a bend location", () => {
    expect(pointInsideWallObstacle({ x: 90, y: 70 }, [wall], [])).not.toBeNull();
  });

  it("a point inside the clearance band beside the wall is still rejected", () => {
    // 8 units off the centerline (band = thickness/2 + 6 = 9): visually embedded.
    expect(pointInsideWallObstacle({ x: 90, y: 78 }, [wall], [])).not.toBeNull();
  });

  it("a point in genuine open floor is not inside any obstacle", () => {
    expect(pointInsideWallObstacle({ x: 90, y: 90 }, [wall], [])).toBeNull();
  });

  it("a wall-side anchor may touch the wall only locally — the path must leave at once", () => {
    // Anchor 3 units off the wall leaving PERPENDICULARLY into open floor: legal.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 67 }, { x: 90, y: 130 }, [wall], [])).toBeNull();
    // The same anchor running ALONG the wall instead: a hug → blocked.
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 67 }, { x: 110, y: 67 }, [wall], [])).not.toBeNull();
  });

  it("the same wall away from a Door remains blocked (LOCAL door exception)", () => {
    const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
    // Crossing far from the door opening: still a solid wall.
    expect(edgeCrossesWallWithoutDoor({ x: 50, y: 30 }, { x: 50, y: 120 }, [wall], [door])).not.toBeNull();
    // A door elsewhere on the wall never opens the whole wall.
    expect(edgeCrossesWallWithoutDoor({ x: 130, y: 30 }, { x: 130, y: 120 }, [wall], [door])).not.toBeNull();
  });

  it("a diagonal through a Door opening stays a legal passage", () => {
    const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 48, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
    // A steep diagonal through the opening (its wall-axis span fits inside it).
    expect(edgeCrossesWallWithoutDoor({ x: 90, y: 40 }, { x: 105, y: 110 }, [wall], [door])).toBeNull();
  });

  it("pointInsideWallObstacle honors the Door opening as open floor", () => {
    const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
    // Inside the doorway (projection within the opening span) → not an obstacle.
    expect(pointInsideWallObstacle({ x: 90, y: 70 }, [wall], [door])).toBeNull();
    // Same wall, away from the opening → still a wall.
    expect(pointInsideWallObstacle({ x: 60, y: 70 }, [wall], [door])).not.toBeNull();
  });

  it("wallObstacleRadius = thickness/2 + clearance (thick geometry, never thin)", () => {
    expect(wallObstacleRadius(wall)).toBe(9); // 6/2 + 6
    expect(wallObstacleRadius({ ...wall, thickness: 4 })).toBe(8);
  });

  it("detour geometry stays INSIDE floor bounds when bounds are provided", () => {
    // A FULL-HEIGHT wall — the only way 'around' it would leave the floor
    // canvas. With bounds, no out-of-floor detour is generated → clean reject.
    const fullWall: FloorWall = { id: "wf", x1: 100, y1: 0, x2: 100, y2: 160, thickness: 4, color: "#64748b" };
    const bounds = { width: 220, height: 160 };
    expect(orthogonalBendsFor({ x: 60, y: 60 }, { x: 140, y: 110 }, [fullWall], [], bounds)).toEqual([]);
    // Bounds-free (lib default) may still detour — the caller opts into bounds.
    expect(orthogonalBendsFor({ x: 60, y: 60 }, { x: 140, y: 110 }, [fullWall], [])).not.toEqual([]);
  });
});

describe("B5 Phase 2.8 — bend normalization + orthogonal segment translation", () => {
  it("removes duplicate consecutive bends and zero-length segments", () => {
    expect(normalizeBendPoints([{ x: 40, y: 40 }, { x: 40, y: 40 }, { x: 100, y: 40 }]))
      .toEqual([{ x: 40, y: 40 }, { x: 100, y: 40 }]);
  });

  it("removes three consecutive collinear points (A─B─C on the same axis)", () => {
    expect(normalizeBendPoints([{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 100, y: 40 }]))
      .toEqual([{ x: 40, y: 40 }, { x: 100, y: 40 }]);
    expect(normalizeBendPoints([{ x: 40, y: 20 }, { x: 40, y: 60 }, { x: 40, y: 100 }]))
      .toEqual([{ x: 40, y: 20 }, { x: 40, y: 100 }]);
  });

  it("keeps intentional corners", () => {
    expect(normalizeBendPoints([{ x: 40, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }]))
      .toEqual([{ x: 40, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }]);
  });

  it("interior segment drag preserves bend count (no manufactured corners)", () => {
    const pts = [{ x: 40, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }, { x: 140, y: 80 }];
    const bends = [{ x: 100, y: 40 }, { x: 100, y: 80 }];
    const next = translateOrthogonalSegment(pts, bends, 1, 20, false); // vertical seg → move horizontally
    expect(next).toEqual([{ x: 120, y: 40 }, { x: 120, y: 80 }]);
  });

  it("boundary segment drag inserts exactly ONE corner from the snapshot", () => {
    const pts = [{ x: 40, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }];
    const bends = [{ x: 100, y: 40 }];
    // First segment (horizontal, node→bend) dragged down 20.
    const next = translateOrthogonalSegment(pts, bends, 0, 20, true);
    expect(next).toEqual([{ x: 40, y: 60 }, { x: 100, y: 60 }]);
    // Dragging again from the SAME snapshot never adds another corner.
    const again = translateOrthogonalSegment(pts, bends, 0, 40, true);
    expect(again).toEqual([{ x: 40, y: 80 }, { x: 100, y: 80 }]);
  });
});

describe("B5 Phase 2.8 — always-on alignment guides (no Shift)", () => {
  it("snaps a free node's X or Y to another routing node and reports the guide", () => {
    const snap = navAlignSnap({ x: 52, y: 38 }, [{ x: 46, y: 80 }]);
    expect(snap.x).toBe(46);
    expect(snap.y).toBe(38);
    expect(snap.guides).toEqual([{ type: "v", pos: 46 }]);
  });

  it("returns no guide far from any node", () => {
    const snap = navAlignSnap({ x: 120, y: 120 }, [{ x: 46, y: 80 }]);
    expect(snap.x).toBe(120);
    expect(snap.y).toBe(120);
    expect(snap.guides).toEqual([]);
  });

  it("group drag aligns bbox edges/centers to another node's X or Y", () => {
    const snap = navGroupAlignSnap(
      { minX: 40, minY: 40, width: 20, height: 10 },
      12, -2, // → target bbox x 52..72
      [{ x: 46, y: 80 }]
    );
    // Left edge (52) snaps to 46 → dx adjusts by -6.
    expect(snap.dx).toBe(6);
    expect(snap.dy).toBe(-2);
    expect(snap.guides).toEqual([{ type: "v", pos: 46 }]);
  });
});

describe("B5 Phase 2.11 — live validity of EXISTING authored edges (navEdgeIsBlocked)", () => {
  const wall: FloorWall = { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" };
  const door: FloorDoor = { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 };
  const nodes = [
    { id: "n1", x: 20, y: 40 },
    { id: "n2", x: 160, y: 100 },
  ];
  const edge: Pick<NavigationEdge, "startNodeId" | "endNodeId" | "bendPoints"> = {
    startNodeId: "n1",
    endNodeId: "n2",
    bendPoints: [{ x: 160, y: 40 }],
  };

  it("a straight edge whose direct line crosses a wall is invalid", () => {
    const straight = { ...edge, bendPoints: undefined };
    expect(navEdgeIsBlocked(straight, nodes, [wall], [])).toBe(true);
  });

  it("the same edge bent AROUND the wall is valid — and a REMOVED bend turns it invalid again", () => {
    expect(navEdgeIsBlocked(edge, nodes, [wall], [])).toBe(false);
    // Simulate Remove Bend leaving the direct diagonal.
    const afterRemove = { ...edge, bendPoints: undefined };
    expect(navEdgeIsBlocked(afterRemove, nodes, [wall], [])).toBe(true);
  });

  it("an edge crossing through an actual Door opening stays valid", () => {
    const doorNodes = [{ id: "n1", x: 90, y: 30 }, { id: "n2", x: 90, y: 120 }];
    expect(navEdgeIsBlocked({ startNodeId: "n1", endNodeId: "n2" }, doorNodes, [wall], [door])).toBe(false);
  });

  it("an edge wholly clear of walls is valid", () => {
    expect(navEdgeIsBlocked({ startNodeId: "n1", endNodeId: "n2", bendPoints: [{ x: 20, y: 100 }] }, nodes, [wall], [])).toBe(false);
  });

  it("keeps the semantic Room→Door relationship out of physical path validation", () => {
    expect(navEdgeIsBlocked({ ...edge, type: ROOM_DOOR_EDGE_TYPE }, nodes, [wall], [])).toBe(false);
  });
});

describe("B5 Phase 3 — cross-floor navigation transitions", () => {
  const stair = (id: string, sharedId: string) => ({
    id, x: 40, y: 40, width: 20, height: 16, direction: "both" as const, label: "Stairs", sharedId,
  });
  const elevator = (id: string, sharedId: string, floors?: number[]) => ({
    id, x: 40, y: 40, width: 14, height: 14, doorWidth: 6, label: "Elevator", sharedId,
    ...(floors ? { floors } : {}),
  });
  const ramp = (id: string, sharedId: string) => ({
    id, x: 40, y: 40, width: 20, height: 12, label: "Ramp", direction: "both" as const, sharedId,
  });
  const floors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
    { id: "f1", number: 1, label: "Ground Floor", stairs: [stair("s1", "stair-core-a")], ramps: [], elevators: [] },
    { id: "f2", number: 2, label: "Floor 2", stairs: [stair("s2", "stair-core-a")], ramps: [], elevators: [] },
    { id: "f3", number: 3, label: "Floor 3", stairs: [stair("s3", "stair-core-a")], ramps: [], elevators: [] },
  ];
  const linked = (id: string, floorId: string, refs: Partial<NavigationNode>): NavigationNode => ({
    id, name: "Stairs", type: "stair", x: 50, y: 48, buildingId: "b1", floorId, accessible: false, color: "#16a34a", ...refs,
  });

  it("matching Stair sharedId on adjacent floors produces ONE transition edge (stair = not accessible)", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    expect(edges).toHaveLength(1);
    const t = edges[0];
    expect(t.type).toBe(CROSS_FLOOR_EDGE_TYPE);
    expect(t.accessible).toBe(false);
    expect(crossFloorTransitionAccessible("stair")).toBe(false);
    expect([t.startNodeId, t.endNodeId].sort()).toEqual(["n1", "n2"]);
  });

  it("changing Direction only never creates a new Stair connection", () => {
    const authoredFloors = [
      { ...floors[0], stairs: [{ ...stair("s1", "left-chain"), direction: "both" as const }] },
      { ...floors[1], stairs: [{ ...stair("s2", "left-chain"), direction: "down" as const }] },
      { ...floors[2], stairs: [{ ...stair("s3", "unrelated-chain"), direction: "both" as const }] },
    ];
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
      linked("n3", "f3", { stairId: "s3" }),
    ];
    const before = reconcileCrossFloorTransitions(nodes, [], authoredFloors, "b1");
    const directionChanged = authoredFloors.map((floor) => floor.id === "f2"
      ? { ...floor, stairs: [{ ...floor.stairs[0], direction: "both" as const }] }
      : floor);
    const after = reconcileCrossFloorTransitions(nodes, before, directionChanged, "b1");
    expect(directionChanged.flatMap((floor) => floor.stairs).map((item) => item.sharedId)).toEqual([
      "left-chain", "left-chain", "unrelated-chain",
    ]);
    expect(after.map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|"))).toEqual(["n1|n2"]);
  });

  it("does not cross-pair duplicate same-floor Stair occurrences sharing a legacy identity", () => {
    const duplicateFloors = [
      { ...floors[0], stairs: [stair("s1-left", "legacy-core"), stair("s1-right", "legacy-core")] },
      { ...floors[1], stairs: [stair("s2-left", "legacy-core")] },
    ];
    const nodes = [
      linked("n1-left", "f1", { stairId: "s1-left" }),
      linked("n1-right", "f1", { stairId: "s1-right" }),
      linked("n2-left", "f2", { stairId: "s2-left" }),
    ];
    expect(reconcileCrossFloorTransitions(nodes, [], duplicateFloors, "b1")).toHaveLength(0);
  });

  it("unrelated sharedIds do not connect", () => {
    const otherFloors = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [stair("s1", "stair-core-a")], ramps: [], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [stair("s2", "stair-core-b")], ramps: [], elevators: [] },
    ];
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    expect(reconcileCrossFloorTransitions(nodes, [], otherFloors, "b1")).toHaveLength(0);
  });

  it("a Stair and an Elevator sharing a sharedId do NOT connect (kind isolation)", () => {
    const mixedFloors = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [stair("s1", "core-a")], ramps: [], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "core-a")] },
    ];
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
    ];
    expect(reconcileCrossFloorTransitions(nodes, [], mixedFloors, "b1")).toHaveLength(0);
  });

  it("a three-floor Stair chain creates ADJACENT transitions only (never 1→3)", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
      linked("n3", "f3", { stairId: "s3" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    expect(edges).toHaveLength(2);
    const pairs = edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n1|n2", "n2|n3"]);
  });

  it("a four-floor Stair chain creates exactly N-1 adjacent canonical transitions", () => {
    const fourFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "fa", number: 1, label: "Ground Floor", stairs: [stair("sa", "stair-s")], ramps: [], elevators: [] },
      { id: "fb", number: 2, label: "Floor 2", stairs: [stair("sb", "stair-s")], ramps: [], elevators: [] },
      { id: "fc", number: 3, label: "Floor 3", stairs: [stair("sc", "stair-s")], ramps: [], elevators: [] },
      { id: "fd", number: 4, label: "Floor 4", stairs: [stair("sd", "stair-s")], ramps: [], elevators: [] },
    ];
    const nodes = [
      linked("na", "fa", { stairId: "sa" }),
      linked("nb", "fb", { stairId: "sb" }),
      linked("nc", "fc", { stairId: "sc" }),
      linked("nd", "fd", { stairId: "sd" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], fourFloors, "b1");
    const pairs = edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["na|nb", "nb|nc", "nc|nd"]);
    expect(pairs).not.toContain("na|nc");
    expect(pairs).not.toContain("na|nd");
    expect(pairs).not.toContain("nb|nd");

    const reordered = [fourFloors[3], fourFloors[0], fourFloors[1], fourFloors[2]];
    const afterReorder = reconcileCrossFloorTransitions(nodes, edges, reordered, "b1");
    const reorderedPairs = afterReorder.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(reorderedPairs).toEqual(["na|nb", "na|nd", "nb|nc"]);
    expect(reorderedPairs).not.toContain("nc|nd");
    expect(new Set(afterReorder.map((e) => e.id)).size).toBe(afterReorder.length);
  });

  it("Stairs do not skip a missing linked intermediate floor", () => {
    const fourFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "fa", number: 1, label: "Ground Floor", stairs: [stair("sa", "stair-s")], ramps: [], elevators: [] },
      { id: "fb", number: 2, label: "Floor 2", stairs: [stair("sb", "stair-s")], ramps: [], elevators: [] },
      { id: "fc", number: 3, label: "Floor 3", stairs: [stair("sc", "stair-s")], ramps: [], elevators: [] },
      { id: "fd", number: 4, label: "Floor 4", stairs: [stair("sd", "stair-s")], ramps: [], elevators: [] },
    ];
    const nodes = [
      linked("na", "fa", { stairId: "sa" }),
      linked("nb", "fb", { stairId: "sb" }),
      linked("nd", "fd", { stairId: "sd" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], fourFloors, "b1");
    expect(edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|"))).toEqual(["na|nb"]);
  });

  it("Stair reconciliation cleans existing stale skip edges after canonical reorder", () => {
    const reordered: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "fg", number: 1, label: "Ground Floor", stairs: [stair("sg", "stair-s")], ramps: [], elevators: [] },
      { id: "f3", number: 3, label: "Floor 3", stairs: [stair("s3", "stair-s")], ramps: [], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [stair("s2", "stair-s")], ramps: [], elevators: [] },
      { id: "f4", number: 4, label: "Floor 4", stairs: [stair("s4", "stair-s")], ramps: [], elevators: [] },
    ];
    const nodes = [
      linked("ng", "fg", { stairId: "sg" }),
      linked("n3", "f3", { stairId: "s3" }),
      linked("n2", "f2", { stairId: "s2" }),
      linked("n4", "f4", { stairId: "s4" }),
    ];
    const staleEdges: NavigationEdge[] = [
      { id: "bad-ground-floor2", startNodeId: "ng", endNodeId: "n2", distance: 1, bidirectional: true, accessible: false, emergencySafe: true, type: CROSS_FLOOR_EDGE_TYPE, color: "#475569", width: 1 },
      { id: "bad-ground-floor4", startNodeId: "ng", endNodeId: "n4", distance: 1, bidirectional: true, accessible: false, emergencySafe: true, type: CROSS_FLOOR_EDGE_TYPE, color: "#475569", width: 1 },
      { id: "normal-walkway", startNodeId: "n2", endNodeId: "n4", distance: 20, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const edges = reconcileCrossFloorTransitions(nodes, staleEdges, reordered, "b1");
    const transitions = edges.filter((e) => e.type === CROSS_FLOOR_EDGE_TYPE);
    const pairs = transitions.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n2|n3", "n2|n4", "n3|ng"]);
    expect(pairs).not.toContain("n2|ng");
    expect(pairs).not.toContain("n4|ng");
    expect(edges.some((e) => e.id === "normal-walkway")).toBe(true);
  });

  it("Stair adjacency follows canonical floor array order, not floor numbers", () => {
    const reordered = [floors[2], floors[0], floors[1]]; // Floor 3, Ground Floor, Floor 2
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
      linked("n3", "f3", { stairId: "s3" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], reordered, "b1");
    const pairs = edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n1|n2", "n1|n3"]);
  });

  it("an Elevator links only its SERVED floors (nodes on unserved floors never participate)", () => {
    const elevatorFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 3])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 3])] },
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [], elevators: [elevator("e3", "el-a", [1, 3])] },
    ];
    const nodes = [
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
      linked("n3", "f3", { elevatorId: "e3", type: "elevator" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], elevatorFloors, "b1");
    expect(edges).toHaveLength(1);
    expect(edges[0].accessible).toBe(true); // elevator transition = accessible
    expect([edges[0].startNodeId, edges[0].endNodeId].sort()).toEqual(["n1", "n3"]);
  });

  it("Elevator served floors remain respected while served participants use canonical order", () => {
    const elevatorFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [], elevators: [elevator("e3", "el-a", [1, 3])] },
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 3])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 3])] },
    ];
    const nodes = [
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
      linked("n3", "f3", { elevatorId: "e3", type: "elevator" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], elevatorFloors, "b1");
    expect(edges).toHaveLength(1);
    expect([edges[0].startNodeId, edges[0].endNodeId].sort()).toEqual(["n1", "n3"]);
  });

  it("an Elevator chain connects adjacent served stops only, never skipping through", () => {
    const elevatorFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 2, 4])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 2, 4])] },
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [], elevators: [elevator("e3", "el-a", [1, 2, 4])] },
      { id: "f4", number: 4, label: "Floor 4", stairs: [], ramps: [], elevators: [elevator("e4", "el-a", [1, 2, 4])] },
    ];
    const nodes = [
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
      linked("n3", "f3", { elevatorId: "e3", type: "elevator" }),
      linked("n4", "f4", { elevatorId: "e4", type: "elevator" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], elevatorFloors, "b1");
    const pairs = edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n1|n2", "n2|n4"]);
    expect(pairs).not.toContain("n1|n4");
    expect(edges.every((e) => e.accessible)).toBe(true);
  });

  it("removing an Elevator served floor removes stale transition edges and preserves idempotency", () => {
    const elevatorFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 2, 4])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 2, 4])] },
      { id: "f4", number: 4, label: "Floor 4", stairs: [], ramps: [], elevators: [elevator("e4", "el-a", [1, 2, 4])] },
    ];
    const nodes = [
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
      linked("n4", "f4", { elevatorId: "e4", type: "elevator" }),
    ];
    const first = reconcileCrossFloorTransitions(nodes, [], elevatorFloors, "b1");
    expect(first.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort()).toEqual(["n1|n2", "n2|n4"]);

    const removedStop = elevatorFloors.map((f) => ({
      ...f,
      elevators: (f.elevators ?? []).map((e) => ({ ...e, floors: [1, 4] })),
    }));
    const afterRemoval = reconcileCrossFloorTransitions(nodes, first, removedStop, "b1");
    expect(afterRemoval).toHaveLength(1);
    expect([afterRemoval[0].startNodeId, afterRemoval[0].endNodeId].sort()).toEqual(["n1", "n4"]);

    const again = reconcileCrossFloorTransitions(nodes, afterRemoval, removedStop, "b1");
    expect(again).toEqual(afterRemoval);
  });

  it("Ramp nodes stay local accessible anchors and do NOT create floor transitions", () => {
    const rampFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [ramp("r1", "ramp-a")], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [ramp("r2", "ramp-a")], elevators: [] },
    ];
    const nodes = [
      linked("n1", "f1", { rampId: "r1", type: "ramp", x: 50, y: 46 }), // centered anchors
      linked("n2", "f2", { rampId: "r2", type: "ramp", x: 50, y: 46 }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], rampFloors, "b1");
    expect(edges).toHaveLength(0);
    expect(findCrossFloorOwnerInfo(nodes[0], rampFloors, "b1")).toBeNull();
    expect(createIndoorNavNode("ramp", "Ramp", { x: 50, y: 46 }, { buildingId: "b1", floorId: "f1", rampId: "r1" }).accessible).toBe(true);
    expect(createNavEdge("n1", "n2", 12).accessible).toBe(true);
  });

  it("stale automatic Ramp transition edges are removed deterministically", () => {
    const rampFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [ramp("r3", "ramp-a")], elevators: [] },
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [ramp("r1", "ramp-a")], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [ramp("r2", "ramp-a")], elevators: [] },
    ];
    const nodes = [
      linked("n1", "f1", { rampId: "r1", type: "ramp" }),
      linked("n2", "f2", { rampId: "r2", type: "ramp" }),
      linked("n3", "f3", { rampId: "r3", type: "ramp" }),
    ];
    const stale: NavigationEdge = {
      id: "stale-ramp-transition",
      startNodeId: "n1",
      endNodeId: "n2",
      distance: 1,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: CROSS_FLOOR_EDGE_TYPE,
      color: "#475569",
      width: 1,
    };
    const localWalkway: NavigationEdge = {
      id: "local-ramp-walkway",
      startNodeId: "n1",
      endNodeId: "n2",
      distance: 12,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "walkway",
      color: "#16a34a",
      width: 4,
    };
    const edges = reconcileCrossFloorTransitions(nodes, [stale, localWalkway], rampFloors, "b1");
    expect(edges).toEqual([localWalkway]);
  });

  it("an UNLINKED physical circulation object creates no transition (Link Location stays intentional)", () => {
    // Only floor 1 has a linked node — floor 2's matching stair exists but was
    // never linked into navigation.
    const nodes = [linked("n1", "f1", { stairId: "s1" })];
    expect(reconcileCrossFloorTransitions(nodes, [], floors, "b1")).toHaveLength(0);
  });

  it("creating the matching second-floor node reconciles the transition", () => {
    const oneNode = [linked("n1", "f1", { stairId: "s1" })];
    const without = reconcileCrossFloorTransitions(oneNode, [], floors, "b1");
    expect(without).toHaveLength(0);
    // The second floor's node is linked → the transition appears automatically.
    const both = [linked("n1", "f1", { stairId: "s1" }), linked("n2", "f2", { stairId: "s2" })];
    expect(reconcileCrossFloorTransitions(both, without, floors, "b1")).toHaveLength(1);
  });

  it("repeated reconciliation is idempotent — no duplicate edges, same edge id", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const first = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    const second = reconcileCrossFloorTransitions(nodes, first, floors, "b1");
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("deleting one transition node removes/reconciles its transition edge", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const withEdge = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    expect(withEdge).toHaveLength(1);
    const afterDelete = reconcileCrossFloorTransitions([nodes[0]], withEdge, floors, "b1");
    expect(afterDelete).toHaveLength(0);
  });

  it("a sharedId change removes the stale transition", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const withEdge = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    expect(withEdge).toHaveLength(1);
    // Floor 2's stair now belongs to a different stairwell.
    const changedFloors = floors.map((f) => f.id === "f2" ? { ...f, stairs: [stair("s2", "stair-core-b")] } : f);
    const afterChange = reconcileCrossFloorTransitions(nodes, withEdge, changedFloors, "b1");
    expect(afterChange).toHaveLength(0);
  });

  it("indoorNavEdges excludes cross-floor transition edges (walkable-floor isolation)", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
      { id: "w1", name: "Waypoint", type: "hallway" as const, x: 100, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    const edges = [
      ...reconcileCrossFloorTransitions(nodes, [], floors, "b1"),
      { id: "e1", startNodeId: "n1", endNodeId: "w1", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const indoor = indoorNavEdges(edges, indoorNavNodes(nodes, "b1", "f1"), "b1", "f1");
    expect(indoor.map((e) => e.id)).toEqual(["e1"]);
  });

  it("normalization preserves the transition edge type (persistence-safe)", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    const { edges: normalized } = normalizeNavGraph(nodes, edges);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].type).toBe(CROSS_FLOOR_EDGE_TYPE);
    expect(normalized[0].accessible).toBe(false);
  });

  it("elevator served floors are authoritative even when only ONE owner declares them", () => {
    const mixedFloors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a")] }, // no served list
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 3])] }, // serves 1+3 only
    ];
    const nodes = [
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
    ];
    // Floor 2 is NOT served → no invented stop at floor 2.
    expect(reconcileCrossFloorTransitions(nodes, [], mixedFloors, "b1")).toHaveLength(0);
  });

  it("a sharedId change also creates the NEW valid link where appropriate", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
      linked("n3", "f3", { stairId: "s3" }),
    ];
    const withEdge = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    expect(withEdge).toHaveLength(2); // n1↔n2, n2↔n3
    // Floor 2's stair joins floor 3's chain instead.
    const rezoned = floors.map((f) =>
      f.id === "f2" ? { ...f, stairs: [stair("s2", "stair-core-b")] } : f
    );
    const floors3B = rezoned.map((f) => f.id === "f3" ? { ...f, stairs: [stair("s3", "stair-core-b")] } : f);
    const afterChange = reconcileCrossFloorTransitions(nodes, withEdge, floors3B, "b1");
    // Stale n1↔n2 / n2↔n3 removed; new n2↔n3 created on the b-chain.
    expect(afterChange).toHaveLength(1);
    expect([afterChange[0].startNodeId, afterChange[0].endNodeId].sort()).toEqual(["n2", "n3"]);
  });

  it("findCrossFloorOwnerInfo reports kind/sharedId only for linked, sharedId-carrying nodes", () => {
    const info = findCrossFloorOwnerInfo(linked("n1", "f1", { stairId: "s1" }), floors, "b1");
    expect(info?.kind).toBe("stair");
    expect(info?.sharedId).toBe("stair-core-a");
    expect(info?.floorNumber).toBe(1);
    // No sharedId on the physical object → null.
    const bareFloors = [{ ...floors[0], stairs: [stair("s1", "")] }];
    expect(findCrossFloorOwnerInfo(linked("n1", "f1", { stairId: "s1" }), bareFloors, "b1")).toBeNull();
    // A free (unlinked) node → null.
    const free = { id: "n9", name: "Waypoint", type: "hallway" as const, x: 10, y: 10, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" };
    expect(findCrossFloorOwnerInfo(free, floors, "b1")).toBeNull();
  });

  // ── B5 Phase 3.2 — cross-floor adjacency follows CANONICAL floor order ─────
  // The admin's Move Up/Down reorders the floors ARRAY. The same array order
  // must drive transition adjacency — never floor.number/name (the admin may
  // keep numbers untouched while reordering the hierarchy, so "Floor 3" can
  // be the LOWEST floor visually).

  it("cross-floor adjacency follows CANONICAL array order, not floor numbers", () => {
    // Array order after reorder: [f3, f1, f2]. Array semantics make f3 lowest,
    // f2 highest — so transitions are f3↔f1 and f1↔f2. Number order would have
    // produced f1↔f2 and f2↔f3 (a different, wrong chain).
    const reordered: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f3", number: 3, label: "Floor 3", stairs: [stair("s3", "stair-core-a")], ramps: [], elevators: [] },
      { id: "f1", number: 1, label: "Ground Floor", stairs: [stair("s1", "stair-core-a")], ramps: [], elevators: [] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [stair("s2", "stair-core-a")], ramps: [], elevators: [] },
    ];
    const nodes = [
      linked("n3", "f3", { stairId: "s3" }),
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], reordered, "b1");
    expect(edges).toHaveLength(2);
    const pairs = edges.map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n1|n2", "n1|n3"]); // f3(0)↔f1(1), f1(1)↔f2(2) — never n2|n3
  });

  it("Ramp chains do not create floor transitions after reorder", () => {
    // Array order: [f2, f1, f3] → f2(0)↔f1(1), f1(1)↔f3(2).
    const reordered: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [ramp("r2", "ramp-a")], elevators: [] },
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [ramp("r1", "ramp-a")], elevators: [] },
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [ramp("r3", "ramp-a")], elevators: [] },
    ];
    const nodes = [
      linked("n2", "f2", { rampId: "r2", type: "ramp" }),
      linked("n1", "f1", { rampId: "r1", type: "ramp" }),
      linked("n3", "f3", { rampId: "r3", type: "ramp" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], reordered, "b1");
    expect(edges).toHaveLength(0);
  });

  it("an Elevator's served floors stay authoritative after floors are reordered", () => {
    // Elevator serves floors 1 and 3; the ARRAY order is [f3, f2, f1]. The
    // served-floor list (numbers) filters stops, while the CANONICAL array
    // order decides which adjacent served pair links: f3(0)↔f1(2) — one edge,
    // and the unserved f2 never participates.
    const reordered: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f3", number: 3, label: "Floor 3", stairs: [], ramps: [], elevators: [elevator("e3", "el-a", [1, 3])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 3])] },
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 3])] },
    ];
    const nodes = [
      linked("n3", "f3", { elevatorId: "e3", type: "elevator" }),
      linked("n2", "f2", { elevatorId: "e2", type: "elevator" }),
      linked("n1", "f1", { elevatorId: "e1", type: "elevator" }),
    ];
    const edges = reconcileCrossFloorTransitions(nodes, [], reordered, "b1");
    expect(edges).toHaveLength(1);
    expect([edges[0].startNodeId, edges[0].endNodeId].sort()).toEqual(["n1", "n3"]);
  });

  it("marks ordinary Elevator transitions unsafe for Emergency unless every stop opts in", () => {
    const floors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] = [
      { id: "f1", number: 1, label: "Ground Floor", stairs: [], ramps: [], elevators: [elevator("e1", "el-a", [1, 2])] },
      { id: "f2", number: 2, label: "Floor 2", stairs: [], ramps: [], elevators: [elevator("e2", "el-a", [1, 2])] },
    ];
    const nodes = [linked("n1", "f1", { elevatorId: "e1", type: "elevator" }), linked("n2", "f2", { elevatorId: "e2", type: "elevator" })];
    expect(reconcileCrossFloorTransitions(nodes, [], floors, "b1")[0].emergencySafe).toBe(false);
    const safeNodes = nodes.map((node) => ({ ...node, emergencySafe: true }));
    expect(reconcileCrossFloorTransitions(safeNodes, [], floors, "b1")[0].emergencySafe).toBe(true);
  });

  it("honors Stair direction per occurrence without changing the A* implementation", () => {
    const directionalFloors = [
      { ...floors[0], stairs: [{ ...stair("s1", "directional"), direction: "up" as const }] },
      { ...floors[1], stairs: [{ ...stair("s2", "directional"), direction: "up" as const }] },
    ];
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const transitions = reconcileCrossFloorTransitions(nodes, [], directionalFloors, "b1");
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ startNodeId: "n1", endNodeId: "n2", bidirectional: false });
    expect(findNavigationRoute(nodes, transitions, "n1", "n2")?.nodeIds).toEqual(["n1", "n2"]);
    expect(findNavigationRoute(nodes, transitions, "n2", "n1")).toBeNull();
  });

  it("reuses the transition id while refreshing direction after a Stair edit", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const first = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    const changedFloors = [
      { ...floors[0], stairs: [{ ...stair("s1", "stair-core-a"), direction: "up" as const }] },
      { ...floors[1], stairs: [{ ...stair("s2", "stair-core-a"), direction: "up" as const }] },
    ];
    const next = reconcileCrossFloorTransitions(nodes, first, changedFloors, "b1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(first[0].id);
    expect(next[0].bidirectional).toBe(false);
    expect(next[0].startNodeId).toBe("n1");
    expect(next[0].endNodeId).toBe("n2");
  });

  it("removes a Stair transition when the ordered directions no longer permit either way", () => {
    const nodes = [
      linked("n1", "f1", { stairId: "s1" }),
      linked("n2", "f2", { stairId: "s2" }),
    ];
    const first = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    const blockedFloors = [
      { ...floors[0], stairs: [{ ...stair("s1", "stair-core-a"), direction: "down" as const }] },
      { ...floors[1], stairs: [{ ...stair("s2", "stair-core-a"), direction: "up" as const }] },
    ];
    expect(reconcileCrossFloorTransitions(nodes, first, blockedFloors, "b1")).toHaveLength(0);
  });

  it("finds a standard F1→F2 route through local Walking Network edges and a Stair transition", () => {
    const nodes = [
      { ...freeNode("f1-start", 10, 10), floorId: "f1" },
      linked("stair-f1", "f1", { stairId: "s1", x: 40, y: 48 }),
      linked("stair-f2", "f2", { stairId: "s2", x: 40, y: 48 }),
      { ...freeNode("f2-destination", 90, 10), floorId: "f2" },
    ];
    const transitions = reconcileCrossFloorTransitions(nodes, [], floors.slice(0, 2), "b1");
    const localEdges: NavigationEdge[] = [
      { id: "walk-f1", startNodeId: "f1-start", endNodeId: "stair-f1", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
      { id: "walk-f2", startNodeId: "stair-f2", endNodeId: "f2-destination", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
    ];
    const route = findNavigationRoute(nodes, [...localEdges, ...transitions], "f1-start", "f2-destination");
    expect(route?.nodeIds).toEqual(["f1-start", "stair-f1", "stair-f2", "f2-destination"]);
    const reverse = findNavigationRoute(nodes, [...localEdges, ...transitions], "f2-destination", "f1-start");
    expect(reverse?.nodeIds).toEqual(["f2-destination", "stair-f2", "stair-f1", "f1-start"]);
  });

  it("a missing local Stair connection makes the cross-floor route unavailable", () => {
    const nodes = [
      { ...freeNode("f1-start", 10, 10), floorId: "f1" },
      linked("stair-f1", "f1", { stairId: "s1" }),
      linked("stair-f2", "f2", { stairId: "s2" }),
      { ...freeNode("f2-destination", 90, 10), floorId: "f2" },
    ];
    const transitions = reconcileCrossFloorTransitions(nodes, [], floors.slice(0, 2), "b1");
    const route = findNavigationRoute(nodes, transitions, "f1-start", "f2-destination");
    expect(route).toBeNull();
  });

  it("a three-floor Stair route uses adjacent transitions only", () => {
    const nodes = [
      { ...freeNode("f1-start", 0, 0), floorId: "f1" },
      linked("stair-f1", "f1", { stairId: "s1" }),
      linked("stair-f2", "f2", { stairId: "s2" }),
      linked("stair-f3", "f3", { stairId: "s3" }),
      { ...freeNode("f3-destination", 100, 0), floorId: "f3" },
    ];
    const transitions = reconcileCrossFloorTransitions(nodes, [], floors, "b1");
    const route = findNavigationRoute(nodes, [
      { id: "walk-f1", startNodeId: "f1-start", endNodeId: "stair-f1", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
      { id: "walk-f3", startNodeId: "stair-f3", endNodeId: "f3-destination", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
      ...transitions,
    ], "f1-start", "f3-destination");
    expect(route?.nodeIds).toEqual(["f1-start", "stair-f1", "stair-f2", "stair-f3", "f3-destination"]);
    expect(transitions.map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|"))).toEqual([
      "stair-f1|stair-f2",
      "stair-f2|stair-f3",
    ]);
    const reverse = findNavigationRoute(nodes, [
      { id: "walk-f1", startNodeId: "f1-start", endNodeId: "stair-f1", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
      { id: "walk-f3", startNodeId: "stair-f3", endNodeId: "f3-destination", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a" },
      ...transitions,
    ], "f3-destination", "f1-start");
    expect(reverse?.nodeIds).toEqual(["f3-destination", "stair-f3", "stair-f2", "stair-f1", "f1-start"]);
  });

  it("keeps legacy accessDoorId while exposing deduplicated multi-door access", () => {
    expect(roomAccessDoorIds({ accessDoorId: "west", accessDoorIds: ["east", "west", "east"] })).toEqual(["west", "east"]);
    expect(roomAccessDoorIds({})).toEqual([]);
  });

  it("normalizes split edge geometry and removes duplicate direct edges", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 }, { id: "c", x: 50, y: 0 }, { id: "b", x: 100, y: 0 },
    ] as NavigationNode[];
    const edges = [
      { id: "ac", startNodeId: "a", endNodeId: "c", bidirectional: true, type: "hallway", bendPoints: [{ x: 50, y: 0 }, { x: 50, y: 0 }] },
      { id: "cb", startNodeId: "c", endNodeId: "b", bidirectional: true, type: "hallway", bendPoints: [{ x: 75, y: 0 }] },
      { id: "old", startNodeId: "a", endNodeId: "b", bidirectional: true, type: "hallway", bendPoints: [] },
      { id: "old-duplicate", startNodeId: "b", endNodeId: "a", bidirectional: true, type: "hallway", bendPoints: [] },
    ] as NavigationEdge[];
    const normalized = normalizeNavigationEdges(edges, nodes, 2, { splitNodeIds: new Set(["c"]) });
    expect(normalized.filter((edge) => edge.startNodeId === "a" && edge.endNodeId === "b" || edge.startNodeId === "b" && edge.endNodeId === "a")).toHaveLength(0);
    expect(normalized.find((edge) => edge.id === "ac")?.bendPoints).toEqual([]);
    expect(normalized.find((edge) => edge.id === "cb")?.distance).toBe(50);
  });

  it("does not treat coordinate overlap as an implicit split", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 }, { id: "c", x: 50, y: 0 }, { id: "b", x: 100, y: 0 },
    ] as NavigationNode[];
    const direct = {
      id: "direct", startNodeId: "a", endNodeId: "b", bidirectional: true,
      type: "hallway", bendPoints: [], distance: 100,
    } as NavigationEdge;
    expect(normalizeNavigationEdges([direct], nodes).map((edge) => edge.id)).toEqual(["direct"]);
  });

  it("deduplicates equivalent manual hallway and walkway segments by node pair", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, floorId: "f1" }, { id: "b", x: 100, y: 0, floorId: "f1" },
    ] as NavigationNode[];
    const hallway = { id: "hallway", startNodeId: "a", endNodeId: "b", bidirectional: true, type: "hallway", distance: 100 } as NavigationEdge;
    const walkway = { id: "walkway", startNodeId: "b", endNodeId: "a", bidirectional: true, type: "walkway", distance: 100 } as NavigationEdge;
    expect(normalizeNavigationEdges([hallway, walkway], nodes)).toHaveLength(1);
  });

  it("keeps meaningful parallel paths while collapsing exact duplicates", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, floorId: "f1" }, { id: "b", x: 100, y: 0, floorId: "f1" },
    ] as NavigationNode[];
    const base = {
      startNodeId: "a", endNodeId: "b", bidirectional: true, type: "hallway",
      distance: 100, accessible: true, emergencySafe: true, closed: false,
    } as const;
    const exact = { id: "exact", ...base } as NavigationEdge;
    const duplicate = { id: "duplicate", ...base } as NavigationEdge;
    const inaccessible = { id: "inaccessible", ...base, accessible: false } as NavigationEdge;
    const bent = { id: "bent", ...base, bendPoints: [{ x: 50, y: 20 }] } as NavigationEdge;

    const normalized = normalizeNavigationEdges([exact, duplicate, inaccessible, bent], nodes);

    expect(normalized.map((edge) => edge.id)).toEqual(["exact", "inaccessible", "bent"]);
  });
});
