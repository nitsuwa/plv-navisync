import { describe, expect, it } from "vitest";
import {
  planBuildingRoute,
  planDestinationRoute,
  stepsFromGraphPath,
  detectFloorTransitions,
  formatDistance,
  formatMinutes,
  type RouteSegment,
} from "../routePlanner";
import { findBuildingPath, type GraphPath } from "../pathfinding";

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

  it("returns a graph-based route in accessible mode (filters non-accessible edges)", () => {
    const route = planBuildingRoute(MAB, SSC, "accessible", POSITIONS);
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
  });

  it("returns a graph-based route in emergency mode", () => {
    const route = planBuildingRoute(GYM, SSC, "emergency", POSITIONS);
    expect(route).not.toBeNull();
    expect(route!.isGraphBased).toBe(true);
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

describe("planDestinationRoute (combined routing)", () => {
  it("plans a building → room route and exposes the destination room", () => {
    const route = planDestinationRoute(
      { type: "building", buildingId: "b1", label: MAB.name, code: MAB.code },
      { type: "room", buildingId: "b1", floorNumber: 2, roomId: "m203", roomName: "Room 201", buildingLabel: MAB.name, buildingCode: MAB.code },
      "standard"
    );
    expect(route).not.toBeNull();
    expect(route!.destinationRoom).toEqual({ buildingId: "b1", floorNumber: 2, roomId: "m203" });
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
