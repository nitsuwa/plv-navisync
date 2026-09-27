import { describe, expect, it } from "vitest";
import {
  defaultStairDirectionForFloor,
  defaultStairDirectionForFloorInOrder,
  duplicateFloorInBuilding,
  nextFloorNumberForBuilding,
  stairDirectionsForFloor,
  stairDirectionsForFloorInOrder,
  stairContinuationDirectionAllows,
  validateStairContinuation,
  reconcileStairDirectionsForFloorOrder,
  stairLabelForEntrySide,
  isDefaultStairLabel,
  isExteriorEmergencyStairOccurrence,
  isOrdinaryFloorStairConnectionEligible,
} from "../floorManagement";
import { normalizeFloor } from "../floorPlanNormalization";
import type { ExteriorEmergencyStair, FloorPlan, NavigationEdge, NavigationNode } from "../../components/map-builder/types";

// ── B5 Phase 3.1 — floor-number uniqueness + stair direction context ────────

describe("nextFloorNumberForBuilding", () => {
  it("returns 1 for an empty building", () => {
    expect(nextFloorNumberForBuilding([])).toBe(1);
  });

  it("uses max existing number + 1 (never array length + 1)", () => {
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 2 }])).toBe(3);
  });

  it("handles non-contiguous numbers — [1, 3] produces 4, not 3", () => {
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it("never duplicates a persisted building+floor number", () => {
    // Existing [1, 3] with a duplicate-prone length+1 would produce 3 — the
    // helper must always stay clear of every persisted number.
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 3 }])).not.toBe(3);
    expect(nextFloorNumberForBuilding([{ number: 5 }])).toBe(6);
  });

  it("ignores non-finite numbers", () => {
    expect(nextFloorNumberForBuilding([{ number: 2 }, { number: Number.NaN } as never])).toBe(3);
  });
});

