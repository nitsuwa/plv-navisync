import { describe, expect, it } from "vitest";
import type { AssemblyPoint, Campus, CampusEntrance, FloorDoor, FloorPlan, FloorRoom, FloorStairs, FloorWall, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { evaluateRoomEmergencyEvacuation } from "../roomEmergencyEvacuation";
import { currentApprovedRoomEvacuationFingerprint, currentStudentEmergencyRouteFingerprint, isAutomaticStudentEvacuationCandidateEligible, resolveApprovedStudentEvacuationRoutes, resolveAutomaticStudentEvacuationRoutes } from "../studentEmergencyEvacuation";
import { assemblyPointReviewFingerprint } from "../emergencyAssemblyPoints";
import { isStudentEmergencyRouteCurrentAndEligible, planStudentEmergencyRoute } from "../studentEmergencyNavigation";
import { initialStudentRouteUiState, studentFacingRouteSteps, studentRoutePositionForLeg, studentRoutePrimaryAction, studentRouteReachedFinalEndpoint, studentRouteSeekTarget, studentRouteUiReducer } from "../studentRouteFlow";

const navNode = (
  id: string,
  x: number,
  y: number,
  refs: Partial<NavigationNode> = {},
): NavigationNode => ({
  id,
  name: id,
  type: "hallway",
  x,
  y,
  buildingId: "building",
  floorId: "floor-1",
  accessible: true,
  color: "#2563eb",
  ...refs,
});

const edge = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  overrides: Partial<NavigationEdge> = {},
): NavigationEdge => ({
  id,
  startNodeId,
  endNodeId,
  distance: 10,
  bidirectional: true,
  accessible: true,
  emergencySafe: true,
  type: "hallway",
  color: "#2563eb",
  width: 3,
  ...overrides,
});

/** One physical room with two linked doors, but only the east door reaches an exit. */
function twoDoorOneReachableExitCampus(): Campus {
  const room: FloorRoom = {
    id: "assembly-room",
    name: "Assembly Room",
    type: "classroom",
    x: 20,
    y: 20,
    w: 60,
    h: 40,
    buildingId: "building",
    floorId: "floor-1",
    accessDoorId: "west-door",
    accessDoorIds: ["west-door", "east-door"],
  };
  const westDoor: FloorDoor = {
    id: "west-door", x: 20, y: 40, width: 12, direction: "left", color: "#d97706", wallId: "west-wall", offset: 0.5,
  };
  const eastDoor: FloorDoor = {
    id: "east-door", x: 80, y: 40, width: 12, direction: "right", color: "#d97706", wallId: "east-wall", offset: 0.5,
  };
  const exitDoor: FloorDoor = {
    id: "exit-door", x: 160, y: 40, width: 12, direction: "right", color: "#dc2626", isEmergencyExit: true,
  };
  const walls: FloorWall[] = [
    { id: "west-wall", x1: 20, y1: 20, x2: 20, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: room.id, edge: "left", offset: 0.5 } },
    { id: "east-wall", x1: 80, y1: 20, x2: 80, y2: 60, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: room.id, edge: "right", offset: 0.5 } },
  ];
  const floor: FloorPlan = {
    id: "floor-1", buildingId: "building", number: 1, label: "Ground Floor",
    rooms: [room], doors: [westDoor, eastDoor, exitDoor], walls,
    paths: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
  };
  const exit: CampusEntrance = {
    id: "emergency-exit", buildingId: "building", edge: "right", offset: 0.5,
    type: "emergency_exit", name: "East Emergency Exit",
  };
  const navNodes: NavigationNode[] = [
    navNode("room-anchor", 50, 40, { type: "room_access", roomId: room.id, name: room.name }),
    navNode("west-door-node", 20, 40, { doorId: westDoor.id, name: "West Door" }),
    navNode("east-door-node", 80, 40, { doorId: eastDoor.id, name: "East Door" }),
    navNode("west-dead-end", 0, 40, { name: "West Dead End" }),
    navNode("east-approach", 120, 40, { name: "East Approach" }),
    navNode("exit-door-node", 160, 40, { doorId: exitDoor.id, name: "Exit Door" }),
    navNode("exit-entrance-node", 200, 40, { floorId: undefined, entranceId: exit.id, type: "entrance", name: exit.name }),
    navNode("exit-discharge", 220, 40, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
  ];
  return {
    id: "campus",
    name: "Test Campus",
    buildings: [{
      id: "building", name: "Assembly Building", code: "AB", category: "academic", description: "",
      x: 0, y: 0, width: 300, height: 120, color: "#ddd", entrances: [exit], floors: [floor],
    }],
    navNodes,
    navEdges: [
      // This west door is linked to a real but disconnected dead-end. It must
      // not become an evacuation route by traversing the synthetic room hub.
      edge("west-dead-end-edge", "west-door-node", "west-dead-end"),
      edge("east-approach-edge", "east-door-node", "east-approach"),
      edge("east-exit-approach", "east-approach", "exit-door-node"),
      edge("exit-door-transition", "exit-door-node", "exit-entrance-node", { type: "entrance_transition" }),
      edge("exit-outdoor", "exit-entrance-node", "exit-discharge"),
    ],
  } as Campus;
}

function twoDoorTwoDistinctExitCampus(): Campus {
  const campus = twoDoorOneReachableExitCampus();
  const building = campus.buildings[0];
  const floor = building.floors[0];
  const westExitDoor: FloorDoor = {
    id: "west-exit-door", x: -40, y: 40, width: 12, direction: "left", color: "#dc2626", isEmergencyExit: true,
  };
  const westExit: CampusEntrance = {
    id: "west-emergency-exit", buildingId: building.id, edge: "left", offset: 0.5,
    type: "emergency_exit", name: "West Emergency Exit",
  };
  floor.doors = [...floor.doors, westExitDoor];
  building.entrances = [...(building.entrances ?? []), westExit];
  campus.navNodes = [
    ...(campus.navNodes ?? []).filter((node) => node.id !== "west-dead-end"),
    navNode("west-approach", -10, 40, { name: "West Approach" }),
    navNode("west-exit-door-node", -40, 40, { doorId: westExitDoor.id, name: "West Exit Door" }),
    navNode("west-exit-entrance-node", -80, 40, { floorId: undefined, entranceId: westExit.id, type: "entrance", name: westExit.name }),
    navNode("west-exit-discharge", -100, 40, { buildingId: undefined, floorId: undefined, type: "outdoor" }),
  ];
  campus.navEdges = [
    ...(campus.navEdges ?? []).filter((candidate) => candidate.id !== "west-dead-end-edge"),
    edge("west-room-door-walk", "west-door-node", "west-approach"),
    edge("west-approach-exit", "west-approach", "west-exit-door-node"),
    edge("west-exit-transition", "west-exit-door-node", "west-exit-entrance-node", { type: "entrance_transition" }),
    edge("west-exit-outdoor", "west-exit-entrance-node", "west-exit-discharge"),
  ];
  return connectApprovedAssemblyPoint(campus);
}

