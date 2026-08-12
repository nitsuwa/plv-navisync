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