describe("append-only floor duplication graph copy", () => {
  it("keeps the source and full existing campus graph intact while remapping the copied Room/Door/nav chain", () => {
    const source = normalizeFloor({
      id: "f1", buildingId: "b1", number: 1, label: "Floor 1",
      rooms: [{
        id: "room-a", name: "Room A", type: "classroom", x: 10, y: 10, w: 40, h: 30,
        buildingId: "b1", floorId: "f1", accessDoorId: "door-a",
        accessDoorIds: ["door-a", "door-b"], accessNodeId: "room-node",
      }],
      paths: [{ id: "path-a", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], type: "main", color: "#123456", width: 2 }],
      walls: [{
        id: "wall-a", x1: 10, y1: 10, x2: 50, y2: 10, thickness: 4, color: "#64748b",
        startAnchor: { targetType: "room", roomId: "room-a", edge: "top", offset: 0.25 },
      }],
      doors: [
        { id: "door-a", x: 20, y: 10, width: 8, direction: "left", color: "#123456", wallId: "wall-a" },
        { id: "door-b", x: 40, y: 10, width: 8, direction: "left", color: "#123456", wallId: "wall-a" },
      ],
      stairs: [{ id: "stair-a", x: 60, y: 60, width: 20, height: 20, direction: "both", label: "Stair", sharedId: "stair-shaft-source" }],
      ramps: [{ id: "ramp-a", x: 80, y: 60, width: 20, height: 10, label: "Ramp" }],
      elevators: [{ id: "elevator-a", x: 110, y: 60, width: 18, height: 18, doorWidth: 8, label: "Lift", sharedId: "elevator-shaft-source" }],
    });
    const otherFloor = normalizeFloor({ id: "f2", buildingId: "b1", number: 2, label: "Floor 2" });
    const beforeSource = structuredClone(source);
    const outdoor1: NavigationNode = {
      id: "outdoor-1", name: "Outdoor 1", type: "outdoor", x: 400, y: 250,
      campusId: "c1", accessible: true, color: "#334155", outdoorMetadata: { authored: ["keep"] },
    } as NavigationNode;
    const outdoor2: NavigationNode = { ...outdoor1, id: "outdoor-2", name: "Outdoor 2", x: 420 };
    const roomNode: NavigationNode = {
      id: "room-node", name: "Room A", type: "room_access", x: 30, y: 25, campusId: "c1",
      buildingId: "b1", floorId: "f1", roomId: "room-a", accessible: true, color: "#2563eb",
    };
    const doorNode: NavigationNode = {
      id: "door-node", name: "Door A", type: "hallway", x: 20, y: 10, campusId: "c1",
      buildingId: "b1", floorId: "f1", doorId: "door-a", accessible: true, color: "#2563eb",
    };
    const localNode: NavigationNode = {
      id: "free-node", name: "Waypoint", type: "hallway", x: 60, y: 30, campusId: "c1",
      buildingId: "b1", floorId: "f1", accessible: true, color: "#2563eb",
    };
    const stairNode: NavigationNode = {
      id: "stair-node", name: "Stair", type: "stair", x: 70, y: 70, campusId: "c1",
      buildingId: "b1", floorId: "f1", stairId: "stair-a", transitionSharedId: "stair-shaft-source", accessible: false, color: "#2563eb",
    };
    const rampNode: NavigationNode = {
      id: "ramp-node", name: "Ramp", type: "ramp", x: 90, y: 65, campusId: "c1",
      buildingId: "b1", floorId: "f1", rampId: "ramp-a", accessible: true, color: "#2563eb",
    };
    const elevatorNode: NavigationNode = {
      id: "elevator-node", name: "Lift", type: "elevator", x: 119, y: 69, campusId: "c1",
      buildingId: "b1", floorId: "f1", elevatorId: "elevator-a", transitionSharedId: "elevator-shaft-source", accessible: true, color: "#2563eb",
    };
    const nextFloorNode: NavigationNode = {
      id: "other-floor-node", name: "Other Floor", type: "hallway", x: 60, y: 30,
      campusId: "c1", buildingId: "b1", floorId: "f2", accessible: true, color: "#2563eb",
    };
    const nextFloorNode2: NavigationNode = {
      id: "other-floor-node-2", name: "Other Floor 2", type: "hallway", x: 80, y: 30,
      campusId: "c1", buildingId: "b1", floorId: "f2", accessible: true, color: "#2563eb",
    };
    const nodes = [outdoor1, outdoor2, roomNode, doorNode, localNode, stairNode, rampNode, elevatorNode, nextFloorNode, nextFloorNode2];
    const edges: NavigationEdge[] = [
      { id: "outdoor-edge", startNodeId: outdoor1.id, endNodeId: outdoor2.id, distance: 20, bidirectional: true, accessible: true, type: "walkway", color: "#334155", width: 2, bendPoints: [{ x: 410, y: 240 }], generatedFromPathIds: ["outdoor-path"] },
      { id: "room-door", startNodeId: roomNode.id, endNodeId: doorNode.id, distance: 10, bidirectional: true, accessible: true, type: "room_door_transition", color: "#334155", width: 2 },
      { id: "door-waypoint", startNodeId: doorNode.id, endNodeId: localNode.id, distance: 45, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2, bendPoints: [{ x: 44, y: 18 }], generatedFromPathIds: ["path-a"], pathJunctionId: localNode.id },
      { id: "outdoor-bridge", startNodeId: doorNode.id, endNodeId: outdoor1.id, distance: 400, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2 },
      { id: "other-floor-edge", startNodeId: nextFloorNode.id, endNodeId: nextFloorNode2.id, distance: 20, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2 },
      { id: "cross-floor-edge", startNodeId: localNode.id, endNodeId: nextFloorNode.id, distance: 1, bidirectional: true, accessible: false, type: "floor_transition", color: "#334155", width: 2 },
    ];
    const beforeNodes = structuredClone(nodes);
    const beforeEdges = structuredClone(edges);

    const result = duplicateFloorInBuilding([source, otherFloor], "b1", "f1", nodes, edges);

    expect(source).toEqual(beforeSource);
    expect(nodes).toEqual(beforeNodes);
    expect(edges).toEqual(beforeEdges);
    expect(result.copy).not.toBeNull();
    expect(result.copiedNavNodes).toHaveLength(6);
    expect(result.copiedNavEdges).toHaveLength(2);
    const finalNodes = [...nodes, ...(result.copiedNavNodes ?? [])];
    const finalEdges = [...edges, ...(result.copiedNavEdges ?? [])];
    expect(finalNodes.slice(0, nodes.length)).toEqual(beforeNodes);
    expect(finalEdges.slice(0, edges.length)).toEqual(beforeEdges);
    expect(finalNodes.find((node) => node.id === "outdoor-1")).toEqual(outdoor1);
    expect(finalEdges.find((edge) => edge.id === "outdoor-edge")).toEqual(beforeEdges[0]);

    const copy = result.copy!;
    const copiedRoom = copy.rooms[0];
    const copiedDoorIds = new Map(source.doors.map((door, index) => [door.id, copy.doors[index].id]));
    const copiedRoomNode = result.copiedNavNodes?.find((node) => node.roomId === copiedRoom.id);
    const copiedDoorNode = result.copiedNavNodes?.find((node) => node.doorId === copy.doors[0].id);
    expect(copiedRoom.accessDoorId).toBe(copiedDoorIds.get("door-a"));
    expect(copiedRoom.accessDoorIds).toEqual([copiedDoorIds.get("door-a"), copiedDoorIds.get("door-b")]);
    expect(copiedRoom.accessNodeId).toBe(copiedRoomNode?.id);
    expect(copy.doors[0].wallId).toBe(copy.walls[0].id);
    expect(copy.walls[0].startAnchor?.roomId).toBe(copiedRoom.id);
    expect(copiedRoomNode?.roomId).toBe(copiedRoom.id);
    expect(copiedDoorNode?.doorId).toBe(copy.doors[0].id);
    expect(copy.stairs[0].sharedId).not.toBe("stair-shaft-source");
    expect(result.copiedNavNodes?.find((node) => node.stairId === copy.stairs[0].id)?.transitionSharedId).toBe(copy.stairs[0].sharedId);
    expect(result.copiedNavNodes?.find((node) => node.elevatorId === copy.elevators[0].id)?.transitionSharedId).toBe(copy.elevators[0].sharedId);
    expect(result.copiedNavNodes?.map((node) => node.id)).not.toContain("stair-node");
    expect(result.copiedNavEdges?.map((edge) => edge.id)).not.toContain("door-waypoint");
    const copiedDoorPathEdge = result.copiedNavEdges?.find((edge) => edge.startNodeId === copiedDoorNode?.id);
    expect(copiedDoorPathEdge?.generatedFromPathIds).toEqual([copy.paths[0].id]);
    expect(copiedDoorPathEdge?.pathJunctionId).toBe(result.copiedNavNodes?.find((node) => node.name === "Waypoint")?.id);
    expect(result.copiedNavEdges?.every((edge) => {
      const endpoints = new Set(result.copiedNavNodes?.map((node) => node.id));
      return endpoints.has(edge.startNodeId) && endpoints.has(edge.endNodeId);
    })).toBe(true);
    expect(result.copiedNavEdges?.some((edge) => edge.type === "floor_transition")).toBe(false);

    // Nested copy-owned arrays/metadata must not alias the protected source.
    copy.paths[0].points[0].x = 999;
    const copiedBentEdge = result.copiedNavEdges!.find((edge) => edge.bendPoints);
    expect(copiedBentEdge).toBeDefined();
    copiedBentEdge!.bendPoints![0].x = 999;
    expect(source.paths[0].points[0].x).toBe(0);
    expect(edges.find((edge) => edge.id === "room-door")?.bendPoints).toBeUndefined();
    expect(edges.find((edge) => edge.id === "door-waypoint")?.bendPoints?.[0].x).toBe(44);
  });
});

