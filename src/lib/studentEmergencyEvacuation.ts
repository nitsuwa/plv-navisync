import type { Campus, RoomEmergencyEvacuationRouteAssignment } from "../components/map-builder/types";
import { buildTestRouteEdges, emergencyEgressRoutePriority, routeEdgeTrace } from "../components/map-builder/TestNavigationPanel";
import type { RoomDest } from "./combinedPathfinding";
import type { Pt } from "./routePlanner";
import {
  approvedRoomEmergencyCandidates,
  evaluateRoomEmergencyEvacuation,
  type RoomEmergencyEvacuationEvaluation,
  type RoomEmergencyRouteCandidate,
} from "./roomEmergencyEvacuation";
import {
  assignedPrimaryAssemblyPoint,
  hasEmergencyAssemblyPointConfiguredForBuilding,
  isAssemblyPointResolvedForBuilding,
} from "./emergencyAssemblyPoints";
import { assessEmergencyAuthoredPath } from "./emergencyPathEligibility";

/** One eligibility gate shared by preview generation, route switching, and Start. */
export function isAutomaticStudentEvacuationCandidateEligible(
  campus: Campus,
  candidate: RoomEmergencyRouteCandidate,
  routeEdges: ReturnType<typeof buildTestRouteEdges> = buildTestRouteEdges(campus),
): boolean {
  const nodeIds = candidate.route.authoredGraphNodeIds ?? [];
  // PlannedRoute stores only edge IDs from its original search traversal;
  // generated physical transitions can omit an edge ID. Rebuild the full
  // node-to-node trace from the current graph, as route generation does, so
  // the final Student gate validates every hop without treating a sparse ID
  // list as an incomplete path.
  const edgeIds = routeEdgeTrace({ nodeIds, edgeTraversals: [] }, routeEdges, candidate.route.authoredGraphEdgeIds).map((traversal) => traversal.edgeId);
  const originNode = campus.navNodes?.find((node) => node.id === nodeIds[0]);
  const buildingId = originNode?.buildingId;
  const destinationNode = campus.navNodes?.find((node) => node.id === candidate.destinationNodeId);
  const path = assessEmergencyAuthoredPath(campus, routeEdges, {
    nodeIds,
    edgeIds,
    destinationNodeId: candidate.destinationNodeId,
    originBuildingId: buildingId,
    destinationPoint: candidate.route.campusPoints?.at(-1) ?? candidate.route.points.at(-1),
  });
  if (!candidate.completeDestinationRoute || !path.connected || !path.emergencyEligible
    || candidate.emergencyUseReviewRequired
    || !candidate.route.isAuthoredGraph || !destinationNode) return false;

  if (candidate.assemblyPointId) {
    const point = campus.assemblyPoints?.find((item) => item.id === candidate.assemblyPointId);
    if (!point || !buildingId || candidate.completeAssemblyRoute !== true || candidate.graphCompleteAssemblyRoute !== true
      || point.navNodeId !== candidate.destinationNodeId || destinationNode.assemblyPointId !== point.id
      || candidate.route.emergencyAssemblyPointId !== point.id
      || !isAssemblyPointResolvedForBuilding(campus, point, buildingId)) return false;
    return campus.settings?.emergencyDestinationPolicy === "nearest_eligible"
      ? candidate.assemblyPointDesignation === "primary" || candidate.assemblyPointDesignation === "alternate"
      : candidate.assemblyPointDesignation === "primary"
        && assignedPrimaryAssemblyPoint(campus, buildingId)?.id === point.id;
  }

  if (candidate.campusGatePurpose === undefined || !buildingId
    || hasEmergencyAssemblyPointConfiguredForBuilding(campus, buildingId)) return false;
  const gate = destinationNode.gateId
    ? campus.markers?.find((marker) => marker.id === destinationNode.gateId && marker.type === "gate")
    : undefined;
  const gatePurpose = gate?.purpose === "emergency_exit" ? "emergency_exit" : gate ? "general" : undefined;
  return Boolean(gate && gatePurpose === candidate.campusGatePurpose);
}

export type ApprovedStudentEvacuationRoute = {
  id: string;
  label: string;
  assignment: RoomEmergencyEvacuationRouteAssignment;
  candidate: RoomEmergencyRouteCandidate;
};

/**
 * Resolve the current authored evacuation graph for navigation without
 * requiring a persisted per-room Route A/B approval. Only complete candidates
 * that satisfy graph-derived destination and emergency-use checks are returned
 * for Student guidance. A Campus Gate candidate is
 * returned only when the building has no Assembly Point assignment, and is
 * explicitly labeled as a fallback.
 */
