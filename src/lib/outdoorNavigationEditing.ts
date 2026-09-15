import type { Campus, NavigationEdge } from "../components/map-builder/types";

/**
 * Small screen-space movement required before a waypoint pointer gesture is
 * considered an edit.  Keeping this outside the component makes the no-op
 * contract directly testable without involving the SVG event loop.
 */
export const OUTDOOR_WAYPOINT_DRAG_THRESHOLD_PX = 4;

export function didOutdoorWaypointDragStart(
  start: { x: number; y: number },
  current: { x: number; y: number },
  zoom = 1,
  thresholdPx = OUTDOOR_WAYPOINT_DRAG_THRESHOLD_PX,
): boolean {
  const scale = Math.max(0.01, Number.isFinite(zoom) ? zoom : 1);
  return Math.hypot(current.x - start.x, current.y - start.y) * scale >= thresholdPx;
}

function edgeDistance(
  edge: NavigationEdge,
  nodes: Map<string, { x: number; y: number }>,
): number {
  const start = nodes.get(edge.startNodeId);
  const end = nodes.get(edge.endNodeId);
  if (!start || !end) return edge.distance;
  const points = [start, ...(edge.bendPoints ?? []), end];
  return Math.round(points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0));
}

/**
 * Move one free outdoor waypoint without invoking any graph-wide
 * reconciliation.  Incident edges retain IDs, endpoints, bendPoints, and
 * semantic flags; only their coordinate-derived distance is refreshed.
 */
export function moveOutdoorWaypointLocally(
  campus: Campus,
  nodeId: string,
  point: { x: number; y: number },
): Campus {
  const nodes = campus.navNodes ?? [];
  if (!nodes.some((node) => node.id === nodeId)) return campus;
  const nextNodes = nodes.map((node) => node.id === nodeId
    ? { ...node, x: point.x, y: point.y }
    : node);
  const coordinates = new Map(nextNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const nextEdges = (campus.navEdges ?? []).map((edge) => {
    if (edge.startNodeId !== nodeId && edge.endNodeId !== nodeId) return edge;
    const distance = edgeDistance(edge, coordinates);
    return edge.distance === distance ? edge : { ...edge, distance };
  });
  return { ...campus, navNodes: nextNodes, navEdges: nextEdges };
}