describe("single-Floor duplication and Building-owned Exterior Emergency Stairs", () => {
  it("omits generated exterior occurrences and their nav graph while copying ordinary Stair navigation", () => {
    const source = normalizeFloor({
      id: "f1", buildingId: "b1", number: 1,
      stairs: [
        { id: "normal-stair", x: 20, y: 20, width: 20, height: 30, direction: "up", label: "Left Stair", sharedId: "normal-shaft" },
        { id: "exterior-occurrence", x: 80, y: 20, width: 20, height: 30, direction: "both", label: "Emergency Exit", sharedId: "exterior-shaft", exteriorEmergencyStairId: "building-exterior" },
      ],
    });
    const ordinaryNode: NavigationNode = {
      id: "normal-node", name: "Left Stair", type: "stair", x: 30, y: 35,
      buildingId: "b1", floorId: "f1", stairId: "normal-stair", transitionSharedId: "normal-shaft", accessible: false, color: "#333",
    };
    const exteriorNode: NavigationNode = {
      id: "exterior-node", name: "Emergency Exit", type: "stair", x: 90, y: 35,
      buildingId: "b1", floorId: "f1", stairId: "exterior-occurrence", exteriorEmergencyStairId: "building-exterior",
      transitionSharedId: "exterior-shaft", accessible: false, color: "#333",
    };
    const waypoint: NavigationNode = {
      id: "waypoint", name: "Hallway", type: "hallway", x: 50, y: 60,
      buildingId: "b1", floorId: "f1", accessible: true, color: "#333",
    };
    const edges: NavigationEdge[] = [
      { id: "normal-edge", startNodeId: ordinaryNode.id, endNodeId: waypoint.id, distance: 20, bidirectional: true, accessible: true, type: "hallway", color: "#333", width: 2 },
      { id: "exterior-edge", startNodeId: exteriorNode.id, endNodeId: waypoint.id, distance: 20, bidirectional: true, accessible: true, type: "hallway", color: "#333", width: 2 },
    ];

    const result = duplicateFloorInBuilding([source], "b1", "f1", [ordinaryNode, exteriorNode, waypoint], edges);

    expect(result.copy?.stairs).toHaveLength(1);
    expect(result.copy?.stairs[0].exteriorEmergencyStairId).toBeUndefined();
    expect(result.copiedNavNodes?.map((node) => node.name)).toEqual(["Left Stair", "Hallway"]);
    expect(result.copiedNavNodes?.some((node) => node.exteriorEmergencyStairId || node.stairId === "exterior-occurrence")).toBe(false);
    expect(result.copiedNavEdges?.map((edge) => edge.id)).toHaveLength(1);
    expect(result.copiedNavEdges?.some((edge) => edge.type === "floor_transition")).toBe(false);
    expect(result.copiedNavNodes?.find((node) => node.name === "Left Stair")?.stairId).toBe(result.copy?.stairs[0].id);
  });
});