export function resolveAutomaticStudentEvacuationRoutes(
  campus: Campus | null | undefined,
  room: RoomDest | null | undefined,
): StudentEvacuationRouteResolution {
  if (!campus || !room || room.type !== "room") {
    return { configured: false, routes: [], message: null };
  }
  const building = campus.buildings.find((candidate) => candidate.id === room.buildingId);
  const floor = building?.floors.find((candidate) => candidate.number === room.floorNumber);
  const authoredRoom = floor?.rooms.find((candidate) => candidate.id === room.roomId);
  if (!building || !floor || !authoredRoom) {
    return { configured: false, routes: [], message: "This room is not available in the current campus map." };
  }

  // Legacy Smart Multi-Exit settings are retained in the authored snapshot,
  // but route alternatives are now discovered automatically. Existing
  // per-room enablement no longer gates route calculation or choice display.
  const configuration = authoredRoom.emergencyEvacuation;
  const evaluation = evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, authoredRoom.id, { eligibleOnly: true });
  const routeEdges = buildTestRouteEdges(campus);
  const hasAssignedAssemblyPoint = hasEmergencyAssemblyPointConfiguredForBuilding(campus, building.id);
  const nearestEligible = campus.settings?.emergencyDestinationPolicy === "nearest_eligible";
  const eligibleCandidates = evaluation.candidates.filter((candidate) => {
    if (!isAutomaticStudentEvacuationCandidateEligible(campus, candidate, routeEdges)) return false;
    if (hasAssignedAssemblyPoint) {
      return Boolean(candidate.assemblyPointId)
        && (nearestEligible || candidate.assemblyPointDesignation === "primary");
    }
    return !candidate.assemblyPointId && candidate.campusGatePurpose !== undefined;
  });
  let selectedAssemblyPointId: RoomEmergencyRouteCandidate["assemblyPointId"];
  if (nearestEligible) {
    const bestCostByPoint = new Map<string, number>();
    for (const candidate of eligibleCandidates) {
      if (!candidate.assemblyPointId) continue;
      bestCostByPoint.set(candidate.assemblyPointId, Math.min(
        bestCostByPoint.get(candidate.assemblyPointId) ?? Number.POSITIVE_INFINITY,
        candidate.distanceM,
      ));
    }
    selectedAssemblyPointId = [...bestCostByPoint.entries()]
      .sort(([leftId, leftCost], [rightId, rightCost]) => leftCost - rightCost || leftId.localeCompare(rightId))[0]?.[0];
  }
  const destinationCandidates = selectedAssemblyPointId
    ? eligibleCandidates.filter((candidate) => candidate.assemblyPointId === selectedAssemblyPointId)
    : eligibleCandidates;

  // Room doors can converge on the same physical building egress. Keep the
  // best path for each real exit, so two displayed choices always represent
  // two distinct evacuation exits rather than duplicate doorway variants.
  const bestByPhysicalExit = new Map<string, RoomEmergencyRouteCandidate>();
  for (const candidate of destinationCandidates) {
    const identity = candidate.exitId || candidate.exitLabel;
    const current = bestByPhysicalExit.get(identity);
    const candidatePriority = emergencyEgressRoutePriority(campus, candidate, candidate.route.authoredGraphNodeIds ?? []);
    const currentPriority = current
      ? emergencyEgressRoutePriority(campus, current, current.route.authoredGraphNodeIds ?? [])
      : Number.POSITIVE_INFINITY;
    if (!current || candidatePriority < currentPriority
      || (candidatePriority === currentPriority && candidate.distanceM < current.distanceM)) {
      bestByPhysicalExit.set(identity, candidate);
    }
  }
  const candidates = [...bestByPhysicalExit.values()].sort((left, right) =>
    emergencyEgressRoutePriority(campus, left, left.route.authoredGraphNodeIds ?? [])
      - emergencyEgressRoutePriority(campus, right, right.route.authoredGraphNodeIds ?? [])
    || left.distanceM - right.distanceM
    || left.exitLabel.localeCompare(right.exitLabel));

  const existingApprovals = approvedRoomEmergencyCandidates(evaluation, configuration);
  const approvalByCandidateId = new Map(existingApprovals.map(({ assignment, candidate }) => [candidate.id, assignment]));
  const routes = candidates.slice(0, 2).map((candidate) => {
    const savedApproval = approvalByCandidateId.get(candidate.id);
    const fallback = !hasAssignedAssemblyPoint && Boolean(candidate.campusGatePurpose);
    const label = fallback
      ? "Campus Gate · Fallback"
      : candidate.exitLabel.split(" -> ")[0].trim() || candidate.exitLabel;
    const assignment: RoomEmergencyEvacuationRouteAssignment = savedApproval ?? {
      id: candidate.id,
      doorId: candidate.doorId,
      exitId: candidate.exitId,
      destinationNodeId: candidate.destinationNodeId,
      label,
      approved: false,
    };
    const routeCandidate = fallback
      ? {
          ...candidate,
          route: {
            ...candidate.route,
            emergencyDestinationLabel: "Campus Gate · Fallback",
            emergencyDestinationFallback: true,
          },
        }
      : candidate;
    return { id: candidate.id, label, assignment, candidate: routeCandidate };
  });

  return {
    // `configured` continues to mean that meaningful Route A/B alternatives
    // exist. Consumers that need to know whether any automatic route is
    // available must use routes.length; a single valid route is still a
    // complete SOS result, but it is not a multi-exit configuration.
    configured: routes.length > 1,
    routes,
    evaluation,
    message: routes.length ? null : hasAssignedAssemblyPoint
      ? "No complete emergency-safe route reaches the assigned Assembly Point. Follow posted emergency instructions."
      : "No complete emergency-safe route to a Campus Gate is available. Follow posted emergency instructions.",
  };
}