function markTwoExitStairsForReview(
  source: Campus,
  input: { westEligible?: boolean; eastEligible?: boolean } = {},
): Campus {
  const campus = structuredClone(source);
  const floor = campus.buildings[0].floors[0];
  const stairs: FloorStairs[] = [
    { id: "west-stair", x: -10, y: 40, width: 20, height: 30, direction: "both", label: "West Stair", emergencySafe: input.westEligible },
    { id: "east-stair", x: 120, y: 40, width: 20, height: 30, direction: "both", label: "East Stair", emergencySafe: input.eastEligible },
  ];
  floor.stairs = [...floor.stairs, ...stairs];
  campus.navNodes = (campus.navNodes ?? []).map((node) => node.id === "west-approach"
    ? { ...node, type: "stair", stairId: "west-stair" }
    : node.id === "east-approach" ? { ...node, type: "stair", stairId: "east-stair" } : node);
  campus.navEdges = (campus.navEdges ?? []).map((edge) => edge.id === "west-room-door-walk"
    ? { ...edge, id: "23c676f3-27fc-4d8c-9308-8a1571c89b6c", emergencySafe: input.westEligible === true }
    : edge.id === "east-approach-edge"
      ? { ...edge, id: "677a5a24-9d4d-4855-8011-9eacb0944a2a", emergencySafe: input.eastEligible === true }
      : edge);
  return campus;
}

function addGateAndRemoveAssemblyPoint(source: Campus): Campus {
  const campus = structuredClone(source);
  const removedNodeIds = new Set([
    "assembly-walk-hub",
    ...(campus.assemblyPoints ?? []).map((point) => point.navNodeId).filter((id): id is string => Boolean(id)),
  ]);
  campus.assemblyPoints = [];
  campus.navNodes = (campus.navNodes ?? []).filter((node) => !removedNodeIds.has(node.id));
  const discharges = campus.navNodes.filter((node) => node.id.endsWith("-discharge"));
  const gateNode: NavigationNode = {
    id: "campus-gate-node", name: "Main Campus Gate", type: "outdoor", x: 300, y: 120,
    campusId: campus.id, gateId: "campus-gate", accessible: true, emergencySafe: true, color: "#2563eb",
  };
  campus.navNodes.push(gateNode);
  campus.markers = [{
    id: "campus-gate", name: "Main Campus Gate", type: "gate", purpose: "general",
    navNodeId: gateNode.id, x: gateNode.x, y: gateNode.y, color: "#2563eb",
  }];
  const westWaypoints: NavigationNode[] = [
    { ...gateNode, id: "gate-west-south-a", name: "West Gate Path A", x: -120, y: -120, gateId: undefined },
    { ...gateNode, id: "gate-west-south-b", name: "West Gate Path B", x: -50, y: -120, gateId: undefined },
    { ...gateNode, id: "gate-west-east", name: "West Gate Path C", x: 300, y: -120, gateId: undefined },
  ];
  campus.navNodes.push(...westWaypoints);
  campus.navEdges = (campus.navEdges ?? []).filter((edge) =>
    !removedNodeIds.has(edge.startNodeId) && !removedNodeIds.has(edge.endNodeId));
  for (const discharge of discharges) {
    if (discharge.x < 0) {
      const route = [discharge, ...westWaypoints, gateNode];
      campus.navEdges.push(...route.slice(0, -1).map((node, index) =>
        edge(`gate-link-${node.id}`, node.id, route[index + 1].id, { type: "outdoor" })));
    } else {
      campus.navEdges.push(edge(`gate-link-${discharge.id}`, discharge.id, gateNode.id, { type: "outdoor" }));
    }
  }
  return campus;
}

function connectApprovedAssemblyPoint(campus: Campus): Campus {
  campus.buildings[0].width = 200;
  const hub = navNode("assembly-walk-hub", 260, 180, { buildingId: undefined, floorId: undefined, campusId: campus.id, type: "outdoor" });
  const assemblyNode = navNode("assembly-point-node", 330, 180, {
    buildingId: undefined, floorId: undefined, campusId: campus.id, type: "assembly", assemblyPointId: "main-assembly-point",
  });
  const dischargeNodes = (campus.navNodes ?? []).filter((node) => node.type === "outdoor" && node.id.endsWith("-discharge"));
  const outdoorEdges = dischargeNodes.map((discharge) => edge(`assembly-link-${discharge.id}`, discharge.id, hub.id, {
    type: "outdoor",
    ...(discharge.x < 0 ? { bendPoints: [{ x: -120, y: discharge.y }, { x: -120, y: 180 }, { x: hub.x, y: 180 }] } : {}),
  }));
  campus.navNodes = [...(campus.navNodes ?? []), hub, assemblyNode];
  campus.navEdges = [
    ...(campus.navEdges ?? []),
    ...outdoorEdges,
    edge("assembly-hub-to-point", hub.id, assemblyNode.id, { type: "outdoor" }),
  ];
  const assemblyPoint: AssemblyPoint = {
    id: "main-assembly-point", name: "Main Assembly Point A", x: assemblyNode.x, y: assemblyNode.y,
    campusId: campus.id, navNodeId: assemblyNode.id,
    buildingAssignments: [{ buildingId: campus.buildings[0].id, designation: "primary" }],
  };
  campus.assemblyPoints = [assemblyPoint];
  return approveCurrentAssemblyPoint(campus);
}

function addApprovedAlternateAssemblyPoint(campus: Campus): Campus {
  const anchor = navNode("alternate-assembly-node", 270, 180, {
    buildingId: undefined,
    floorId: undefined,
    campusId: campus.id,
    type: "assembly",
    assemblyPointId: "alternate-assembly-point",
  });
  campus.navNodes = [...(campus.navNodes ?? []), anchor];
  campus.navEdges = [...(campus.navEdges ?? []), edge("alternate-hub-link", "assembly-walk-hub", anchor.id, { distance: 10, type: "outdoor" })];
  const alternate: AssemblyPoint = {
    id: "alternate-assembly-point",
    name: "East Gathering Area",
    x: anchor.x,
    y: anchor.y,
    campusId: campus.id,
    navNodeId: anchor.id,
    buildingAssignments: [{ buildingId: campus.buildings[0].id, designation: "alternate" }],
  };
  const fingerprint = assemblyPointReviewFingerprint(campus, alternate);
  campus.assemblyPoints = [...(campus.assemblyPoints ?? []), {
    ...alternate,
    safetyReview: { status: "approved", approvedAt: "2026-10-15T00:00:00.000Z", approvedByRole: "admin", fingerprint: fingerprint ?? undefined },
  }];
  // Adding the second point changes the shared outdoor component fingerprint;
  // model the required TEST ONLY re-review of both affected points.
  campus.assemblyPoints = campus.assemblyPoints.map((point) => ({
    ...point,
    safetyReview: {
      ...point.safetyReview,
      status: "approved",
      fingerprint: assemblyPointReviewFingerprint(campus, point) ?? undefined,
    },
  }));
  return campus;
}

