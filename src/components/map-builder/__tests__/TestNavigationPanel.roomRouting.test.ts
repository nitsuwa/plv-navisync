import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
  buildDestinationOptions,
  buildPhysicalRoutePolyline,
  buildRoutePolyline,
  buildStartOptions,
  buildTestRouteEdges,
  compactRouteLocationLabel,
  emergencyExitReadiness,
  endpointReadinessMessage,
  routeTransitionMarkers,
  routeTransitionMethod,
  roomRouteInfo,
  resolveBuildingEntranceNodeId,
  resolveNodeId,
  semanticDoorDisplayName,
  TestNavigationPanel,
} from "../TestNavigationPanel";
import { RouteTransitionMarker, transitionLabelLayout } from "../RouteTransitionMarker";
import { findNavigationRoute } from "../../../lib/pathfinding";
import { ROOM_DOOR_EDGE_TYPE } from "../../../lib/indoorNavigationGraph";
import type { Campus, CampusEntrance, FloorDoor, FloorPlan, FloorRoom, FloorWall, NavigationEdge, NavigationNode } from "../types";

const edge = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  overrides: Partial<NavigationEdge> = {},
): NavigationEdge => ({
  id,
  startNodeId,
  endNodeId,
  distance: 40,
  bidirectional: true,
  accessible: true,
  type: "hallway",
  color: "#2563eb",
  width: 3,
  ...overrides,
});

function node(id: string, x: number, y: number, refs: Partial<NavigationNode> = {}): NavigationNode {
  return {
    id,
    name: id,
    type: "hallway",
    x,
    y,
    buildingId: "b1",
    floorId: "f1",
    accessible: true,
    color: "#2563eb",
    ...refs,
  };
}

function makeCampus(overrides: Partial<Campus> = {}): Campus {
  const rooms: FloorRoom[] = [
    { id: "room-a", name: "Room A", type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1", accessDoorId: "door-a" },
    { id: "room-b", name: "Room B", type: "classroom", x: 360, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1", accessDoorId: "door-b" },
    { id: "room-incomplete", name: "Room Incomplete", type: "classroom", x: 500, y: 20, w: 60, h: 40, floorId: "f1", buildingId: "b1" },
  ];
  const doors: FloorDoor[] = [
    { id: "door-a", x: 80, y: 40, width: 12, direction: "left", color: "#d97706", wallId: "wall-a", offset: 0.5 },
    { id: "door-b", x: 360, y: 40, width: 12, direction: "right", color: "#d97706", wallId: "wall-b", offset: 0.5 },
  ];
  const walls: FloorWall[] = [
    { id: "wall-a", x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: "room-a", edge: "right", offset: 0.5 } },
    { id: "wall-b", x1: 360, y1: 20, x2: 360, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: "room-b", edge: "left", offset: 0.5 } },
  ];
  const floor: FloorPlan = {
    id: "f1", buildingId: "b1", number: 1, label: "Floor 1", rooms, doors, walls,
    paths: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
  };
  const nodes: NavigationNode[] = [
    node("room-node-a", 50, 30, { type: "room_access", roomId: "room-a", name: "Room A" }),
    node("door-node-a", 80, 40, { doorId: "door-a", name: "Door A" }),
    node("wp-a", 120, 40, { name: "Walking Point A" }),
    node("wp-b", 320, 40, { name: "Walking Point B" }),
    node("door-node-b", 360, 40, { doorId: "door-b", name: "Door B" }),
    node("room-node-b", 390, 30, { type: "room_access", roomId: "room-b", name: "Room B" }),
  ];
  return {
    id: "campus-1",
    name: "Campus",
    buildings: [{ id: "b1", name: "Building", code: "B1", category: "academic", description: "", x: 0, y: 0, width: 600, height: 200, color: "#ddd", floors: [floor] }],
    navNodes: nodes,
    navEdges: [
      edge("door-a-wp-a", "door-node-a", "wp-a", { distance: 40 }),
      edge("wp-a-wp-b", "wp-a", "wp-b", { distance: 200 }),
      edge("wp-b-door-b", "wp-b", "door-node-b", { distance: 40 }),
    ],
    ...overrides,
  } as Campus;
}

