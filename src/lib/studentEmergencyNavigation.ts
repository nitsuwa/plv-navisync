import type { Campus } from "../components/map-builder/types";
import {
  buildTestRouteEdges,
  chooseEmergencyDestinationCandidates,
  emergencyEgressRoutePriority,
  routeEdgeTrace,
  resolveNodeId,
} from "../components/map-builder/TestNavigationPanel";
import {
  assignedPrimaryAssemblyPoint,
  hasEmergencyAssemblyPointConfiguredForBuilding,
  isAssemblyPointResolvedForBuilding,
  resolvedAssemblyPointsForBuilding,
} from "./emergencyAssemblyPoints";
import type { Destination } from "./combinedPathfinding";
import { isAutomaticStudentEvacuationCandidateEligible, resolveAutomaticStudentEvacuationRoutes } from "./studentEmergencyEvacuation";
import { plannedRouteFromAuthoredPath, type PlannedRoute } from "./routePlanner";
import { assessEmergencyAuthoredPath } from "./emergencyPathEligibility";
import { doorNodeForEdge, findEntranceTransitionForEntrance } from "./entranceTransitions";

/**
 * Calculate SOS from the same authored emergency graph used by Admin route
 * discovery. Room routes are selected automatically from physically linked
 * doors and do not depend on a persisted Route A/B approval. The assigned
 * Primary Assembly Point and emergency-use graph checks still apply.
 */
export function planStudentEmergencyRoute(
  campus: Campus | null,
  origin: Destination | { type: "point"; x: number; y: number } | null,
): PlannedRoute | null {
  if (!campus || !origin) return null;

  if (origin.type === "room") {
    return resolveAutomaticStudentEvacuationRoutes(campus, origin).routes[0]?.candidate.route ?? null;
  }

  // Point and campus-place starts have no authored building evacuation policy
  // to resolve. Keep them unavailable rather than guessing a destination from
  // a nearby building.
  if (origin.type !== "building") return null;
  const originBuildingId = origin.buildingId;

  const nearestEligible = campus.settings?.emergencyDestinationPolicy === "nearest_eligible";
  const hasConfiguredAssemblyPoint = hasEmergencyAssemblyPointConfiguredForBuilding(campus, originBuildingId);
  const primaryAssemblyPoint = assignedPrimaryAssemblyPoint(campus, originBuildingId);
  // A configured but disconnected or conflicting destination must not
  // silently turn into a Campus Gate route.
  if (!nearestEligible && hasConfiguredAssemblyPoint && !primaryAssemblyPoint) return null;

  const nodes = campus.navNodes ?? [];
  const edges = buildTestRouteEdges(campus);
  const startId = resolveNodeId(`building:${originBuildingId}`, campus, edges, false, true);
  if (!startId) return null;
  const assemblyDestinations = nearestEligible
    ? resolvedAssemblyPointsForBuilding(campus, originBuildingId, "nearest_eligible").map(({ point }) => point)
    : primaryAssemblyPoint ? [primaryAssemblyPoint] : [];
  type CandidatePath = ReturnType<typeof chooseEmergencyDestinationCandidates>[number];
  type StudentCandidatePath = CandidatePath & { campusGateFallback: boolean };
  const findCandidateRoutes = (searchStartId: string): StudentCandidatePath[] => {
    const routes: StudentCandidatePath[] = assemblyDestinations.flatMap((point) =>
      chooseEmergencyDestinationCandidates(campus, edges, searchStartId, { assemblyPointId: point.id, eligibleOnly: true })
        .filter(({ candidate }) => candidate.assemblyPointId === point.id && candidate.completeAssemblyRoute === true)
        .map((candidatePath) => ({ ...candidatePath, campusGateFallback: false })),
    );

    // Campus Gate is only a compatibility destination when this building has
    // no assigned Assembly Point at all. It uses the same route and owner
    // metadata checks as an Assembly Point candidate.
    if (!hasConfiguredAssemblyPoint) {
      routes.push(...chooseEmergencyDestinationCandidates(campus, edges, searchStartId, {
        primaryOnly: true,
        allowExitOnlyPreview: true,
        eligibleOnly: true,
      }).filter(({ candidate }) => {
        if (!candidate.campusGatePurpose) return false;
        const target = nodes.find((node) => node.id === candidate.nodeId);
        const gate = target?.gateId
          ? campus.markers?.find((marker) => marker.id === target.gateId && marker.type === "gate")
          : undefined;
        const purpose = gate?.purpose === "emergency_exit" ? "emergency_exit" : gate ? "general" : undefined;
        return purpose === candidate.campusGatePurpose;
      }).map((candidatePath) => ({ ...candidatePath, campusGateFallback: true })));
    }
    return routes;
  };

  const isValidCandidateRoute = ({ candidate, path, campusGateFallback }: StudentCandidatePath) => {
    const traversals = routeEdgeTrace(path, edges);
    const assessment = assessEmergencyAuthoredPath(campus, edges, {
      nodeIds: path.nodeIds,
      edgeIds: traversals.map((traversal) => traversal.edgeId),
      destinationNodeId: candidate.nodeId,
      originBuildingId,
      destinationPoint: path.waypoints.at(-1),
    });
    if (!assessment.connected || !assessment.emergencyEligible) return false;
    if (candidate.assemblyPointId) {
      const point = campus.assemblyPoints?.find((item) => item.id === candidate.assemblyPointId);
      const destination = nodes.find((node) => node.id === candidate.nodeId);
      return Boolean(point && point.navNodeId === candidate.nodeId && destination?.assemblyPointId === point.id
        && isAssemblyPointResolvedForBuilding(campus, point, originBuildingId)
        && (nearestEligible
          ? candidate.assemblyPointDesignation === "primary" || candidate.assemblyPointDesignation === "alternate"
          : candidate.assemblyPointDesignation === "primary" && primaryAssemblyPoint?.id === point.id));
    }
    if (!campusGateFallback) return false;
    const target = nodes.find((node) => node.id === candidate.nodeId);
    return Boolean(target?.gateId && campus.markers?.some((marker) => marker.id === target.gateId && marker.type === "gate"));
  };

  let candidateRoutes = findCandidateRoutes(startId);
  let validCandidateRoutes = candidateRoutes.filter(isValidCandidateRoute);
  if (validCandidateRoutes.length === 0) {
    // The semantic building start is its outdoor entrance, which has no Floor
    // context for exterior-stair routing. Retry from the actual indoor side of
    // that same authored entrance so a complete route can use its connected
    // emergency staircase. The full path is still checked above and remains
    // limited to this building's interior and the authored outdoor network.
    const selectedEntranceNode = nodes.find((node) => node.id === startId && node.buildingId === originBuildingId && node.entranceId);
    const entranceTransition = selectedEntranceNode?.entranceId
      ? findEntranceTransitionForEntrance(nodes, edges, originBuildingId, selectedEntranceNode.entranceId)
      : undefined;
    const indoorEntrance = entranceTransition ? doorNodeForEdge(entranceTransition, nodes) : undefined;
    const indoorEntranceId = indoorEntrance?.buildingId === originBuildingId && indoorEntrance.floorId && indoorEntrance.doorId
      ? indoorEntrance.id
      : null;
    if (indoorEntranceId && indoorEntranceId !== startId) {
      const indoorCandidateRoutes = findCandidateRoutes(indoorEntranceId);
      const indoorValidCandidateRoutes = indoorCandidateRoutes.filter(isValidCandidateRoute);
      if (indoorValidCandidateRoutes.length > 0) {
        candidateRoutes = indoorCandidateRoutes;
        validCandidateRoutes = indoorValidCandidateRoutes;
      }
    }
  }

  // Nearest Eligible selects its Assembly Point by the complete traversable
  // route cost. Within that selected destination, exit priority chooses the
  // exterior stair before a shorter regular egress. Fixed Primary has one
  // destination and applies the same exit ranking directly.
  const selectedAssemblyPointId = nearestEligible
    ? [...validCandidateRoutes.reduce((costs, route) => {
        if (!route.candidate.assemblyPointId) return costs;
        costs.set(route.candidate.assemblyPointId, Math.min(
          costs.get(route.candidate.assemblyPointId) ?? Number.POSITIVE_INFINITY,
          route.path.distanceM,
        ));
        return costs;
      }, new Map<string, number>()).entries()]
        .sort(([leftId, leftCost], [rightId, rightCost]) => leftCost - rightCost || leftId.localeCompare(rightId))[0]?.[0]
    : undefined;
  const selectedRoutes = validCandidateRoutes
    .filter(({ candidate }) => !selectedAssemblyPointId || candidate.assemblyPointId === selectedAssemblyPointId)
    .sort((left, right) => emergencyEgressRoutePriority(campus, left.candidate, left.path.nodeIds)
      - emergencyEgressRoutePriority(campus, right.candidate, right.path.nodeIds)
      || left.path.distanceM - right.path.distanceM
      || left.candidate.nodeId.localeCompare(right.candidate.nodeId));

  const selected = selectedRoutes[0];
  if (!selected) return null;
  const destinationLabel = selected.campusGateFallback
    ? "Campus Gate · Fallback"
    : selected.candidate.assemblyPointName ?? selected.candidate.label;
  const planned = plannedRouteFromAuthoredPath(selected.path, campus, edges, origin.label, destinationLabel);
  return planned ? {
    ...planned,
    emergencyDestinationLabel: destinationLabel,
    emergencyAssemblyPointId: selected.candidate.assemblyPointId,
    ...(selected.campusGateFallback ? { emergencyDestinationFallback: true } : {}),
  } : null;
}