function approveCurrentAssemblyPoint(campus: Campus): Campus {
  const assemblyPoint = campus.assemblyPoints?.[0];
  if (!assemblyPoint) return campus;
  const fingerprint = assemblyPointReviewFingerprint(campus, assemblyPoint);
  campus.assemblyPoints = [{
    ...assemblyPoint,
    safetyReview: { status: "approved", approvedAt: "2026-10-15T00:00:00.000Z", approvedByRole: "admin", fingerprint: fingerprint ?? undefined },
  }];
  return campus;
}

function twoDoorSameExitCampus(): Campus {
  const campus = twoDoorOneReachableExitCampus();
  campus.navEdges = [
    ...(campus.navEdges ?? []),
    edge("west-corridor-east", "west-dead-end", "east-approach", { bendPoints: [{ x: 0, y: 0 }, { x: 120, y: 0 }] }),
  ];
  return connectApprovedAssemblyPoint(campus);
}

function threeDoorCampus(): Campus {
  const campus = twoDoorTwoDistinctExitCampus();
  const building = campus.buildings[0];
  const floor = building.floors[0];
  const room = floor.rooms[0];
  const southDoor: FloorDoor = {
    id: "south-door", x: 50, y: 60, width: 12, direction: "left", color: "#d97706", wallId: "south-wall", offset: 0.5,
  };
  floor.doors.push(southDoor);
  floor.walls.push({
    id: "south-wall", x1: 20, y1: 60, x2: 80, y2: 60, thickness: 4, color: "#64748b",
    startAnchor: { targetType: "room", roomId: room.id, edge: "bottom", offset: 0.5 },
  });
  room.accessDoorIds = [...(room.accessDoorIds ?? []), southDoor.id];
  campus.navNodes = [
    ...(campus.navNodes ?? []),
    navNode("south-door-node", 50, 60, { doorId: southDoor.id, name: "South Door" }),
    navNode("south-approach", 50, 120, { name: "South Corridor" }),
  ];
  campus.navEdges = [
    ...(campus.navEdges ?? []),
    edge("south-door-authored-corridor", "south-door-node", "south-approach"),
    edge("south-corridor-to-east-network", "south-approach", "east-approach"),
  ];
  return approveCurrentAssemblyPoint(campus);
}

function relabelPublishedRoomFixture(
  campus: Campus,
  input: { buildingName: string; buildingCode: string; roomName: string; floorNumber: number; floorLabel?: string },
): Campus {
  const building = campus.buildings[0];
  const floor = building.floors[0];
  const room = floor.rooms[0];
  building.name = input.buildingName;
  building.code = input.buildingCode;
  floor.number = input.floorNumber;
  floor.label = input.floorLabel ?? `Floor ${input.floorNumber}`;
  room.name = input.roomName;
  campus.navNodes = (campus.navNodes ?? []).map((node) => node.roomId === room.id ? { ...node, name: room.name } : node);
  return campus;
}

function approveFixtureRoomRoutes(campus: Campus, evaluation: ReturnType<typeof evaluateRoomEmergencyEvacuation>): void {
  const room = campus.buildings[0].floors[0].rooms[0];
  room.emergencyEvacuation = {
    enabled: true,
    routes: evaluation.candidates.slice(0, 2).map((candidate, index) => ({
      id: candidate.id,
      doorId: candidate.doorId,
      exitId: candidate.exitId,
      destinationNodeId: candidate.destinationNodeId,
      label: index === 0 ? "Route A" : "Route B",
      approved: true,
      approvedAt: "2026-10-15T00:00:00.000Z",
      approvedRouteSignature: candidate.routeSignature,
    })),
  };
}

function resolveFixtureRoom(campus: Campus) {
  const building = campus.buildings[0];
  const floor = building.floors[0];
  const room = floor.rooms[0];
  return resolveApprovedStudentEvacuationRoutes(campus, {
    type: "room",
    buildingId: building.id,
    floorNumber: floor.number,
    roomId: room.id,
    roomName: room.name,
    buildingLabel: building.name,
    buildingCode: building.code,
  });
}

