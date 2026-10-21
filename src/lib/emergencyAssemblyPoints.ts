import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { pointInBuilding } from "./editorPlacement";

export type AssemblyPointConnectionState = "not_connected" | "connected" | "invalid";
export type AssemblyPointReviewReadiness = "draft" | "ready_for_review" | "approved" | "needs_rereview";

export type AssemblyPointValidation = {
  connection: AssemblyPointConnectionState;
  readiness: AssemblyPointReviewReadiness;
  /** Physical location/path blockers for this point's separate safety review. */
  reviewReasons: string[];
  reasons: string[];
  fingerprint: string | null;
};

const OUTDOOR_ASSEMBLY_NODE_TYPES = new Set(["outdoor", "assembly", "safe_area"]);

export function isOutdoorAssemblyGraphNode(node: NavigationNode | undefined, campusId?: string): node is NavigationNode {
  return Boolean(node
    && !node.floorId
    && !node.entranceId
    && !node.doorId
    && !node.roomId
    && !node.gateId
    && !node.exteriorEmergencyStairId
    && !node.derivedOwnerType
    && (!campusId || !node.campusId || node.campusId === campusId)
    && OUTDOOR_ASSEMBLY_NODE_TYPES.has(node.type));
}

export function isEmergencyAssemblyEdgeTraversable(edge: NavigationEdge, fromNodeId: string, toNodeId: string): boolean {
  if (edge.closed || edge.emergencySafe === false || edge.emergencyReason || edge.type === "room_door_transition"
    || edge.startNodeId === edge.endNodeId) return false;
  return (edge.startNodeId === fromNodeId && edge.endNodeId === toNodeId)
    || (edge.bidirectional && edge.startNodeId === toNodeId && edge.endNodeId === fromNodeId);
}

function pointNode(campus: Campus, point: AssemblyPoint): NavigationNode | undefined {
  return (campus.navNodes ?? []).find((node) => node.id === point.navNodeId && node.assemblyPointId === point.id);
}