describe("stairDirectionsForFloor", () => {
  it("lowest floor allows only Up when a higher floor exists", () => {
    expect(stairDirectionsForFloor(1, [1, 2, 3])).toEqual(["up"]);
  });

  it("highest floor allows only Down when a lower floor exists", () => {
    expect(stairDirectionsForFloor(3, [1, 2, 3])).toEqual(["down"]);
  });

  it("middle floor allows Up, Down and Both", () => {
    expect(stairDirectionsForFloor(2, [1, 2, 3])).toEqual(["up", "down", "both"]);
  });

  it("single-floor building offers no cross-floor direction", () => {
    expect(stairDirectionsForFloor(1, [1])).toEqual([]);
  });
});

describe("defaultStairDirectionForFloor", () => {
  it("lowest floor defaults to Up", () => {
    expect(defaultStairDirectionForFloor(1, [1, 2])).toBe("up");
  });

  it("highest floor defaults to Down", () => {
    expect(defaultStairDirectionForFloor(2, [1, 2])).toBe("down");
  });

  it("middle floor defaults to Both", () => {
    expect(defaultStairDirectionForFloor(2, [1, 2, 3])).toBe("both");
  });

  it("single-floor building stays neutral (no cross-floor implication)", () => {
    expect(defaultStairDirectionForFloor(1, [1])).toBe("both");
  });
});

