import { describe, expect, it } from "vitest";
import {
  planBuildingRoute,
  planRouteFromPoint,
  planPointToDestinationRoute,
  planDestinationRoute,
  planAuthoredDestinationRoute,
  hasNavigableRoute,
  stepsFromGraphPath,
  detectFloorTransitions,
  formatDistance,
  formatMinutes,
  type CampusNavGraph,
  type RouteSegment,
} from "../routePlanner";
import { findBuildingPath, type GraphPath } from "../pathfinding";

// Small published-campus nav graph shaped like the seed (b_mab / b_gym ids).
const CAMPUS_GRAPH: CampusNavGraph = {
  navNodes: [
    { id: "nn_gate", name: "Main Gate", type: "entrance", x: 108, y: 285, accessible: true, color: "#16a34a" },
    { id: "nn_mab", name: "MAB Entrance", type: "entrance", x: 280, y: 170, buildingId: "b_mab", accessible: true, color: "#16a34a" },
    { id: "nn_gym", name: "Gym Entrance", type: "entrance", x: 375, y: 476, buildingId: "b_gym", accessible: true, color: "#16a34a" },
  ],
  navEdges: [
    { id: "ne_gate_mab", startNodeId: "nn_gate", endNodeId: "nn_mab", distance: 169, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
    { id: "ne_gate_gym", startNodeId: "nn_gate", endNodeId: "nn_gym", distance: 200, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
  ],
};

const CAMPUS_POSITIONS = {
  b_mab: { x: 155, y: 130, w: 125, h: 80 },
  b_gym: { x: 305, y: 435, w: 145, h: 82 },
};

const MAB = { id: "b1", code: "MAB", name: "Main Academic Building" };
const GYM = { id: "b5", code: "GYM", name: "Gymnasium & Sports Complex" };
const SSC = { id: "b6", code: "SSC", name: "Student Services Center" };

const POSITIONS = {
  b1: { x: 155, y: 130, w: 125, h: 80 },
  b5: { x: 305, y: 435, w: 145, h: 82 },
  b6: { x: 605, y: 415, w: 112, h: 72 },
};

describe("planBuildingRoute (building → building)", () => {
  it("returns a graph-based route with real distance and ETA in standard mode", () => {
    const route = planBuildingRoute(MAB, GYM, "standard", POSITIONS);
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
    expect(route!.dist).toBeGreaterThan(0);
    expect(route!.mins).toBeGreaterThanOrEqual(1);
    expect(route!.points.length).toBeGreaterThanOrEqual(2);
    expect(route!.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("returns no route while accessibility planning is unavailable", () => {
    const route = planBuildingRoute(MAB, SSC, "accessible", POSITIONS);
    expect(route).toBeNull();
  });

  it("does not claim emergency safety without an authored graph", () => {
    const route = planBuildingRoute(GYM, SSC, "emergency", POSITIONS);
    expect(route).toBeNull();
  });

  it("falls back to an SVG estimate when the buildings are not on the graph", () => {
    // Unknown ids that exist in positions but not in the walkway graph
    const route = planBuildingRoute(
      { id: "custom-a", code: "CA", name: "Custom A" },
      { id: "custom-b", code: "CB", name: "Custom B" },
      "standard",
      { "custom-a": { x: 100, y: 100, w: 60, h: 40 }, "custom-b": { x: 500, y: 400, w: 60, h: 40 } }
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(false);
    expect(route!.dist).toBeGreaterThan(0);
    // Fallback produces a start + walk + arrive
    expect(route!.steps.map((s) => s.icon)).toEqual(["start", "walk", "arrive"]);
  });

  it("returns null for the same building (no self-route)", () => {
    expect(planBuildingRoute(MAB, MAB, "standard", POSITIONS)).toBeNull();
  });

  it("returns null when positions are missing and the graph has no entry", () => {
    const route = planBuildingRoute(
      { id: "unknown", code: "X", name: "X" },
      { id: "also-unknown", code: "Y", name: "Y" },
      "standard"
    );
    expect(route).toBeNull();
  });

  it("routes to an authored Campus Gate node without treating it as a building", () => {
    const gateGraph: CampusNavGraph = {
      navNodes: [
        { id: "gate-node", name: "Campus Gate", type: "outdoor", gateId: "gate-1", x: 20, y: 20, accessible: true },
        { id: "walk-node", name: "Walkway", type: "outdoor", x: 80, y: 20, accessible: true },
        { id: "building-entry", name: "Building entrance", type: "entrance", buildingId: "lib", x: 120, y: 20, accessible: true },
      ],
      navEdges: [
        { id: "gate-walk", startNodeId: "gate-node", endNodeId: "walk-node", distance: 60, bidirectional: true, accessible: true },
        { id: "walk-building", startNodeId: "walk-node", endNodeId: "building-entry", distance: 40, bidirectional: true, accessible: true },
      ],
    };
    const route = planDestinationRoute(
      { type: "campus_place", campusPlaceId: "gate-1", nodeId: "gate-node", label: "Campus Gate", code: "Campus Gate" },
      { type: "building", buildingId: "lib", label: "Library", code: "LIB" },
      "standard",
      gateGraph,
    );

    expect(route).not.toBeNull();
    expect(route?.fromCode).toBe("Campus Gate");
    expect(route?.points[0]).toEqual({ x: 20, y: 20 });
    expect(route?.points.at(-1)).toEqual({ x: 120, y: 20 });
  });

  it("routes from a generic campus place through its exact authored node reference", () => {
    const gateGraph: CampusNavGraph = {
      navNodes: [
        { id: "landmark-node", name: "Atrium", type: "outdoor", x: 20, y: 20, accessible: true },
        { id: "entry", name: "Library entrance", type: "entrance", buildingId: "lib", x: 80, y: 20, accessible: true },
      ],
      navEdges: [{ id: "path", startNodeId: "landmark-node", endNodeId: "entry", distance: 60, bidirectional: true, accessible: true }],
    };
    const route = planDestinationRoute(
      { type: "campus_place", campusPlaceId: "atrium-1", nodeId: "landmark-node", label: "Atrium", code: "Atrium" },
      { type: "building", buildingId: "lib", label: "Library", code: "LIB" },
      "standard",
      gateGraph,
    );
    expect(route?.fromCode).toBe("Atrium");
    expect(route?.points).toEqual([{ x: 20, y: 20 }, { x: 80, y: 20 }]);
  });
});

describe("planBuildingRoute (published-campus nav graph — C4 Phase 2 bridge)", () => {
  it("uses direction-eligible connected entrances instead of forcing the primary door", () => {
    const graph: CampusNavGraph = {
      buildings: [
        { id: "a", x: 0, y: 0, width: 20, height: 20, entrances: [
          { id: "a-in", type: "general", direction: "entrance_only", isPrimary: true },
          { id: "a-out", type: "general", direction: "exit_only" },
        ] },
        { id: "b", x: 100, y: 0, width: 20, height: 20, entrances: [
          { id: "b-out", type: "general", direction: "exit_only", isPrimary: true },
          { id: "b-in", type: "general", direction: "entrance_only" },
        ] },
      ],
      navNodes: [
        { id: "a-in-node", x: 0, y: 0, buildingId: "a", entranceId: "a-in", type: "entrance" },
        { id: "a-out-node", x: 10, y: 0, buildingId: "a", entranceId: "a-out", type: "entrance" },
        { id: "b-out-node", x: 100, y: 0, buildingId: "b", entranceId: "b-out", type: "entrance" },
        { id: "b-in-node", x: 110, y: 0, buildingId: "b", entranceId: "b-in", type: "entrance" },
      ],
      navEdges: [
        { startNodeId: "a-out-node", endNodeId: "b-in-node", distance: 100, bidirectional: false, accessible: true },
      ],
    };
    const route = planBuildingRoute(
      { id: "a", code: "A", name: "A", entranceNodeId: "a-in-node" },
      { id: "b", code: "B", name: "B", entranceNodeId: "b-out-node" },
      "standard", undefined, graph,
    );
    expect(route?.points[0]).toEqual({ x: 10, y: 0 });
    expect(route?.points.at(-1)).toEqual({ x: 110, y: 0 });
  });

  it("uses the campus nav graph for seed-style building ids (b_mab → b_gym)", () => {
    const route = planBuildingRoute(
      { id: "b_mab", code: "MAB", name: "Main Academic Building" },
      { id: "b_gym", code: "GYM", name: "Gymnasium" },
      "standard",
      CAMPUS_POSITIONS,
      CAMPUS_GRAPH
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
    expect(route!.dist).toBeGreaterThan(0);
    // First node is the MAB entrance, last is the gym entrance.
    expect(route!.points[0]).toEqual({ x: 280, y: 170 });
    expect(route!.points[route!.points.length - 1]).toEqual({ x: 375, y: 476 });
  });

  it("keeps accessibility unavailable even when a published graph exists", () => {
    const graph: CampusNavGraph = {
      navNodes: CAMPUS_GRAPH.navNodes,
      navEdges: [
        { ...CAMPUS_GRAPH.navEdges![0], accessible: false },
        { ...CAMPUS_GRAPH.navEdges![1], accessible: true },
      ],
    };
    const route = planBuildingRoute(
      { id: "b_mab", code: "MAB", name: "MAB" },
      { id: "b_gym", code: "GYM", name: "GYM" },
      "accessible",
      CAMPUS_POSITIONS,
      graph
    );
    expect(route).toBeNull();
  });

  it("treats authored nodes without edges as disconnected instead of falling back", () => {
    const route = planBuildingRoute(
      { id: "b1", code: "MAB", name: "Main Academic Building" },
      { id: "b5", code: "GYM", name: "Gymnasium" },
      "standard",
      POSITIONS,
      { navNodes: [{ id: "mab-entry", type: "entrance", x: 155, y: 170, buildingId: "b1" }] },
    );
    expect(route).toBeNull();
  });

  it("treats an explicitly supplied empty graph as authoritative", () => {
    const emptyGraph: CampusNavGraph = { navNodes: [], navEdges: [] };
    expect(planBuildingRoute(MAB, GYM, "standard", POSITIONS, emptyGraph)).toBeNull();
    expect(planRouteFromPoint({ x: 155, y: 170 }, GYM, "standard", emptyGraph, POSITIONS)).toBeNull();
  });

  it("uses the open lowest-cost duplicate edge for authored bend geometry", () => {
    const graph: CampusNavGraph = {
      navNodes: [
        { id: "a-entry", name: "A Entrance", type: "entrance", x: 0, y: 0, buildingId: "a" },
        { id: "b-entry", name: "B Entrance", type: "entrance", x: 100, y: 0, buildingId: "b" },
      ],
      navEdges: [
        {
          id: "closed-shortcut",
          startNodeId: "a-entry",
          endNodeId: "b-entry",
          distance: 1,
          bidirectional: true,
          accessible: true,
          closed: true,
          bendPoints: [{ x: 50, y: 50 }],
        },
        {
          id: "open-route",
          startNodeId: "a-entry",
          endNodeId: "b-entry",
          distance: 10,
          bidirectional: true,
          accessible: true,
          bendPoints: [{ x: 50, y: 0 }],
        },
      ],
    };
    const route = planBuildingRoute(
      { id: "a", code: "A", name: "A" },
      { id: "b", code: "B", name: "B" },
      "standard",
      undefined,
      graph,
    );
    expect(route?.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]);
  });
});

describe("authored destination endpoint combinations", () => {
  const graph: CampusNavGraph = {
    navNodes: [
      { id: "b1-entry", name: "Building 1 Entrance", type: "entrance", x: 0, y: 0, buildingId: "b1" },
      { id: "b2-entry", name: "Building 2 Entrance", type: "entrance", x: 200, y: 0, buildingId: "b2" },
      { id: "b1-door", name: "Building 1 Lobby Door", type: "entrance", x: 10, y: 0, buildingId: "b1", floorId: "f1", doorId: "door-b1" },
      { id: "b1-room-door", name: "Room 1 Door", type: "hallway", x: 20, y: 0, buildingId: "b1", floorId: "f1", doorId: "door-b1-room" },
      { id: "b2-door", name: "Building 2 Lobby Door", type: "entrance", x: 210, y: 0, buildingId: "b2", floorId: "f1", doorId: "door-b2" },
      { id: "b2-room-door", name: "Room 3 Door", type: "hallway", x: 220, y: 0, buildingId: "b2", floorId: "f1", doorId: "door-b2-room" },
      { id: "b1-door-upper", name: "Building 1 Upper Door", type: "hallway", x: 55, y: 0, buildingId: "b1", floorId: "f2", doorId: "door-b1-upper" },
      { id: "room-1", name: "Room 1 center", type: "room_access", x: 30, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1" },
      { id: "stair-1", name: "Stairs", type: "stair", x: 40, y: 0, buildingId: "b1", floorId: "f1", stairId: "s1" },
      { id: "stair-2", name: "Stairs", type: "stair", x: 40, y: 0, buildingId: "b1", floorId: "f2", stairId: "s2" },
      { id: "elevator-1", name: "Elevator", type: "elevator", x: 40, y: 0, buildingId: "b1", floorId: "f1", elevatorId: "e1" },
      { id: "elevator-2", name: "Elevator", type: "elevator", x: 40, y: 0, buildingId: "b1", floorId: "f2", elevatorId: "e1" },
      { id: "room-2", name: "Room 2 center", type: "room_access", x: 70, y: 0, buildingId: "b1", floorId: "f2", roomId: "r2" },
      { id: "room-3", name: "Room 3 center", type: "room_access", x: 230, y: 0, buildingId: "b2", floorId: "f1", roomId: "r3" },
    ],
    navEdges: [
      { id: "e-entry-door-b1", startNodeId: "b1-entry", endNodeId: "b1-door", distance: 10, bidirectional: true, accessible: true, type: "entrance_transition" },
      { id: "e-door-room-b1", startNodeId: "b1-room-door", endNodeId: "room-1", distance: 10, bidirectional: true, accessible: true, type: "room_door_transition" },
      { id: "e-room-door-lobby", startNodeId: "b1-room-door", endNodeId: "b1-door", distance: 10, bidirectional: true, accessible: true },
      { id: "e-door-stair", startNodeId: "b1-door", endNodeId: "stair-1", distance: 20, bidirectional: true, accessible: true },
      { id: "e-door-elevator", startNodeId: "b1-door", endNodeId: "elevator-1", distance: 10, bidirectional: true, accessible: true },
      { id: "e-stair-transition", startNodeId: "stair-1", endNodeId: "stair-2", distance: 5, bidirectional: true, accessible: false, type: "floor_transition", emergencySafe: true },
      { id: "e-elevator-transition", startNodeId: "elevator-1", endNodeId: "elevator-2", distance: 100, bidirectional: true, accessible: true, type: "floor_transition", emergencySafe: true },
      { id: "e-stair-upper-door", startNodeId: "stair-2", endNodeId: "b1-door-upper", distance: 20, bidirectional: true, accessible: true },
      { id: "e-elevator-upper-door", startNodeId: "elevator-2", endNodeId: "b1-door-upper", distance: 10, bidirectional: true, accessible: true },
      { id: "e-upper-door-room", startNodeId: "b1-door-upper", endNodeId: "room-2", distance: 10, bidirectional: true, accessible: true, type: "room_door_transition" },
      { id: "e-outdoor", startNodeId: "b1-entry", endNodeId: "b2-entry", distance: 200, bidirectional: true, accessible: true, emergencySafe: true },
      { id: "e-entry-door-b2", startNodeId: "b2-entry", endNodeId: "b2-door", distance: 10, bidirectional: true, accessible: true, type: "entrance_transition" },
      { id: "e-b2-hall", startNodeId: "b2-door", endNodeId: "b2-room-door", distance: 10, bidirectional: true, accessible: true },
      { id: "e-door-room-b2", startNodeId: "b2-room-door", endNodeId: "room-3", distance: 10, bidirectional: true, accessible: true, type: "room_door_transition" },
    ],
  };
  const building = (buildingId: string, code: string) => ({ type: "building" as const, buildingId, label: code, code });
  const room = (buildingId: string, roomId: string, floorNumber: number, code: string) => ({
    type: "room" as const, buildingId, roomId, floorNumber, roomName: roomId,
    buildingLabel: code, buildingCode: code,
    accessDoorId: roomId === "r1" ? "door-b1-room" : roomId === "r2" ? "door-b1-upper" : "door-b2-room",
  });

  it("routes building→room, room→room across floors, and room→room across buildings", () => {
    const targetRoom = { ...room("b1", "r2", 2, "B1"), roomName: "Room 201" };
    const buildingToRoom = planAuthoredDestinationRoute(building("b1", "B1"), targetRoom, "standard", graph);
    expect(buildingToRoom?.destinationRoom?.roomId).toBe("r2");
    expect(buildingToRoom?.toCode).toBe("Room 201");
    expect(buildingToRoom?.steps.at(-1)?.instruction).toBe("Arrive at Room 201.");
    expect(buildingToRoom?.steps.map((step) => step.instruction)).toContain("Take the Stairs to Floor 2.");
    expect(buildingToRoom?.steps.some((step) => /waypoint/i.test(step.instruction))).toBe(false);
    expect(buildingToRoom?.points.length).toBeLessThan(2);
    expect(buildingToRoom?.indoorSegments?.some((segment) => segment.floorNumber === 2)).toBe(true);
    expect(buildingToRoom?.indoorSegments?.at(-1)?.waypoints.at(-1)).toEqual({ x: 55, y: 0 });
    expect(buildingToRoom?.indoorSegments?.at(-1)?.waypoints).not.toContainEqual({ x: 70, y: 0 });

    const graphWithFloorMetadata: CampusNavGraph = {
      ...graph,
      buildings: [{
        id: "b1",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        floors: [
          { id: "f1", number: 1 },
          { id: "f2", number: 2 },
        ],
      }],
    };
    const buildingToUpperRoom = planAuthoredDestinationRoute(
      building("b1", "B1"),
      targetRoom,
      "standard",
      graphWithFloorMetadata,
    );
    expect(buildingToUpperRoom?.indoorSegments?.map((segment) => segment.floorNumber)).toEqual([1, 2]);
    expect(buildingToUpperRoom?.steps.map((step) => step.instruction)).toContain("Take the Stairs up to Floor 2.");

    const sameBuilding = planDestinationRoute(room("b1", "r1", 1, "B1"), room("b1", "r2", 2, "B1"), "standard", graph);
    expect(sameBuilding?.points).toEqual([]);
    expect(sameBuilding?.indoorSegments?.map((segment) => segment.floorId)).toEqual(["f1", "f2"]);
    expect(sameBuilding?.indoorSegments?.every((segment) => segment.waypoints.length >= 2)).toBe(true);
    expect(sameBuilding?.transitionDetails).toEqual([
      expect.objectContaining({ kind: "stairs", nodeId: "stair-2", fromFloorId: "f1", toFloorId: "f2" }),
    ]);
    expect(sameBuilding?.indoorSegments?.[0].waypoints[0]).toEqual({ x: 20, y: 0 });
    expect(sameBuilding?.indoorSegments?.at(-1)?.waypoints.at(-1)).toEqual({ x: 55, y: 0 });
    expect(sameBuilding?.indoorSegments?.at(-1)?.waypoints).not.toContainEqual({ x: 70, y: 0 });
    expect(sameBuilding?.steps.some((step) => /Take the stairs/i.test(step.instruction))).toBe(true);
    expect(sameBuilding?.steps.map((step) => step.instruction)).toEqual([
      "Start at the door of r1.",
      "Follow the indoor path to the Stairs.",
      "Take the Stairs up to Floor 2.",
      "Follow the indoor path to the door of r2.",
      "Arrive at r2.",
    ]);
    const roomToBuilding = planDestinationRoute(room("b1", "r2", 2, "B1"), building("b1", "B1"), "standard", graph);
    expect(roomToBuilding?.destinationRoom).toBeUndefined();
    expect(roomToBuilding?.points.length).toBeLessThan(2);
    expect(roomToBuilding?.indoorSegments?.some((segment) => segment.floorNumber === 2)).toBe(true);
    const crossBuilding = planDestinationRoute(
      room("b1", "r1", 1, "B1"),
      room("b2", "r3", 1, "B2"),
      "standard",
      graph,
    );
    expect(crossBuilding).not.toBeNull();
    expect(crossBuilding?.points.length).toBeGreaterThanOrEqual(2);
    expect(crossBuilding?.indoorSegments?.map((segment) => ({
      buildingId: segment.buildingId,
      floorNumber: segment.floorNumber,
    }))).toEqual([
      { buildingId: "b1", floorNumber: 1 },
      { buildingId: "b2", floorNumber: 1 },
    ]);
    expect(crossBuilding?.indoorSegments?.every((segment) => segment.waypoints.length >= 2)).toBe(true);
    expect(crossBuilding?.indoorSegments?.[0].waypoints[0]).toEqual({ x: 20, y: 0 });
    expect(crossBuilding?.indoorSegments?.at(-1)?.waypoints.at(-1)).toEqual({ x: 220, y: 0 });
    expect(crossBuilding?.indoorSegments?.at(-1)?.waypoints).not.toContainEqual({ x: 230, y: 0 });
    expect(crossBuilding?.steps.map((step) => step.instruction)).toEqual([
      "Start at the door of r1.",
      "Follow the indoor path to the building exit door.",
      "Exit B1 building.",
      "Follow the campus path to the entrance of B2 building.",
      "Enter B2 building.",
      "Follow the indoor path to the door of r3.",
      "Arrive at r3.",
    ]);
    const emergencyRoute = planDestinationRoute(room("b1", "r2", 2, "B1"), building("b2", "B2"), "emergency", graph);
    expect(emergencyRoute).not.toBeNull();
    expect(emergencyRoute!.steps.some((step) => step.icon === "stairs")).toBe(true);
  });

  it("keeps routine room routes off emergency-only stairs while preserving them for Emergency mode", () => {
    const emergencyShortcutGraph: CampusNavGraph = {
      ...graph,
      navNodes: [
        ...(graph.navNodes ?? []),
        {
          id: "emergency-path-junction",
          name: "Emergency Path",
          type: "walking",
          x: 150,
          y: 50,
        },
        {
          id: "exterior-emergency-stair",
          name: "Right Stair",
          type: "stair",
          x: 100,
          y: 100,
          exteriorEmergencyStairId: "right-stair",
          emergencySafe: true,
        },
      ],
      navEdges: [
        ...(graph.navEdges ?? []),
        { id: "emergency-shortcut-in", startNodeId: "b1-entry", endNodeId: "exterior-emergency-stair", distance: 1, bidirectional: true, accessible: true, emergencySafe: true },
        { id: "emergency-shortcut-out", startNodeId: "exterior-emergency-stair", endNodeId: "b2-entry", distance: 1, bidirectional: true, accessible: true, emergencySafe: true },
        { id: "emergency-layer-in", startNodeId: "b1-entry", endNodeId: "emergency-path-junction", distance: 5, bidirectional: true, accessible: true, emergencySafe: true, type: "emergency" },
        { id: "emergency-layer-out", startNodeId: "emergency-path-junction", endNodeId: "b2-entry", distance: 5, bidirectional: true, accessible: true, emergencySafe: true, type: "emergency" },
      ],
    };
    const from = room("b1", "r1", 1, "B1");
    const to = room("b2", "r3", 1, "B2");

    const standardRoute = planDestinationRoute(from, to, "standard", emergencyShortcutGraph);
    const emergencyRoute = planDestinationRoute(from, to, "emergency", emergencyShortcutGraph);

    expect(standardRoute).not.toBeNull();
    expect(standardRoute?.points).not.toContainEqual({ x: 100, y: 100 });
    expect(standardRoute?.points).not.toContainEqual({ x: 150, y: 50 });
    expect(emergencyRoute?.points).toContainEqual({ x: 100, y: 100 });
    expect(standardRoute!.dist).toBeGreaterThan(emergencyRoute!.dist);
  });

  it("keeps a same-building exterior-stair detour in source → campus → destination order", () => {
    const detourGraph: CampusNavGraph = {
      buildings: [{ id: "sc", x: 0, y: 0, width: 300, height: 200, floors: [
        { id: "ground", number: 1 }, { id: "second", number: 3 }, { id: "third", number: 4 },
      ] }],
      navNodes: [
        { id: "copy-door", x: 10, y: 10, buildingId: "sc", floorId: "ground", doorId: "copy" },
        { id: "exit-hall", x: 20, y: 10, buildingId: "sc", floorId: "ground" },
        { id: "exit", x: 30, y: 10, buildingId: "sc", type: "entrance" },
        { id: "stair-entry", x: 200, y: 10, buildingId: "sc", type: "entrance" },
        { id: "stair-ground", x: 210, y: 10, buildingId: "sc", floorId: "ground", type: "stair", stairId: "stair-ground" },
        { id: "stair-second", x: 210, y: 10, buildingId: "sc", floorId: "second", type: "stair", stairId: "stair-second" },
        { id: "stair-third", x: 210, y: 10, buildingId: "sc", floorId: "third", type: "stair", stairId: "stair-third" },
        { id: "lecture-door", x: 250, y: 10, buildingId: "sc", floorId: "third", doorId: "lecture" },
      ],
      navEdges: [
        ["copy-door", "exit-hall"], ["exit-hall", "exit"], ["exit", "stair-entry"],
        ["stair-entry", "stair-ground"], ["stair-ground", "stair-second"],
        ["stair-second", "stair-third"], ["stair-third", "lecture-door"],
      ].map(([startNodeId, endNodeId], index) => ({
        id: `detour-${index}`, startNodeId, endNodeId, distance: 10,
        bidirectional: true, accessible: true,
        type: index === 4 || index === 5 ? "floor_transition" : "walkway",
      })),
    };
    const route = planDestinationRoute(
      { type: "room", buildingId: "sc", floorNumber: 1, roomId: "copy-room", roomName: "Copy Shop", buildingLabel: "Student Center", buildingCode: "SC", accessDoorId: "copy" },
      { type: "room", buildingId: "sc", floorNumber: 4, roomId: "lecture-room", roomName: "Lecture Room", buildingLabel: "Student Center", buildingCode: "SC", accessDoorId: "lecture" },
      "standard", detourGraph,
    );
    expect(route?.points.length).toBeGreaterThanOrEqual(2);
    expect(route?.indoorSegments?.map((segment) => [segment.floorNumber, segment.afterOutdoor])).toEqual([
      [1, false], [1, true], [3, true], [4, true],
    ]);
    expect(route?.transitionDetails).toHaveLength(2);
    expect(route?.indoorSegments?.at(-1)?.waypoints.at(-1)).toEqual({ x: 250, y: 10 });
  });

  it("chooses the shortest connected physical Door and ignores room-center shortcuts", () => {
    const multiDoorGraph: CampusNavGraph = {
      navNodes: [
        { id: "source-entry", name: "Source Entrance", type: "entrance", x: 0, y: 0, buildingId: "source" },
        { id: "target-entry", name: "Target Entrance", type: "entrance", x: 200, y: 0, buildingId: "target" },
        { id: "source-room-center", name: "Room center", type: "room_access", x: 50, y: 0, buildingId: "source", floorId: "source-f1", roomId: "source-room" },
        { id: "door-slow", name: "Slow Door", type: "hallway", x: 20, y: 0, buildingId: "source", floorId: "source-f1", doorId: "slow" },
        { id: "door-fast", name: "Fast Door", type: "hallway", x: 80, y: 0, buildingId: "source", floorId: "source-f1", doorId: "fast" },
      ],
      navEdges: [
        { id: "slow-to-entry", startNodeId: "door-slow", endNodeId: "source-entry", distance: 80, bidirectional: true, accessible: true },
        { id: "fast-to-entry", startNodeId: "door-fast", endNodeId: "source-entry", distance: 10, bidirectional: true, accessible: true },
        { id: "center-shortcut", startNodeId: "source-room-center", endNodeId: "source-entry", distance: 1, bidirectional: true, accessible: true },
        { id: "outdoor", startNodeId: "source-entry", endNodeId: "target-entry", distance: 100, bidirectional: true, accessible: true },
      ],
    };
    const route = planAuthoredDestinationRoute(
      {
        type: "room",
        buildingId: "source",
        roomId: "source-room",
        floorNumber: 1,
        roomName: "Source Room",
        buildingLabel: "Source",
        buildingCode: "SRC",
        accessDoorIds: ["slow", "fast"],
      },
      { type: "building", buildingId: "target", label: "Target", code: "TGT" },
      "standard",
      multiDoorGraph,
    );

    expect(route).not.toBeNull();
    expect(route!.indoorSegments?.[0].waypoints[0]).toEqual({ x: 80, y: 0 });
    expect(route!.indoorSegments?.[0].waypoints).not.toContainEqual({ x: 50, y: 0 });
  });

  it("reanchors a room-origin route to the published physical Door", () => {
    const graphWithStaleDoorNode: CampusNavGraph = {
      buildings: [{
        id: "source",
        x: 0,
        y: 0,
        width: 160,
        height: 100,
        floors: [{
          id: "source-floor",
          number: 1,
          rooms: [{
            id: "copy-shop",
            name: "Copy Shop",
            type: "classroom",
            x: 20,
            y: 20,
            w: 60,
            h: 40,
            floorId: "source-floor",
            buildingId: "source",
            accessDoorId: "copy-shop-door",
          }],
          doors: [{
            id: "copy-shop-door",
            x: 82,
            y: 40,
            width: 12,
            direction: "right",
            color: "#d97706",
            wallId: "copy-shop-wall",
          }],
          walls: [{
            id: "copy-shop-wall",
            x1: 80,
            y1: 20,
            x2: 80,
            y2: 60,
            thickness: 4,
            color: "#64748b",
          }],
        }],
      }],
      navNodes: [
        { id: "source-entry", type: "entrance", x: 0, y: 40, buildingId: "source" },
        { id: "target-entry", type: "entrance", x: 200, y: 40, buildingId: "target" },
        // This is the stale persisted position. The physical Door above is
        // the source of truth and must become the route's first waypoint.
        { id: "copy-shop-door-node", type: "hallway", x: 24, y: 24, buildingId: "source", floorId: "source-floor", doorId: "copy-shop-door" },
      ],
      navEdges: [
        { id: "copy-shop-exit", startNodeId: "copy-shop-door-node", endNodeId: "source-entry", distance: 10, bidirectional: true, accessible: true },
        { id: "outdoor", startNodeId: "source-entry", endNodeId: "target-entry", distance: 100, bidirectional: true, accessible: true },
      ],
    };

    const route = planAuthoredDestinationRoute(
      { type: "room", buildingId: "source", roomId: "copy-shop", floorNumber: 1, roomName: "Copy Shop", buildingLabel: "Source", buildingCode: "SRC", accessDoorId: "copy-shop-door" },
      { type: "building", buildingId: "target", label: "Target", code: "TGT" },
      "standard",
      graphWithStaleDoorNode,
    );

    expect(route).not.toBeNull();
    expect(route!.indoorSegments?.[0].waypoints[0]).toEqual({ x: 82, y: 40 });
  });

  it("keeps a point→room route fully authored and prices the floor transition", () => {
    const targetRoom = { ...room("b1", "r2", 2, "B1"), roomName: "Room 202" };
    const route = planPointToDestinationRoute(
      { x: 0, y: 0 },
      targetRoom,
      "standard",
      graph,
    );
    expect(route).not.toBeNull();
    expect(route!.points).toEqual([{ x: 0, y: 0 }]);
    expect(route!.toCode).toBe("Room 202");
    expect(route!.steps.at(-1)?.instruction).toBe("Arrive at Room 202.");
    expect(route!.steps.some((step) => /waypoint/i.test(step.instruction))).toBe(false);
    expect(route!.steps.map((step) => step.instruction)).toContain("Enter B1 building.");
    expect(route!.indoorSegments?.map((segment) => segment.floorId)).toEqual(["f1", "f2"]);
    expect(route!.dist).toBeGreaterThan(0);
    expect(route!.transitions).toContain("Take the stairs to Stairs");
    expect(route!.transitionDetails?.[0]).toMatchObject({ kind: "stairs", nodeId: "stair-2" });
    expect(hasNavigableRoute(route)).toBe(true);
  });

  it("does not treat a zero-length authored route as navigable", () => {
    const route = planAuthoredDestinationRoute(
      room("b1", "r1", 1, "B1"),
      room("b1", "r1", 1, "B1"),
      "standard",
      graph,
    );
    expect(route).toBeNull();
    expect(hasNavigableRoute(null)).toBe(false);
  });

  it("prefers stairs or elevators in Standard mode and falls back when the preferred transition is absent", () => {
    const targetRoom = { ...room("b1", "r2", 2, "B1"), roomName: "Room 201" };
    const stairsRoute = planDestinationRoute(building("b1", "B1"), targetRoom, "standard", graph, "stairs");
    const elevatorRoute = planDestinationRoute(building("b1", "B1"), targetRoom, "standard", graph, "elevator");

    expect(stairsRoute?.transitionDetails?.some((transition) => transition.kind === "stairs")).toBe(true);
    expect(elevatorRoute?.transitionDetails?.some((transition) => transition.kind === "elevator")).toBe(true);
    const stairsOnlyGraph: CampusNavGraph = {
      ...graph,
      navNodes: graph.navNodes?.filter((node) => !node.elevatorId && node.type !== "elevator"),
      navEdges: graph.navEdges?.filter((edge) => !edge.id?.includes("elevator")),
    };
    const fallbackRoute = planDestinationRoute(building("b1", "B1"), targetRoom, "standard", stairsOnlyGraph, "elevator");
    expect(fallbackRoute?.transitionDetails?.some((transition) => transition.kind === "stairs")).toBe(true);
  });
});

describe("public authored exterior route projection", () => {
  it("keeps Floor-local Veranda nodes in the campus route until the matching door", () => {
    const graph: CampusNavGraph = {
      buildings: [{ id: "b1", x: 0, y: 0, width: 400, height: 200, floors: [{ id: "f1", canvasW: 400, canvasH: 200 }] }],
      navNodes: [
        { id: "entrance", name: "Entrance", type: "entrance", x: 0, y: 100, buildingId: "b1", accessible: true },
        { id: "ramp-outer", name: "Ramp", type: "ramp", x: 40, y: 100, buildingId: "b1", derivedOwnerType: "entrance_ramp", derivedRole: "outer", accessible: true },
        { id: "veranda", name: "Veranda", type: "hallway", x: 120, y: 80, buildingId: "b1", floorId: "f1", exteriorZoneId: "zone-1", accessible: true },
        { id: "threshold", name: "Entrance threshold", type: "entrance", x: 200, y: 100, buildingId: "b1", floorId: "f1", derivedOwnerType: "entrance_threshold", derivedRole: "threshold", accessible: true },
        { id: "door", name: "Lobby door", type: "entrance", x: 220, y: 100, buildingId: "b1", floorId: "f1", doorId: "door-1", accessible: true },
        { id: "room", name: "Room 1", type: "room_access", x: 300, y: 100, buildingId: "b1", floorId: "f1", roomId: "room-1", accessible: true },
      ],
      navEdges: [
        { id: "entry-ramp", startNodeId: "entrance", endNodeId: "ramp-outer", distance: 40, bidirectional: true, accessible: true },
        { id: "ramp-veranda", startNodeId: "ramp-outer", endNodeId: "veranda", distance: 80, bidirectional: true, accessible: true },
        { id: "veranda-threshold", startNodeId: "veranda", endNodeId: "threshold", distance: 80, bidirectional: true, accessible: true, bendPoints: [{ x: 160, y: 100 }] },
        { id: "threshold-door", startNodeId: "threshold", endNodeId: "door", distance: 20, bidirectional: true, accessible: true, type: "entrance_transition" },
        { id: "door-room", startNodeId: "door", endNodeId: "room", distance: 80, bidirectional: true, accessible: true },
      ],
    };
    const route = planAuthoredDestinationRoute(
      { type: "building", buildingId: "b1", label: "Building 1", code: "B1" },
      { type: "room", buildingId: "b1", roomId: "room-1", floorNumber: 1, roomName: "Room 1", buildingLabel: "Building 1", buildingCode: "B1", accessDoorId: "door-1" },
      "standard",
      graph,
    );

    expect(route).not.toBeNull();
    expect(route!.campusPoints).toEqual([
      { x: 0, y: 100 },
      { x: 40, y: 100 },
      { x: 120, y: 80 },
      { x: 160, y: 100 },
      { x: 200, y: 100 },
    ]);
    expect(route!.indoorSegments?.[0].waypoints).toEqual([
      { x: 220, y: 100 },
    ]);
  });

  it("uses the authored Ramp/Veranda chain for Accessible routes and excludes Steps", () => {
    const graph: CampusNavGraph = {
      buildings: [{ id: "b1", x: 0, y: 0, width: 400, height: 200, floors: [{ id: "f1", canvasW: 400, canvasH: 200 }] }],
      navNodes: [
        { id: "entrance", name: "Entrance", type: "entrance", x: 0, y: 100, buildingId: "b1", accessible: true },
        { id: "ramp-outer", name: "Ramp", type: "ramp", x: 40, y: 100, buildingId: "b1", derivedOwnerType: "entrance_ramp", derivedRole: "outer", accessible: true },
        { id: "steps-outer", name: "Steps", type: "steps", x: 40, y: 130, buildingId: "b1", derivedOwnerType: "entrance_steps", derivedRole: "outer", accessible: false },
        { id: "veranda", name: "Veranda", type: "hallway", x: 120, y: 80, buildingId: "b1", floorId: "f1", exteriorZoneId: "zone-1", accessible: true },
        { id: "threshold", name: "Entrance threshold", type: "entrance", x: 200, y: 100, buildingId: "b1", floorId: "f1", derivedOwnerType: "entrance_threshold", derivedRole: "threshold", accessible: true },
        { id: "door", name: "Lobby door", type: "entrance", x: 220, y: 100, buildingId: "b1", floorId: "f1", doorId: "door-1", accessible: true },
        { id: "room", name: "Room 1", type: "room_access", x: 300, y: 100, buildingId: "b1", floorId: "f1", roomId: "room-1", accessible: true },
      ],
      navEdges: [
        { id: "entry-ramp", startNodeId: "entrance", endNodeId: "ramp-outer", distance: 40, bidirectional: true, accessible: true },
        { id: "ramp-veranda", startNodeId: "ramp-outer", endNodeId: "veranda", distance: 80, bidirectional: true, accessible: true },
        { id: "entry-steps", startNodeId: "entrance", endNodeId: "steps-outer", distance: 20, bidirectional: true, accessible: false },
        { id: "steps-veranda", startNodeId: "steps-outer", endNodeId: "veranda", distance: 20, bidirectional: true, accessible: false },
        { id: "veranda-threshold", startNodeId: "veranda", endNodeId: "threshold", distance: 80, bidirectional: true, accessible: true },
        { id: "threshold-door", startNodeId: "threshold", endNodeId: "door", distance: 20, bidirectional: true, accessible: true, type: "entrance_transition" },
        { id: "door-room", startNodeId: "door", endNodeId: "room", distance: 80, bidirectional: true, accessible: true },
      ],
    };
    const route = planAuthoredDestinationRoute(
      { type: "building", buildingId: "b1", label: "Building 1", code: "B1" },
      { type: "room", buildingId: "b1", roomId: "room-1", floorNumber: 1, roomName: "Room 1", buildingLabel: "Building 1", buildingCode: "B1", accessDoorId: "door-1" },
      "accessible",
      graph,
    );

    expect(route).not.toBeNull();
    expect(route!.campusPoints).toContainEqual({ x: 40, y: 100 });
    expect(route!.campusPoints).not.toContainEqual({ x: 40, y: 130 });
  });
});

describe("planBuildingRoute (seed ids on the static graph)", () => {
  it("routes b_mab → b_gym via the extended static entrance map (no campus graph passed)", () => {
    const route = planBuildingRoute(
      { id: "b_mab", code: "MAB", name: "Main Academic Building" },
      { id: "b_gym", code: "GYM", name: "Gymnasium" },
      "standard",
      CAMPUS_POSITIONS
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
    expect(route!.dist).toBeGreaterThan(0);
  });
});

describe("planRouteFromPoint (kiosk-style 'You are here' start)", () => {
  it("snaps a point to the nearest node and routes to the destination building", () => {
    const route = planRouteFromPoint(
      { x: 100, y: 280 }, // just outside the Main Gate
      { id: "b_gym", code: "GYM", name: "Gymnasium" },
      "standard",
      CAMPUS_GRAPH,
      CAMPUS_POSITIONS
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
    expect(route!.fromCode).toBe("You are here");
    // The walk starts at the snapped gate node.
    expect(route!.points[0]).toEqual({ x: 108, y: 285 });
    expect(route!.steps[0].instruction).toBe("You are here");
    expect(route!.steps[route!.steps.length - 1].icon).toBe("arrive");
  });

  it("works on the static graph when no campus graph is provided", () => {
    const route = planRouteFromPoint(
      { x: 155, y: 285 }, // near MAB junction
      { id: "b5", code: "GYM", name: "Gymnasium" },
      "standard",
      null,
      POSITIONS
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
    expect(route!.steps[0].instruction).toBe("You are here");
  });

  it("falls back to a straight-line estimate when the destination has no node", () => {
    const route = planRouteFromPoint(
      { x: 100, y: 100 },
      { id: "unknown", code: "XX", name: "Unknown" },
      "standard",
      null,
      { unknown: { x: 500, y: 400, w: 60, h: 40 } }
    );
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(false);
    expect(route!.steps[0].instruction).toBe("You are here");
  });

  it("returns null without a destination", () => {
    expect(planRouteFromPoint({ x: 0, y: 0 }, null as never, "standard", CAMPUS_GRAPH, CAMPUS_POSITIONS)).toBeNull();
  });
});

describe("planDestinationRoute (combined routing)", () => {
  it("plans a building → room route and exposes the destination room", () => {
    const route = planDestinationRoute(
      { type: "building", buildingId: "b1", label: MAB.name, code: MAB.code },
      { type: "room", buildingId: "b1", floorNumber: 2, roomId: "m203", roomName: "Room 201", buildingLabel: MAB.name, buildingCode: MAB.code },
      "standard"
    );
    expect(route).not.toBeNull();
    expect(route!.destinationRoom).toEqual({ buildingId: "b1", floorNumber: 2, roomId: "m203" });
    expect(route!.toCode).toBe("Room 201");
    expect(route!.steps.at(-1)?.instruction).toBe("Arrive at Room 201");
    expect(route!.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("plans a room → building route", () => {
    const route = planDestinationRoute(
      { type: "room", buildingId: "b1", floorNumber: 2, roomId: "m203", roomName: "Room 201", buildingLabel: MAB.name, buildingCode: MAB.code },
      { type: "building", buildingId: "b5", label: GYM.name, code: GYM.code },
      "standard"
    );
    expect(route).not.toBeNull();
    expect(route!.dist).toBeGreaterThan(0);
  });
});

describe("stepsFromGraphPath", () => {
  it("prefixes a start step and appends an arrive step when missing", () => {
    const path = findBuildingPath("b1", "b5");
    expect(path).not.toBeNull();
    const steps = stepsFromGraphPath(path!, "MAB", "GYM");
    expect(steps[0].icon).toBe("start");
    expect(steps[steps.length - 1].icon).toBe("arrive");
    // At least one walking instruction in between
    expect(steps.some((s) => s.icon === "walk")).toBe(true);
  });

  it("extracts the walking distance from instructions", () => {
    const path: GraphPath = {
      nodeIds: ["a", "b"],
      distanceM: 100,
      minutes: 2,
      waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      steps: ["Walk 45m toward the gate", "Arrive at Main Gate"],
    };
    const steps = stepsFromGraphPath(path, "A", "B");
    // steps[0] is the prefixed start step; steps[1] is the Walk instruction
    expect(steps[1].distanceM).toBe(45);
  });
});

describe("detectFloorTransitions", () => {
  const baseSegment = {
    label: "seg",
    waypoints: [{ x: 0, y: 0 }],
    distanceM: 10,
    seconds: 10,
    steps: ["Walk 10m"],
    buildingId: "b1",
    isIndoor: true,
  };

  it("flags an elevator transition between floors", () => {
    const segments: RouteSegment[] = [
      { ...baseSegment, label: "Exit elevator", floorNumber: 1 },
      { ...baseSegment, label: "Take elevator up", floorNumber: null, steps: ["Take the elevator up"] },
      { ...baseSegment, label: "Enter floor 3", floorNumber: 3 },
    ];
    const transitions = detectFloorTransitions(segments);
    expect(transitions).toContain("Take the elevator to Floor 3");
  });

  it("returns no transitions when everything is on one floor", () => {
    const segments: RouteSegment[] = [
      { ...baseSegment, floorNumber: 1 },
      { ...baseSegment, floorNumber: 1 },
    ];
    expect(detectFloorTransitions(segments)).toEqual([]);
  });
});

describe("formatting helpers", () => {
  it("formats distances with the right unit", () => {
    expect(formatDistance(450)).toBe("450 m");
    expect(formatDistance(1200)).toBe("1.2 km");
  });

  it("formats minutes with hours when needed", () => {
    expect(formatMinutes(5)).toBe("5 min");
    expect(formatMinutes(0)).toBe("<1 min");
    expect(formatMinutes(75)).toBe("1h 15m");
  });
});