/** Re-resolve an SOS path immediately before it is started. Room Route A/B
 * are each checked against the current automatic candidate set; building
 * starts are checked against the current destination policy and graph. */
export function isStudentEmergencyRouteCurrentAndEligible(
  campus: Campus,
  route: PlannedRoute | null | undefined,
  origin: Destination | { type: "point"; x: number; y: number } | null,
): boolean {
  if (!route?.isAuthoredGraph || !origin) return false;
  const sameAuthoredPath = (candidate: PlannedRoute) =>
    JSON.stringify(candidate.authoredGraphNodeIds ?? []) === JSON.stringify(route.authoredGraphNodeIds ?? [])
    && JSON.stringify(candidate.authoredGraphEdgeIds ?? []) === JSON.stringify(route.authoredGraphEdgeIds ?? [])
    && candidate.emergencyAssemblyPointId === route.emergencyAssemblyPointId
    && candidate.emergencyDestinationFallback === route.emergencyDestinationFallback;

  if (origin.type === "room") {
    const resolution = resolveAutomaticStudentEvacuationRoutes(campus, origin);
    const routeEdges = buildTestRouteEdges(campus);
    return resolution.routes.some((option) => sameAuthoredPath(option.candidate.route)
      && isAutomaticStudentEvacuationCandidateEligible(campus, option.candidate, routeEdges));
  }

  const current = planStudentEmergencyRoute(campus, origin);
  return Boolean(current && sameAuthoredPath(current));
}