describe("canonical floor-order stair helpers", () => {
  const misleadingOrder = [
    { id: "f4", number: 4, label: "Floor 4" },
    { id: "f1", number: 1, label: "Ground Floor" },
    { id: "f2", number: 2, label: "Floor 2" },
  ];

  it("uses array order, not floor number/name, for lowest/middle/highest", () => {
    expect(stairDirectionsForFloorInOrder("f4", misleadingOrder)).toEqual(["up"]);
    expect(stairDirectionsForFloorInOrder("f1", misleadingOrder)).toEqual(["up", "down", "both"]);
    expect(stairDirectionsForFloorInOrder("f2", misleadingOrder)).toEqual(["down"]);
  });

  it("defaults by canonical order after reorder", () => {
    expect(defaultStairDirectionForFloorInOrder("f4", misleadingOrder)).toBe("up");
    expect(defaultStairDirectionForFloorInOrder("f1", misleadingOrder)).toBe("both");
    expect(defaultStairDirectionForFloorInOrder("f2", misleadingOrder)).toBe("down");
  });

  it("filters Stair continuations by ordered floor direction", () => {
    expect(stairContinuationDirectionAllows("up", 0, 1)).toBe(true);
    expect(stairContinuationDirectionAllows("up", 1, 0)).toBe(false);
    expect(stairContinuationDirectionAllows("down", 1, 0)).toBe(true);
    expect(stairContinuationDirectionAllows("down", 0, 1)).toBe(false);
    expect(stairContinuationDirectionAllows("both", 1, 0)).toBe(true);
    expect(stairContinuationDirectionAllows("both", 1, 2)).toBe(true);
  });

  const stairFloor = (id: string, stair: { id: string; sharedId?: string; direction: "up" | "down" | "both" }) => ({
    id,
    stairs: [{ ...stair, x: 0, y: 0, width: 20, height: 20, label: stair.id }],
  } as any);

  it("reports a direction mismatch when Up points to a lower continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "both" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "up" })];
    expect(validateStairContinuation(floors[1].stairs[0], "f2", floors).state).toBe("direction-mismatch");
  });

  it("reports a direction mismatch when Down points to a higher continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "down" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "both" })];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors).state).toBe("direction-mismatch");
  });

  it("does not warn when the selected direction has a valid adjacent continuation", () => {
    const floors = [
      stairFloor("f1", { id: "s1", sharedId: "core", direction: "both" }),
      stairFloor("f2", { id: "s2", sharedId: "core", direction: "up" }),
      stairFloor("f3", { id: "s3", sharedId: "core", direction: "down" }),
    ];
    // The lower occurrence is outside the selected Up direction, but Floor 3
    // is a valid adjacent continuation and therefore satisfies this Stair.
    expect(validateStairContinuation(floors[1].stairs[0], "f2", floors).state).toBe("none");
  });

  it("ignores non-adjacent identity occurrences when checking continuation readiness", () => {
    const floors = [
      stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }),
      stairFloor("f2", { id: "s2", sharedId: "other", direction: "both" }),
      stairFloor("f3", { id: "s3", sharedId: "core", direction: "down" }),
    ];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors).state).toBe("none");
  });

  it("reports a missing continuation when a shared Stair has no valid transition", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const result = validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, []);
    expect(result.state).toBe("missing");
    expect(result.unavailableFloorIds).toEqual(["f2"]);
  });

  it("clears the direction warning once the continuation direction is valid", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const edges = [{ startNodeId: "n1", endNodeId: "n2", type: "floor_transition", bidirectional: true, closed: false }];
    const result = validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, edges);
    expect(result.state).toBe("none");
  });

  it("recognizes legacy cross_floor edges when checking a connected continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const edges = [{ startNodeId: "n1", endNodeId: "n2", type: "cross_floor", bidirectional: true, closed: false }];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, edges).state).toBe("none");
  });

  it("leaves a missing local anchor to the existing Navigation connectivity issue", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors, [], []).state).toBe("none");
  });
});

describe("generated Stair labels", () => {
  it("uses the opposite physical side name for the corridor entry side", () => {
    expect(stairLabelForEntrySide(false)).toBe("Right Stair");
    expect(stairLabelForEntrySide(true)).toBe("Left Stair");
  });

  it("recognizes only system/default labels as renameable", () => {
    expect(isDefaultStairLabel("Stairs")).toBe(true);
    expect(isDefaultStairLabel("Left Stair")).toBe(true);
    expect(isDefaultStairLabel(" right stair ")).toBe(true);
    expect(isDefaultStairLabel("West Stair")).toBe(false);
    expect(isDefaultStairLabel("Emergency Stair")).toBe(false);
  });
});

