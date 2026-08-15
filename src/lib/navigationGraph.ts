import type { NavigationNode, NavigationEdge, CampusBuilding } from "../components/map-builder/types";
import { entranceWorldPosition } from "./buildingEntrances";

// ── B5 Phase 1 — Navigation graph foundation ───────────────────────────────
// Pure, testable helpers shared by the outdoor editor's Waypoint + Path tools.
// The model (NavigationNode / NavigationEdge on Campus.navNodes / navEdges)
// already exists and serializes through campusStructureService; these helpers
// keep graph RULES out of CampusEditor so later B5 phases can reuse them.

export const DEFAULT_NAV_NODE_COLOR = "#16a34a";
export const DEFAULT_NAV_EDGE_COLOR = "#16a34a";
export const DEFAULT_NAV_NODE_TYPE = "outdoor" as const;

/** Node hit-test radius used by the Path tool and pointer interactions. */
export const NAV_NODE_HIT_THRESHOLD = 12;

/**
 * B5 Phase 2.9 — navigation scope isolation. Indoor floor navigation lives on
 * the SAME campus nav arrays but is scoped by `floorId` (plus buildingId). The
 * outdoor/campus graph is everything WITHOUT a floorId. These selectors are the
 * single render/read boundary the outdoor editor uses so indoor floor nodes and
 * edges NEVER enter the outdoor canvas, even when their building is visible.
 */
export function outdoorNavNodes(nodes: NavigationNode[] | undefined): NavigationNode[] {
  return (nodes ?? []).filter((n) => !n.floorId);
}

/** Outdoor-scoped edges — both endpoints must belong to the outdoor graph. */
export function outdoorNavEdges(
  edges: NavigationEdge[] | undefined,
  outdoorNodes: NavigationNode[]
): NavigationEdge[] {
  const ids = new Set(outdoorNodes.map((n) => n.id));
  return (edges ?? []).filter(
    (e) => ids.has(e.startNodeId) && ids.has(e.endNodeId)
  );
}

export interface CreateNavNodeInput {
  id: string;
  x: number;
  y: number;
  campusId?: string;
  buildingId?: string;
  floorId?: string;
  entranceId?: string;
  name?: string;
  type?: NavigationNode["type"];
  color?: string;
  accessible?: boolean;
}

/** Canonical node creation — every authoring surface creates nodes through here. */
export function createNavNode(input: CreateNavNodeInput): NavigationNode {
  return {
    id: input.id,
    name: input.name ?? "Waypoint",
    type: input.type ?? DEFAULT_NAV_NODE_TYPE,
    x: Math.round(input.x),
    y: Math.round(input.y),
    campusId: input.campusId,
    buildingId: input.buildingId,
    floorId: input.floorId,
    entranceId: input.entranceId,
    accessible: input.accessible ?? true,
    color: input.color ?? DEFAULT_NAV_NODE_COLOR,
  };
}

export interface CreateNavEdgeInput {
  id: string;
  startNodeId: string;
  endNodeId: string;
  /** Lookup used to auto-calculate distance in canvas units. */
  nodes?: NavigationNode[];
  type?: string;
  color?: string;
  width?: number;
}

/**
 * Canonical edge creation. Distance is the straight-line canvas-unit distance
 * between the two nodes (the model's `distance` is already defined as canvas
 * units converted to meters in the student view) — B5 must NOT invent real
 * meters because the deferred B4 calibration feature is not required.
 */
export function createNavEdge(input: CreateNavEdgeInput): NavigationEdge {
  const start = input.nodes?.find((n) => n.id === input.startNodeId);
  const end = input.nodes?.find((n) => n.id === input.endNodeId);
  return {
    id: input.id,
    startNodeId: input.startNodeId,
    endNodeId: input.endNodeId,
    distance: navEdgeDistance(start, end),
    bidirectional: true,
    accessible: true,
    emergencySafe: true,
    type: input.type ?? "walkway",
    color: input.color ?? DEFAULT_NAV_EDGE_COLOR,
    width: input.width ?? 4,
  };
}

/** Straight-line distance between two nodes in canvas units (0 when unknown). */
export function navEdgeDistance(
  a: Pick<NavigationNode, "x" | "y"> | undefined,
  b: Pick<NavigationNode, "x" | "y"> | undefined
): number {
  if (!a || !b) return 0;
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
}

