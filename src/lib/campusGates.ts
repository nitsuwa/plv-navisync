import type { Campus, CampusMarker, NavigationEdge, NavigationNode } from "../components/map-builder/types";

export const CAMPUS_GATE_DEFAULT_SIZE = { width: 44, height: 34 } as const;

export type CampusGateAlignmentGuide = { type: "h" | "v"; pos: number };

/**
 * Align a movable Campus Gate's canonical anchor to one connected outdoor
 * target.  This is deliberately a tiny, local transform helper: it does not
 * move the target or rebuild any graph geometry.  Both axes may snap when the
 * pointer is within the editor's world-space tolerance, which makes a direct
 * connector mathematically horizontal/vertical instead of merely close.
 */
export function alignCampusGateAnchor(
  point: { x: number; y: number },
  target: { x: number; y: number } | undefined,
  threshold = 8,
): { point: { x: number; y: number }; guides: CampusGateAlignmentGuide[] } {
  if (!target) return { point, guides: [] };
  const guides: CampusGateAlignmentGuide[] = [];
  let x = point.x;
  let y = point.y;
  if (Math.abs(target.x - point.x) <= threshold) {
    x = target.x;
    guides.push({ type: "v", pos: target.x });
  }
  if (Math.abs(target.y - point.y) <= threshold) {
    y = target.y;
    guides.push({ type: "h", pos: target.y });
  }
  return { point: { x, y }, guides };
}

export function campusGateSize(marker?: Pick<CampusMarker, "width" | "height">): { width: number; height: number } {
  return {
    width: Math.max(24, marker?.width ?? CAMPUS_GATE_DEFAULT_SIZE.width),
    height: Math.max(22, marker?.height ?? CAMPUS_GATE_DEFAULT_SIZE.height),
  };
}

/** Functional outdoor gate/exit markers. They intentionally live in the
 * existing top-level marker collection so old campus payloads remain
 * loadable; the linked navigation node is the graph identity. */
export type CampusGatePurpose = "general" | "emergency_exit";
export type CampusGate = CampusMarker & {
  type: "gate";
  purpose: CampusGatePurpose;
  navNodeId?: string;
};

export function isCampusGate(marker: CampusMarker | undefined): marker is CampusGate {
  // `type: "gate"` existed in older marker payloads as a decorative marker.
  // Only the authored Campus Gate shape (purpose or linked anchor) owns a
  // derived navigation node; this keeps legacy marker round-trips lossless.
  return marker?.type === "gate" && (marker.purpose !== undefined || marker.navNodeId !== undefined);
}

export function campusGates(campus: Pick<Campus, "markers">): CampusGate[] {
  return (campus.markers ?? []).filter(isCampusGate);
}

function newId(idFactory: ((prefix: string) => string) | undefined, prefix: string): string {
  if (idFactory) return idFactory(prefix);
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Reconcile one generated NavigationNode per canonical Campus Gate. The
 * physical marker owns position/name/purpose; the node is never independently
 * authored and incident edges are pruned only when their gate owner is gone. */
export function syncCampusGateNavigation(
  campus: Campus,
  idFactory?: (prefix: string) => string,
): Campus {
  const gates = campusGates(campus);
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  const sourceNodes = campus.navNodes ?? [];
  const sourceEdges = campus.navEdges ?? [];
  const usedNodeIds = new Set<string>();
  const nodeById = new Map(sourceNodes.map((node) => [node.id, node]));
  const nextMarkers = (campus.markers ?? []).map((marker) => {
    if (!isCampusGate(marker)) return marker;
    const existing = marker.navNodeId ? nodeById.get(marker.navNodeId) : undefined;
    const conflict = existing?.gateId && existing.gateId !== marker.id;
    const nodeId = !conflict && marker.navNodeId && !usedNodeIds.has(marker.navNodeId)
      ? marker.navNodeId
      : newId(idFactory, "gate-nav");
    usedNodeIds.add(nodeId);
    const purpose = marker.purpose === "emergency_exit" ? "emergency_exit" : "general";
    const node: NavigationNode = {
      ...(nodeById.get(nodeId) ?? {}),
      id: nodeId,
      name: marker.name?.trim() || (purpose === "emergency_exit" ? "Emergency Exit Gate" : "Campus Gate"),
      type: purpose === "emergency_exit" ? "emergency_exit" : "outdoor",
      x: Number.isFinite(marker.x) ? marker.x : 0,
      y: Number.isFinite(marker.y) ? marker.y : 0,
      campusId: campus.id,
      buildingId: undefined,
      floorId: undefined,
      gateId: marker.id,
      accessible: true,
      emergencySafe: true,
      color: marker.color || (purpose === "emergency_exit" ? "#dc2626" : "#2563eb"),
    };
    nodeById.set(nodeId, node);
    return { ...marker, name: node.name, purpose, navNodeId: nodeId };
  });
  const nextNodes = sourceNodes
    .filter((node) => !node.gateId || gateById.has(node.gateId))
    .filter((node) => !node.gateId || usedNodeIds.has(node.id));
  for (const marker of nextMarkers) {
    if (!isCampusGate(marker) || !marker.navNodeId) continue;
    const node = nodeById.get(marker.navNodeId);
    const index = nextNodes.findIndex((candidate) => candidate.id === marker.navNodeId);
    if (node && index >= 0) nextNodes[index] = node;
    else if (node) nextNodes.push(node);
  }
  const liveNodeIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = sourceEdges.filter((edge) => liveNodeIds.has(edge.startNodeId) && liveNodeIds.has(edge.endNodeId));
  return { ...campus, markers: nextMarkers, navNodes: nextNodes, navEdges: nextEdges };
}

export function campusGateForNode(campus: Pick<Campus, "markers">, node: NavigationNode | undefined): CampusGate | undefined {
  return node?.gateId ? campusGates(campus).find((gate) => gate.id === node.gateId) : undefined;
}

export function campusGateNodeIds(
  campus: Pick<Campus, "markers" | "navNodes">,
  purpose?: CampusGatePurpose,
): string[] {
  const gates = campusGates(campus);
  const allowed = purpose ? new Set(gates.filter((gate) => gate.purpose === purpose).map((gate) => gate.id)) : undefined;
  return (campus.navNodes ?? [])
    .filter((node) => !!node.gateId && (!allowed || allowed.has(node.gateId)))
    .map((node) => node.id);
}

/** Return whether an outdoor graph can reach at least one authored Campus
 * Gate from the supplied node. This deliberately stays a tiny graph helper;
 * the existing route engine still performs the actual path search/costing. */
export function outdoorNetworkReachesCampusGate(
  startNodeId: string,
  nodes: NavigationNode[] = [],
  edges: NavigationEdge[] = [],
): boolean {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(startNodeId)) return false;
  const gateIds = new Set(nodes.filter((node) => !!node.gateId).map((node) => node.id));
  const seen = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (gateIds.has(current)) return true;
    for (const edge of edges) {
      if (edge.closed || edge.emergencySafe === false) continue;
      let next: string | undefined;
      if (edge.startNodeId === current) next = edge.endNodeId;
      else if (edge.bidirectional && edge.endNodeId === current) next = edge.startNodeId;
      if (next && nodeIds.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function gateIncidentEdges(
  nodeId: string,
  edges: NavigationEdge[] = [],
): NavigationEdge[] {
  return edges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId);
}