describe("reconcileStairDirectionsForFloorOrder", () => {
  const floor = (id: string, direction: "up" | "down" | "both") => ({
    id,
    buildingId: "b1",
    number: 1,
    label: id,
    canvasW: 100,
    canvasH: 100,
    rooms: [], walls: [], doors: [], windows: [], furniture: [],
    stairs: [{ id: `st-${id}`, x: 10, y: 10, width: 20, height: 20, direction, label: "Stair" }],
    ramps: [], elevators: [], labels: [], paths: [],
  } as any);

  it("repairs an impossible boundary direction and reports the adjustment", () => {
    const result = reconcileStairDirectionsForFloorOrder([
      floor("f1", "down"),
      floor("f2", "down"),
    ]);
    expect(result.floors[0].stairs[0].direction).toBe("up");
    expect(result.adjustments).toMatchObject([{ floorId: "f1", from: "down", to: "up" }]);
  });

  it("preserves an intentional middle-floor direction", () => {
    const result = reconcileStairDirectionsForFloorOrder([
      floor("f1", "up"),
      floor("f2", "down"),
      floor("f3", "down"),
    ]);
    expect(result.floors[1].stairs[0].direction).toBe("down");
    expect(result.adjustments).toHaveLength(0);
  });

  it("normalizes a single-floor direction to the neutral Both value", () => {
    const result = reconcileStairDirectionsForFloorOrder([floor("f1", "up")]);
    expect(result.floors[0].stairs[0].direction).toBe("both");
    expect(result.adjustments).toMatchObject([{ floorId: "f1", from: "up", to: "both" }]);
  });

  it("keeps generated Exterior Emergency Stair direction system-owned without changing ordinary directions", () => {
    const ground = floor("f1", "up");
    ground.stairs.push({ ...ground.stairs[0], id: "generated", exteriorEmergencyStairId: "owner", direction: "up" });
    const upper = floor("f2", "down");

    const result = reconcileStairDirectionsForFloorOrder([ground, upper]);

    expect(result.floors[0].stairs.find((stair) => stair.id === "generated")?.direction).toBe("both");
    expect(result.floors[0].stairs.find((stair) => stair.id !== "generated")?.direction).toBe("up");
  });
});

describe("ordinary indoor Stair connection ownership", () => {
  it("recognizes exterior ownership from occurrence metadata, node metadata, or canonical owner IDs", () => {
    const externalByNode: NavigationNode[] = [{
      id: "external-node", name: "Renamed landing", type: "stair", x: 0, y: 0,
      buildingId: "b1", floorId: "f2", stairId: "external-stair", exteriorEmergencyStairId: "canonical-ext",
      accessible: false, color: "#000",
    }];
    const canonical = [{
      id: "canonical-ext", occurrenceIds: { f3: "generated-stair" }, occurrenceNodeIds: { f3: "generated-node" },
    }] as unknown as ExteriorEmergencyStair[];
    expect(isExteriorEmergencyStairOccurrence({ id: "external-stair" }, "f2", externalByNode, canonical)).toBe(true);
    expect(isExteriorEmergencyStairOccurrence({ id: "generated-stair" }, "f3", [], canonical)).toBe(true);
    expect(isExteriorEmergencyStairOccurrence({ id: "marked", exteriorEmergencyStairId: "canonical-ext" }, "f1", [], [])).toBe(true);
  });

  it("rejects a normal connection pair if either occurrence is exterior-system owned", () => {
    const node: NavigationNode = {
      id: "ext-node", name: "Any label", type: "stair", x: 0, y: 0,
      buildingId: "b1", floorId: "f2", stairId: "ext-stair", exteriorEmergencyStairId: "canonical-ext",
      accessible: false, color: "#000",
    };
    expect(isOrdinaryFloorStairConnectionEligible(
      { id: "indoor-source" }, "f1", { id: "ext-stair" }, "f2", [node], [],
    )).toBe(false);
    expect(isOrdinaryFloorStairConnectionEligible(
      { id: "indoor-source" }, "f1", { id: "indoor-target" }, "f2", [], [],
    )).toBe(true);
  });
});
