import { describe, it, expect } from "vitest";
import {
  buildFloorGraphFromRooms,
  findIndoorRouteForFloor,
  findMultiFloorIndoorRoute,
  type RoomLike,
} from "../indoorPathfinding";

// ── Fixtures ────────────────────────────────────────────────────────────────

function room(id: string, name: string, type: string, x: number, y: number, w = 30, h = 20, accessibility?: boolean): RoomLike {
  return { id, name, type, x, y, w, h, accessibility };
}

/** One row of rooms: stairs at one end, rooms across the corridor. */
function makeFloor(): RoomLike[] {
  return [
    room("stairs1", "Stairs A", "stairs", 10, 80, 20, 20),
    room("room1", "Room 101", "classroom", 60, 20),
    room("room2", "Room 102", "classroom", 100, 20),
  ];
}

function makeAccessibleFloor(): RoomLike[] {
  return [
    room("elev1", "Elevator A", "elevator", 10, 80, 20, 20),
    room("roomA", "Room A", "classroom", 60, 20, 30, 20, true),
    room("roomB", "Room B", "classroom", 100, 20, 30, 20, false),
  ];
}

// ── buildFloorGraphFromRooms ────────────────────────────────────────────────

describe("buildFloorGraphFromRooms", () => {
  it("returns null for an empty room list", () => {
    expect(buildFloorGraphFromRooms([])).toBeNull();
  });

  it("builds corridor nodes, door nodes, and stair service nodes", () => {
    const graph = buildFloorGraphFromRooms(makeFloor());
    expect(graph).not.toBeNull();
    expect(graph!.roomNodeMap.get("room1")).toBe("door_room1");
    expect(graph!.stairNodes).toContain("service_stairs1");
    expect(graph!.nodes.length).toBeGreaterThan(2);
    expect(graph!.edges.length).toBeGreaterThan(0);
  });

  it("in accessible-only mode excludes stairs and non-accessible rooms", () => {
    const graph = buildFloorGraphFromRooms(makeFloor(), true);
    expect(graph).not.toBeNull();
    expect(graph!.stairNodes).toEqual([]);
    expect(graph!.roomNodeMap.has("room1")).toBe(false);
  });

  it("in accessible-only mode keeps elevators and accessible rooms", () => {
    const graph = buildFloorGraphFromRooms(makeAccessibleFloor(), true);
    expect(graph).not.toBeNull();
    expect(graph!.stairNodes).toContain("service_elev1");
    expect(graph!.roomNodeMap.has("roomA")).toBe(true);
    expect(graph!.roomNodeMap.has("roomB")).toBe(false);
  });
});

// ── findIndoorRouteForFloor ─────────────────────────────────────────────────

describe("findIndoorRouteForFloor", () => {
  it("returns a route with waypoints, steps, and estimates for a reachable room", () => {
    const route = findIndoorRouteForFloor("b1", 1, "room1", makeFloor());
    expect(route).not.toBeNull();
    expect(route!.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(route!.distanceMeters).toBeGreaterThanOrEqual(0);
    expect(route!.estimatedSeconds).toBeGreaterThanOrEqual(0);
    expect(route!.steps.join(" ")).toContain("Arrive at Room 101");
  });

  it("returns null for an unknown room", () => {
    expect(findIndoorRouteForFloor("b1", 1, "missing-room", makeFloor())).toBeNull();
  });

  it("returns null when there is no entry point (accessible mode, stairs only)", () => {
    expect(findIndoorRouteForFloor("b1", 1, "room1", makeFloor(), true)).toBeNull();
  });

  it("finds an accessible route to an accessible room via elevator", () => {
    const route = findIndoorRouteForFloor("b1", 1, "roomA", makeAccessibleFloor(), true);
    expect(route).not.toBeNull();
    expect(route!.steps.join(" ")).toContain("Arrive at Room A");
  });

  it("refuses non-accessible rooms in accessible-only mode", () => {
    expect(findIndoorRouteForFloor("b1", 1, "roomB", makeAccessibleFloor(), true)).toBeNull();
  });
});

// ── findMultiFloorIndoorRoute ───────────────────────────────────────────────

describe("findMultiFloorIndoorRoute", () => {
  const floor1 = [room("stairs1", "Stairs A", "stairs", 10, 80, 20, 20), room("r1f1", "Room 101", "classroom", 60, 20)];
  const floor2 = [room("stairs2", "Stairs A", "stairs", 10, 80, 20, 20), room("r1f2", "Room 201", "classroom", 60, 20)];
  const floorData = { 1: floor1, 2: floor2 };

  it("handles same-floor routing as a single segment", () => {
    const route = findMultiFloorIndoorRoute("b1", 1, "r1f1", 1, floorData);
    expect(route).not.toBeNull();
    expect(route!.segments).toHaveLength(1);
    expect(route!.segments[0].floorNumber).toBe(1);
  });

  it("builds exit, transit, and entry segments for cross-floor routes", () => {
    const route = findMultiFloorIndoorRoute("b1", 2, "r1f2", 1, floorData);
    expect(route).not.toBeNull();
    // exit (source floor) + vertical transit + entry (target floor)
    expect(route!.segments.length).toBeGreaterThanOrEqual(3);
    expect(route!.totalSeconds).toBeGreaterThan(0);
    expect(route!.allSteps.length).toBeGreaterThan(0);
    const transit = route!.segments.find((s) => s.floorNumber === null);
    expect(transit).toBeDefined();
    expect(transit!.label.toLowerCase()).toContain("take");
  });

  it("returns null when target floor data is missing", () => {
    expect(findMultiFloorIndoorRoute("b1", 5, "r1f2", 1, floorData)).toBeNull();
  });

  it("forces elevator transit in accessible-only mode when an elevator exists", () => {
    const accFloor2 = [room("elev2", "Elevator A", "elevator", 10, 80, 20, 20), room("r1f2", "Room 201", "classroom", 60, 20, 30, 20, true)];
    const route = findMultiFloorIndoorRoute("b1", 2, "r1f2", 1, { 1: floor1, 2: accFloor2 }, true);
    expect(route).not.toBeNull();
    const transit = route!.segments.find((s) => s.floorNumber === null);
    expect(transit!.label).toContain("elevator");
  });
});