/** A node may never be connected to itself. */
export function isSelfEdge(fromNodeId: string, toNodeId: string): boolean {
  return fromNodeId === toNodeId;
}

/**
 * Find an existing edge connecting the SAME unordered node pair. The graph is
 * treated as an undirected set for duplicate detection regardless of the
 * direction flag — A→B and B→A describe the same physical walkway.
 */
export function findDuplicateNavEdge(
  edges: NavigationEdge[],
  fromNodeId: string,
  toNodeId: string
): NavigationEdge | undefined {
  return edges.find(
    (e) =>
      (e.startNodeId === fromNodeId && e.endNodeId === toNodeId) ||
      (e.startNodeId === toNodeId && e.endNodeId === fromNodeId)
  );
}

/**
 * Remove a node AND every edge touching it. Never leaves dangling edge
 * references — callers that delete a node must use this instead of a bare
 * filter so the graph stays valid.
 */
export function removeNavNode(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  nodeId: string
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  return {
    nodes: nodes.filter((n) => n.id !== nodeId),
    edges: edges.filter((e) => e.startNodeId !== nodeId && e.endNodeId !== nodeId),
  };
}

/** Find the node under a canvas point (closest within the threshold). */
export function findNavNodeAtPoint(
  nodes: NavigationNode[],
  point: { x: number; y: number },
  threshold = NAV_NODE_HIT_THRESHOLD
): NavigationNode | undefined {
  let best: NavigationNode | undefined;
  let bestD = threshold;
  for (const n of nodes) {
    const d = Math.hypot(point.x - n.x, point.y - n.y);
    if (d <= bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Axis-aligned rect (used by the marquee selector). */
export interface NavSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * True when the segment a→b intersects the given axis-aligned rect (or lies
 * entirely inside it). Used to include edges whose geometry crosses a marquee.
 */
export function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: NavSelectionRect
): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  // Quick reject: the segment's bounding box must overlap the rect.
  if (maxX < rect.x || minX > rect.x + rect.width) return false;
  if (maxY < rect.y || minY > rect.y + rect.height) return false;
  // Both endpoints inside the rect — segment is fully covered.
  if (a.x >= rect.x && a.x <= rect.x + rect.width && a.y >= rect.y && a.y <= rect.y + rect.height
    && b.x >= rect.x && b.x <= rect.x + rect.width && b.y >= rect.y && b.y <= rect.y + rect.height) {
    return true;
  }
  // One endpoint inside — the segment crosses the rect.
  const inside = (p: { x: number; y: number }) =>
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  if (inside(a) || inside(b)) return true;
  // Both outside but the segment may still slice through the rect (T-junction
  // style crossings). Test each rect edge against the segment via orientation
  // sign flips (classic segment-segment intersection).
  const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const onSegment = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x)
    && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const edges: [ { x: number; y: number }, { x: number; y: number } ][] = [
    [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
    [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
    [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
    [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }],
  ];
  for (const [c, d] of edges) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
    if (o1 === 0 && onSegment(a, b, c)) return true;
    if (o2 === 0 && onSegment(a, b, d)) return true;
    if (o3 === 0 && onSegment(c, d, a)) return true;
    if (o4 === 0 && onSegment(c, d, b)) return true;
  }
  return false;
}

/**
 * Graph elements captured by a marquee rect (Navigation Select): nodes whose
 * center falls inside the rect, plus edges whose segment intersects it.
 * Returns the combined id list — callers that only move nodes filter by kind.
 */
export function navGraphSelectionIdsInRect(
  rect: NavSelectionRect,
  nodes: NavigationNode[],
  edges: NavigationEdge[]
): { nodeIds: string[]; edgeIds: string[] } {
  const nodeIds = nodes
    .filter((n) => n.x >= rect.x && n.x <= rect.x + rect.width && n.y >= rect.y && n.y <= rect.y + rect.height)
    .map((n) => n.id);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeIds = edges
    .filter((e) => {
      const a = nodeById.get(e.startNodeId);
      const b = nodeById.get(e.endNodeId);
      if (!a || !b) return false;
      return segmentIntersectsRect(a, b, rect);
    })
    .map((e) => e.id);
  return { nodeIds, edgeIds };
}

/**
 * Reuse an existing entrance-linked node for a building entrance (so entrance
 * targets are never duplicated per click) — or undefined to create one.
 */
export function findEntranceNavNode(
  nodes: NavigationNode[],
  buildingId: string,
  entranceId: string
): NavigationNode | undefined {
  return nodes.find((n) => n.buildingId === buildingId && n.entranceId === entranceId);
}

/**
 * B5 Phase 1.8: entrance-linked nodes are DERIVED geometry — their effective
 * position is always the resolved world position of their linked B3 entrance.
 * Recompute every entrance-linked node from the CURRENT building geometry
 * (x/y/width/height/rotation) + entrance edge/offset, so a building move,
 * resize, rotate, or entrance reposition automatically moves the node (and
 * therefore every connected edge). Plain outdoor nodes are untouched.
 */
export function syncEntranceNodePositions(
  buildings: Pick<CampusBuilding, "id" | "x" | "y" | "width" | "height" | "rotation" | "entrances">[],
  nodes: NavigationNode[]
): NavigationNode[] {
  return nodes.map((n) => {
    if (!n.buildingId || !n.entranceId) return n;
    const parent = buildings.find((b) => b.id === n.buildingId);
    const entrance = parent?.entrances?.find((en) => en.id === n.entranceId);
    if (!parent || !entrance) return n; // orphaned — prune helper handles removal
    const pos = entranceWorldPosition(parent, entrance);
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    if (x === n.x && y === n.y) return n;
    return { ...n, x, y };
  });
}

/**
 * B5 Phase 1.8: remove entrance-linked nodes whose B3 entrance no longer
 * exists (deleted entrance / deleted building), plus every edge touching them
 * — no stale entranceId references, no dangling edges.
 */
export function pruneOrphanedEntranceNodes(
  buildings: Pick<CampusBuilding, "id" | "entrances">[],
  nodes: NavigationNode[],
  edges: NavigationEdge[]
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const living = new Set(
    buildings.flatMap((b) => (b.entrances ?? []).map((en) => `${b.id}:${en.id}`))
  );
  let result = { nodes, edges };
  for (const n of nodes) {
    if (!n.buildingId || !n.entranceId) continue;
    if (!living.has(`${n.buildingId}:${n.entranceId}`)) {
      result = removeNavNode(result.nodes, result.edges, n.id);
    }
  }
  return result;
}

/**
 * Normalize an authored graph: coerce numeric fields, drop edges whose
 * endpoints no longer exist, and fill benign defaults. Pure + safe for legacy
 * or hand-edited data.
 */
export function normalizeNavGraph(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const safeNodes = (nodes ?? [])
    .map((n) => ({
      ...n,
      x: Number.isFinite(Number(n.x)) ? Math.round(Number(n.x)) : 0,
      y: Number.isFinite(Number(n.y)) ? Math.round(Number(n.y)) : 0,
      accessible: n.accessible !== false,
    }))
    .filter((n) => n.id);
  const nodeIds = new Set(safeNodes.map((n) => n.id));
  const safeEdges = (edges ?? [])
    .map((e) => {
      // B5 Phase 2.5: coerce authored bend/control points (polyline geometry).
      const bendPoints = Array.isArray(e.bendPoints)
        ? e.bendPoints
            .map((p) => ({ x: Math.round(Number(p?.x) || 0), y: Math.round(Number(p?.y) || 0) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : undefined;
      return {
        ...e,
        ...(bendPoints && bendPoints.length > 0 ? { bendPoints } : {}),
        distance: Number.isFinite(Number(e.distance)) ? Number(e.distance) : 0,
        bidirectional: e.bidirectional !== false,
        accessible: e.accessible !== false,
        emergencySafe: e.emergencySafe !== false,
      };
    })
    .filter((e) => e.id && e.startNodeId && e.endNodeId && nodeIds.has(e.startNodeId) && nodeIds.has(e.endNodeId) && e.startNodeId !== e.endNodeId);
  return { nodes: safeNodes, edges: safeEdges };
}

export interface NavGraphIssues {
  selfEdges: NavigationEdge[];
  duplicateEdges: NavigationEdge[];
  danglingEdges: NavigationEdge[];
  invalidCoords: NavigationNode[];
}

/**
 * Basic local graph validation used for authoring feedback (NOT the full B7
 * issues workflow). Detects the obvious local errors an admin can create.
 */
export function validateNavGraphBasics(
  nodes: NavigationNode[],
  edges: NavigationEdge[]
): NavGraphIssues {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const selfEdges: NavigationEdge[] = [];
  const duplicateEdges: NavigationEdge[] = [];
  const danglingEdges: NavigationEdge[] = [];
  const invalidCoords = nodes.filter((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y));
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.startNodeId === e.endNodeId) {
      selfEdges.push(e);
      continue;
    }
    if (!nodeIds.has(e.startNodeId) || !nodeIds.has(e.endNodeId)) {
      danglingEdges.push(e);
      continue;
    }
    const key = [e.startNodeId, e.endNodeId].sort().join("|");
    if (seen.has(key)) duplicateEdges.push(e);
    else seen.add(key);
  }
  return { selfEdges, duplicateEdges, danglingEdges, invalidCoords };
}

// ── B5 Phase 6.1 — Edge snap detection for waypoint insertion ───────────

/** Find the nearest point on a polyline segment. Returns { point, t } where t ∈ [0,1]. */
function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0, dist: Math.hypot(px - ax, py - ay) };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { x: cx, y: cy, t, dist: Math.hypot(px - cx, py - cy) };
}

