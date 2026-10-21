import type {
  Campus,
  FloorDoor,
  FloorRoom,
  NavigationEdge,
  NavigationNode,
  RoomEmergencyEvacuationConfiguration,
  RoomEmergencyEvacuationRouteAssignment,
} from "../components/map-builder/types";
import {
  buildTestRouteEdges,
  chooseEmergencyDestinationCandidates,
  emergencyEgressRoutePriority,
  routeEdgeTrace,
  type EmergencyDestinationCandidate,
} from "../components/map-builder/TestNavigationPanel";
import { isDoorEligibleForRoom, roomDoorIsValid, ROOM_DOOR_EDGE_TYPE, roomAccessDoorIds } from "./indoorNavigationGraph";
import { plannedRouteFromAuthoredPath, type PlannedRoute } from "./routePlanner";
import { analyzeEmergencyOutdoorConnectivity } from "./emergencyOutdoorConnectivity";
import {
  assignedPrimaryAssemblyPoint,
  hasCampusWidePrimaryDesignation,
  resolvedAssemblyPointsForBuilding,
} from "./emergencyAssemblyPoints";
import { assessEmergencyAuthoredPath } from "./emergencyPathEligibility";

export type EmergencyDoorReadiness = {
  doorId: string;
  label: string;
  state: "disconnected" | "connected_without_route" | "destination_review_required" | "route_needs_review" | "route_ready";
  detail: string;
  routeCount: number;
};

export type EmergencyRouteReviewRequirement = {
  kind: "stairs" | "door" | "path";
  id: string;
  buildingId?: string;
  floorId?: string;
  label: string;
  detail: string;
};

export type RoomEmergencyRouteCandidate = {
  id: string;
  doorId: string;
  doorLabel: string;
  exitId: string;
  exitLabel: string;
  destinationNodeId: string;
  assemblyPointId?: string;
  assemblyPointName?: string;
  assemblyPointDesignation?: EmergencyDestinationCandidate["assemblyPointDesignation"];
  /** Campus Gate is a labeled compatibility fallback only when this building has no assigned Assembly Point. */
  campusGatePurpose?: EmergencyDestinationCandidate["campusGatePurpose"];
  /** The authored graph path reaches its exact destination anchor, independent of approval. */
  completeDestinationRoute?: boolean;
  completeAssemblyRoute?: boolean;
  graphCompleteAssemblyRoute?: boolean;
  /** Connected Admin preview that still crosses infrastructure not designated emergency-safe. */
  emergencyUseReviewRequired?: boolean;
  emergencyReviewRequirements?: EmergencyRouteReviewRequirement[];
  kind: EmergencyDestinationCandidate["kind"];
  distanceM: number;
  routeSignature: string;
  route: PlannedRoute;
};

export type RoomEmergencyEvacuationEvaluation = {
  roomId: string;
  doorReadiness: EmergencyDoorReadiness[];
  candidates: RoomEmergencyRouteCandidate[];
  message: string;
};