describe("smart multi-exit Admin-to-Student integration", () => {
  it("does not treat a building-exit-only route as complete when no Assembly Point is configured", () => {
    const campus = twoDoorOneReachableExitCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");

    expect(evaluation.doorReadiness).toEqual([
      expect.objectContaining({ doorId: "west-door", state: "connected_without_route", routeCount: 0 }),
      expect.objectContaining({ doorId: "east-door", state: "connected_without_route", routeCount: 0 }),
    ]);
    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.candidates[0]).toMatchObject({ doorId: "east-door", exitId: "entrance:emergency-exit", completeAssemblyRoute: false });
    expect(evaluation.candidates[0].route.indoorSegments?.flatMap((segment) => segment.waypoints))
      .not.toContainEqual({ x: 50, y: 40 });
  });

  it("keeps a building-exit-only approval out of Student SOS when no Assembly Point is configured", () => {
    const campus = twoDoorOneReachableExitCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    const room = campus.buildings[0].floors[0].rooms[0];
    const roomDestination = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Assembly Building",
      buildingCode: "AB",
    };

    room.emergencyEvacuation = {
      enabled: true,
      routes: evaluation.candidates.map((candidate) => ({
        id: candidate.id,
        doorId: candidate.doorId,
        exitId: candidate.exitId,
        destinationNodeId: candidate.destinationNodeId,
        label: "East Exit",
        approved: false,
      })),
    };
    expect(resolveApprovedStudentEvacuationRoutes(campus, roomDestination).routes).toEqual([]);

    room.emergencyEvacuation.routes[0] = {
      ...room.emergencyEvacuation.routes[0],
      approved: true,
      approvedAt: "2026-10-14T00:00:00.000Z",
      approvedRouteSignature: evaluation.candidates[0].routeSignature,
    };
    expect(resolveApprovedStudentEvacuationRoutes(campus, roomDestination).routes).toEqual([]);

    // A changed authored edge invalidates the approval, rather than silently
    // substituting the current route as if it had been reviewed.
    campus.navEdges = (campus.navEdges ?? []).map((candidate) => ["east-exit-approach", "west-approach-exit"].includes(candidate.id)
      ? { ...candidate, closed: true }
      : candidate);
    expect(resolveApprovedStudentEvacuationRoutes(campus, roomDestination).routes).toEqual([]);
  });

  it("plans the regular SOS route all the way to an approved assigned Assembly Point", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const planned = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });
    expect(planned?.emergencyAssemblyPointId).toBe("main-assembly-point");
    expect(planned?.emergencyDestinationLabel).toBe("Main Assembly Point A");
    expect(planned?.campusPoints?.at(-1)).toEqual({ x: 330, y: 180 });
    expect(planned?.isAuthoredGraph).toBe(true);
  });

  it("routes Room SOS through the connected central crossing to its assigned test Assembly Point", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    // TEST ONLY topology: both eligible exterior exits hand off to the same
    // same-level central crossing, which continues to the assigned Assembly
    // Point. No MAIN CAMPUS records or safety flags are involved.
    campus.navEdges = (campus.navEdges ?? []).filter((candidate) => !candidate.id.startsWith("assembly-link-"));
    const centralCrossing = navNode("central-crossing", 520, 560, {
      buildingId: undefined,
      floorId: undefined,
      campusId: campus.id,
      type: "outdoor",
      emergencySafe: true,
    });
    const dischargeNodes = (campus.navNodes ?? []).filter((node) => node.type === "outdoor" && node.id.endsWith("-discharge"));
    campus.navNodes = [...(campus.navNodes ?? []), centralCrossing];
    campus.navEdges = [
      ...(campus.navEdges ?? []),
      ...dischargeNodes.map((node) => edge(`test-central-link-${node.id}`, node.id, centralCrossing.id, {
        type: "outdoor",
        distance: Math.hypot(node.x - centralCrossing.x, node.y - centralCrossing.y),
      })),
      edge("test-central-to-assembly", centralCrossing.id, "assembly-walk-hub", {
        type: "outdoor",
        distance: Math.hypot(centralCrossing.x - 260, centralCrossing.y - 180),
      }),
    ];
    approveCurrentAssemblyPoint(campus);

    const planned = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });

    expect(planned?.emergencyAssemblyPointId).toBe("main-assembly-point");
    expect(planned?.campusPoints).toContainEqual({ x: centralCrossing.x, y: centralCrossing.y });
    expect(isStudentEmergencyRouteCurrentAndEligible(campus, planned!, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
    })).toBe(true);
  });

  it("advances the canonical cursor through every walking instruction when the final outdoor leg completes", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const route = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });
    expect(route).toBeTruthy();
    const steps = studentFacingRouteSteps(route!);
    const finalCampusLegIndex = route!.contextLegs?.reduce((last, leg, index) => leg.kind === "campus" ? index : last, -1) ?? -1;
    expect(finalCampusLegIndex).toBeGreaterThanOrEqual(0);

    const cursor = studentRoutePositionForLeg(route!, steps, "outdoor", null, 1, 0, finalCampusLegIndex);
    const endpoint = studentRouteSeekTarget(route!, steps, steps.length - 1);

    expect(cursor).toBe(steps.length - 1);
    expect(studentRouteReachedFinalEndpoint({
      route,
      steps,
      cursor,
      context: "campus",
      phase: "outdoor",
      progress: 1,
    })).toBe(true);
    expect(endpoint.context).toBe("campus");
    expect(steps.filter((step) => step.contextLegIndex === finalCampusLegIndex && step.icon === "walk")).toHaveLength(1);
    expect(steps.at(-2)?.instruction).toMatch(/Follow the campus path/);
    expect(steps.at(-1)?.instruction).toContain("Main Assembly Point A");
    expect(endpoint.routeProgress).toBe(1);

    const complete = studentRouteReachedFinalEndpoint({
      route,
      steps,
      cursor,
      context: "campus",
      phase: "outdoor",
      progress: 1,
    });
    expect(studentRouteReachedFinalEndpoint({ route, steps, cursor, context: "campus", phase: "outdoor", progress: 0.99 })).toBe(false);
    expect(studentRouteReachedFinalEndpoint({ route, steps, cursor, context: "campus", phase: "outdoor", progress: 1, pendingTransition: true })).toBe(false);
    const navigating = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION", camera: "follow" });
    const arrived = complete ? studentRouteUiReducer(navigating, { type: "ARRIVE" }) : navigating;
    expect(arrived.phase).toBe("arrived");
    expect(studentRoutePrimaryAction({ phase: arrived.phase, playback: arrived.playback, hasAuthoredTransition: false })).toBe("done");
  });

  it("automatically plans an ordinary room without a saved Route A approval", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const room = campus.buildings[0].floors[0].rooms[0];
    expect(room.emergencyEvacuation).toBeUndefined();

    const planned = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    });

    expect(planned?.emergencyAssemblyPointId).toBe("main-assembly-point");
    expect(planned?.emergencyDestinationFallback).not.toBe(true);
    expect(planned?.isAuthoredGraph).toBe(true);
  });

  it("keeps complete SOS routes when an Assembly Point review fingerprint is stale", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const point = campus.assemblyPoints![0];
    campus.assemblyPoints = [{
      ...point,
      safetyReview: {
        status: "approved",
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin",
        fingerprint: "stale-after-unrelated-map-edit",
      },
    }];
    const room = campus.buildings[0].floors[0].rooms[0];
    const result = resolveAutomaticStudentEvacuationRoutes(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    });

    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes.every((candidate) => candidate.candidate.completeAssemblyRoute)).toBe(true);
    expect(result.routes.every((candidate) => isAutomaticStudentEvacuationCandidateEligible(campus, candidate.candidate))).toBe(true);
  });

  it("fingerprints the current eligible automatic SOS route for explicit video review without per-room approval", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const room = campus.buildings[0].floors[0].rooms[0];
    expect(room.emergencyEvacuation).toBeUndefined();

    const automaticFingerprint = currentStudentEmergencyRouteFingerprint(campus, "building", "floor-1", room.id);

    expect(automaticFingerprint).toBeTruthy();
    expect(currentApprovedRoomEvacuationFingerprint(campus, "building", "floor-1", room.id)).toBeNull();

    // The reviewed-video fingerprint includes the actual route used by SOS,
    // so a route edit invalidates video review even with no room assignment.
    campus.navEdges = (campus.navEdges ?? []).map((candidate) => candidate.id === "east-exit-approach"
      ? { ...candidate, closed: true }
      : candidate);
    expect(currentStudentEmergencyRouteFingerprint(campus, "building", "floor-1", room.id)).not.toBe(automaticFingerprint);
  });

  it("automatically exposes two distinct physical exits without Smart Multi-Exit configuration", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const room = campus.buildings[0].floors[0].rooms[0];
    const roomDestination = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    };

    const ordinary = resolveAutomaticStudentEvacuationRoutes(campus, roomDestination);
    expect(ordinary.configured).toBe(true);
    expect(ordinary.routes).toHaveLength(2);
    expect(ordinary.routes[0]?.assignment.approved).toBe(false);
    expect(ordinary.routes[0]?.candidate.assemblyPointId).toBe("main-assembly-point");
    expect(new Set(ordinary.routes.map((option) => option.candidate.exitId)).size).toBe(2);

    room.emergencyEvacuation = { enabled: true, routes: [] };
    const multiExit = resolveAutomaticStudentEvacuationRoutes(campus, roomDestination);
    expect(multiExit.configured).toBe(true);
    expect(multiExit.routes).toHaveLength(2);
    expect(new Set(multiExit.routes.map((option) => option.candidate.exitId)).size).toBe(2);
    expect(new Set(multiExit.routes.map((option) => option.candidate.assemblyPointId))).toEqual(new Set(["main-assembly-point"]));
  });

  it("rejects the published CABA-201 candidate paths when either authored Stair is unresolved", () => {
    // TEST ONLY graph: the two traversed edge IDs are copied from the current
    // published CABA-201 audit reproduction; no live campus data is changed.
    const campus = markTwoExitStairsForReview(twoDoorTwoDistinctExitCampus());
    const room = campus.buildings[0].floors[0].rooms[0];
    const origin = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "CABA",
      buildingCode: "CABA",
      accessDoorIds: room.accessDoorIds,
    };

    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", room.id);
    expect(evaluation.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ emergencyUseReviewRequired: true, route: expect.objectContaining({ authoredGraphEdgeIds: expect.arrayContaining(["677a5a24-9d4d-4855-8011-9eacb0944a2a"]) }) }),
      expect.objectContaining({ emergencyUseReviewRequired: true, route: expect.objectContaining({ authoredGraphEdgeIds: expect.arrayContaining(["23c676f3-27fc-4d8c-9308-8a1571c89b6c"]) }) }),
    ]));
    expect(resolveAutomaticStudentEvacuationRoutes(campus, origin).routes).toEqual([]);
    expect(planStudentEmergencyRoute(campus, origin)).toBeNull();
    expect(isStudentEmergencyRouteCurrentAndEligible(campus, evaluation.candidates[0]?.route, origin)).toBe(false);
  });

  it("automatically keeps only eligible exits and permits valid reviewed stairs", () => {
    const source = twoDoorTwoDistinctExitCampus();
    const room = source.buildings[0].floors[0].rooms[0];
    const origin = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    };
    const mixed = markTwoExitStairsForReview(source, { eastEligible: true });
    const mixedRoutes = resolveAutomaticStudentEvacuationRoutes(mixed, origin).routes;
    expect(mixedRoutes).toHaveLength(1);
    expect(mixedRoutes[0]?.candidate.exitId).toBe("entrance:emergency-exit");
    expect(isStudentEmergencyRouteCurrentAndEligible(mixed, mixedRoutes[0]?.candidate.route, origin)).toBe(true);

    const allEligible = markTwoExitStairsForReview(source, { westEligible: true, eastEligible: true });
    const routes = resolveAutomaticStudentEvacuationRoutes(allEligible, origin).routes;
    expect(routes).toHaveLength(2);
    expect(new Set(routes.map((route) => route.candidate.exitId)).size).toBe(2);
    expect(routes.every((route) => route.candidate.assemblyPointId === "main-assembly-point"
      && route.candidate.route.authoredGraphNodeIds?.at(-1) === "assembly-point-node"
      && isStudentEmergencyRouteCurrentAndEligible(allEligible, route.candidate.route, origin))).toBe(true);
  });

  it("applies the same unresolved-Stair rejection to Campus Gate fallback routes", () => {
    const campus = addGateAndRemoveAssemblyPoint(markTwoExitStairsForReview(twoDoorTwoDistinctExitCampus()));
    const room = campus.buildings[0].floors[0].rooms[0];
    const origin = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    };
    expect(resolveAutomaticStudentEvacuationRoutes(campus, origin).routes).toEqual([]);
    expect(planStudentEmergencyRoute(campus, origin)).toBeNull();

    const safeCampus = addGateAndRemoveAssemblyPoint(markTwoExitStairsForReview(twoDoorTwoDistinctExitCampus(), {
      westEligible: true,
      eastEligible: true,
    }));
    const safeRoom = safeCampus.buildings[0].floors[0].rooms[0];
    const safeOrigin = { ...origin, roomId: safeRoom.id, roomName: safeRoom.name, accessDoorIds: safeRoom.accessDoorIds };
    const fallbackRoutes = resolveAutomaticStudentEvacuationRoutes(safeCampus, safeOrigin).routes;
    expect(fallbackRoutes).toHaveLength(2);
    expect(fallbackRoutes.every((option) => option.candidate.campusGatePurpose === "general"
      && option.candidate.route.emergencyDestinationFallback === true
      && isStudentEmergencyRouteCurrentAndEligible(safeCampus, option.candidate.route, safeOrigin))).toBe(true);
  });

  it("does not substitute a connected Campus Gate for an assigned but disconnected Assembly Point", () => {
    const source = twoDoorTwoDistinctExitCampus();
    const disconnected = addGateAndRemoveAssemblyPoint(source);
    // Restore the existing assigned point identity but leave its outdoor link
    // disconnected; the Gate remains reachable from both building exits.
    const pointCampus = structuredClone(source);
    pointCampus.markers = disconnected.markers;
    pointCampus.navNodes = [...(pointCampus.navNodes ?? []), ...(disconnected.navNodes ?? []).filter((node) => node.gateId)];
    pointCampus.navEdges = [...(pointCampus.navEdges ?? []).filter((edge) => edge.id !== "assembly-hub-to-point"),
      ...(disconnected.navEdges ?? []).filter((edge) => edge.id.startsWith("gate-link-"))];
    const room = pointCampus.buildings[0].floors[0].rooms[0];
    const origin = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    };
    expect(resolveAutomaticStudentEvacuationRoutes(pointCampus, origin).routes).toEqual([]);
    expect(planStudentEmergencyRoute(pointCampus, origin)).toBeNull();
  });

  it("keeps Fixed Primary as the legacy default and selects one nearest eligible point by complete route cost", () => {
    const campus = addApprovedAlternateAssemblyPoint(twoDoorTwoDistinctExitCampus());
    const room = campus.buildings[0].floors[0].rooms[0];
    const destination = {
      type: "room" as const,
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    };
    campus.navEdges = (campus.navEdges ?? []).map((candidate) => candidate.id === "assembly-hub-to-point"
      ? { ...candidate, distance: 500 }
      : candidate.id === "alternate-hub-link" ? { ...candidate, distance: 10 } : candidate);
    campus.assemblyPoints = (campus.assemblyPoints ?? []).map((point) => ({
      ...point,
      safetyReview: {
        ...point.safetyReview,
        status: "approved",
        fingerprint: assemblyPointReviewFingerprint(campus, point) ?? undefined,
      },
    }));

    const legacyDefault = resolveAutomaticStudentEvacuationRoutes(campus, destination);
    expect(new Set(legacyDefault.routes.map((route) => route.candidate.assemblyPointId))).toEqual(new Set(["main-assembly-point"]));

    campus.settings = { ...campus.settings, emergencyDestinationPolicy: "nearest_eligible" };
    const nearest = resolveAutomaticStudentEvacuationRoutes(campus, destination);
    expect(nearest.routes).toHaveLength(2);
    expect(new Set(nearest.routes.map((route) => route.candidate.exitId)).size).toBe(2);
    expect(new Set(nearest.routes.map((route) => route.candidate.assemblyPointId))).toEqual(new Set(["alternate-assembly-point"]));
    expect(nearest.routes.every((route) => route.candidate.destinationNodeId === "alternate-assembly-node"
      && route.candidate.route.emergencyAssemblyPointId === "alternate-assembly-point")).toBe(true);
  });

  it("uses the shared Fixed Primary and Nearest Eligible policy for building starts", () => {
    const campus = addApprovedAlternateAssemblyPoint(twoDoorTwoDistinctExitCampus());
    campus.navEdges = (campus.navEdges ?? []).map((candidate) => candidate.id === "assembly-hub-to-point"
      ? { ...candidate, distance: 500 }
      : candidate.id === "alternate-hub-link" ? { ...candidate, distance: 10 } : candidate);
    campus.assemblyPoints = (campus.assemblyPoints ?? []).map((point) => ({
      ...point,
      safetyReview: {
        ...point.safetyReview,
        status: "approved",
        fingerprint: assemblyPointReviewFingerprint(campus, point) ?? undefined,
      },
    }));
    const origin = { type: "building" as const, buildingId: "building", label: "Test Building", code: "TEST" };

    const fixedPrimary = planStudentEmergencyRoute(campus, origin);
    expect(fixedPrimary?.emergencyAssemblyPointId).toBe("main-assembly-point");
    expect(isStudentEmergencyRouteCurrentAndEligible(campus, fixedPrimary, origin)).toBe(true);

    campus.settings = { ...campus.settings, emergencyDestinationPolicy: "nearest_eligible" };
    const nearest = planStudentEmergencyRoute(campus, origin);
    expect(nearest?.emergencyAssemblyPointId).toBe("alternate-assembly-point");
    expect(isStudentEmergencyRouteCurrentAndEligible(campus, nearest, origin)).toBe(true);
  });

  it("does not fabricate a second alternative when only one physical exit reaches the Primary", () => {
    const campus = connectApprovedAssemblyPoint(twoDoorOneReachableExitCampus());
    const room = campus.buildings[0].floors[0].rooms[0];
    room.emergencyEvacuation = { enabled: true, routes: [] };

    const resolution = resolveAutomaticStudentEvacuationRoutes(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: room.accessDoorIds,
    });

    expect(resolution.configured).toBe(false);
    expect(resolution.routes).toHaveLength(1);
    expect(resolution.routes[0]?.candidate.exitId).toBe("entrance:emergency-exit");
  });

  it("uses Campus Gate as a labeled fallback only when no Assembly Point is assigned", () => {
    const campus = twoDoorOneReachableExitCampus();
    // The authored building exit is at x=220, so keep its outdoor discharge
    // outside the building footprint just as it is in the real campus graph.
    campus.buildings[0].width = 200;
    const gateNode: NavigationNode = {
      id: "campus-gate-node",
      name: "Main Campus Gate",
      type: "outdoor",
      x: 300,
      y: 120,
      campusId: campus.id,
      gateId: "campus-gate",
      accessible: true,
      emergencySafe: true,
      color: "#2563eb",
    };
    campus.markers = [{
      id: "campus-gate",
      name: "Main Campus Gate",
      type: "gate",
      purpose: "general",
      navNodeId: gateNode.id,
      x: gateNode.x,
      y: gateNode.y,
      color: "#2563eb",
    }];
    campus.navNodes = [...(campus.navNodes ?? []), gateNode];
    campus.navEdges = [...(campus.navEdges ?? []), edge("discharge-to-campus-gate", "exit-discharge", gateNode.id, { type: "outdoor", distance: 80 })];

    const planned = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });

    expect(planned?.emergencyDestinationFallback).toBe(true);
    expect(planned?.emergencyDestinationLabel).toBe("Campus Gate · Fallback");
    expect(planned?.emergencyAssemblyPointId).toBeUndefined();
    expect(planned?.campusPoints?.at(-1)).toEqual({ x: gateNode.x, y: gateNode.y });
    expect(studentFacingRouteSteps(planned!).at(-1)?.instruction).toBe("Arrive at Campus Gate · Fallback.");
  });

  it("routes unassigned buildings to the campus Primary and keeps both exits on that same destination", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const primary = campus.assemblyPoints![0];
    primary.campusWidePrimary = true;
    primary.buildingAssignments = [];

    const resolution = resolveAutomaticStudentEvacuationRoutes(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });

    expect(resolution.routes).toHaveLength(2);
    expect(resolution.routes.every((route) => route.candidate.assemblyPointId === primary.id)).toBe(true);
    expect(resolution.routes.every((route) => route.candidate.completeAssemblyRoute && route.candidate.graphCompleteAssemblyRoute)).toBe(true);
    expect(new Set(resolution.routes.map((route) => route.candidate.exitId)).size).toBe(2);

    campus.settings = { ...campus.settings, emergencyDestinationPolicy: "nearest_eligible" };
    const nearest = resolveAutomaticStudentEvacuationRoutes(campus, {
      type: "room", buildingId: "building", floorNumber: 1, roomId: "assembly-room", roomName: "Assembly Room",
      buildingLabel: "Test Building", buildingCode: "TEST", accessDoorIds: ["west-door", "east-door"],
    });
    expect(nearest.routes).toHaveLength(2);
    expect(nearest.routes.every((route) => route.candidate.assemblyPointId === primary.id)).toBe(true);
  });

  it("keeps an explicit building Primary ahead of the campus-wide Primary", () => {
    const campus = addApprovedAlternateAssemblyPoint(twoDoorTwoDistinctExitCampus());
    const inherited = campus.assemblyPoints!.find((point) => point.id === "main-assembly-point")!;
    inherited.campusWidePrimary = true;
    inherited.buildingAssignments = [];
    const override = campus.assemblyPoints!.find((point) => point.id === "alternate-assembly-point")!;
    override.buildingAssignments = [{ buildingId: "building", designation: "primary" }];
    const room = campus.buildings[0].floors[0].rooms[0];

    const planned = planStudentEmergencyRoute(campus, {
      type: "room", buildingId: "building", floorNumber: 1, roomId: room.id, roomName: room.name,
      buildingLabel: "Test Building", buildingCode: "TEST", accessDoorIds: room.accessDoorIds,
    });

    expect(planned?.emergencyAssemblyPointId).toBe(override.id);
  });

  it("does not substitute a connected Campus Gate when the designated campus Primary is unreachable", () => {
    const campus = twoDoorOneReachableExitCampus();
    connectApprovedAssemblyPoint(campus);
    const primary = campus.assemblyPoints![0];
    primary.campusWidePrimary = true;
    primary.buildingAssignments = [];
    campus.navEdges = campus.navEdges!.filter((candidate) => candidate.id !== "assembly-hub-to-point");
    const gateNode: NavigationNode = {
      id: "fallback-gate-node", name: "Connected Gate", type: "outdoor", x: 290, y: 130,
      campusId: campus.id, gateId: "fallback-gate", accessible: true, emergencySafe: true, color: "#2563eb",
    };
    campus.markers = [{ id: "fallback-gate", name: "Connected Gate", type: "gate", purpose: "general", x: 290, y: 130, navNodeId: gateNode.id, color: "#2563eb" }];
    campus.navNodes = [...campus.navNodes!, gateNode];
    campus.navEdges = [...campus.navEdges!, edge("discharge-to-gate", "exit-discharge", gateNode.id, { type: "outdoor" })];

    const planned = planStudentEmergencyRoute(campus, {
      type: "room", buildingId: "building", floorNumber: 1, roomId: "assembly-room", roomName: "Assembly Room",
      buildingLabel: "Test Building", buildingCode: "TEST", accessDoorIds: ["east-door"],
    });

    expect(planned).toBeNull();
  });

  it("uses the assigned Primary even when a closer approved Alternate is connected", () => {
    const campus = addApprovedAlternateAssemblyPoint(twoDoorTwoDistinctExitCampus());
    const planned = planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    });

    expect(planned?.emergencyAssemblyPointId).toBe("main-assembly-point");
    expect(planned?.emergencyDestinationLabel).toBe("Main Assembly Point A");
  });

  it("does not turn an Alternate into a Smart Multi-Exit route when one physical exit cannot reach the Primary", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const primary = campus.assemblyPoints![0];
    const alternateNode = navNode("alternate-assembly-node", 270, 240, {
      buildingId: undefined,
      floorId: undefined,
      campusId: campus.id,
      type: "assembly",
      assemblyPointId: "alternate-assembly-point",
    });
    const alternate: AssemblyPoint = {
      id: "alternate-assembly-point",
      name: "East Gathering Area",
      x: alternateNode.x,
      y: alternateNode.y,
      campusId: campus.id,
      navNodeId: alternateNode.id,
      buildingAssignments: [{ buildingId: campus.buildings[0].id, designation: "alternate" }],
    };
    const westHub = navNode("west-outdoor-hub", -140, 180, { buildingId: undefined, floorId: undefined, campusId: campus.id, type: "outdoor" });
    const eastHub = navNode("east-outdoor-hub", 260, 180, { buildingId: undefined, floorId: undefined, campusId: campus.id, type: "outdoor" });
    const primaryNode = campus.navNodes!.find((node) => node.id === primary.navNodeId)!;
    campus.navNodes = [...campus.navNodes!, westHub, eastHub, alternateNode];
    campus.navEdges = [
      ...campus.navEdges!.filter((candidate) => !candidate.id.startsWith("assembly-link-") && candidate.id !== "assembly-hub-to-point"),
      edge("west-exit-to-west-hub", "west-exit-discharge", westHub.id, { type: "outdoor" }),
      edge("west-hub-to-primary", westHub.id, primaryNode.id, { type: "outdoor" }),
      edge("west-to-east-one-way", westHub.id, eastHub.id, { type: "outdoor", bidirectional: false }),
      edge("east-exit-to-east-hub", "exit-discharge", eastHub.id, { type: "outdoor" }),
      edge("east-hub-to-alternate", eastHub.id, alternateNode.id, { type: "outdoor" }),
    ];
    campus.assemblyPoints = [primary, alternate];
    campus.assemblyPoints = campus.assemblyPoints.map((point) => ({
      ...point,
      safetyReview: {
        status: "approved",
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin",
        fingerprint: assemblyPointReviewFingerprint(campus, point) ?? undefined,
      },
    }));

    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");

    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.candidates[0]).toMatchObject({
      exitId: "entrance:west-emergency-exit",
      assemblyPointId: "main-assembly-point",
      completeAssemblyRoute: true,
    });
    expect(evaluation.candidates.some((candidate) => candidate.assemblyPointId === "alternate-assembly-point")).toBe(false);
    expect(evaluation.doorReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ doorId: "east-door", state: "connected_without_route" }),
    ]));
  });

  it("does not fall back to an approved Alternate when the assigned Primary is disconnected", () => {
    const source = addApprovedAlternateAssemblyPoint(twoDoorTwoDistinctExitCampus());
    const campus = {
      ...source,
      navEdges: source.navEdges?.filter((candidate) => candidate.id !== "assembly-hub-to-point"),
    };

    expect(planStudentEmergencyRoute(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: ["west-door", "east-door"],
    })).toBeNull();
  });

  it("keeps an approved single Route A active when Smart Multi-Exit is off", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    const candidate = evaluation.candidates[0];
    campus.buildings[0].floors[0].rooms[0].emergencyEvacuation = {
      enabled: false,
      routes: [{
        id: candidate.id,
        doorId: candidate.doorId,
        exitId: candidate.exitId,
        destinationNodeId: candidate.destinationNodeId,
        label: "Primary Exit",
        approved: true,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedRouteSignature: candidate.routeSignature,
      }],
    };

    const resolution = resolveApprovedStudentEvacuationRoutes(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: "assembly-room",
      roomName: "Assembly Room",
      buildingLabel: "Test Building",
      buildingCode: "TEST",
    });

    expect(resolution.configured).toBe(true);
    expect(resolution.routes).toHaveLength(1);
    expect(resolution.routes[0]?.assignment.id).toBe(candidate.id);
    expect(resolution.routes[0]?.candidate.assemblyPointId).toBe("main-assembly-point");
    expect(currentApprovedRoomEvacuationFingerprint(campus, "building", "floor-1", "assembly-room"))
      .toBeTruthy();
  });

  it("validates two connected physical doors to distinct exits and publishes only the two explicitly approved assignments", () => {
    const campus = twoDoorTwoDistinctExitCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    expect(evaluation.doorReadiness).toEqual([
      expect.objectContaining({ doorId: "west-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "east-door", state: "route_ready" }),
    ]);
    expect(evaluation.candidates).toHaveLength(2);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(2);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.doorId))).toEqual(new Set(["west-door", "east-door"]));
    expect(evaluation.candidates.every((candidate) => candidate.route.isGraphBased && candidate.route.isAuthoredGraph && candidate.completeAssemblyRoute)).toBe(true);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.assemblyPointId))).toEqual(new Set(["main-assembly-point"]));
    expect(new Set(evaluation.candidates.map((candidate) => candidate.destinationNodeId))).toEqual(new Set(["assembly-point-node"]));

    const room = campus.buildings[0].floors[0].rooms[0];
    room.emergencyEvacuation = {
      enabled: true,
      routes: evaluation.candidates.map((candidate, index) => ({
        id: candidate.id,
        doorId: candidate.doorId,
        exitId: candidate.exitId,
        destinationNodeId: candidate.destinationNodeId,
        label: index === 0 ? "Route A" : "Route B",
        approved: true,
        approvedAt: "2026-10-14T00:00:00.000Z",
        approvedRouteSignature: candidate.routeSignature,
      })),
    };
    const resolved = resolveApprovedStudentEvacuationRoutes(campus, {
      type: "room",
      buildingId: "building",
      floorNumber: 1,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: "Assembly Building",
      buildingCode: "AB",
    });
    expect(resolved.routes.map((route) => route.label)).toEqual(["Route A", "Route B"]);
    expect(new Set(resolved.routes.map((route) => route.candidate.exitId)).size).toBe(2);
    expect(new Set(resolved.routes.map((route) => route.candidate.destinationNodeId))).toEqual(new Set(["assembly-point-node"]));
    expect(resolved.routes.every((route) => route.candidate.assemblyPointId === "main-assembly-point"
      && route.candidate.route.emergencyAssemblyPointId === "main-assembly-point")).toBe(true);
  });

  it("does not count two connected doors converging on the same final egress as two alternatives", () => {
    const campus = twoDoorSameExitCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    expect(evaluation.doorReadiness).toEqual([
      expect.objectContaining({ doorId: "west-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "east-door", state: "route_ready" }),
    ]);
    expect(evaluation.candidates).toHaveLength(1);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(1);
  });

  it("evaluates three connected doors and returns only the two distinct complete egresses", () => {
    const campus = threeDoorCampus();
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");

    expect(evaluation.doorReadiness).toHaveLength(3);
    expect(evaluation.doorReadiness).toEqual([
      expect.objectContaining({ doorId: "west-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "east-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "south-door", state: "route_ready" }),
    ]);
    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates.map((candidate) => candidate.distanceM)).toEqual(
      [...evaluation.candidates].map((candidate) => candidate.distanceM).sort((a, b) => a - b),
    );
    expect(new Set(evaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(2);
  });

  it("Assembly Hall / COED keeps two room doors as one physical exit and reaches its assigned Assembly Point", () => {
    const campus = relabelPublishedRoomFixture(twoDoorSameExitCampus(), {
      buildingName: "College of Education Building", buildingCode: "COED", roomName: "Assembly Hall", floorNumber: 1,
    });
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");

    expect(evaluation.doorReadiness).toEqual([
      expect.objectContaining({ doorId: "west-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "east-door", state: "route_ready" }),
    ]);
    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.candidates[0]).toMatchObject({
      exitId: "entrance:emergency-exit", assemblyPointId: "main-assembly-point", completeAssemblyRoute: true,
    });
    approveFixtureRoomRoutes(campus, evaluation);
    const student = resolveFixtureRoom(campus);
    expect(student.routes).toHaveLength(1);
    expect(student.routes[0].candidate.route.campusPoints?.at(-1)).toEqual({ x: 330, y: 180 });
  });

  it("CABA Lecture Hall retains both distinct exits through the same assigned Assembly Point", () => {
    const campus = relabelPublishedRoomFixture(twoDoorTwoDistinctExitCampus(), {
      buildingName: "College of Accountancy and Business Administration", buildingCode: "CABA",
      roomName: "CABA Lecture Hall", floorNumber: 1,
    });
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    expect(evaluation.candidates).toHaveLength(2);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(2);
    expect(evaluation.candidates.every((candidate) => candidate.assemblyPointId === "main-assembly-point"
      && candidate.destinationNodeId === "assembly-point-node" && candidate.completeAssemblyRoute)).toBe(true);
    approveFixtureRoomRoutes(campus, evaluation);
    const student = resolveFixtureRoom(campus);
    expect(student.routes.map((route) => route.label)).toEqual(["Route A", "Route B"]);
    expect(new Set(student.routes.map((route) => route.candidate.exitId)).size).toBe(2);
  });

  it("CEIT Lecture Hall calculates both complete alternatives to the connected Assembly Point", () => {
    const campus = relabelPublishedRoomFixture(twoDoorTwoDistinctExitCampus(), {
      buildingName: "College of Engineering and Information Technology", buildingCode: "CEIT",
      roomName: "CEIT Lecture Hall", floorNumber: 6,
    });
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");
    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates.every((candidate) => candidate.completeAssemblyRoute
      && candidate.destinationNodeId === "assembly-point-node" && candidate.route.isAuthoredGraph)).toBe(true);
    expect(evaluation.candidates[0].distanceM).not.toBe(evaluation.candidates[1].distanceM);
    approveFixtureRoomRoutes(campus, evaluation);
    const student = resolveFixtureRoom(campus);
    expect(student.routes).toHaveLength(2);
    expect(student.routes.every((route) => route.candidate.assemblyPointId === "main-assembly-point")).toBe(true);
  });

  it("PLV Auditorium uses its Floor 5 label, excludes the disconnected third door, and preserves two exits", () => {
    const campus = relabelPublishedRoomFixture(threeDoorCampus(), {
      buildingName: "PLV Auditorium", buildingCode: "PLV-AUD", roomName: "PLV Auditorium", floorNumber: 5, floorLabel: "Floor 5",
    });
    campus.navEdges = (campus.navEdges ?? []).filter((candidate) =>
      candidate.id !== "south-door-authored-corridor" && candidate.id !== "south-corridor-to-east-network");
    const evaluation = evaluateRoomEmergencyEvacuation(campus, "building", "floor-1", "assembly-room");

    expect(campus.buildings[0].floors[0].label).toBe("Floor 5");
    expect(evaluation.doorReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ doorId: "west-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "east-door", state: "route_ready" }),
      expect.objectContaining({ doorId: "south-door", state: "disconnected" }),
    ]));
    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates.some((candidate) => candidate.doorId === "south-door")).toBe(false);
    expect(new Set(evaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(2);
    approveFixtureRoomRoutes(campus, evaluation);
    expect(resolveFixtureRoom(campus).routes).toHaveLength(2);
  });
});