function emergencyOutdoorComponent(campus: Campus, startNodeId: string): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const nodes = (campus.navNodes ?? []).filter((node) => isOutdoorAssemblyGraphNode(node, campus.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId)) return { nodes: [], edges: [] };
  const traversable = (campus.navEdges ?? []).filter((edge) => !edge.closed && edge.emergencySafe !== false && !edge.emergencyReason
    && edge.type !== "room_door_transition"
    && nodeById.has(edge.startNodeId) && nodeById.has(edge.endNodeId)
    && edge.startNodeId !== edge.endNodeId);
  const adjacent = new Map<string, string[]>();
  for (const node of nodes) adjacent.set(node.id, []);
  for (const edge of traversable) {
    adjacent.get(edge.startNodeId)?.push(edge.endNodeId);
    // Review fingerprint captures the whole incident outdoor component in
    // either direction. Actual route resolution still obeys edge direction.
    adjacent.get(edge.endNodeId)?.push(edge.startNodeId);
  }
  const seen = new Set([startNodeId]);
  const queue = [startNodeId];
  while (queue.length) {
    const current = queue.pop()!;
    for (const next of adjacent.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return {
    nodes: nodes.filter((node) => seen.has(node.id)),
    edges: traversable.filter((edge) => seen.has(edge.startNodeId) && seen.has(edge.endNodeId)),
  };
}

/** Outdoor graph nodes that have a fully eligible, correctly directed route to an Assembly Point anchor. */
export function emergencyOutdoorNodesThatCanReachAssembly(campus: Campus, assemblyNodeId: string): Set<string> {
  const nodes = (campus.navNodes ?? []).filter((node) => isOutdoorAssemblyGraphNode(node, campus.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(assemblyNodeId)) return new Set();
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of campus.navEdges ?? []) {
    if (!nodeIds.has(edge.startNodeId) || !nodeIds.has(edge.endNodeId)
      || !isEmergencyAssemblyEdgeTraversable(edge, edge.startNodeId, edge.endNodeId)) continue;
    // Walk backward over legal travel directions: if start -> end is usable,
    // then start can reach every destination reachable from end.
    incoming.get(edge.endNodeId)?.push(edge.startNodeId);
    if (edge.bidirectional) incoming.get(edge.startNodeId)?.push(edge.endNodeId);
  }
  const reachable = new Set([assemblyNodeId]);
  const pending = [assemblyNodeId];
  while (pending.length > 0) {
    const destination = pending.pop()!;
    for (const predecessor of incoming.get(destination) ?? []) {
      if (reachable.has(predecessor)) continue;
      reachable.add(predecessor);
      pending.push(predecessor);
    }
  }
  return reachable;
}

/** Deterministic change detector for the point's outdoor emergency component. */
export function assemblyPointReviewFingerprint(campus: Campus, point: AssemblyPoint): string | null {
  const anchor = pointNode(campus, point);
  if (!anchor) return null;
  const component = emergencyOutdoorComponent(campus, anchor.id);
  const stable = JSON.stringify({
    // This review covers the physical gathering location and its supporting
    // outdoor graph only. Building assignments and route plans have separate
    // review lifecycles and must not reset location approval when they change.
    point: [point.id, point.campusId ?? campus.id, anchor.id, anchor.x, anchor.y],
    nodes: component.nodes.map((node) => [node.id, node.type, node.x, node.y, node.accessible, node.emergencySafe])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    edges: component.edges.map((edge) => [edge.id, edge.startNodeId, edge.endNodeId, edge.bidirectional,
      edge.accessible, edge.emergencySafe, edge.closed, edge.type, edge.distance, edge.bendPoints])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < stable.length; index += 1) {
    hash = Math.imul(hash ^ stable.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function assemblyPointValidation(campus: Campus, point: AssemblyPoint): AssemblyPointValidation {
  const reasons: string[] = [];
  const reviewReasons: string[] = [];
  const addReviewReason = (reason: string) => { reasons.push(reason); reviewReasons.push(reason); };
  if (!point.id.trim()) addReviewReason("This Assembly Point needs a stable identity.");
  if (point.campusId !== campus.id) addReviewReason("The point is not associated with the current campus.");
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.y < 0 || point.x > campus.canvasW || point.y > campus.canvasH) {
    addReviewReason("Place the Assembly Point within the outdoor campus map.");
  }
  if ((campus.buildings ?? []).some((building) => pointInBuilding(building, point))) {
    addReviewReason("Assembly Points must be placed outside building footprints.");
  }
  const anchor = pointNode(campus, point);
  if (!anchor || !isOutdoorAssemblyGraphNode(anchor, campus.id) || anchor.type !== "assembly") {
    addReviewReason("The Assembly Point does not have a valid linked outdoor navigation waypoint.");
  } else if (Math.hypot(anchor.x - point.x, anchor.y - point.y) > 0.01) {
    addReviewReason("The Assembly Point marker and its navigation waypoint are out of sync.");
  }

  const assignments = point.buildingAssignments ?? [];
  if (assignments.length === 0 && point.campusWidePrimary !== true) reasons.push("Assign a building or designate this as the campus-wide Primary Assembly Point.");
  if (point.campusWidePrimary === true && (campus.assemblyPoints ?? []).some((other) => other.id !== point.id && other.campusWidePrimary === true)) {
    reasons.push("Only one Assembly Point can be designated as the campus-wide Primary.");
  }
  const seenBuildings = new Set<string>();
  for (const assignment of assignments) {
    if (!campus.buildings.some((building) => building.id === assignment.buildingId)) {
      reasons.push("A building assignment no longer exists on this campus.");
    }
    if (seenBuildings.has(assignment.buildingId)) reasons.push("A building can only appear once in this point's assignments.");
    seenBuildings.add(assignment.buildingId);
    if (assignment.designation === "primary") {
      const conflict = (campus.assemblyPoints ?? []).some((other) => other.id !== point.id
        && (other.buildingAssignments ?? []).some((candidate) => candidate.buildingId === assignment.buildingId
          && candidate.designation === "primary"));
      if (conflict) reasons.push("This building already has another primary Assembly Point.");
    }
  }

  let connection: AssemblyPointConnectionState = "not_connected";
  if (anchor && isOutdoorAssemblyGraphNode(anchor, campus.id) && anchor.type === "assembly") {
    const component = emergencyOutdoorComponent(campus, anchor.id);
    const reachableToAssembly = emergencyOutdoorNodesThatCanReachAssembly(campus, anchor.id);
    connection = component.nodes.some((node) => node.id !== anchor.id && reachableToAssembly.has(node.id))
      ? "connected"
      : "not_connected";
    if (connection !== "connected") addReviewReason("Connect this point to an emergency-safe outdoor Walking Network path.");
  } else if (anchor) {
    connection = "invalid";
  } else {
    connection = "invalid";
  }

  const fingerprint = assemblyPointReviewFingerprint(campus, point);
  const approved = point.safetyReview?.status === "approved";
  const readiness: AssemblyPointReviewReadiness = reviewReasons.length > 0
    ? approved ? "needs_rereview" : "draft"
    : approved && point.safetyReview?.fingerprint === fingerprint ? "approved"
      : approved ? "needs_rereview" : "ready_for_review";
  return { connection, readiness, reviewReasons, reasons, fingerprint };
}

export function isAssemblyPointApprovedForBuilding(campus: Campus, point: AssemblyPoint, buildingId: string): boolean {
  const validation = assemblyPointValidation(campus, point);
  const explicitlyAssigned = (point.buildingAssignments ?? []).some((assignment) => assignment.buildingId === buildingId
    && (assignment.designation === "primary" || assignment.designation === "alternate"));
  return validation.readiness === "approved"
    && (explicitlyAssigned || isAssemblyPointResolvedForBuilding(campus, point, buildingId));
}

/**
 * A destination is available to automatic SOS when an authorized Admin has
 * assigned it to the building and its authored outdoor anchor is still
 * intact.  Route reachability and emergency eligibility are checked on the
 * complete graph path by the normal route gate; a stale location-review
 * fingerprint is not a route approval requirement.
 */
export function isAssemblyPointAssignedForBuilding(campus: Campus, point: AssemblyPoint, buildingId: string): boolean {
  const assignments = (point.buildingAssignments ?? []).filter((assignment) => assignment.buildingId === buildingId);
  if (assignments.length !== 1 || !campus.buildings.some((building) => building.id === buildingId)) return false;
  if (point.campusId && point.campusId !== campus.id) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.y < 0 || point.x > campus.canvasW || point.y > campus.canvasH
    || (campus.buildings ?? []).some((building) => pointInBuilding(building, point))) return false;
  const anchor = pointNode(campus, point);
  return Boolean(anchor
    && isOutdoorAssemblyGraphNode(anchor, campus.id)
    && anchor.type === "assembly"
    && Math.hypot(anchor.x - point.x, anchor.y - point.y) <= 0.01);
}

/** Whether the campus configuration contains any campus-wide Primary choice.
 * This deliberately includes malformed/duplicate designations so routing does
 * not silently substitute a Campus Gate when configured destination data is
 * invalid. */
export function hasCampusWidePrimaryDesignation(campus: Campus): boolean {
  return (campus.assemblyPoints ?? []).some((point) => point.campusWidePrimary === true);
}

/** Resolve the unique structurally valid campus-wide Primary. Reachability is
 * checked by the graph search; a disconnected point stays the selected
 * destination and therefore yields an unavailable route rather than a Gate
 * fallback. */
export function campusWidePrimaryAssemblyPoint(campus: Campus): AssemblyPoint | null {
  const primaries = (campus.assemblyPoints ?? []).filter((point) => point.campusWidePrimary === true);
  if (primaries.length !== 1) return null;
  const point = primaries[0];
  if (point.campusId && point.campusId !== campus.id) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.y < 0 || point.x > campus.canvasW || point.y > campus.canvasH
    || (campus.buildings ?? []).some((building) => pointInBuilding(building, point))) return null;
  const anchor = pointNode(campus, point);
  return anchor && isOutdoorAssemblyGraphNode(anchor, campus.id) && anchor.type === "assembly"
    && Math.hypot(anchor.x - point.x, anchor.y - point.y) <= 0.01
    ? point
    : null;
}

export function hasEmergencyAssemblyPointConfiguredForBuilding(campus: Campus, buildingId: string): boolean {
  return (campus.assemblyPoints ?? []).some((point) =>
    (point.buildingAssignments ?? []).some((assignment) => assignment.buildingId === buildingId))
    || hasCampusWidePrimaryDesignation(campus);
}

export interface ResolvedAssemblyPointForBuilding {
  point: AssemblyPoint;
  designation: "primary" | "alternate";
}

/** Destination candidates after applying the campus policy and inheritance.
 * Explicit building assignments retain their legacy role. Fixed Primary uses
 * one explicit Primary override, otherwise the campus-wide Primary. Nearest
 * Eligible considers the building's explicit assignments first and inherits
 * the campus Primary only when no valid explicit destination is configured. */
export function resolvedAssemblyPointsForBuilding(
  campus: Campus,
  buildingId: string,
  policy: "fixed_primary" | "nearest_eligible" = campus.settings?.emergencyDestinationPolicy ?? "fixed_primary",
): ResolvedAssemblyPointForBuilding[] {
  if (!(campus.buildings ?? []).some((building) => building.id === buildingId)) return [];
  const explicit = (campus.assemblyPoints ?? []).flatMap((point) => {
    const assignments = (point.buildingAssignments ?? []).filter((assignment) => assignment.buildingId === buildingId);
    return assignments.map((assignment) => ({ point, designation: assignment.designation, valid: isAssemblyPointAssignedForBuilding(campus, point, buildingId) }));
  });

  if (policy === "fixed_primary") {
    const primary = explicit.filter((entry) => entry.designation === "primary");
    if (primary.length > 1) return [];
    if (primary.length === 1 && primary[0].valid) {
      return [{ point: primary[0].point, designation: "primary" }];
    }
    const inherited = campusWidePrimaryAssemblyPoint(campus);
    return inherited ? [{ point: inherited, designation: "primary" }] : [];
  }

  const validExplicit = explicit.filter((entry) => entry.valid);
  if (validExplicit.length > 0) return validExplicit.map(({ point, designation }) => ({ point, designation }));
  const inherited = campusWidePrimaryAssemblyPoint(campus);
  return inherited ? [{ point: inherited, designation: "primary" }] : [];
}

export function isAssemblyPointResolvedForBuilding(campus: Campus, point: AssemblyPoint, buildingId: string): boolean {
  return resolvedAssemblyPointsForBuilding(campus, buildingId)
    .some((candidate) => candidate.point.id === point.id);
}

/** Resolve the unique explicitly assigned Primary without depending on legacy review fingerprints. */
export function assignedPrimaryAssemblyPoint(campus: Campus, buildingId: string): AssemblyPoint | null {
  return resolvedAssemblyPointsForBuilding(campus, buildingId, "fixed_primary")
    .find((candidate) => candidate.designation === "primary")?.point ?? null;
}

/** Resolve the one current, approved Primary Assembly Point assigned to a
 * building. Alternates are deliberately excluded: using one requires an
 * explicit, separately reviewed evacuation plan. Conflicting or stale Primary
 * assignments are treated as unavailable instead of being chosen by distance.
 */
export function approvedPrimaryAssemblyPoint(campus: Campus, buildingId: string): AssemblyPoint | null {
  const point = assignedPrimaryAssemblyPoint(campus, buildingId);
  if (!point) return null;
  return isAssemblyPointApprovedForBuilding(campus, point, buildingId) ? point : null;
}

function newId(idFactory: ((prefix: string) => string) | undefined, prefix: string): string {
  if (idFactory) return idFactory(prefix);
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep one canonical assembly waypoint per Assembly Point in the shared graph. */
export function syncEmergencyAssemblyPointNavigation(
  campus: Campus,
  idFactory?: (prefix: string) => string,
): Campus {
  const points = campus.assemblyPoints ?? [];
  const sourceNodes = campus.navNodes ?? [];
  const nodeById = new Map(sourceNodes.map((node) => [node.id, node]));
  const claimed = new Set<string>();
  const nextPoints = points.map((point) => {
    let existing = point.navNodeId ? nodeById.get(point.navNodeId) : undefined;
    existing ??= sourceNodes.find((node) => node.assemblyPointId === point.id);
    if (existing && existing.assemblyPointId && existing.assemblyPointId !== point.id) existing = undefined;
    if (existing && (!isOutdoorAssemblyGraphNode(existing, campus.id)
      || existing.floorId || existing.entranceId || existing.gateId)) existing = undefined;
    let nodeId = existing?.id ?? point.navNodeId;
    if (!nodeId || claimed.has(nodeId) || (nodeById.has(nodeId) && nodeById.get(nodeId)?.assemblyPointId !== point.id && nodeById.get(nodeId)?.type !== "assembly")) {
      nodeId = newId(idFactory, "assembly-nav");
      while (nodeById.has(nodeId) || claimed.has(nodeId)) nodeId = newId(idFactory, "assembly-nav");
      existing = undefined;
    }
    claimed.add(nodeId);
    const nextPoint: AssemblyPoint = { ...point, campusId: campus.id, navNodeId: nodeId };
    const node: NavigationNode = {
      ...(existing ?? nodeById.get(nodeId) ?? {} as NavigationNode),
      id: nodeId,
      name: point.name?.trim() || "Emergency Assembly Point",
      type: "assembly",
      x: point.x,
      y: point.y,
      campusId: campus.id,
      buildingId: undefined,
      floorId: undefined,
      entranceId: undefined,
      doorId: undefined,
      roomId: undefined,
      gateId: undefined,
      assemblyPointId: point.id,
      accessible: point.accessible ?? existing?.accessible ?? true,
      emergencySafe: true,
      color: "#15803d",
    };
    nodeById.set(nodeId, node);
    return nextPoint;
  });
  const livePointIds = new Set(nextPoints.map((point) => point.id));
  const liveNodeIds = new Set(nextPoints.map((point) => point.navNodeId).filter((id): id is string => !!id));
  const nextNodes = sourceNodes.filter((node) => !node.assemblyPointId || livePointIds.has(node.assemblyPointId))
    .filter((node) => !node.assemblyPointId || liveNodeIds.has(node.id));
  for (const point of nextPoints) {
    const node = nodeById.get(point.navNodeId!);
    const index = nextNodes.findIndex((candidate) => candidate.id === point.navNodeId);
    if (node && index >= 0) nextNodes[index] = node;
    else if (node) nextNodes.push(node);
  }
  const validNodeIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = (campus.navEdges ?? []).filter((edge) => validNodeIds.has(edge.startNodeId) && validNodeIds.has(edge.endNodeId));
  return { ...campus, assemblyPoints: nextPoints, navNodes: nextNodes, navEdges: nextEdges };
}

/** Keep an Assembly Point's persisted marker position aligned when its linked
 * generated Pathway waypoint moves. This deliberately does not rebuild the
 * graph or review record; callers can use it for lightweight drag previews,
 * while review readiness is derived from the changed connected-graph fingerprint.
 */
export function syncEmergencyAssemblyPointPositionsFromNavigation(campus: Campus): Campus {
  const assemblyPoints = campus.assemblyPoints ?? [];
  if (assemblyPoints.length === 0) return campus;
  const anchors = new Map((campus.navNodes ?? [])
    .filter((node) => node.type === "assembly" && node.assemblyPointId)
    .map((node) => [node.assemblyPointId!, node]));
  let changed = false;
  const nextPoints = assemblyPoints.map((point) => {
    const anchor = anchors.get(point.id);
    if (!anchor || anchor.id !== point.navNodeId || (anchor.x === point.x && anchor.y === point.y)) return point;
    changed = true;
    return { ...point, x: anchor.x, y: anchor.y };
  });
  return changed ? { ...campus, assemblyPoints: nextPoints } : campus;
}

export function removeEmergencyAssemblyPoint(campus: Campus, pointId: string): Campus {
  const point = (campus.assemblyPoints ?? []).find((candidate) => candidate.id === pointId);
  if (!point) return campus;
  const anchor = (campus.navNodes ?? []).find((node) => node.id === point.navNodeId && node.assemblyPointId === point.id);
  const assemblyPoints = (campus.assemblyPoints ?? []).filter((candidate) => candidate.id !== pointId);
  if (!anchor) return { ...campus, assemblyPoints };

  // A pathway-owned anchor represents an authored physical Pathway vertex.
  // Keep that graph junction and its generated edges; only return it to an
  // ordinary walking point when the emergency destination is removed.
  if (anchor.generatedFromPathVertices?.length || point.connectionOrigin?.kind === "path-vertex") {
    const navNodes = (campus.navNodes ?? []).map((node) => node.id === anchor.id
      ? { ...node, type: "outdoor" as const, name: "Walking Point", assemblyPointId: undefined }
      : node);
    return { ...campus, assemblyPoints, navNodes };
  }

  if (point.connectionOrigin?.kind === "split-edge") {
    const origin = point.connectionOrigin;
    const incident = (campus.navEdges ?? []).filter((edge) => edge.startNodeId === anchor.id || edge.endNodeId === anchor.id);
    const expectedSegments = origin.splitEdges ?? [];
    const expectedIds = new Set(expectedSegments.map((edge) => edge.id));
    const currentById = new Map(incident.map((edge) => [edge.id, edge]));
    const splitUnchanged = expectedSegments.length === 2 && expectedSegments.every((edge) => {
      const current = currentById.get(edge.id);
      return Boolean(current && JSON.stringify(current) === JSON.stringify(edge));
    });
    const original = origin.originalEdge;
    const endpointIds = new Set((campus.navNodes ?? []).filter((node) => node.id !== anchor.id).map((node) => node.id));
    const outsideIncident = (campus.navEdges ?? []).filter((edge) => edge.startNodeId !== anchor.id && edge.endNodeId !== anchor.id);
    if (splitUnchanged) {
      const canRestore = endpointIds.has(original.startNodeId) && endpointIds.has(original.endNodeId)
        && !outsideIncident.some((edge) => edge.id === original.id);
      const navNodes = (campus.navNodes ?? []).filter((node) => node.id !== anchor.id);
      return {
        ...campus,
        assemblyPoints,
        navNodes,
        navEdges: canRestore ? [...outsideIncident, original] : outsideIncident,
      };
    }

    // If a split segment was edited after insertion (or the point was moved),
    // keep that authored junction and its current split edges as an ordinary
    // Walking Point. Delete only AP-owned connector edges. Older persisted
    // split-edge provenance has no expected segments; retain its historical
    // restore behavior for backward compatibility.
    if (expectedSegments.length > 0) {
      const retainedSegments = incident.filter((edge) => expectedIds.has(edge.id));
      if (retainedSegments.length > 0) {
        const { assemblyPointId: _owner, emergencySafe: _emergencySafe, ...ordinaryNode } = anchor;
        const navNodes = (campus.navNodes ?? []).map((node) => node.id === anchor.id
          ? { ...ordinaryNode, type: "outdoor" as const, name: "Walking Point" }
          : node);
        return { ...campus, assemblyPoints, navNodes, navEdges: [...outsideIncident, ...retainedSegments] };
      }
      return {
        ...campus,
        assemblyPoints,
        navNodes: (campus.navNodes ?? []).filter((node) => node.id !== anchor.id),
        navEdges: outsideIncident,
      };
    }

    const canRestore = endpointIds.has(original.startNodeId) && endpointIds.has(original.endNodeId)
      && !outsideIncident.some((edge) => edge.id === original.id);
    return {
      ...campus,
      assemblyPoints,
      navNodes: (campus.navNodes ?? []).filter((node) => node.id !== anchor.id),
      navEdges: canRestore ? [...outsideIncident, original] : outsideIncident,
    };
  }

  if (point.connectionOrigin?.kind === "reused-node") {
    const origin = point.connectionOrigin;
    const { assemblyPointId: _owner, ...ordinaryNode } = anchor;
    const navNodes = (campus.navNodes ?? []).map((node) => node.id === anchor.id
      ? { ...ordinaryNode, type: origin.previousType, name: origin.previousName }
      : node);
    return { ...campus, assemblyPoints, navNodes };
  }

  const navNodes = (campus.navNodes ?? []).filter((node) => node.id !== anchor.id);
  const navEdges = (campus.navEdges ?? []).filter((edge) => edge.startNodeId !== anchor.id && edge.endNodeId !== anchor.id);
  return { ...campus, assemblyPoints, navNodes, navEdges };
}
