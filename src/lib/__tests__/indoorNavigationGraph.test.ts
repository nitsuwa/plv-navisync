import { describe, expect, it } from "vitest";
import {
  indoorNavNodes,
  indoorNavEdges,
  indoorNodeAccessibleDefault,
  createIndoorNavNode,
  linkedObjectRef,
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
  navEdgeIsBlocked,
} from "../indoorNavigationGraph";
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
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n3", x: 0, y: 0, buildingId: "b1", floorId: "f1", stairId: "s1" }), floor)).toEqual({ x: 110, y: 88 });
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n4", x: 0, y: 0, buildingId: "b1", floorId: "f1", elevatorId: "e1" }), floor)).toEqual({ x: 177, y: 67 });
    // B5 Phase 2.6: the ramp's LOGICAL routing anchor is the object CENTER
    // (route edges terminate there); the visual badge may offset separately.
    expect(resolveIndoorLinkedPosition(createIndoorNavNode({ id: "n5", x: 0, y: 0, buildingId: "b1", floorId: "f1", rampId: "r1c" }), floor)).toEqual({ x: 150, y: 86 });
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
});