function usableDoorLabel(door: FloorDoor | undefined, index: number): string {
  const authored = door?.label?.trim();
  if (authored && !/^door(?:[\s#_-]*\d+)?$/i.test(authored)) return authored;
  return `Room door ${index + 1}`;
}

function egressIdentity(candidate: EmergencyDestinationCandidate): string {
  return candidate.kind === "exterior_stair"
    ? `exterior-stair:${candidate.stairId ?? candidate.entranceNodeId}`
    : `entrance:${candidate.entranceId ?? candidate.entranceNodeId}`;
}

function emergencyTraversableFrom(nodeId: string, edges: NavigationEdge[]): boolean {
  return edges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
    && !edge.closed
    && edge.emergencySafe !== false
    && (edge.startNodeId === nodeId || (edge.bidirectional && edge.endNodeId === nodeId)));
}

/**
 * Admin discovery can preview an authored, physically connected route even
 * when a walking edge or an ordinary Stair landing has not been designated
 * for emergency use yet. Closed links, explicitly identified hazards, and
 * non-designated Elevators remain excluded. This graph is never used for
 * student route resolution or approval.
 */
function emergencyReviewPreviewEdges(campus: Campus, edges: NavigationEdge[]): NavigationEdge[] {
  const nodes = campus.navNodes ?? [];
  return edges.map((edge) => {
    if (edge.emergencySafe !== false || edge.closed || edge.emergencyReason) return edge;
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    const includesElevator = [start, end].some((node) => !!node && (node.elevatorId || node.type === "elevator"));
    if (includesElevator) return edge;
    return { ...edge, emergencySafe: true };
  });
}

function emergencyReviewRequirement(campus: Campus, edge: NavigationEdge): EmergencyRouteReviewRequirement[] {
  const nodes = campus.navNodes ?? [];
  const endpoints = [
    nodes.find((node) => node.id === edge.startNodeId),
    nodes.find((node) => node.id === edge.endNodeId),
  ].filter((node): node is NonNullable<typeof node> => !!node);
  const stairRequirements = endpoints.flatMap((node) => {
    if (!node.stairId || !node.buildingId || !node.floorId) return [];
    const building = campus.buildings.find((item) => item.id === node.buildingId);
    const floor = building?.floors.find((item) => item.id === node.floorId);
    const stair = floor?.stairs.find((item) => item.id === node.stairId);
    // Legacy ordinary stair records without a value use the established open
    // indoor circulation default. Only an explicit false needs review.
    if (!stair || stair.emergencySafe !== false) return [];
    return [{
      kind: "stairs" as const,
      id: stair.id,
      buildingId: building?.id,
      floorId: floor?.id,
      label: `${stair.label?.trim() || "Stair"}${floor?.label ? ` · ${floor.label}` : ""}`,
      detail: "This Stair landing is explicitly excluded from emergency use.",
    }];
  });
  if (stairRequirements.length > 0) {
    return [...new Map(stairRequirements.map((requirement) => [`${requirement.buildingId}:${requirement.floorId}:${requirement.id}`, requirement])).values()];
  }
  const doorNode = endpoints.find((node) => node.doorId);
  if (doorNode?.doorId && doorNode.buildingId && doorNode.floorId) {
    const building = campus.buildings.find((item) => item.id === doorNode.buildingId);
    const floor = building?.floors.find((item) => item.id === doorNode.floorId);
    const door = floor?.doors.find((item) => item.id === doorNode.doorId);
    return [{
      kind: "door",
      id: doorNode.doorId,
      buildingId: building?.id,
      floorId: floor?.id,
      label: door?.label?.trim() || doorNode.name?.trim() || "Door connection",
      detail: "Review this Door connection for emergency use.",
    }];
  }
  const name = endpoints.map((node) => node.name?.trim()).find(Boolean);
  const context = endpoints.find((node) => node.buildingId && node.floorId);
  return [{
    kind: "path",
    id: edge.id,
    ...(context?.buildingId ? { buildingId: context.buildingId } : {}),
    ...(context?.floorId ? { floorId: context.floorId } : {}),
    label: name ? `${name} connection` : "Walking Network connection",
    detail: "Review this connection for emergency use.",
  }];
}

function routeSignature(input: {
  room: FloorRoom;
  door: FloorDoor;
  roomNodeId: string;
  roomDoorEdge: NavigationEdge;
  candidate: EmergencyDestinationCandidate;
  pathNodeIds: string[];
  pathEdgeTrace: ReturnType<typeof routeEdgeTrace>;
  sourceEdges: NavigationEdge[];
  waypoints: Array<{ x: number; y: number }>;
  distanceM: number;
}): string {
  const emergencyEligibility = input.pathEdgeTrace.map((traversal) => {
    const source = input.sourceEdges.find((edge) => edge.id === traversal.edgeId);
    return [traversal.edgeId, source?.emergencySafe, source?.emergencyReason, source?.closed];
  });
  const hasExplicitEmergencyConstraint = emergencyEligibility.some(([, emergencySafe, emergencyReason, closed]) =>
    emergencySafe === false || !!emergencyReason || closed === true);
  const stable = JSON.stringify({
    room: [input.room.id, input.room.buildingId, input.room.floorId],
    // The normalized room-door graph adapter synthesizes a fresh edge UUID on
    // each evaluation. Fingerprint its stable authored relationship instead
    // of that transient runtime ID so approvals survive route revalidation.
    roomDoorTransition: [input.roomNodeId, input.door.id, input.roomDoorEdge.startNodeId, input.roomDoorEdge.endNodeId, input.roomDoorEdge.bidirectional, input.roomDoorEdge.closed, input.roomDoorEdge.emergencySafe],
    door: [input.door.id, input.door.wallId, input.door.x, input.door.y, input.door.width, input.door.offset],
    egress: [input.candidate.kind, egressIdentity(input.candidate), input.candidate.nodeId],
    destination: [input.candidate.assemblyPointId ?? null, input.candidate.assemblyPointDesignation ?? null, input.candidate.completeAssemblyRoute ?? false],
    nodes: input.pathNodeIds,
    edges: input.pathEdgeTrace.map((edge) => [edge.edgeId, edge.fromNodeId, edge.toNodeId, edge.reversed, edge.bendPoints]),
    ...(hasExplicitEmergencyConstraint ? { emergencyEligibility } : {}),
    waypoints: input.waypoints,
    distanceM: input.distanceM,
  });
  // Small deterministic change detector, not a security checksum.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < stable.length; index += 1) {
    const code = stable.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function isCorrectRoomDoorTransition(
  room: FloorRoom,
  doorNode: NavigationNode,
  roomNode: NavigationNode | undefined,
  edges: NavigationEdge[],
): boolean {
  return !!roomNode
    && roomNode.roomId === room.id
    && roomNode.buildingId === room.buildingId
    && roomNode.floorId === room.floorId
    && !!roomDoorTransitionEdge(roomNode, doorNode, edges);
}

function roomDoorTransitionEdge(roomNode: NavigationNode, doorNode: NavigationNode, edges: NavigationEdge[]): NavigationEdge | undefined {
  return edges.find((edge) => edge.type === ROOM_DOOR_EDGE_TYPE
    && !edge.closed
    && ((edge.startNodeId === roomNode.id && edge.endNodeId === doorNode.id)
      || (edge.bidirectional && edge.startNodeId === doorNode.id && edge.endNodeId === roomNode.id)));
}

/**
 * Evaluate only authored Room access Doors. Every candidate begins at the
 * exact linked Door navigation node and is routed through the existing
 * Test Route emergency graph, including obstacle checks, emergency-safe edge
 * filtering, real floor transitions, and complete egress validation.
 */
export function evaluateRoomEmergencyEvacuation(
  campus: Campus,
  buildingId: string,
  floorId: string,
  roomId: string,
  options: { eligibleOnly?: boolean } = {},
): RoomEmergencyEvacuationEvaluation {
  const building = campus.buildings.find((item) => item.id === buildingId);
  const floor = building?.floors.find((item) => item.id === floorId);
  const room = floor?.rooms.find((item) => item.id === roomId);
  if (!building || !floor || !room || room.buildingId !== buildingId || room.floorId !== floorId) {
    return { roomId, doorReadiness: [], candidates: [], message: "The selected Room or Floor no longer exists." };
  }

  const edges = buildTestRouteEdges(campus);
  const reviewPreviewEdges = emergencyReviewPreviewEdges(campus, edges);
  // A Room↔Door transition is a destination-resolution adapter, not an
  // authored walking segment through the room. Each evacuation candidate
  // already starts at its assigned physical Door, so allowing the pathfinder
  // to leave that Door through a shared Room anchor can fabricate a shortcut
  // from one entrance to another (especially in large rooms without aisle
  // geometry). Keep the semantic edge in the approval fingerprint below, but
  // route only over actual traversable navigation edges.
  const evacuationTraversalEdges = edges.filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE);
  const nodes = campus.navNodes ?? [];
  const doorIds = roomAccessDoorIds(room);
  if (doorIds.length === 0) {
    return {
      roomId,
      doorReadiness: [],
      candidates: [],
      message: "Assign and connect at least one physical Room door before validating evacuation routes.",
    };
  }

  const doorReadiness: EmergencyDoorReadiness[] = [];
  const candidates: RoomEmergencyRouteCandidate[] = [];
  doorIds.forEach((doorId, index) => {
    const door = floor.doors.find((item) => item.id === doorId);
    const label = usableDoorLabel(door, index);
    if (!door) {
      doorReadiness.push({ doorId, label, state: "disconnected", detail: "The assigned Room door no longer exists on this Floor.", routeCount: 0 });
      return;
    }
    const doorNode = nodes.find((node) => node.doorId === door.id
      && node.buildingId === buildingId && node.floorId === floorId);
    const roomNode = nodes.find((node) => node.roomId === room.id
      && node.buildingId === buildingId && node.floorId === floorId);
    const physicalLink = roomDoorIsValid(room, door, floor.walls);
    if (!physicalLink) {
      doorReadiness.push({
        doorId,
        label,
        state: "disconnected",
        detail: "The Door is not a valid physical access opening for this Room.",
        routeCount: 0,
      });
      return;
    }
    if (!doorNode || !isDoorEligibleForRoom(room, door, floor.walls, nodes, { rooms: floor.rooms })) {
      doorReadiness.push({ doorId, label, state: "disconnected", detail: "The Door has no valid navigation node on this Building and Floor.", routeCount: 0 });
      return;
    }
    const roomDoorEdge = roomNode ? roomDoorTransitionEdge(roomNode, doorNode, reviewPreviewEdges) : undefined;
    if (!roomNode || !isCorrectRoomDoorTransition(room, doorNode, roomNode, reviewPreviewEdges) || !roomDoorEdge) {
      doorReadiness.push({
        doorId,
        label,
        state: "disconnected",
        detail: "The Room-side Door transition is missing or incomplete.",
        routeCount: 0,
      });
      return;
    }
    if (!emergencyTraversableFrom(doorNode.id, reviewPreviewEdges)) {
      const physicallyConnected = reviewPreviewEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
        && !edge.closed
        && (edge.startNodeId === doorNode.id || (edge.bidirectional && edge.endNodeId === doorNode.id)));
      doorReadiness.push({
        doorId,
        label,
        state: physicallyConnected ? "connected_without_route" : "disconnected",
        detail: physicallyConnected
          ? "The Door connects only to a closed or non-traversable Walking Network connection."
          : "The Door is linked to the Room, but has no traversable Walking Network connection.",
        routeCount: 0,
      });
      return;
    }

    // Room-level route plans use the building's designated Primary Assembly
    // Point for every exit alternative. An Alternate is never selected merely
    // because that exit can reach it when the Primary is not reachable; this
    // product has no approved automatic fallback policy to authorize that.
    const nearestEligible = campus.settings?.emergencyDestinationPolicy === "nearest_eligible";
    const selection = nearestEligible
      ? {
          primaryOnly: false,
          allowExitOnlyPreview: true,
          eligibleOnly: options.eligibleOnly,
        } as const
      : {
          primaryOnly: true,
          allowExitOnlyPreview: true,
          eligibleOnly: options.eligibleOnly,
        } as const;
    const selected = chooseEmergencyDestinationCandidates(campus, evacuationTraversalEdges, doorNode.id, selection);
    const hasEmergencyReviewEdges = reviewPreviewEdges.some((edge, edgeIndex) => edge !== edges[edgeIndex]);
    const reviewSelected = hasEmergencyReviewEdges && !options.eligibleOnly
      ? chooseEmergencyDestinationCandidates(campus, reviewPreviewEdges.filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE), doorNode.id, selection)
      : selected;
    const toRouteCandidates = (
      results: typeof selected,
      resultEdges: NavigationEdge[],
    ): RoomEmergencyRouteCandidate[] => results.flatMap((result) => {
      const planned = plannedRouteFromAuthoredPath(result.path, campus, resultEdges, room.name || "Selected Room", result.candidate.label);
      if (!planned) return [];
      const pathEdgeTrace = routeEdgeTrace(result.path, resultEdges);
      const sourceById = new Map(edges.map((edge) => [edge.id, edge]));
      const pathAssessment = assessEmergencyAuthoredPath(campus, edges, {
        nodeIds: result.path.nodeIds,
        edgeIds: pathEdgeTrace.map((traversal) => traversal.edgeId),
        destinationNodeId: result.candidate.nodeId,
        originBuildingId: buildingId,
        destinationPoint: result.path.waypoints.at(-1),
      });
      const routeReviewEdges = pathEdgeTrace.flatMap((traversal) => {
        const source = sourceById.get(traversal.edgeId ?? "");
        return source?.emergencySafe === false && !source.closed && !source.emergencyReason ? [source] : [];
      });
      if (roomDoorEdge.emergencySafe === false && !roomDoorEdge.closed && !roomDoorEdge.emergencyReason) routeReviewEdges.push(roomDoorEdge);
      const reviewRequirements = [...new Map(routeReviewEdges.flatMap((edge) => emergencyReviewRequirement(campus, edge))
        .concat(pathAssessment.issues)
        .map((requirement) => [`${requirement.kind}:${requirement.buildingId ?? ""}:${requirement.floorId ?? ""}:${requirement.id}`, requirement])).values()];
      if (roomDoorEdge.emergencyReason) {
        reviewRequirements.push({
          kind: "door",
          id: roomDoorEdge.id,
          buildingId,
          floorId,
          label: doorNode?.name?.trim() || label,
          detail: `The Room-to-Door connection is marked unsafe for emergency use (${roomDoorEdge.emergencyReason}).`,
        });
      }
      const emergencyUseReviewRequired = reviewRequirements.length > 0 || !pathAssessment.emergencyEligible;
      const graphCompleteAssemblyRoute = result.candidate.graphCompleteAssemblyRoute === true;
      // Assignment and a real graph path authorize the destination. Legacy
      // location-review fingerprints are retained but do not gate routing.
      const completeAssemblyRoute = graphCompleteAssemblyRoute
        && !!result.candidate.assemblyPointId
        && pathAssessment.connected && !emergencyUseReviewRequired;
      const signature = routeSignature({
        room,
        door,
        roomNodeId: roomNode!.id,
        roomDoorEdge,
        candidate: result.candidate,
        pathNodeIds: result.path.nodeIds,
        pathEdgeTrace,
        sourceEdges: edges,
        waypoints: result.path.waypoints,
        distanceM: result.path.distanceM,
      });
      return [{
        id: `${door.id}::${egressIdentity(result.candidate)}${nearestEligible && result.candidate.assemblyPointDesignation !== "primary" && result.candidate.assemblyPointId ? `::assembly:${result.candidate.assemblyPointId}` : ""}`,
        doorId: door.id,
        doorLabel: label,
        exitId: egressIdentity(result.candidate),
        exitLabel: result.candidate.label,
        destinationNodeId: result.candidate.nodeId,
        assemblyPointId: result.candidate.assemblyPointId,
        assemblyPointName: result.candidate.assemblyPointName,
        assemblyPointDesignation: result.candidate.assemblyPointDesignation,
        campusGatePurpose: result.candidate.campusGatePurpose,
        completeDestinationRoute: pathAssessment.connected,
        completeAssemblyRoute,
        graphCompleteAssemblyRoute,
        emergencyUseReviewRequired,
        emergencyReviewRequirements: reviewRequirements,
        kind: result.candidate.kind,
        distanceM: result.path.distanceM,
        routeSignature: signature,
        route: {
          ...planned,
          emergencyDestinationLabel: result.candidate.assemblyPointName ?? result.candidate.label,
          emergencyAssemblyPointId: result.candidate.assemblyPointId,
        },
      }];
    });
    const strictCandidates = toRouteCandidates(selected, evacuationTraversalEdges);
    const reviewCandidates = options.eligibleOnly
      ? []
      : toRouteCandidates(reviewSelected, reviewPreviewEdges.filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE));
    const candidateById = new Map<string, RoomEmergencyRouteCandidate>();
    for (const candidate of [...reviewCandidates, ...strictCandidates]) {
      const existing = candidateById.get(candidate.id);
      if (!existing
        || Number(candidate.emergencyUseReviewRequired) < Number(existing.emergencyUseReviewRequired)
        || (candidate.emergencyUseReviewRequired === existing.emergencyUseReviewRequired
          && Number(candidate.completeAssemblyRoute) > Number(existing.completeAssemblyRoute))) candidateById.set(candidate.id, candidate);
    }
    const doorCandidates = [...candidateById.values()];

    const completeAssemblyCandidates = doorCandidates.filter((candidate) => candidate.completeAssemblyRoute);
    const graphAssemblyCandidates = doorCandidates.filter((candidate) => candidate.graphCompleteAssemblyRoute);
    doorReadiness.push(completeAssemblyCandidates.length > 0
      ? { doorId, label, state: "route_ready", detail: `${completeAssemblyCandidates.length} complete, eligible Assembly Point route${completeAssemblyCandidates.length === 1 ? "" : "s"} found. Routes are calculated automatically from the campus graph.`, routeCount: completeAssemblyCandidates.length }
      : graphAssemblyCandidates.length > 0
        ? { doorId, label, state: "route_needs_review", detail: `A complete graph path reaches ${nearestEligible ? "an assigned Assembly Point" : "the assigned Primary Assembly Point"}, but one or more connections or Stair landings still need emergency-use eligibility.`, routeCount: 0 }
      : doorCandidates.length > 0
          ? { doorId, label, state: "connected_without_route", detail: "A building-exit preview is available, but no connected route to the assigned Assembly Point is available.", routeCount: 0 }
      : { doorId, label, state: "connected_without_route", detail: "The Door is connected to the emergency graph, but no complete emergency-safe route to a configured egress was found.", routeCount: 0 });
    candidates.push(...doorCandidates);
  });

  // A General Entrance is a fallback only when no designated Emergency Exit
  // or complete Exterior Emergency Stair can be reached from any Room Door.
  const designated = candidates.filter((candidate) => candidate.kind !== "general");
  const qualifying = designated.length > 0 ? designated : candidates;
  qualifying.sort((left, right) => Number(right.completeAssemblyRoute) - Number(left.completeAssemblyRoute)
    || Number(left.emergencyUseReviewRequired) - Number(right.emergencyUseReviewRequired)
    || emergencyEgressRoutePriority(campus, left, left.route.authoredGraphNodeIds ?? [])
      - emergencyEgressRoutePriority(campus, right, right.route.authoredGraphNodeIds ?? [])
    || left.distanceM - right.distanceM
    || left.exitId.localeCompare(right.exitId)
    || left.doorId.localeCompare(right.doorId)
    || left.destinationNodeId.localeCompare(right.destinationNodeId));
  // Multiple room doors can converge on the same final physical exit. Keep
  // the shortest complete route for that exit so two assignments cannot
  // appear to be independent evacuation alternatives when they are not.
  const bestRoutePerExit = new Map<string, RoomEmergencyRouteCandidate>();
  for (const candidate of qualifying) {
    const identity = campus.settings?.emergencyDestinationPolicy === "nearest_eligible"
      ? `${candidate.exitId}:${candidate.assemblyPointId ?? "campus-gate"}`
      : candidate.exitId;
    if (!bestRoutePerExit.has(identity)) bestRoutePerExit.set(identity, candidate);
  }
  const distinctExitCandidates = [...bestRoutePerExit.values()];

  const completeRouteCount = distinctExitCandidates.filter((candidate) => candidate.completeAssemblyRoute).length;
  const graphRouteCount = distinctExitCandidates.filter((candidate) => candidate.graphCompleteAssemblyRoute).length;
  const nearestEligible = campus.settings?.emergencyDestinationPolicy === "nearest_eligible";
  const configuredAssignments = (campus.assemblyPoints ?? []).flatMap((point) =>
    (point.buildingAssignments ?? []).filter((assignment) => assignment.buildingId === buildingId).map((assignment) => ({ point, assignment })));
  const primaryAssignments = configuredAssignments.filter(({ assignment }) => assignment.designation === "primary");
  const resolvedPoints = resolvedAssemblyPointsForBuilding(campus, buildingId, nearestEligible ? "nearest_eligible" : "fixed_primary");
  const primaryAssignmentProblem = nearestEligible
    ? resolvedPoints.length === 0
      ? hasCampusWidePrimaryDesignation(campus)
        ? "Restore the designated campus-wide Primary Assembly Point and its outdoor anchor."
        : configuredAssignments.length > 0
          ? "Restore a valid outdoor Assembly Point anchor and building assignment."
          : "Assign a building Assembly Point or designate a campus-wide Primary."
      : resolvedPoints.every(({ point }) => analyzeEmergencyOutdoorConnectivity(campus, point).state !== "connected")
          ? "Connect the resolved Assembly Point to the campus outdoor paths."
          : null
    : primaryAssignments.length > 1
      ? "Resolve the conflicting Primary Assembly Point assignments for this Building."
      : (() => {
          const point = assignedPrimaryAssemblyPoint(campus, buildingId);
          if (!point) return hasCampusWidePrimaryDesignation(campus)
            ? "Restore the designated campus-wide Primary Assembly Point and its outdoor anchor."
            : "Assign one Primary Assembly Point to this Building or designate a campus-wide Primary.";
          if (analyzeEmergencyOutdoorConnectivity(campus, point).state !== "connected") return "Connect the resolved Primary Assembly Point to the campus outdoor paths.";
          return null;
        })();
  return {
    roomId,
    doorReadiness,
    candidates: distinctExitCandidates,
    message: completeRouteCount > 0
      ? `${completeRouteCount} distinct complete Assembly Point route${completeRouteCount === 1 ? "" : "s"} found. Graph connectivity does not establish that a location is physically safe or campus-approved.`
      : graphRouteCount > 0
        ? `A complete graph path reaches ${nearestEligible ? "an assigned Assembly Point" : "the assigned Primary Assembly Point"}, but one or more path segments still need emergency-use eligibility.`
      : distinctExitCandidates.length > 0
        ? primaryAssignmentProblem ?? "No connected Assembly Point route is available. The building-exit preview is incomplete and must not be treated as an evacuation destination."
        : primaryAssignmentProblem ?? "No complete connected emergency route is available. No route was generated from proximity alone.",
  };
}

export function approvedRoomEmergencyCandidates(
  evaluation: RoomEmergencyEvacuationEvaluation,
  config: RoomEmergencyEvacuationConfiguration | undefined,
): Array<{ assignment: RoomEmergencyEvacuationRouteAssignment; candidate: RoomEmergencyRouteCandidate }> {
  if (!config) return [];
  const byId = new Map(evaluation.candidates.map((candidate) => [candidate.id, candidate]));
  return (config.routes ?? []).slice(0, config.enabled ? 2 : 1).flatMap((assignment) => {
    if (!assignment.approved || !assignment.approvedRouteSignature) return [];
    const candidate = byId.get(assignment.id);
    if (!candidate || candidate.completeAssemblyRoute === false || candidate.graphCompleteAssemblyRoute === false || candidate.doorId !== assignment.doorId
      || candidate.exitId !== assignment.exitId
      || candidate.destinationNodeId !== assignment.destinationNodeId
      || candidate.routeSignature !== assignment.approvedRouteSignature) return [];
    return [{ assignment, candidate }];
  });
}
