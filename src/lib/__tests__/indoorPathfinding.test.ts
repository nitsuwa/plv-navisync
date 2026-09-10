import { describe, it, expect } from "vitest";
import {
  buildFloorGraphFromRooms,
  findIndoorRouteForFloor,
  findIndoorRouteFromNavigationGraph,
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

// ── findIndoorRouteFromNavigationGraph ─────────────────────────────────────

describe("findIndoorRouteFromNavigationGraph", () => {
  const node = (id: string, name: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    type: "hallway" as const,
    x,
    y,
    buildingId: "b1",
    floorId: "f1",
    accessible: true,
    color: "#16a34a",
    ...extra,
  });
  const edge = (id: string, startNodeId: string, endNodeId: string, distance: number, extra: Record<string, unknown> = {}) => ({
    id,
    startNodeId,
    endNodeId,
    distance,
    bidirectional: true,
    accessible: true,
    emergencySafe: true,
    type: "hallway",
    color: "#16a34a",
    width: 4,
    ...extra,
  });

  it("uses the authored shortest graph and preserves edge bend points", () => {
    const nodes = [
      node("entry-door", "Main Door", 20, 100, { doorId: "door-main" }),
      node("hall-a", "Hallway", 80, 100),
      node("room-access", "Room 101 access", 140, 40, { type: "room_access", roomId: "room-101" }),
    ];
    const edges = [
      edge("door-hall", "entry-door", "hall-a", 60, { bendPoints: [{ x: 50, y: 100 }] }),
      edge("hall-room", "hall-a", "room-access", 90, { bendPoints: [{ x: 80, y: 40 }] }),
    ];

    const route = findIndoorRouteFromNavigationGraph(
      nodes,
      edges,
      { buildingId: "b1", floorId: "f1", roomId: "room-101", roomName: "Room 101" },
      "entry-door",
    );

    expect(route).not.toBeNull();
    expect(route!.waypoints.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 20, y: 100 },
      { x: 50, y: 100 },
      { x: 80, y: 100 },
      { x: 80, y: 40 },
      { x: 140, y: 40 },
    ]);
    expect(route!.steps[0]).toContain("Main Door");
    expect(route!.steps.at(-1)).toContain("Room 101");
  });

  it("returns only the destination-floor leg after an authored floor transition", () => {
    const nodes = [
      node("entry-door", "Main Door", 20, 100, { doorId: "door-main" }),
      node("stair-ground", "Stairwell", 80, 100, { type: "stair", stairId: "stair-g", accessible: false }),
      node("stair-upper", "Stairwell", 80, 100, { floorId: "f2", type: "stair", stairId: "stair-2", accessible: false }),
      node("room-upper", "Room 201 access", 140, 40, { floorId: "f2", type: "room_access", roomId: "room-201" }),
    ];
    const edges = [
      edge("door-stair", "entry-door", "stair-ground", 60),
      edge("floor-transition", "stair-ground", "stair-upper", 5, { type: "floor_transition", accessible: false }),
      edge("stair-room", "stair-upper", "room-upper", 90, { floorId: "f2" }),
    ];

    const route = findIndoorRouteFromNavigationGraph(
      nodes,
      edges,
      { buildingId: "b1", floorId: "f2", roomId: "room-201", roomName: "Room 201" },
      "entry-door",
    );

    expect(route).not.toBeNull();
    expect(route!.waypoints[0]).toMatchObject({ x: 80, y: 100 });
    expect(route!.waypoints.at(-1)).toMatchObject({ x: 140, y: 40 });
    expect(route!.waypoints).not.toContainEqual({ x: 20, y: 100 });
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