describe("Admin Test Route Room → Door → Walking Network resolution", () => {
  it("mounts the panel without an undefined map-pick state", () => {
    render(createElement(TestNavigationPanel, {
      campus: makeCampus(),
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
    }));
    expect(screen.getByText("Test Route")).toBeTruthy();
    expect(screen.getAllByPlaceholderText(/Search\/select location/)).toHaveLength(2);
  });

  it("updates picker results live and reveals the matching hierarchy", async () => {
    render(createElement(TestNavigationPanel, {
      campus: makeCampus(),
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
    }));
    const startPicker = screen.getAllByPlaceholderText(/Search\/select location/)[0];
    fireEvent.focus(startPicker);
    fireEvent.change(startPicker, { target: { value: "Room B" } });
    await waitFor(() => expect(screen.getByText("Room B (Floor 1)")).toBeTruthy());
    const building = screen.getAllByTestId("route-picker-building-group")[0] as HTMLDetailsElement;
    const floor = screen.getAllByTestId("route-picker-floor-group")[0] as HTMLDetailsElement;
    expect(building.open).toBe(true);
    expect(floor.open).toBe(true);
  });

  it("consumes an explicit map-pick result into the matching endpoint", async () => {
    const consumed = vi.fn();
    render(createElement(TestNavigationPanel, {
      campus: makeCampus(),
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
      mapPickResult: { kind: "start", value: "node:door-node-a" },
      onMapPickResultConsumed: consumed,
    }));
    await waitFor(() => expect(screen.getByText("Room A Door")).toBeTruthy());
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("lists only ready Rooms with human-readable names and resolves through their Room node", () => {
    const campus = makeCampus();
    const edges = buildTestRouteEdges(campus);
    const starts = buildStartOptions(campus, edges);
    const destinations = buildDestinationOptions(campus, edges);

    expect(starts.filter((option) => option.value.startsWith("room:")).map((option) => option.label)).toEqual([
      "Room A (Floor 1)",
      "Room B (Floor 1)",
    ]);
    expect(destinations.filter((option) => option.value.startsWith("room:")).map((option) => option.label)).toEqual([
      "Room A (Floor 1)",
      "Room B (Floor 1)",
    ]);
    expect(resolveNodeId("room:b1:room-a", campus, edges)).toBe("room-node-a");
    expect(resolveNodeId("room:b1:room-incomplete", campus, edges)).toBeNull();
    expect(edges.filter((candidate) => candidate.type === ROOM_DOOR_EDGE_TYPE)).toHaveLength(2);
  });

  it("resolves a semantic Building through the best connected eligible Entrance", () => {
    const main: CampusEntrance = { id: "entrance-main", buildingId: "b1", edge: "bottom", offset: 0.4, type: "general", isPrimary: true };
    const service: CampusEntrance = { id: "entrance-service", buildingId: "b1", edge: "top", offset: 0.6, type: "service" };
    const campus = makeCampus({
      buildings: [{ ...makeCampus().buildings[0], entrances: [main, service] }],
      navNodes: [
        ...(makeCampus().navNodes ?? []),
        node("entrance-main-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: main.id, name: "Main Entrance" }),
        node("entrance-service-node", 500, 0, { buildingId: "b1", floorId: undefined, entranceId: service.id, name: "Service Entrance" }),
      ],
      navEdges: [
        ...makeCampus().navEdges,
        edge("main-outdoor", "entrance-main-node", "wp-a"),
        edge("service-outdoor", "entrance-service-node", "wp-b"),
      ],
    });
    const edges = buildTestRouteEdges(campus);
    expect(resolveBuildingEntranceNodeId(campus, campus.buildings[0], edges)).toBe("entrance-main-node");
    expect(buildDestinationOptions(campus, edges).find((option) => option.value === "building:b1")?.nodeHint).toBe("entrance-main-node");
  });

  it("resolves a Building through an accessible Entrance when the primary Entrance is inaccessible", () => {
    const main: CampusEntrance = { id: "entrance-main", buildingId: "b1", edge: "bottom", offset: 0.4, type: "general", isPrimary: true, accessible: false };
    const accessible: CampusEntrance = { id: "entrance-accessible", buildingId: "b1", edge: "top", offset: 0.6, type: "general", accessible: true };
    const campus = makeCampus({
      buildings: [{ ...makeCampus().buildings[0], entrances: [main, accessible] }],
      navNodes: [
        ...(makeCampus().navNodes ?? []),
        node("entrance-main-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: main.id, accessible: false, name: "Main Entrance" }),
        node("entrance-accessible-node", 500, 0, { buildingId: "b1", floorId: undefined, entranceId: accessible.id, accessible: true, name: "Accessible Entrance" }),
      ],
      navEdges: [
        ...makeCampus().navEdges,
        edge("main-outdoor", "entrance-main-node", "wp-a"),
        edge("accessible-outdoor", "entrance-accessible-node", "wp-b"),
      ],
    });
    const edges = buildTestRouteEdges(campus);
    expect(resolveBuildingEntranceNodeId(campus, campus.buildings[0], edges, true)).toBe("entrance-accessible-node");
    expect(resolveNodeId("building:b1", campus, edges, true)).toBe("entrance-accessible-node");
  });

  it("skips an accessible-labeled Entrance whose outgoing edge is inaccessible", () => {
    const primary: CampusEntrance = { id: "entrance-primary", buildingId: "b1", edge: "bottom", offset: 0.4, type: "general", isPrimary: true, accessible: true };
    const alternate: CampusEntrance = { id: "entrance-alternate", buildingId: "b1", edge: "top", offset: 0.6, type: "general", accessible: true };
    const campus = makeCampus({
      buildings: [{ ...makeCampus().buildings[0], entrances: [primary, alternate] }],
      navNodes: [
        ...(makeCampus().navNodes ?? []),
        node("entrance-primary-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: primary.id, accessible: true, name: "Primary Entrance" }),
        node("entrance-alternate-node", 500, 0, { buildingId: "b1", floorId: undefined, entranceId: alternate.id, accessible: true, name: "Accessible Entrance" }),
      ],
      navEdges: [
        ...(makeCampus().navEdges ?? []),
        edge("primary-inaccessible", "entrance-primary-node", "wp-a", { accessible: false }),
        edge("alternate-accessible", "entrance-alternate-node", "wp-b", { accessible: true }),
      ],
    });
    const edges = buildTestRouteEdges(campus);
    expect(resolveBuildingEntranceNodeId(campus, campus.buildings[0], edges, true)).toBe("entrance-alternate-node");
    expect(resolveNodeId("building:b1", campus, edges, true)).toBe("entrance-alternate-node");
  });

  it("chooses an accessible Door when a Room has multiple linked Doors", () => {
    const base = makeCampus();
    const room = { ...base.buildings[0].floors[0].rooms[0], accessDoorId: "door-a", accessDoorIds: ["door-a-accessible"] };
    const accessibleDoor: FloorDoor = { id: "door-a-accessible", x: 80, y: 45, width: 12, direction: "left", color: "#16a34a", wallId: "wall-a", offset: 0.6 };
    const floor = { ...base.buildings[0].floors[0], rooms: [room, ...base.buildings[0].floors[0].rooms.slice(1)], doors: [...base.buildings[0].floors[0].doors, accessibleDoor] };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [floor] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("door-a-accessible-node", 80, 45, { doorId: "door-a-accessible", accessible: true, name: "Accessible Door" }),
      ],
      navEdges: [
        ...(base.navEdges ?? []).map((candidate) => candidate.id === "door-a-wp-a" ? { ...candidate, accessible: false } : candidate),
        edge("accessible-door-wp-a", "door-a-accessible-node", "wp-a", { accessible: true }),
      ],
    });
    const routeEdges = buildTestRouteEdges(campus);
    expect(roomRouteInfo(campus, "b1", "room-a", routeEdges, false, true)?.door.id).toBe("door-a-accessible");
    expect(resolveNodeId("room:b1:room-a", campus, routeEdges, true)).toBe("room-node-a");
  });

  it("keeps a selected but unroutable Building endpoint and reports Building readiness", async () => {
    const campus = makeCampus();
    render(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
    }));
    const inputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(inputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(inputs[1]);
    fireEvent.click(screen.getByText("Building"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByText("Building has no routable Entrance.")).toBeTruthy());
    expect(screen.queryByText("Select a destination.")).toBeNull();
  });

  it("routes Room A → Room B and back on the same floor through both Doors", () => {
    const campus = makeCampus();
    const edges = buildTestRouteEdges(campus);
    const nodes = campus.navNodes ?? [];
    const forward = findNavigationRoute(nodes, edges, "room-node-a", "room-node-b");
    const reverse = findNavigationRoute(nodes, edges, "room-node-b", "room-node-a");

    expect(forward?.nodeIds).toEqual(["room-node-a", "door-node-a", "wp-a", "wp-b", "door-node-b", "room-node-b"]);
    expect(reverse?.nodeIds).toEqual(["room-node-b", "door-node-b", "wp-b", "wp-a", "door-node-a", "room-node-a"]);
    expect(forward?.nodeIds.every((id) => nodes.find((candidate) => candidate.id === id)?.floorId === "f1")).toBe(true);
  });

  it("routes Room endpoints across Floors through the canonical Stair transition", () => {
    const floor = (floorId: string, roomId: string, doorId: string, wallId: string, stairId: string, number: number, label: string): FloorPlan => ({
      id: floorId,
      buildingId: "b1",
      number,
      label,
      rooms: [{ id: roomId, name: `Room ${number}01`, type: "classroom", x: 20, y: 20, w: 60, h: 40, floorId, buildingId: "b1", accessDoorId: doorId }],
      doors: [{ id: doorId, x: 80, y: 40, width: 12, direction: "left", color: "#d97706", wallId, offset: 0.5 }],
      walls: [{ id: wallId, x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId, edge: "right", offset: 0.5 } }],
      stairs: [{ id: stairId, x: 180, y: 32, width: 20, height: 16, direction: "both", label: "Stairs", sharedId: "shared-stair-b1" }],
      paths: [], windows: [], furniture: [], ramps: [], elevators: [], labels: [],
    });
    const floor1 = floor("f1", "room-f1", "door-f1", "wall-f1", "stair-f1", 1, "Ground Floor");
    const floor2 = floor("f2", "room-f2", "door-f2", "wall-f2", "stair-f2", 2, "Floor 2");
    const nodes: NavigationNode[] = [
      node("room-node-f1", 50, 30, { roomId: "room-f1", type: "room_access", floorId: "f1" }),
      node("door-node-f1", 80, 40, { doorId: "door-f1", floorId: "f1" }),
      node("stair-node-f1", 190, 40, { stairId: "stair-f1", type: "stair", floorId: "f1", accessible: false }),
      node("room-node-f2", 50, 30, { roomId: "room-f2", type: "room_access", floorId: "f2" }),
      node("door-node-f2", 80, 40, { doorId: "door-f2", floorId: "f2" }),
      node("stair-node-f2", 190, 40, { stairId: "stair-f2", type: "stair", floorId: "f2", accessible: false }),
    ];
    const campus = makeCampus({
      buildings: [{ ...makeCampus().buildings[0], floors: [floor1, floor2] }],
      navNodes: nodes,
      navEdges: [
        edge("door-f1-stair", "door-node-f1", "stair-node-f1"),
        edge("door-f2-stair", "door-node-f2", "stair-node-f2"),
      ],
    });
    const routeEdges = buildTestRouteEdges(campus);
    const from = resolveNodeId("room:b1:room-f1", campus, routeEdges);
    const to = resolveNodeId("room:b1:room-f2", campus, routeEdges);
    expect(from).toBe("room-node-f1");
    expect(to).toBe("room-node-f2");
    expect(findNavigationRoute(nodes, routeEdges, from!, to!)?.nodeIds).toEqual([
      "room-node-f1", "door-node-f1", "stair-node-f1", "stair-node-f2", "door-node-f2", "room-node-f2",
    ]);
  });

  it("does not bypass a disconnected or one-way Door connection", () => {
    const disconnected = makeCampus({
      navEdges: [
        edge("door-a-wp-a", "door-node-a", "wp-a"),
        edge("wp-a-wp-b", "wp-a", "wp-b"),
        edge("wp-b-door-b", "wp-b", "door-node-b", { closed: true }),
      ],
    });
    const disconnectedEdges = buildTestRouteEdges(disconnected);
    expect(findNavigationRoute(disconnected.navNodes ?? [], disconnectedEdges, "room-node-a", "room-node-b")).toBeNull();
    expect(buildDestinationOptions(disconnected, disconnectedEdges).some((option) => option.value === "room:b1:room-b")).toBe(false);

    const oneWay = makeCampus({
      navEdges: [
        edge("door-a-wp-a", "door-node-a", "wp-a", { bidirectional: false }),
        edge("wp-a-wp-b", "wp-a", "wp-b"),
        edge("wp-b-door-b", "wp-b", "door-node-b"),
      ],
    });
    const oneWayEdges = buildTestRouteEdges(oneWay);
    expect(findNavigationRoute(oneWay.navNodes ?? [], oneWayEdges, "room-node-a", "room-node-b")).not.toBeNull();
    expect(findNavigationRoute(oneWay.navNodes ?? [], oneWayEdges, "room-node-b", "room-node-a")).toBeNull();
  });

  it("removes a walking edge that is blocked by the current floor wall geometry", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1", name: "Building", code: "B1", category: "academic", description: "", x: 0, y: 0, width: 600, height: 200, color: "#ddd",
        floors: [{
          ...makeCampus().buildings[0].floors[0],
          walls: [
            ...makeCampus().buildings[0].floors[0].walls,
            { id: "blocking-wall", x1: 200, y1: 0, x2: 200, y2: 80, thickness: 6, color: "#64748b" },
          ],
        }],
      }],
    });
    const routeEdges = buildTestRouteEdges(campus);
    expect(routeEdges.some((candidate) => candidate.id === "wp-a-wp-b")).toBe(false);
    expect(findNavigationRoute(campus.navNodes ?? [], routeEdges, "room-node-a", "room-node-b")).toBeNull();
  });

  it("filters outdoor walking edges through Building footprints but preserves Entrance transitions", () => {
    const base = makeCampus();
    const outdoorBuilding = {
      ...base.buildings[0],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      floors: [],
    };
    const outdoorNodes = [
      node("out-start", -40, 50, { floorId: undefined, buildingId: undefined, type: "outdoor" }),
      node("out-end", 140, 50, { floorId: undefined, buildingId: undefined, type: "outdoor" }),
    ];
    const campus = makeCampus({
      buildings: [outdoorBuilding],
      navNodes: outdoorNodes,
      navEdges: [edge("out-blocked", "out-start", "out-end")],
    });
    expect(buildTestRouteEdges(campus).some((candidate) => candidate.id === "out-blocked")).toBe(false);

    const entranceCampus = {
      ...campus,
      navEdges: [edge("out-entrance", "out-start", "out-end", { type: "entrance_transition" })],
    };
    expect(buildTestRouteEdges(entranceCampus).some((candidate) => candidate.id === "out-entrance")).toBe(true);
  });

  it("keeps locally connected Rooms ready when only a downstream corridor is blocked", () => {
    const campus = makeCampus({
      buildings: [{
        ...makeCampus().buildings[0],
        floors: [{
          ...makeCampus().buildings[0].floors[0],
          walls: [
            ...makeCampus().buildings[0].floors[0].walls,
            { id: "blocking-wall", x1: 200, y1: 0, x2: 200, y2: 80, thickness: 6, color: "#64748b" },
          ],
        }],
      }],
    });
    const routeEdges = buildTestRouteEdges(campus);
    expect(buildStartOptions(campus, routeEdges).filter((option) => option.kind === "room").map((option) => option.label)).toEqual([
      "Room A (Floor 1)",
      "Room B (Floor 1)",
    ]);
  });

  it("reports No route for ready same-floor Rooms when a Wall blocks the network", async () => {
    const campus = makeCampus({
      buildings: [{
        ...makeCampus().buildings[0],
        floors: [{
          ...makeCampus().buildings[0].floors[0],
          walls: [
            ...makeCampus().buildings[0].floors[0].walls,
            { id: "blocking-wall", x1: 200, y1: 0, x2: 200, y2: 80, thickness: 6, color: "#64748b" },
          ],
        }],
      }],
    });
    render(createElement(TestNavigationPanel, { campus, onHighlightRoute: vi.fn(), onFocusNode: vi.fn() }));
    fireEvent.focus(screen.getAllByPlaceholderText(/Search\/select location/)[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(screen.getByPlaceholderText(/Search\/select location/));
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());
    expect(screen.getByText("No Route")).toBeTruthy();
    expect(screen.getByText("Check paths, closures, direction, mode, or obstacles.")).toBeTruthy();
  });

  it("classifies ready-but-disconnected semantic endpoints as No Route", async () => {
    const campus = makeCampus({
      navEdges: [
        edge("door-a-wp-a", "door-node-a", "wp-a"),
        edge("wp-b-door-b", "wp-b", "door-node-b"),
      ],
    });
    render(createElement(TestNavigationPanel, { campus, onHighlightRoute: vi.fn(), onFocusNode: vi.fn() }));
    const inputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(inputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(inputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByText("No Route")).toBeTruthy());
    expect(screen.queryByText(/not ready for routing/)).toBeNull();
  });

  it("ignores legacy generic Room edges instead of restoring a direct Room shortcut", () => {
    const legacy = makeCampus({
      navEdges: [
        edge("legacy-room-a-wp-b", "room-node-a", "wp-b", { distance: 1 }),
        edge("wp-b-door-b", "wp-b", "door-node-b"),
      ],
    });
    const routeEdges = buildTestRouteEdges(legacy);
    expect(routeEdges.some((candidate) => candidate.id === "legacy-room-a-wp-b")).toBe(false);
    expect(findNavigationRoute(legacy.navNodes ?? [], routeEdges, "room-node-a", "room-node-b")).toBeNull();
  });

  it("reverses authored bend geometry when the route is traversed backwards", () => {
    const nodes = [node("a", 0, 0), node("b", 40, 40)];
    const routeEdge = {
      id: "bent",
      startNodeId: "a",
      endNodeId: "b",
      bidirectional: true,
      bendPoints: [{ x: 0, y: 20 }, { x: 40, y: 20 }],
    };
    expect(buildRoutePolyline(["a", "b"], [routeEdge], nodes)).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 },
    ]);
    expect(buildRoutePolyline(["b", "a"], [routeEdge], nodes)).toEqual([
      { x: 40, y: 40 }, { x: 40, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 },
    ]);
  });

  it("removes an immediate stale bend out-and-back from the display polyline", () => {
    const nodes = [node("a", 0, 0), node("b", 40, 0)];
    const routeEdge = {
      id: "stale-bends",
      startNodeId: "a",
      endNodeId: "b",
      bidirectional: true,
      bendPoints: [{ x: 0, y: 20 }, { x: 0, y: 0 }, { x: 0, y: 20 }],
    };
    expect(buildRoutePolyline(["a", "b"], [routeEdge], nodes)).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 0 },
    ]);
  });

  it("drops endpoint-like bends left behind after a waypoint moves", () => {
    const nodes = [node("a", 0, 0), node("b", 80, 0)];
    const routeEdge = {
      id: "moved-endpoint",
      startNodeId: "a",
      endNodeId: "b",
      bidirectional: true,
      // A stale endpoint-like bend may remain after an endpoint moves.
      bendPoints: [{ x: 80, y: 0 }, { x: 40, y: 20 }],
    };
    expect(buildRoutePolyline(["a", "b"], [routeEdge], nodes)).toEqual([
      { x: 0, y: 0 }, { x: 40, y: 20 }, { x: 80, y: 0 },
    ]);
  });

  it("uses the shortest current geometry when legacy duplicate edges share a pair", () => {
    const nodes = [node("a", 0, 0), node("b", 80, 0)];
    const long = { id: "legacy-long", startNodeId: "a", endNodeId: "b", bidirectional: true, bendPoints: [{ x: 0, y: 80 }, { x: 80, y: 80 }] };
    const short = { id: "canonical-short", startNodeId: "a", endNodeId: "b", bidirectional: true };
    expect(buildRoutePolyline(["a", "b"], [long, short], nodes)).toEqual([
      { x: 0, y: 0 }, { x: 80, y: 0 },
    ]);
  });

  it("presents Room routes from linked Door anchors while retaining semantic identities", () => {
    const campus = makeCampus();
    const edges = buildTestRouteEdges(campus);
    const physical = buildPhysicalRoutePolyline(
      ["room-node-a", "door-node-a", "wp-a", "wp-b", "door-node-b", "room-node-b"],
      campus,
      edges,
      campus.navNodes ?? [],
    );
    expect(physical[0]).toEqual({ x: 80, y: 40 });
    expect(physical[physical.length - 1]).toEqual({ x: 360, y: 40 });
    expect(semanticDoorDisplayName(campus, campus.navNodes!.find((node) => node.id === "door-node-a")!)).toBe("Room A Door");
  });

  it("recalculates a calculated route after canonical edge edits", async () => {
    const onHighlight = vi.fn();
    const campus = makeCampus();
    const view = render(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: onHighlight,
      onFocusNode: vi.fn(),
    }));
    fireEvent.focus(screen.getAllByPlaceholderText(/Search\/select location/)[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(screen.getByPlaceholderText(/Search\/select location/));
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ waypoints: expect.any(Array) })));

    const broken = makeCampus({ navEdges: campus.navEdges!.map((edge) => edge.id === "wp-b-door-b" ? { ...edge, closed: true } : edge) });
    expect(roomRouteInfo(broken, "b1", "room-b", buildTestRouteEdges(broken), true)).not.toBeNull();
    view.rerender(createElement(TestNavigationPanel, {
      campus: broken,
      onHighlightRoute: onHighlight,
      onFocusNode: vi.fn(),
    }));
    await waitFor(() => expect(screen.getByText("No Route")).toBeTruthy());
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("collapses a calculated route to a fixed compact monitor", async () => {
    const campus = makeCampus();
    const view = render(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
      inspectorVisible: false,
    }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());
    expect(screen.getByTestId("test-route-compact").getAttribute("data-layout")).toBe("horizontal-monitor");
    expect(screen.getByRole("button", { name: "Clear route" })).toBeTruthy();

    view.rerender(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
      inspectorVisible: true,
    }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Expand Test Route" }));
    expect(screen.getByTestId("test-route-full")).toBeTruthy();
  });

  it("keeps Route Preview inside the active session and clears it with the route", async () => {
    const campus = makeCampus();
    render(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
    }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());

    const previewToggle = screen.getByTestId("test-route-compact-preview-toggle");
    fireEvent.click(previewToggle);
    expect(previewToggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Expand Test Route" }));
    expect(screen.getByTestId("test-route-preview-toggle").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear", exact: true }));
    await waitFor(() => expect(screen.getByTestId("test-route-preview-toggle")).toBeTruthy());
    expect((screen.getByTestId("test-route-preview-toggle") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps both semantic endpoints visible and switches an active route mode inline", async () => {
    const onHighlight = vi.fn();
    const campus = makeCampus();
    render(createElement(TestNavigationPanel, {
      campus,
      onHighlightRoute: onHighlight,
      onFocusNode: vi.fn(),
    }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());

    expect(screen.getByTestId("test-route-start-summary").textContent).toBe("Room A");
    expect(screen.getByTestId("test-route-destination-summary").textContent).toBe("Room B");
    expect(screen.getByTestId("test-route-start-summary").getAttribute("title")).toContain("Room A");
    expect(screen.getByTestId("test-route-destination-summary").getAttribute("title")).toContain("Room B");

    fireEvent.click(screen.getByRole("button", { name: "Use Accessible route mode" }));
    await waitFor(() => expect(onHighlight).toHaveBeenLastCalledWith(expect.objectContaining({ color: "#2563eb" })));
    expect(screen.getByRole("button", { name: "Use Accessible route mode" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Use Emergency route mode" }));
    await waitFor(() => expect(screen.getByText("No emergency route available.")).toBeTruthy());
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("shows a draftable Standard-only preference and resets it when leaving Standard", async () => {
    render(createElement(TestNavigationPanel, {
      campus: makeCampus(),
      onHighlightRoute: vi.fn(),
      onFocusNode: vi.fn(),
    }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));

    const preferenceTrigger = screen.getByTestId("test-route-preference-trigger");
    expect(preferenceTrigger).toHaveTextContent("Best Route");
    fireEvent.click(preferenceTrigger);
    fireEvent.click(screen.getByRole("radio", { name: /Prefer Elevator/i }));
    // Selecting a draft does not affect the applied control until Apply.
    expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Best Route");
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Best Route");
    fireEvent.click(screen.getByTestId("test-route-preference-trigger"));
    fireEvent.click(screen.getByRole("radio", { name: /Prefer Elevator/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Prefer Elevator");

    fireEvent.click(screen.getByRole("button", { name: "Accessible", exact: true }));
    expect(screen.queryByTestId("test-route-preference-trigger")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Standard", exact: true }));
    expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Best Route");

    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());
    fireEvent.click(screen.getByTestId("test-route-preference-trigger"));
    fireEvent.click(screen.getByRole("radio", { name: /Prefer Stairs/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    await waitFor(() => expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Prefer Stairs"));
    expect(screen.getByTestId("test-route-compact")).toBeTruthy();
    fireEvent.click(screen.getByTestId("test-route-reverse"));
    await waitFor(() => expect(screen.getByTestId("test-route-start-summary").textContent).toContain("Room B"));
    fireEvent.click(screen.getByRole("button", { name: "Expand Test Route" }));
    expect(screen.getByTestId("test-route-preference-trigger")).toHaveTextContent("Prefer Stairs");
  });

  it("keeps a mode-specific No Route result compact and recovers when switched back", async () => {
    const campus = makeCampus({ navEdges: makeCampus().navEdges!.map((candidate) => ({ ...candidate, accessible: false })) });
    render(createElement(TestNavigationPanel, { campus, onHighlightRoute: vi.fn(), onFocusNode: vi.fn() }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Use Accessible route mode" }));
    await waitFor(() => expect(screen.getByText("No Accessible Route")).toBeTruthy());
    expect(screen.getByTestId("test-route-compact")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use Standard route mode" }));
    await waitFor(() => expect(screen.getByText("Route Found")).toBeTruthy());
    expect(screen.getByTestId("test-route-compact")).toBeTruthy();
  });

  it("uses deterministic semantic labels for the compact HUD without ellipsis", () => {
    expect(compactRouteLocationLabel({ label: "Room 101 (Floor 2)", kind: "room" }, "Start")).toBe("Room 101");
    expect(compactRouteLocationLabel({ label: "Engineering Laboratory", kind: "room" }, "Start")).toBe("Engineering Lab");
    expect(compactRouteLocationLabel({ label: "Computer Laboratory 2", kind: "room" }, "Start")).toBe("Computer Lab 2");
    expect(compactRouteLocationLabel({ label: "Registrar Office", kind: "room" }, "Start")).toBe("Registrar");
    expect(compactRouteLocationLabel({ label: "TES89 Main Entrance", kind: "entrance" }, "Start")).toBe("Main Entrance");
    expect(compactRouteLocationLabel({ label: "A very long room name...", kind: "room" }, "Start")).toBe("A very long room name");
  });

  it("creates a clickable context transition marker without changing the canonical route", () => {
    const campus = makeCampus({
      navNodes: [
        node("outdoor", 10, 10, { buildingId: undefined, floorId: undefined, type: "outdoor", name: "Main Entrance" }),
        ...makeCampus().navNodes!,
      ],
      navEdges: [
        edge("outdoor-entrance", "outdoor", "door-node-a", { type: "entrance_transition" }),
        ...makeCampus().navEdges,
      ],
    });
    const markers = routeTransitionMarkers(["outdoor", "door-node-a"], campus, { kind: "outdoor" });
    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe("entrance");
    expect(markers[0].targetContext).toEqual({ kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(campus.navEdges).toHaveLength(4);
  });

  it("labels a Stair transition marker with the destination Floor", () => {
    const base = makeCampus();
    const floor2: FloorPlan = {
      ...base.buildings[0].floors[0], id: "f2", number: 2, label: "Floor 2",
      rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [],
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [base.buildings[0].floors[0], floor2] }],
      navNodes: [
        node("stair-f1", 40, 40, { type: "stair", stairId: "s1", name: "Stairs" }),
        node("stair-f2", 40, 40, { type: "stair", stairId: "s2", floorId: "f2", name: "Stairs" }),
        node("floor2-walk", 80, 40, { floorId: "f2", name: "Floor 2 walkway" }),
      ],
      navEdges: [
        edge("stair-transition", "stair-f1", "stair-f2", { type: "floor_transition" }),
        edge("floor2-walk-edge", "stair-f2", "floor2-walk"),
      ],
    });
    const markers = routeTransitionMarkers(["stair-f1", "stair-f2", "floor2-walk"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: "stair", targetLabel: "Floor 2", direction: "up" });
  });

  it("marks a Stair transition that begins at Start for secondary cue styling", () => {
    render(createElement("svg", null, createElement(RouteTransitionMarker, {
      marker: {
        id: "stair-start-transition",
        x: 40,
        y: 40,
        kind: "stair",
        context: { kind: "floor", buildingId: "b1", floorId: "f1" },
        targetContext: { kind: "floor", buildingId: "b1", floorId: "f2" },
        targetLabel: "Floor 2",
        direction: "up",
        endpointRole: "start",
      },
    })));
    const marker = screen.getByTestId("test-route-transition-marker");
    expect(marker).toHaveAttribute("data-transition-endpoint-role", "start");
    expect(marker).toHaveAttribute("data-transition-label-mode", "hover-focus");
    expect(document.querySelector("circle.animate-pulse")).toHaveAttribute("r", "13");
    expect(screen.getByTestId("transition-label-pill").querySelector("rect")).toHaveAttribute("x", "18");
  });

  it("uses the destination pin, not a transition marker, when Stair or Elevator is terminal", () => {
    const base = makeCampus();
    const floor2: FloorPlan = {
      ...base.buildings[0].floors[0], id: "f2", number: 2, label: "Floor 2",
      rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [],
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [base.buildings[0].floors[0], floor2] }],
      navNodes: [
        node("start", 20, 40),
        node("terminal-stair", 40, 40, { type: "stair", stairId: "s1", floorId: "f2" }),
        node("terminal-elevator", 60, 40, { type: "elevator", elevatorId: "e1", floorId: "f2" }),
      ],
      navEdges: [
        edge("to-stair", "start", "terminal-stair", { type: "floor_transition" }),
        edge("to-elevator", "start", "terminal-elevator", { type: "floor_transition" }),
      ],
    });
    const stairMarkers = routeTransitionMarkers(["start", "terminal-stair"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(stairMarkers).toHaveLength(1);
    expect(stairMarkers[0]).toMatchObject({ kind: "stair", targetLabel: "Floor 2", direction: "up" });
    const elevatorMarkers = routeTransitionMarkers(["start", "terminal-elevator"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(elevatorMarkers).toHaveLength(1);
    expect(elevatorMarkers[0]).toMatchObject({ kind: "elevator", targetLabel: "Floor 2", direction: "up" });
  });

  it("labels Elevator transitions using ordered floor direction", () => {
    const base = makeCampus();
    const floor2: FloorPlan = {
      ...base.buildings[0].floors[0], id: "f2", number: 2, label: "Second Floor",
      rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [],
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [base.buildings[0].floors[0], floor2] }],
      navNodes: [
        node("elevator-f1", 40, 40, { type: "elevator", elevatorId: "e1" }),
        node("elevator-f2", 40, 40, { type: "elevator", elevatorId: "e2", floorId: "f2" }),
        node("floor2-destination", 80, 40, { floorId: "f2" }),
      ],
      navEdges: [
        edge("elevator-transition", "elevator-f1", "elevator-f2", { type: "floor_transition" }),
        edge("floor2-local", "elevator-f2", "floor2-destination"),
      ],
    });
    const up = routeTransitionMarkers(["elevator-f1", "elevator-f2", "floor2-destination"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(up).toHaveLength(1);
    expect(up[0]).toMatchObject({ kind: "elevator", targetLabel: "Second Floor", direction: "up" });
    const down = routeTransitionMarkers(["elevator-f1", "elevator-f2", "floor2-destination"], campus, { kind: "floor", buildingId: "b1", floorId: "f2" });
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ kind: "elevator", targetLabel: "Floor 1", direction: "down" });
    expect(routeTransitionMethod(campus, ["elevator-f1", "elevator-f2", "floor2-destination"])).toBe("Elevator");
  });

  it("keeps Elevator transition targets on the actual route node and supports skipped floors", () => {
    const base = makeCampus();
    const floors = [1, 2, 3, 4].map((number) => ({
      ...base.buildings[0].floors[0],
      id: `f${number}`,
      number,
      label: number === 1 ? "Ground Floor" : `Floor ${number}`,
      rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [],
    }));
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors }],
      navNodes: [
        node("elevator-f1", 40, 40, { type: "elevator", elevatorId: "e1", floorId: "f1" }),
        node("elevator-f4", 40, 40, { type: "elevator", elevatorId: "e1", floorId: "f4" }),
      ],
      navEdges: [edge("elevator-direct", "elevator-f1", "elevator-f4", { type: "floor_transition" })],
    });
    const markers = routeTransitionMarkers(["elevator-f1", "elevator-f4"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: "elevator", targetLabel: "Floor 4", targetNodeId: "elevator-f4", direction: "up" });
  });

  it("presents an adjacent-stop Elevator route as one direct destination transition", () => {
    const base = makeCampus();
    const floors = [1, 2, 3, 4].map((number) => ({
      ...base.buildings[0].floors[0], id: `f${number}`, number,
      label: number === 1 ? "Ground Floor" : `Floor ${number}`,
      rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [],
    }));
    const elevatorNode = (floorNumber: number) => node(`elevator-f${floorNumber}`, 40, 40, {
      type: "elevator", elevatorId: `e${floorNumber}`, floorId: `f${floorNumber}`, transitionSharedId: "lift-main",
    });
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors }],
      navNodes: [elevatorNode(1), elevatorNode(2), elevatorNode(3), elevatorNode(4)],
      navEdges: [
        edge("lift-1-2", "elevator-f1", "elevator-f2", { type: "floor_transition" }),
        edge("lift-2-3", "elevator-f2", "elevator-f3", { type: "floor_transition" }),
        edge("lift-3-4", "elevator-f3", "elevator-f4", { type: "floor_transition" }),
      ],
    });
    const markers = routeTransitionMarkers(["elevator-f1", "elevator-f2", "elevator-f3", "elevator-f4"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" }, "node:elevator-f4");
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: "elevator", targetLabel: "Floor 4", targetNodeId: "elevator-f4", direction: "up" });
  });

  it("describes Indoor/Outdoor entrance transitions with actionable context", () => {
    const base = makeCampus({ buildings: [{ ...makeCampus().buildings[0], name: "Building 3" }] });
    const campus = makeCampus({
      buildings: base.buildings,
      navNodes: [
        node("floor-door", 20, 40, { floorId: "f1", doorId: "door-a" }),
        node("outdoor-entrance", 20, 0, { floorId: undefined, buildingId: "b1", entranceId: "ent-main", type: "entrance" }),
      ],
      navEdges: [edge("entrance-bridge", "floor-door", "outdoor-entrance", { type: "entrance_transition" })],
    });
    const markers = routeTransitionMarkers(["floor-door", "outdoor-entrance"], campus, { kind: "floor", buildingId: "b1", floorId: "f1" }, "node:outdoor-entrance");
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: "entrance", instruction: "Exit Building 3", targetNodeId: "outdoor-entrance" });
  });

  it("does not require cross-floor Elevator membership for a local endpoint", () => {
    const base = makeCampus();
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [
        { ...base.buildings[0].floors[0], elevators: [{ id: "e1", x: 200, y: 40, width: 40, height: 40, doorWidth: 20, label: "Elevator 1" } as any] },
        { ...base.buildings[0].floors[0], id: "f2", number: 2, label: "Floor 2", rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [] },
      ] }],
      navNodes: [node("local-elevator", 200, 40, { type: "elevator", elevatorId: "e1", floorId: "f1" }), node("local-walk", 240, 40)],
      navEdges: [edge("elevator-local", "local-elevator", "local-walk")],
    });
    expect(endpointReadinessMessage("node:local-elevator", campus, campus.navEdges ?? [], "starting")).toBeNull();
  });

  it("does not require cross-floor Stair membership for a local endpoint", () => {
    const base = makeCampus();
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], floors: [
        {
          ...base.buildings[0].floors[0],
          stairs: [{ id: "s1", x: 200, y: 30, width: 24, height: 32, rotation: 0, direction: "up", label: "Stair" } as any],
        },
        { ...base.buildings[0].floors[0], id: "f2", number: 2, label: "Floor 2", rooms: [], doors: [], walls: [], stairs: [], ramps: [], elevators: [], paths: [] },
      ] }],
      navNodes: [
        node("local-stair", 212, 46, { type: "stair", stairId: "s1", accessible: false }),
        node("local-walk", 250, 46),
      ],
      navEdges: [edge("stair-local", "local-stair", "local-walk", { accessible: false })],
    });
    expect(endpointReadinessMessage("node:local-stair", campus, campus.navEdges ?? [], "starting")).toBeNull();
  });

  it("presents an active Elevator transition with a directional instruction and pulse", () => {
    render(createElement("svg", null, createElement(RouteTransitionMarker, {
      marker: {
        id: "elevator-transition",
        x: 40,
        y: 40,
        kind: "elevator",
        context: { kind: "floor", buildingId: "b1", floorId: "f1" },
        targetContext: { kind: "floor", buildingId: "b1", floorId: "f3" },
        targetLabel: "Floor 3",
        direction: "up",
      },
    })));
    expect(screen.getByTitle("Going up to Floor 3")).toBeTruthy();
    expect(screen.getByText("Going up to Floor 3")).toBeTruthy();
    expect(document.querySelector("circle.animate-pulse")).toBeTruthy();
  });

  it("sizes transition pills for readable short and long floor labels", () => {
    const short = transitionLabelLayout("Going up to Floor 3");
    const entrance = transitionLabelLayout("Exit Building 3", { anchor: "center", compact: true });
    const long = transitionLabelLayout("Going down to Upper Research and Administration Floor");
    expect(short.width).toBeGreaterThan(68);
    expect(entrance.width).toBeLessThan(112);
    expect(entrance.height).toBe(19);
    expect(short.lines.join(" ")).toBe("Going up to Floor 3");
    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.join(" ")).toBe("Going down to Upper Research and Administration Floor");
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.textX).toBeGreaterThan(long.iconX);
  });

  it("centers regular transition labels over the cue", () => {
    const centered = transitionLabelLayout("Exit Building 3", { anchor: "center", compact: true });
    expect(centered.x).toBeCloseTo(-centered.width / 2);
  });

  it("reverses the exact endpoints and recalculates an active route", async () => {
    const onHighlight = vi.fn();
    render(createElement(TestNavigationPanel, {
      campus: makeCampus(),
      onHighlightRoute: onHighlight,
      onFocusNode: vi.fn(),
    }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTestId("test-route-compact")).toBeTruthy());
    expect(screen.getByTestId("test-route-start-summary").textContent).toContain("Room A");
    expect(screen.getByTestId("test-route-destination-summary").textContent).toContain("Room B");

    fireEvent.click(screen.getByTestId("test-route-reverse"));
    await waitFor(() => expect(screen.getByTestId("test-route-start-summary").textContent).toContain("Room B"));
    expect(screen.getByTestId("test-route-destination-summary").textContent).toContain("Room A");
    expect(onHighlight).toHaveBeenLastCalledWith(expect.objectContaining({ waypoints: expect.any(Array) }));
  });

  it("leaves a terminal Building access point to the destination marker", () => {
    const campus = makeCampus({
      navNodes: [
        node("floor-start", 20, 40),
        node("building-access", 80, 40, { floorId: undefined, entranceId: "ent-main", name: "Main Access" }),
      ],
      navEdges: [edge("floor-to-access", "floor-start", "building-access", { type: "entrance_transition" })],
    });
    expect(routeTransitionMarkers(
      ["floor-start", "building-access"],
      campus,
      { kind: "floor", buildingId: "b1", floorId: "f1" },
      "building:b1",
    )).toMatchObject([{
      kind: "entrance",
      instruction: "Exit Building",
      targetNodeId: "building-access",
    }]);
  });

  it("validates and prefers a complete Emergency Exit chain for Emergency mode", () => {
    const base = makeCampus();
    const emergencyEntrance: CampusEntrance = {
      id: "ent-emergency", buildingId: "b1", edge: "right", offset: 0.5,
      type: "emergency_exit", name: "East Fire Exit",
    };
    const generalEntrance: CampusEntrance = {
      id: "ent-general", buildingId: "b1", edge: "bottom", offset: 0.2,
      type: "general", isPrimary: true, name: "Main Entrance",
    };
    const exitDoor: FloorDoor = {
      id: "door-emergency", x: 590, y: 100, width: 12, direction: "right",
      color: "#dc2626", isEmergencyExit: true,
    };
    const floor = { ...base.buildings[0].floors[0], doors: [...base.buildings[0].floors[0].doors, exitDoor] };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [generalEntrance, emergencyEntrance], floors: [floor] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-emergency-node", 600, 100, { buildingId: "b1", floorId: undefined, entranceId: emergencyEntrance.id, type: "entrance", name: "East Fire Exit" }),
        node("ent-general-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: generalEntrance.id, type: "entrance", name: "Main Entrance" }),
        node("door-emergency-node", 590, 100, { buildingId: "b1", floorId: "f1", doorId: exitDoor.id, type: "hallway", name: "East Fire Exit Door" }),
        node("wp-emergency", 560, 100, { buildingId: "b1", floorId: "f1", type: "hallway", name: "Emergency Exit Approach" }),
        node("outdoor-safe", 650, 100, { buildingId: undefined, floorId: undefined, type: "outdoor", name: "Outdoor" }),
      ],
      navEdges: [
        ...(base.navEdges ?? []),
        edge("emergency-outdoor", "ent-emergency-node", "outdoor-safe"),
        edge("emergency-bridge", "ent-emergency-node", "door-emergency-node", { type: "entrance_transition" }),
        edge("emergency-local", "door-emergency-node", "wp-emergency"),
        edge("general-outdoor", "ent-general-node", "outdoor-safe"),
      ],
    });
    const routeEdges = buildTestRouteEdges(campus);
    expect(emergencyExitReadiness(campus, campus.buildings[0], emergencyEntrance, routeEdges)).toMatchObject({ ready: true, doorId: exitDoor.id });
    expect(resolveBuildingEntranceNodeId(campus, campus.buildings[0], routeEdges, false, true)).toBe("ent-emergency-node");
  });

  it("falls back to General Access when no usable Emergency Exit exists", () => {
    const base = makeCampus();
    const generalEntrance: CampusEntrance = {
      id: "ent-general", buildingId: "b1", edge: "bottom", offset: 0.2,
      type: "general", isPrimary: true,
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [generalEntrance] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-general-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: generalEntrance.id, type: "entrance" }),
        node("outdoor-fallback", -40, 0, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
      ],
      navEdges: [...(base.navEdges ?? []), edge("general-outdoor", "ent-general-node", "outdoor-fallback")],
    });
    const routeEdges = buildTestRouteEdges(campus);
    expect(resolveBuildingEntranceNodeId(campus, campus.buildings[0], routeEdges, false, true)).toBe("ent-general-node");
  });

  it("falls back to a reachable General Access exit when the preferred Emergency Exit is unreachable", async () => {
    const base = makeCampus();
    const emergencyEntrance: CampusEntrance = {
      id: "ent-emergency", buildingId: "b1", edge: "right", offset: 0.5,
      type: "emergency_exit", name: "East Fire Exit",
    };
    const generalEntrance: CampusEntrance = {
      id: "ent-general", buildingId: "b1", edge: "bottom", offset: 0.2,
      type: "general", isPrimary: true, name: "Main Entrance",
    };
    const exitDoor: FloorDoor = {
      id: "door-emergency", x: 590, y: 100, width: 12, direction: "right",
      color: "#dc2626", isEmergencyExit: true,
    };
    const floor = { ...base.buildings[0].floors[0], doors: [...base.buildings[0].floors[0].doors, exitDoor] };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [generalEntrance, emergencyEntrance], floors: [floor] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-emergency-node", 600, 100, { buildingId: "b1", floorId: undefined, entranceId: emergencyEntrance.id, type: "entrance" }),
        node("ent-general-node", 100, 0, { buildingId: "b1", floorId: undefined, entranceId: generalEntrance.id, type: "entrance" }),
        node("door-emergency-node", 590, 100, { buildingId: "b1", floorId: "f1", doorId: exitDoor.id, type: "hallway" }),
        node("wp-emergency", 560, 100, { buildingId: "b1", floorId: "f1", type: "hallway" }),
        node("outdoor-safe", 650, 100, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
      ],
      navEdges: [
        ...(base.navEdges ?? []),
        edge("emergency-outdoor", "ent-emergency-node", "outdoor-safe"),
        edge("emergency-bridge", "ent-emergency-node", "door-emergency-node", { type: "entrance_transition" }),
        edge("emergency-local", "door-emergency-node", "wp-emergency"),
        edge("general-outdoor", "ent-general-node", "outdoor-safe"),
        edge("general-bridge", "ent-general-node", "door-node-a", { type: "entrance_transition" }),
      ],
    });
    render(createElement(TestNavigationPanel, { campus, onHighlightRoute: vi.fn(), onFocusNode: vi.fn() }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.click(screen.getByTitle("Use emergency-safe routes"));
    await waitFor(() => expect(screen.getByTitle("Use emergency-safe routes").getAttribute("class")).toContain("bg-red-500"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByTitle("Emergency Route")).toBeTruthy());
    expect(screen.queryByPlaceholderText(/Search\/select location/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Test Route" }));
    expect(screen.getByTestId("test-route-emergency-destination")).toHaveTextContent("Safest available exit");
    expect(screen.getByTestId("test-route-emergency-exit")).toHaveTextContent("Main Entrance");
  });

  it("reports the missing indoor Door part of an Emergency Exit", () => {
    const base = makeCampus();
    const emergencyEntrance: CampusEntrance = {
      id: "ent-emergency", buildingId: "b1", edge: "right", offset: 0.5,
      type: "emergency_exit", name: "East Fire Exit",
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [emergencyEntrance] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-emergency-node", 600, 100, { buildingId: "b1", floorId: undefined, entranceId: emergencyEntrance.id, type: "entrance" }),
        node("outdoor-safe", 650, 100, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
      ],
      navEdges: [...(base.navEdges ?? []), edge("emergency-outdoor", "ent-emergency-node", "outdoor-safe")],
    });
    const status = emergencyExitReadiness(campus, campus.buildings[0], emergencyEntrance, buildTestRouteEdges(campus));
    expect(status.ready).toBe(false);
    expect(status.reason).toBe("Connect this Emergency Exit to an indoor Door.");
  });

  it("rejects an Emergency Exit whose outdoor-side edge still terminates indoors", () => {
    const base = makeCampus();
    const emergencyEntrance: CampusEntrance = {
      id: "ent-emergency", buildingId: "b1", edge: "right", offset: 0.5,
      type: "emergency_exit", name: "East Fire Exit",
    };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [emergencyEntrance] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-emergency-node", 600, 100, { buildingId: "b1", floorId: undefined, entranceId: emergencyEntrance.id, type: "entrance" }),
      ],
      navEdges: [...(base.navEdges ?? []), edge("emergency-indoor-looking", "ent-emergency-node", "wp-a")],
    });
    const status = emergencyExitReadiness(campus, campus.buildings[0], emergencyEntrance, buildTestRouteEdges(campus));
    expect(status.ready).toBe(false);
    expect(status.reason).toBe("Connect this Emergency Exit to the Outdoor Walking Network.");
  });

  it("requires an emergency-safe indoor Walking Path at the linked exit Door", () => {
    const base = makeCampus();
    const emergencyEntrance: CampusEntrance = {
      id: "ent-emergency", buildingId: "b1", edge: "right", offset: 0.5,
      type: "emergency_exit", name: "East Fire Exit",
    };
    const exitDoor: FloorDoor = {
      id: "door-emergency", x: 590, y: 100, width: 12, direction: "right",
      color: "#dc2626", isEmergencyExit: true,
    };
    const floor = { ...base.buildings[0].floors[0], doors: [...base.buildings[0].floors[0].doors, exitDoor] };
    const campus = makeCampus({
      buildings: [{ ...base.buildings[0], entrances: [emergencyEntrance], floors: [floor] }],
      navNodes: [
        ...(base.navNodes ?? []),
        node("ent-emergency-node", 600, 100, { buildingId: "b1", floorId: undefined, entranceId: emergencyEntrance.id, type: "entrance" }),
        node("door-emergency-node", 590, 100, { buildingId: "b1", floorId: "f1", doorId: exitDoor.id, type: "hallway" }),
        node("outdoor-safe", 650, 100, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
      ],
      navEdges: [
        ...(base.navEdges ?? []),
        edge("emergency-outdoor", "ent-emergency-node", "outdoor-safe"),
        edge("emergency-bridge", "ent-emergency-node", "door-emergency-node", { type: "entrance_transition" }),
      ],
    });
    const status = emergencyExitReadiness(campus, campus.buildings[0], emergencyEntrance, buildTestRouteEdges(campus));
    expect(status.ready).toBe(false);
    expect(status.reason).toBe("Connect the Emergency Exit Door to the Walking Network.");
  });

  it("shows a mode-specific Emergency result and clears a previous Standard highlight", async () => {
    const onHighlight = vi.fn();
    const base = makeCampus();
    const campus = makeCampus({
      navEdges: (base.navEdges ?? []).map((candidate) => ({ ...candidate, emergencySafe: false })),
    });
    render(createElement(TestNavigationPanel, { campus, onHighlightRoute: onHighlight, onFocusNode: vi.fn() }));
    const locationInputs = screen.getAllByPlaceholderText(/Search\/select location/);
    fireEvent.focus(locationInputs[0]);
    fireEvent.click(screen.getByText("Room A (Floor 1)"));
    fireEvent.focus(locationInputs[1]);
    fireEvent.click(screen.getByText("Room B (Floor 1)"));
    fireEvent.click(screen.getByRole("button", { name: "Calculate Route" }));
    await waitFor(() => expect(screen.getByText("Route Found")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Use Emergency route mode" }));
    await waitFor(() => expect(screen.getByText("No emergency route available.")).toBeTruthy());
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });
});
