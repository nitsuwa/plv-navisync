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
});

describe("planBuildingRoute (published-campus nav graph — C4 Phase 2 bridge)", () => {
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
        { ...CAMPUS_GRAPH.navEdges[0], accessible: false },
        { ...CAMPUS_GRAPH.navEdges[1], accessible: true },
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
      { id: "b2-door", name: "Building 2 Lobby Door", type: "entrance", x: 210, y: 0, buildingId: "b2", floorId: "f1", doorId: "door-b2" },
      { id: "room-1", name: "Room 1", type: "room_access", x: 20, y: 0, buildingId: "b1", floorId: "f1", roomId: "r1" },
      { id: "stair-1", name: "Stairs", type: "stair", x: 40, y: 0, buildingId: "b1", floorId: "f1", stairId: "s1" },
      { id: "stair-2", name: "Stairs", type: "stair", x: 40, y: 0, buildingId: "b1", floorId: "f2", stairId: "s2" },
      { id: "room-2", name: "Room 2", type: "room_access", x: 60, y: 0, buildingId: "b1", floorId: "f2", roomId: "r2" },
      { id: "room-3", name: "Room 3", type: "room_access", x: 220, y: 0, buildingId: "b2", floorId: "f1", roomId: "r3" },
    ],
    navEdges: [
      { id: "e-entry-door-b1", startNodeId: "b1-entry", endNodeId: "b1-door", distance: 10, bidirectional: true, accessible: true, type: "entrance_transition" },
      { id: "e-door-room-b1", startNodeId: "b1-door", endNodeId: "room-1", distance: 10, bidirectional: true, accessible: true },
      { id: "e-room-stair", startNodeId: "room-1", endNodeId: "stair-1", distance: 20, bidirectional: true, accessible: true },
      { id: "e-stair-transition", startNodeId: "stair-1", endNodeId: "stair-2", distance: 5, bidirectional: true, accessible: false, type: "floor_transition", emergencySafe: true },
      { id: "e-stair-room", startNodeId: "stair-2", endNodeId: "room-2", distance: 20, bidirectional: true, accessible: true },
      { id: "e-outdoor", startNodeId: "b1-entry", endNodeId: "b2-entry", distance: 200, bidirectional: true, accessible: true, emergencySafe: true },
      { id: "e-entry-door-b2", startNodeId: "b2-entry", endNodeId: "b2-door", distance: 10, bidirectional: true, accessible: true, type: "entrance_transition" },
      { id: "e-door-room-b2", startNodeId: "b2-door", endNodeId: "room-3", distance: 10, bidirectional: true, accessible: true },
    ],
  };
  const building = (buildingId: string, code: string) => ({ type: "building" as const, buildingId, label: code, code });
  const room = (buildingId: string, roomId: string, floorNumber: number, code: string) => ({
    type: "room" as const, buildingId, roomId, floorNumber, roomName: roomId,
    buildingLabel: code, buildingCode: code,
  });

  it("routes building→room, room→room across floors, and room→room across buildings", () => {
    const targetRoom = { ...room("b1", "r2", 2, "B1"), roomName: "Room 201" };
    const buildingToRoom = planAuthoredDestinationRoute(building("b1", "B1"), targetRoom, "standard", graph);
    expect(buildingToRoom?.destinationRoom?.roomId).toBe("r2");
    expect(buildingToRoom?.toCode).toBe("Room 201");
    expect(buildingToRoom?.steps.at(-1)?.instruction).toBe("Arrive at Room 201");
    expect(buildingToRoom?.points.length).toBeLessThan(2);
    expect(buildingToRoom?.indoorSegments?.some((segment) => segment.floorNumber === 2)).toBe(true);
    const sameBuilding = planDestinationRoute(room("b1", "r1", 1, "B1"), room("b1", "r2", 2, "B1"), "standard", graph);
    expect(sameBuilding?.points).toEqual([]);
    expect(sameBuilding?.indoorSegments?.map((segment) => segment.floorId)).toEqual(["f1", "f2"]);
    expect(sameBuilding?.indoorSegments?.every((segment) => segment.waypoints.length >= 2)).toBe(true);
    expect(sameBuilding?.transitionDetails).toEqual([
      expect.objectContaining({ kind: "stairs", nodeId: "stair-2", fromFloorId: "f1", toFloorId: "f2" }),
    ]);
    expect(sameBuilding?.steps.some((step) => /Take the stairs/i.test(step.instruction))).toBe(true);
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
    const emergencyRoute = planDestinationRoute(room("b1", "r2", 2, "B1"), building("b2", "B2"), "emergency", graph);
    expect(emergencyRoute).not.toBeNull();
    expect(emergencyRoute!.steps.some((step) => step.icon === "stairs")).toBe(true);
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
    expect(route!.steps.at(-1)?.instruction).toBe("Arrive at Room 202");
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