export type StudentEvacuationRouteResolution = {
  /** True when automatic discovery found meaningful alternative physical exits. */
  configured: boolean;
  routes: ApprovedStudentEvacuationRoute[];
  message: string | null;
  /** Validated room-door egress candidates, including exit-only previews. */
  evaluation?: RoomEmergencyEvacuationEvaluation;
};

export type StudentEmergencyRouteSegment = {
  id: string;
  label: string;
  points: Pt[];
  color: string;
  doorLabel: string;
  exitLabel: string;
  showDoorMarker: boolean;
  showExitMarker: boolean;
};

// Keep SOS routes inside the emergency palette: Route A uses the familiar
// emergency red, while Route B uses a distinct rust tone and dashed pattern.
const emergencyRouteColor = (index: number) => index === 0 ? "#dc2626" : "#c2410c";

/** Map labels stay short; the route sheet and instructions carry full exit names. */
export function studentEmergencyRouteMapLabel(index: number): string {
  return index === 0 ? "Route A" : "Route B";
}

/**
 * Fingerprint the exact approved assignments currently resolved against the
 * authored emergency graph. It is a change detector shared by Admin review,
 * the published video reference, and student visibility checks; it is not an
 * authorization token or a cryptographic signature.
 */
export function studentEvacuationRouteFingerprint(routes: readonly ApprovedStudentEvacuationRoute[]): string | null {
  if (!routes.length) return null;
  const values = routes.slice(0, 2).map(({ assignment, candidate }) => [
    assignment.id || candidate.id,
    assignment.doorId,
    assignment.exitId,
    assignment.destinationNodeId,
    // Automatic SOS routes do not require a saved room-level approval. Their
    // current authored graph signature is still suitable for change detection
    // when an Admin explicitly reviews a video against that route.
    assignment.approvedRouteSignature || candidate.routeSignature,
  ] as const);
  return JSON.stringify(values);
}

/** Returns only approved routes whose fingerprints still match the current graph. */
export function currentApprovedRoomEvacuationFingerprint(
  campus: Campus,
  buildingId: string,
  floorId: string,
  roomId: string,
): string | null {
  const building = campus.buildings.find((candidate) => candidate.id === buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === floorId);
  const room = floor?.rooms.find((candidate) => candidate.id === roomId);
  const configuration = room?.emergencyEvacuation;
  if (!building || !floor || !room || !configuration || (!configuration.enabled && !configuration.routes?.length)) return null;
  const evaluation = evaluateRoomEmergencyEvacuation(campus, buildingId, floorId, roomId);
  const routes = approvedRoomEmergencyCandidates(evaluation, configuration).map(({ assignment, candidate }) => ({
    id: assignment.id,
    label: assignment.label.trim() || candidate.exitLabel,
    assignment,
    candidate,
  }));
  return studentEvacuationRouteFingerprint(routes);
}

/**
 * Fingerprint the actual eligible route set Student SOS will calculate for a
 * room. This keeps video review aligned with automatic routing when no
 * individual Route A/B approval has been saved, without treating an
 * unapproved Assembly Point or emergency-use connection as eligible.
 */
