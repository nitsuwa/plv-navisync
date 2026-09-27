import { buildTestRouteEdges, chooseEmergencyDestinationCandidate } from "../TestNavigationPanel";
import { createNavigationRouteSearchCache, findNavigationRoute, findPreparedNavigationRoute, prepareNavigationGraph } from "../../../lib/pathfinding";
import { reconcileExteriorApproachNavigation } from "../../../lib/exteriorApproachNavigation";
import { describe, expect, it } from "vitest";
import type { Campus, CampusEntrance, CampusMarker, FloorPlan, NavigationEdge, NavigationNode } from "../types";

const perfNode = (node: object) => node as unknown as NavigationNode;
const perfEdge = (edge: object) => edge as unknown as NavigationEdge;

function makeLargeCampus(): Campus {
  const buildings: Campus["buildings"] = [];
  const navNodes: NavigationNode[] = [];
  const navEdges: NavigationEdge[] = [];
  const buildingCount = 8;
  const floorsPerBuilding = 4;
  const walkNodesPerFloor = 80;
  const roomsPerFloor = 20;
  const gate: CampusMarker = {
    id: "perf-gate",
    name: "Performance Gate",
    type: "gate",
    purpose: "emergency_exit",
    x: 1000,
    y: 1000,
    color: "#dc2626",
    navNodeId: "perf-gate-node",
  };

  for (let buildingIndex = 0; buildingIndex < buildingCount; buildingIndex += 1) {
    const buildingId = `perf-building-${buildingIndex}`;
    const floors: FloorPlan[] = [];
    const entrances: CampusEntrance[] = [];
    for (let floorIndex = 0; floorIndex < floorsPerBuilding; floorIndex += 1) {
      const floorId = `${buildingId}-floor-${floorIndex}`;
      const stairs = [{
        id: `${floorId}-stair`, x: 300, y: 300, width: 24, height: 30,
        direction: "both" as const, label: "Stair", sharedId: `${buildingId}-stair-shaft`,
      }];
      const elevators = [{
        id: `${floorId}-elevator`, x: 340, y: 300, width: 24, height: 30,
        doorWidth: 12, label: "Lift", floors: [1, 2, 3, 4], sharedId: `${buildingId}-elevator-shaft`,
      }];
      const rooms = Array.from({ length: roomsPerFloor }, (_, roomIndex) => ({
        id: `${floorId}-room-${roomIndex}`,
        name: `Room ${roomIndex}`,
        type: "classroom" as const,
        x: roomIndex * 10,
        y: 10,
        w: 8,
        h: 8,
        floorId,
        buildingId,
      }));
      const floor: FloorPlan = {
        id: floorId,
        buildingId,
        number: floorIndex + 1,
        label: floorIndex === 0 ? "Ground" : `Floor ${floorIndex + 1}`,
        rooms,
        doors: [],
        walls: [],
        paths: [],
        windows: [],
        furniture: [],
        stairs,
        elevators,
        ramps: [],
        labels: [],
      };
      floors.push(floor);

      const walkingIds = Array.from({ length: walkNodesPerFloor }, (_, nodeIndex) => `${floorId}-wp-${nodeIndex}`);
      for (let nodeIndex = 0; nodeIndex < walkingIds.length; nodeIndex += 1) {
        navNodes.push(perfNode({
          id: walkingIds[nodeIndex],
          name: walkingIds[nodeIndex],
          type: "hallway",
          x: nodeIndex,
          y: floorIndex * 100,
          buildingId,
          floorId,
          accessible: true,
        }));
        if (nodeIndex > 0) navEdges.push(perfEdge({
          id: `${floorId}-walk-${nodeIndex}`,
          startNodeId: walkingIds[nodeIndex - 1],
          endNodeId: walkingIds[nodeIndex],
          distance: 1,
          bidirectional: true,
          accessible: true,
          emergencySafe: true,
        }));
      }
      navNodes.push(
        perfNode({ id: `${floorId}-stair-node`, name: "Stair", type: "stair", x: 300, y: 300, buildingId, floorId, stairId: stairs[0].id, accessible: false }),
        perfNode({ id: `${floorId}-elevator-node`, name: "Elevator", type: "elevator", x: 340, y: 300, buildingId, floorId, elevatorId: elevators[0].id, accessible: true }),
      );
      navEdges.push(
        perfEdge({ id: `${floorId}-to-stair`, startNodeId: walkingIds[0], endNodeId: `${floorId}-stair-node`, distance: 1, bidirectional: true, accessible: false, emergencySafe: true }),
        perfEdge({ id: `${floorId}-to-elevator`, startNodeId: walkingIds[0], endNodeId: `${floorId}-elevator-node`, distance: 1, bidirectional: true, accessible: true, emergencySafe: true }),
      );

      if (buildingIndex === 0 && floorIndex === 0) {
        const doors = Array.from({ length: 8 }, (_, exitIndex) => ({
          id: `${floorId}-exit-door-${exitIndex}`,
          x: 500 + exitIndex * 10,
          y: 20,
          width: 12,
          direction: "double" as const,
          color: "#dc2626",
          isEmergencyExit: true,
        }));
        floor.doors = doors;
        doors.forEach((door, exitIndex) => {
          const entrance: CampusEntrance = {
            id: `${buildingId}-exit-${exitIndex}`,
            buildingId,
            edge: "bottom",
            offset: (exitIndex + 1) / 10,
            type: "emergency_exit",
            name: `Emergency Exit ${exitIndex + 1}`,
          };
          entrances.push(entrance);
          const doorNodeId = `${door.id}-node`;
          const entranceNodeId = `${entrance.id}-node`;
          const outdoorNodeId = `${entrance.id}-outdoor`;
          navNodes.push(
            perfNode({ id: doorNodeId, name: door.id, type: "hallway", x: door.x, y: door.y, buildingId, floorId, doorId: door.id }),
            perfNode({ id: entranceNodeId, name: entrance.name!, type: "entrance", x: door.x, y: 0, buildingId, entranceId: entrance.id }),
            perfNode({ id: outdoorNodeId, name: "Outside", type: "outdoor", x: door.x, y: -10 }),
          );
          navEdges.push(
            perfEdge({ id: `${door.id}-indoor`, startNodeId: walkingIds[0], endNodeId: doorNodeId, distance: 5 + exitIndex, bidirectional: true, accessible: true, emergencySafe: true }),
            perfEdge({ id: `${door.id}-entrance`, startNodeId: doorNodeId, endNodeId: entranceNodeId, distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition" }),
            perfEdge({ id: `${door.id}-outdoor`, startNodeId: entranceNodeId, endNodeId: outdoorNodeId, distance: 1, bidirectional: true, accessible: true, emergencySafe: true }),
            perfEdge({ id: `${door.id}-gate`, startNodeId: outdoorNodeId, endNodeId: gate.navNodeId!, distance: 10 + exitIndex, bidirectional: true, accessible: true, emergencySafe: true }),
          );
        });
      }
    }
    buildings.push({
      id: buildingId,
      name: `Building ${buildingIndex}`,
      code: `B${buildingIndex}`,
      category: "academic",
      description: "",
      x: buildingIndex * 1000,
      y: 0,
      width: 600,
      height: 400,
      color: "#ddd",
      floors,
      entrances,
    });
  }

  navNodes.push(perfNode({ id: gate.navNodeId!, name: gate.name, type: "outdoor", x: gate.x, y: gate.y, gateId: gate.id }));
  return { id: "perf-campus", name: "Performance Campus", buildings, navNodes, navEdges, markers: [gate] } as unknown as Campus;
}

describe("Test Route large-campus performance fixture", () => {
  it("builds and searches a representative large campus without changing route results", () => {
    const campus = makeLargeCampus();
    const campusNodes = campus.navNodes ?? [];
    const t0 = performance.now();
    const routeCampus = reconcileExteriorApproachNavigation(campus);
    const exteriorReconcileMs = performance.now() - t0;
    const tGraph = performance.now();
    const routeEdges = buildTestRouteEdges(routeCampus, { exteriorApproachReconciled: true });
    const graphBuildMs = performance.now() - tGraph;
    const tRevision = performance.now();
    const graphRevision = JSON.stringify({
      nodes: (routeCampus.navNodes ?? []).map((node) => [node.id, node.x, node.y, node.floorId, node.buildingId, node.doorId, node.roomId]),
      edges: routeEdges.map((edge) => [edge.id, edge.startNodeId, edge.endNodeId, edge.bidirectional, edge.closed, edge.accessible, edge.emergencySafe, edge.bendPoints ?? []]),
      rooms: routeCampus.buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.rooms ?? []).map((room) => [room.id, room.accessDoorId, room.accessDoorIds ?? []]))),
      doors: routeCampus.buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.doors ?? []).map((door) => [door.id, door.x, door.y, door.offset, door.width, door.wallId]))),
      walls: routeCampus.buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.walls ?? []).map((wall) => [wall.id, wall.x1, wall.y1, wall.x2, wall.y2, wall.thickness]))),
      buildingObstacles: routeCampus.buildings.map((building) => [building.id, building.x, building.y, building.width, building.height, building.rotation ?? 0]),
    });
    const graphRevisionMs = performance.now() - tRevision;
    expect(graphRevision.length).toBeGreaterThan(0);

    const startId = "perf-building-0-floor-0-wp-0";
    const destinationId = "perf-building-0-floor-0-wp-79";
    const t1 = performance.now();
    const preparedGraph = prepareNavigationGraph(campusNodes, routeEdges);
    const prepareMs = performance.now() - t1;
    const t2 = performance.now();
    const standard = findPreparedNavigationRoute(preparedGraph, startId, destinationId);
    const standardMs = performance.now() - t2;
    const t3 = performance.now();
    const accessible = findPreparedNavigationRoute(preparedGraph, startId, destinationId, true);
    const accessibleMs = performance.now() - t3;
    const searchCache = createNavigationRouteSearchCache(preparedGraph);
    const cachedRoute = findPreparedNavigationRoute(preparedGraph, startId, destinationId, false, false, { searchCache });
    expect(findPreparedNavigationRoute(preparedGraph, startId, destinationId, false, false, { searchCache })).toBe(cachedRoute);
    const t4 = performance.now();
    const emergency = chooseEmergencyDestinationCandidate(campus, routeEdges, startId);
    const emergencyMs = performance.now() - t4;
    const fanCount = 1800;
    const fanNodes: NavigationNode[] = [
      perfNode({ id: "fan-start", name: "Fan Start", type: "hallway", x: 0, y: 0, accessible: true }),
      ...Array.from({ length: fanCount }, (_, index) => perfNode({
        id: `fan-${index}`,
        name: `Fan ${index}`,
        type: "hallway" as const,
        x: 0,
        y: 0,
        accessible: true,
      })),
      perfNode({ id: "fan-target", name: "Fan Target", type: "hallway", x: 0, y: 0, accessible: true }),
    ];
    const fanEdges: NavigationEdge[] = [
      ...Array.from({ length: fanCount }, (_, index) => perfEdge({
        id: `fan-start-${index}`,
        startNodeId: "fan-start",
        endNodeId: `fan-${index}`,
        distance: 1,
        bidirectional: false,
        accessible: true,
      })),
      ...Array.from({ length: fanCount }, (_, index) => perfEdge({
        id: `fan-target-${index}`,
        startNodeId: `fan-${index}`,
        endNodeId: "fan-target",
        distance: 1000,
        bidirectional: false,
        accessible: true,
      })),
    ];
    const t5 = performance.now();
    const fanPath = findNavigationRoute(fanNodes, fanEdges, "fan-start", "fan-target");
    const fanSearchMs = performance.now() - t5;

    expect(standard?.nodeIds).toEqual(Array.from({ length: 80 }, (_, index) => `perf-building-0-floor-0-wp-${index}`));
    expect(accessible?.nodeIds).toEqual(standard?.nodeIds);
    expect(emergency?.candidate.kind).toBe("emergency_exit");
    expect(emergency?.path.nodeIds).toEqual([
      startId,
      "perf-building-0-floor-0-exit-door-3-node",
      "perf-building-0-exit-3-node",
      "perf-building-0-exit-3-outdoor",
      "perf-gate-node",
    ]);
    expect(fanPath?.nodeIds).toEqual(["fan-start", "fan-0", "fan-target"]);

    // Emergency candidate searches restrict the shared graph to a node set.
    // Their heuristic must match rebuilding the legacy filtered subgraph;
    // unrelated cheap edges elsewhere in Campus must not change tie behavior.
    const scopedNodes = [
      perfNode({ id: "scope-start", x: 0, y: 0 }),
      perfNode({ id: "scope-middle", x: 10, y: 0 }),
      perfNode({ id: "scope-target", x: 20, y: 0 }),
      perfNode({ id: "scope-outside-a", x: 100, y: 0 }),
      perfNode({ id: "scope-outside-b", x: 101, y: 0 }),
    ];
    const scopedEdges = [
      perfEdge({ id: "scope-one", startNodeId: "scope-start", endNodeId: "scope-middle", distance: 10, bidirectional: false, accessible: true }),
      perfEdge({ id: "scope-two", startNodeId: "scope-middle", endNodeId: "scope-target", distance: 10, bidirectional: false, accessible: true }),
      perfEdge({ id: "scope-outside", startNodeId: "scope-outside-a", endNodeId: "scope-outside-b", distance: 0, bidirectional: false, accessible: true }),
    ];
    const allowedNodeIds = new Set(["scope-start", "scope-middle", "scope-target"]);
    const scopedGraph = prepareNavigationGraph(scopedNodes, scopedEdges);
    const preparedScopedRoute = findPreparedNavigationRoute(scopedGraph, "scope-start", "scope-target", false, false, { allowedNodeIds });
    const filteredScopedRoute = findNavigationRoute(
      scopedNodes.filter((node) => allowedNodeIds.has(node.id)),
      scopedEdges.filter((edge) => allowedNodeIds.has(edge.startNodeId) && allowedNodeIds.has(edge.endNodeId)),
      "scope-start",
      "scope-target",
    );
    expect(scopedGraph.allowedViewFor(allowedNodeIds).heuristicScale).toBe(1);
    expect(preparedScopedRoute?.nodeIds).toEqual(filteredScopedRoute?.nodeIds);

    const sharedTransitionNodes = [
      perfNode({ id: "subset-lift-1", x: 0, y: 0, floorId: "subset-floor-1", type: "elevator", elevatorId: "lift-1", transitionSharedId: "lift-shaft", accessible: true }),
      perfNode({ id: "subset-lift-2", x: 0, y: 10, floorId: "subset-floor-2", type: "elevator", elevatorId: "lift-2", transitionSharedId: "lift-shaft", accessible: true }),
      perfNode({ id: "excluded-lift", x: 0, y: 20, floorId: "other-building-floor", type: "elevator", elevatorId: "other-lift", transitionSharedId: "lift-shaft", accessible: false }),
    ];
    const sharedAllowedIds = new Set(["subset-lift-1", "subset-lift-2"]);
    const sharedGraph = prepareNavigationGraph(sharedTransitionNodes, []);
    const preparedSharedRoute = findPreparedNavigationRoute(sharedGraph, "subset-lift-1", "subset-lift-2", true, false, { allowedNodeIds: sharedAllowedIds });
    const filteredSharedRoute = findNavigationRoute(sharedTransitionNodes.slice(0, 2), [], "subset-lift-1", "subset-lift-2", true);
    expect(preparedSharedRoute?.nodeIds).toEqual(filteredSharedRoute?.nodeIds);

    const perfEnabled = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.ROUTE_PERF === "1";
    if (perfEnabled) {
      console.info("[Route Perf] large fixture", {
        nodes: campusNodes.length,
        edges: routeEdges.length,
        exteriorReconcileMs: Number(exteriorReconcileMs.toFixed(2)),
        graphBuildMs: Number(graphBuildMs.toFixed(2)),
        graphRevisionMs: Number(graphRevisionMs.toFixed(2)),
        prepareMs: Number(prepareMs.toFixed(2)),
        standardSearchMs: Number(standardMs.toFixed(2)),
        accessibleSearchMs: Number(accessibleMs.toFixed(2)),
        emergencyCandidatesMs: Number(emergencyMs.toFixed(2)),
        fanNodes: fanNodes.length,
        fanEdges: fanEdges.length,
        fanSearchMs: Number(fanSearchMs.toFixed(2)),
      });
    }
  });
});