/** Find the nearest point on an edge's polyline from a world point. */
export function nearestPointOnEdgePolyline(
  edge: NavigationEdge,
  nodeMap: Record<string, { x: number; y: number }>,
  point: { x: number; y: number },
): { x: number; y: number; dist: number; segIndex: number; t: number } | null {
  const startNode = nodeMap[edge.startNodeId];
  const endNode = nodeMap[edge.endNodeId];
  if (!startNode || !endNode) return null;
  const points = [
    { x: startNode.x, y: startNode.y },
    ...(edge.bendPoints ?? []),
    { x: endNode.x, y: endNode.y },
  ];
  let best: { x: number; y: number; dist: number; segIndex: number; t: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const result = nearestPointOnSegment(point.x, point.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (!best || result.dist < best.dist) {
      best = { x: result.x, y: result.y, dist: result.dist, segIndex: i, t: result.t };
    }
  }
  return best;
}

/** Snap threshold for waypoint-on-edge detection (canvas units). */
export const NAV_EDGE_SNAP_THRESHOLD = 20;

/** Find the nearest eligible navigation edge to a point. */
export function findNavEdgeAtPoint(
  edges: NavigationEdge[],
  nodeMap: Record<string, { x: number; y: number }>,
  point: { x: number; y: number },
  threshold = NAV_EDGE_SNAP_THRESHOLD,
): { edge: NavigationEdge; nearest: { x: number; y: number; dist: number; segIndex: number; t: number } } | null {
  let best: { edge: NavigationEdge; nearest: { x: number; y: number; dist: number; segIndex: number; t: number } } | null = null;
  for (const edge of edges) {
    // Self-edges and edges with no nodes are ineligible
    if (edge.startNodeId === edge.endNodeId) continue;
    const nearest = nearestPointOnEdgePolyline(edge, nodeMap, point);
    if (!nearest) continue;
    if (nearest.dist <= threshold && (!best || nearest.dist < best.nearest.dist)) {
      best = { edge, nearest };
    }
  }
  return best;
}

// ── B5 Final correction — shared nav graph GROUP translation ──────────────
//
// Both editors (outdoor CampusEditor + Floor Editor) must move a multi-selected
// nav graph RIGIDLY: every selected free node translates by (dx,dy), and every
// edge whose BOTH endpoints are in the moving set carries its bendPoints along
// by the same delta. An edge with only ONE endpoint moving keeps its bends (the
// fixed endpoint stays anchored and the polyline stretches) — never detaches.
// Mouse group drags and arrow-key nudges share this ONE pure implementation so
// the two input paths can never disagree.

/**
 * Translate the selected part of a nav graph by (dx,dy).
 *
 * - Nodes listed in `movingNodeIds` move by exactly (dx,dy). Nodes NOT listed
 *   (and therefore unselected / linked-to-physical-owner nodes that the caller
 *   deliberately excluded) stay put.
 * - Edges with BOTH endpoints inside `movingNodeIds` translate their
 *   bendPoints by the same (dx,dy) — the whole edge rides rigidly with the
 *   group. Edges with only one moving endpoint are left untouched: the moving
 *   node translates, the fixed node stays, and the polyline remains attached
 *   to both (partial-move semantics, matching single-node drags).
 * - Coordinates are translated exactly (no rounding/clamping here — callers
 *   round/clamp node positions against their own canvas bounds).
 */
export function translateSelectedNavGraph(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  movingNodeIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  if ((dx === 0 && dy === 0) || movingNodeIds.size === 0) {
    return { nodes, edges };
  }
  const nextNodes = nodes.map((n) =>
    movingNodeIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
  );
  const nextEdges = edges.map((e) => {
    if (!movingNodeIds.has(e.startNodeId) || !movingNodeIds.has(e.endNodeId)) return e;
    const bends = e.bendPoints;
    if (!bends || bends.length === 0) return e;
    return {
      ...e,
      bendPoints: bends.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    };
  });
  return { nodes: nextNodes, edges: nextEdges };
}

/**
 * Axis-aligned bounds of a selected nav graph group, used for the group
 * selection outline. Includes every selected node's coordinates AND the
 * bendPoints of every edge whose both endpoints are selected (the geometry
 * that actually rides with the group). Returns null when there is nothing to
 * bound. `padding` is added on every side (defaults to 18).
 */
export function navGroupSelectionBounds(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  selectedNodeIds: ReadonlySet<string>,
  selectedEdgeIds: ReadonlySet<string> = new Set(),
  padding = 18,
): { x: number; y: number; width: number; height: number } | null {
  const points: { x: number; y: number }[] = [];
  for (const n of nodes) {
    if (selectedNodeIds.has(n.id)) points.push({ x: n.x, y: n.y });
  }
  for (const e of edges) {
    const bothEndpoints = selectedNodeIds.has(e.startNodeId) && selectedNodeIds.has(e.endNodeId);
    if (!bothEndpoints && !selectedEdgeIds.has(e.id)) continue;
    for (const b of e.bendPoints ?? []) points.push({ x: b.x, y: b.y });
  }
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// ── B5 final bulk-routing state fix ────────────────────────────────────────
// The bulk-routing buttons operate on a graph multi-selection. Each action is
// a SEMANTIC classification, not a raw field merge: a positive/negative
// routing classification ALWAYS reopens the connection (closed=false), so the
// closed flag can never stay invisibly stuck after the admin changes the
// routing state. Only Mark closed (and the explicit Mark open) control the
// closed flag directly.

/** Semantic bulk-routing actions available from the graph multi-select panel. */
export type BulkRoutingAction =
  | "mark_accessible"
  | "mark_not_accessible"
  | "mark_emergency_safe"
  | "mark_open"
  | "mark_closed";

/**
 * Apply ONE semantic bulk-routing action to the given nav edges (only the
 * edges whose ids are listed are touched). Returns a NEW edges array; edges
 * outside the selection are returned by identity. Only routing metadata is
 * mutated — geometry (bendPoints/endpoints/distance), direction
 * (bidirectional) and color/width are never altered.
 */
export function applyBulkRoutingAction(
  edges: NavigationEdge[],
  ids: string[],
  action: BulkRoutingAction,
): NavigationEdge[] {
  const target = new Set(ids);
  return edges.map((e) => {
    if (!target.has(e.id)) return e;
    switch (action) {
      case "mark_accessible":
        return { ...e, accessible: true, inaccessibleReason: undefined, closed: false };
      case "mark_not_accessible":
        // Preserve each edge's existing reason, defaulting like the single-edge
        // inspector ("other") — matches existing UI behavior.
        return { ...e, accessible: false, inaccessibleReason: e.inaccessibleReason ?? "other", closed: false };
      case "mark_emergency_safe":
        return { ...e, emergencySafe: true, emergencyReason: undefined, closed: false };
      case "mark_open":
        return { ...e, closed: false };
      case "mark_closed":
        return { ...e, closed: true };
    }
  });
}