export function currentStudentEmergencyRouteFingerprint(
  campus: Campus,
  buildingId: string,
  floorId: string,
  roomId: string,
): string | null {
  const building = campus.buildings.find((candidate) => candidate.id === buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === floorId);
  const room = floor?.rooms.find((candidate) => candidate.id === roomId);
  if (!building || !floor || !room) return null;

  const resolution = resolveAutomaticStudentEvacuationRoutes(campus, {
    type: "room",
    buildingId,
    floorNumber: floor.number,
    roomId,
    roomName: room.name,
    buildingLabel: building.name,
    buildingCode: building.code,
    accessDoorIds: room.accessDoorIds,
  });
  // Campus Gate is an explicit navigation fallback, not an approved gathering
  // destination for an evacuation video review.
  const assemblyRoutes = resolution.routes.filter(({ candidate }) => Boolean(candidate.assemblyPointId));
  return studentEvacuationRouteFingerprint(assemblyRoutes);
}

/** Campus legs used consistently by the 2D overlay and the 3D route surface. */
export function studentEmergencyCampusRouteSegments(
  routes: readonly ApprovedStudentEvacuationRoute[],
): StudentEmergencyRouteSegment[] {
  return routes.flatMap((option, routeIndex) => {
    const route = option.candidate.route;
    const campusLegs = route.contextLegs?.filter((leg) => leg.kind === "campus" && leg.waypoints.length > 1) ?? [];
    const points = campusLegs.length
      ? campusLegs.map((leg) => leg.waypoints)
      : route.campusPoints && route.campusPoints.length > 1 ? [route.campusPoints]
        : route.points.length > 1 ? [route.points] : [];
    return points.map((waypoints, legIndex) => ({
      id: `${option.id}-campus-${legIndex}`,
      label: studentEmergencyRouteMapLabel(routeIndex),
      points: waypoints,
      color: emergencyRouteColor(routeIndex),
      doorLabel: option.candidate.doorLabel,
      exitLabel: option.candidate.exitLabel,
      showDoorMarker: legIndex === 0,
      showExitMarker: legIndex === points.length - 1,
    }));
  });
}

/** Floor-local alternatives for 2D/3D Student Map renderers. */
export function studentEmergencyFloorRouteSegments(
  routes: readonly ApprovedStudentEvacuationRoute[],
  buildingId: string,
  floorNumber: number,
): StudentEmergencyRouteSegment[] {
  return routes.flatMap((option, routeIndex) => {
    const segment = option.candidate.route.indoorSegments?.find((candidate) =>
      candidate.buildingId === buildingId && candidate.floorNumber === floorNumber,
    );
    return segment && segment.waypoints.length > 1 ? [{
      id: option.id,
      label: studentEmergencyRouteMapLabel(routeIndex),
      points: segment.waypoints,
      color: emergencyRouteColor(routeIndex),
      doorLabel: option.candidate.doorLabel,
      exitLabel: option.candidate.exitLabel,
      showDoorMarker: true,
      showExitMarker: true,
    }] : [];
  });
}

/**
 * Resolve only room routes which are both explicitly approved and still match
 * the current authored graph. This deliberately never substitutes a newly
 * calculated candidate for a stale or unapproved assignment.
 */
export function resolveApprovedStudentEvacuationRoutes(
  campus: Campus | null | undefined,
  room: RoomDest | null | undefined,
): StudentEvacuationRouteResolution {
  if (!campus || !room || room.type !== "room") {
    return { configured: false, routes: [], message: null };
  }
  const building = campus.buildings.find((candidate) => candidate.id === room.buildingId);
  const floor = building?.floors.find((candidate) => candidate.number === room.floorNumber);
  const authoredRoom = floor?.rooms.find((candidate) => candidate.id === room.roomId);
  const config = authoredRoom?.emergencyEvacuation;
  const hasRoutePlan = Boolean(config && (config.enabled || config.routes?.length));
  if (!building || !floor || !authoredRoom) {
    return {
      configured: hasRoutePlan,
      routes: [],
      message: hasRoutePlan ? "This evacuation configuration no longer matches an available room and floor." : null,
    };
  }

  const evaluation = evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, authoredRoom.id);
  if (!hasRoutePlan) return { configured: false, routes: [], message: null, evaluation };
  const approved = approvedRoomEmergencyCandidates(evaluation, config);
  const routes = approved.map(({ assignment, candidate }) => ({
    id: assignment.id,
    label: assignment.label.trim() || candidate.exitLabel,
    assignment,
    candidate,
  }));

  return {
    configured: hasRoutePlan,
    routes,
    evaluation,
    message: routes.length > 0
      ? null
      : "No complete emergency-safe evacuation route is available for this room. Follow posted emergency instructions.",
  };
}
