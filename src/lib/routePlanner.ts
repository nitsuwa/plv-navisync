/**
 * routePlanner.ts — Student route planning wrapper (C4 Phase 1).
 *
 * This module does NOT implement new pathfinding. It wraps the existing
 * engines (pathfinding / indoorPathfinding / combinedPathfinding) behind a
 * single typed API used by the student campus map:
 *
 *   - Real graph-based stats (distance + ETA) for standard/emergency routes
 *   - Explicitly deferred accessibility mode until an accessible graph exists
 *   - Structured turn-by-turn steps with icons (not plain strings)
 *   - Floor-transition detection for multi-floor / indoor segments
 *   - Graceful standard-mode fallback when a building is not on the walkway
 *     graph (e.g. a legacy campus without a nav graph yet)
 *
 * Nothing in this file touches the map-builder (Developer 2 territory) or
 * any DB layer.
 */

import {
  findBuildingPath,
  findNavigationRoute,
  NODES as STATIC_NODES,
  EDGES as STATIC_EDGES,
  BUILDING_ENTRANCE_MAP,
  type GraphPath,
} from "./pathfinding";
import {
  findCompleteRoute,
  type BuildingDest,
  type Destination,
  type RouteSegment,
} from "./combinedPathfinding";

export type { Destination, RouteSegment };

// ── Shared types ───────────────────────────────────────────────────────────

export type RouteMode = "standard" | "accessible" | "emergency";

export interface Pt {
  x: number;
  y: number;
}

/** Minimal building shape the planner needs (id/code/name). */
export interface BuildingLike {
  id: string;
  code: string;
  name: string;
  /** Admin-selected outdoor entrance node for this building, when available. */
  entranceNodeId?: string;
}

/** Building rectangle used for the SVG estimate fallback. */
export interface RoutePosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Published-campus navigation graph (map-builder `navNodes` / `navEdges`),
 * consumed structurally so this module stays decoupled from Developer 2's
 * map-builder types.
 */
export interface CampusNavNode {
  id: string;
  x: number;
  y: number;
  name?: string;
  buildingId?: string;
  floorId?: string;
  entranceId?: string;
  roomId?: string;
  doorId?: string;
  transitionSharedId?: string;
  stairId?: string;
  elevatorId?: string;
  emergencySafe?: boolean;
  emergencyStair?: boolean;
  type?: string;
  accessible?: boolean;
  color?: string;
  width?: number;
}

export interface CampusNavEdge {
  id?: string;
  startNodeId: string;
  endNodeId: string;
  distance: number;
  bidirectional: boolean;
  accessible: boolean;
  emergencySafe?: boolean;
  closed?: boolean;
  type?: string;
  bendPoints?: Pt[];
  color?: string;
  width?: number;
}

export interface CampusNavGraph {
  navNodes?: CampusNavNode[] | null;
  navEdges?: CampusNavEdge[] | null;
}

export type RouteStepIcon =
  | "start"
  | "walk"
  | "stairs"
  | "elevator"
  | "enter"
  | "arrive"
  | "info";

export interface RouteStep {
  id: string;
  icon: RouteStepIcon;
  instruction: string;
  distanceM?: number;
  /** Optional badge, e.g. "Take the stairs to Floor 2" */
  badge?: string;
}

/** A floor-local portion of a planned route.  Its coordinates must only be
 * rendered against the matching building/floor SVG, never the campus map. */
export interface RouteIndoorSegment {
  buildingId: string;
  floorId?: string;
  floorNumber?: number;
  waypoints: Pt[];
  distanceM: number;
  seconds: number;
  steps: RouteStep[];
}

/** The exact vertical connection selected by the authored graph. */
export interface RouteTransitionDetail {
  kind: "stairs" | "elevator";
  nodeId: string;
  label: string;
  fromFloorId?: string;
  toFloorId?: string;
}

export interface PlannedRoute {
  /** Backward-compatible campus waypoints. Never contains floor-local points. */
  points: Pt[];
  /** Explicit outdoor/campus waypoints for the campus SVG. */
  campusPoints?: Pt[];
  /** Floor-local waypoints, grouped by building and floor context. */
  indoorSegments?: RouteIndoorSegment[];
  /** Total distance in meters */
  dist: number;
  /** Estimated walking time in minutes */
  mins: number;
  /** Structured turn-by-turn steps */
  steps: RouteStep[];
  /** Whether the stats come from the real walkway graph */
  isGraphBased: boolean;
  /** Whether the graph was authored and published by the map builder. */
  isAuthoredGraph?: boolean;
  mode: RouteMode;
  fromCode: string;
  toCode: string;
  /** Floor-transition badges ("Take the elevator to Floor 3") */
  transitions: string[];
  /** Authored stair/elevator identity for each floor transition. */
  transitionDetails?: RouteTransitionDetail[];
  /** If the destination is a room, the room to auto-open (floor plan) */
  destinationRoom?: { buildingId: string; floorNumber: number; roomId: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractDistanceM(instruction: string): number | undefined {
  const m = instruction.match(/Walk ([\d.]+)m/i);
  return m ? parseFloat(m[1]) : undefined;
}

/**
 * Pick a step icon from the instruction text.
 * Icon choice is purely presentational.
 */
function classifyStep(instruction: string): RouteStepIcon {
  const lower = instruction.toLowerCase();
  if (/arrive|reached/i.test(lower)) return "arrive";
  if (/elevator/i.test(lower)) return "elevator";
  if (/stairs|staircase/i.test(lower)) return "stairs";
  if (/enter|entrance/i.test(lower)) return "enter";
  if (/walk|go to|head|toward/i.test(lower)) return "walk";
  return "info";
}

// ── Step builders ──────────────────────────────────────────────────────────

/**
 * Convert a GraphPath's plain-string steps into structured RouteSteps,
 * prefixing a start step and appending an arrive step when missing.
 */
export function stepsFromGraphPath(path: GraphPath, fromCode: string, toCode: string): RouteStep[] {
  const steps: RouteStep[] = [];
  const hasStart = path.steps.length > 0 && /^start/i.test(path.steps[0]);
  if (!hasStart) {
    steps.push({ id: "start", icon: "start", instruction: `Start from ${fromCode}` });
  }
  path.steps.forEach((s, i) => {
    const icon = classifyStep(s);
    steps.push({ id: `step-${i}`, icon, instruction: s, distanceM: extractDistanceM(s) });
  });
  const last = path.steps[path.steps.length - 1] ?? "";
  if (!/arrive/i.test(last)) {
    steps.push({ id: "arrive", icon: "arrive", instruction: `Arrive at ${toCode}` });
  }
  return steps;
}

/** Flatten a combined route's segments into one ordered step list. */
export function stepsFromCombined(
  segments: RouteSegment[],
  fromCode: string,
  toCode: string
): RouteStep[] {
  const steps: RouteStep[] = [];
  steps.push({ id: "c-start", icon: "start", instruction: `Start from ${fromCode}` });
  let idx = 0;
  for (const seg of segments) {
    for (const s of seg.steps) {
      const icon = classifyStep(s);
      steps.push({ id: `c-${idx}`, icon, instruction: s, distanceM: extractDistanceM(s) });
      idx += 1;
    }
  }
  steps.push({ id: "c-arrive", icon: "arrive", instruction: `Arrive at ${toCode}` });
  return steps;
}

// ── Floor transitions ──────────────────────────────────────────────────────

/**
 * Detect floor changes between consecutive indoor segments and describe
 * them as badges, e.g. "Take the stairs to Floor 2".
 */
export function detectFloorTransitions(segments: RouteSegment[]): string[] {
  const transitions: string[] = [];
  let prevFloor: number | null = null;
  let pendingTransit: "stairs" | "elevator" | null = null;
  for (const seg of segments) {
    // Vertical-transit segments carry floorNumber = null; remember whether
    // they use an elevator (accessible transit) or the stairs.
    if (seg.floorNumber === null) {
      if (/elevator/i.test(seg.label) || /elevator/i.test(seg.steps.join(" "))) {
        pendingTransit = "elevator";
      } else if (/stairs/i.test(seg.label) || /stairs/i.test(seg.steps.join(" "))) {
        pendingTransit = "stairs";
      }
      continue;
    }
    if (prevFloor !== null && seg.floorNumber !== prevFloor) {
      const mode = pendingTransit ?? (/elevator/i.test(seg.label) ? "elevator" : "stairs");
      transitions.push(
        seg.floorNumber > prevFloor
          ? `Take the ${mode} to Floor ${seg.floorNumber}`
          : `Take the ${mode} down to Floor ${seg.floorNumber}`
      );
    }
    prevFloor = seg.floorNumber;
    pendingTransit = null;
  }
  return transitions;
}

// ── SVG estimate fallback (only used when the graph has no entry) ─────────

function svgRoutePoints(from: RoutePosition, to: RoutePosition): Pt[] {
  const fCx = from.x + from.w / 2;
  const fCy = from.y + from.h / 2;
  const tCx = to.x + to.w / 2;
  const tCy = to.y + to.h / 2;
  const pts: Pt[] = [{ x: fCx, y: fCy }];
  // Match the campus map's orthogonal street layout (roads at y=289 / x=401)
  if ((fCx < 401) === (tCx < 401) && (fCy < 289) === (tCy < 289)) {
    pts.push({ x: fCx, y: 289 }, { x: tCx, y: 289 });
  } else {
    pts.push({ x: fCx, y: 289 }, { x: 401, y: 289 }, { x: tCx, y: 289 });
  }
  pts.push({ x: tCx, y: tCy });
  return pts;
}

function estimateDistance(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i += 1) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return Math.round(d * 0.45);
}

function fallbackSteps(from: BuildingLike, to: BuildingLike, dist: number): RouteStep[] {
  return [
    { id: "start", icon: "start", instruction: `Start from ${from.code}` },
    { id: "walk", icon: "walk", instruction: `Walk ${dist} m toward ${to.code}`, distanceM: dist },
    { id: "arrive", icon: "arrive", instruction: `Arrive at ${to.code}` },
  ];
}

// ── Public API ─────────────────────────────────────────────────────────────

function toPlannedRoute(
  path: GraphPath,
  mode: RouteMode,
  fromCode: string,
  toCode: string,
  fromPt?: Pt,
  graphNodes?: CampusNavNode[],
  graphEdges?: CampusNavEdge[],
): PlannedRoute | null {
  if (!path || path.waypoints.length === 0) return null;
  const steps = stepsFromGraphPath(path, fromCode, toCode);
  if (fromPt && steps.length > 0) {
    // The first step of a point-start route always reads "You are here".
    steps[0] = { id: "start", icon: "start", instruction: "You are here" };
  }
  const contexts = graphNodes && graphEdges
    ? authoredRouteContexts(path, graphNodes, graphEdges,
        { type: "building", buildingId: "", label: fromCode, code: fromCode },
        { type: "building", buildingId: "", label: toCode, code: toCode })
    : null;
  const campusPoints = contexts?.campusPoints ?? path.waypoints;
  return {
    points: campusPoints,
    campusPoints,
    indoorSegments: contexts?.indoorSegments,
    dist: path.distanceM,
    mins: path.minutes,
    steps,
    isGraphBased: true,
    isAuthoredGraph: Boolean(graphNodes && graphEdges),
    mode,
    fromCode,
    toCode,
    transitions: path.steps.filter((step) => /^Take the (stairs|elevator)/i.test(step)),
    transitionDetails: contexts?.transitionDetails,
  };
}

/** Used by the page's Find Route guard and by regression tests. */
export function hasNavigableRoute(route: PlannedRoute | null | undefined): route is PlannedRoute {
  return Boolean(route && (
    route.points.length >= 2
    || route.indoorSegments?.some((segment) => segment.waypoints.length >= 2)
  ));
}

function endpointLabel(destination: Destination): string {
  return destination.type === "room" ? destination.roomName : destination.code;
}

function resolveRoomNode(
  nodes: CampusNavNode[],
  destination: Extract<Destination, { type: "room" }>,
): CampusNavNode | undefined {
  const accessNode = destination.accessNodeId
    ? nodes.find((node) =>
        node.id === destination.accessNodeId
        && node.buildingId === destination.buildingId
        && node.floorId
      )
    : undefined;
  return accessNode
    ?? nodes.find((node) =>
      node.buildingId === destination.buildingId
      && node.roomId === destination.roomId
    )
    ?? [
      ...(destination.accessDoorId ? [destination.accessDoorId] : []),
      ...(destination.accessDoorIds ?? []),
    ]
      .map((doorId) => nodes.find((node) =>
        node.buildingId === destination.buildingId
        && node.doorId === doorId
      ))
      .find((node): node is CampusNavNode => Boolean(node));
}

function authoredDestinationEndpoint(
  nodes: CampusNavNode[],
  destination: Destination,
  accessibleOnly: boolean,
): CampusNavNode | undefined {
  if (destination.type === "room") return resolveRoomNode(nodes, destination);
  return resolveBuildingEntranceNode(nodes, destination.buildingId, destination.entranceNodeId, accessibleOnly);
}

/**
 * Route any authored destination pair directly through the campus graph.
 * Room nodes are first-class endpoints, so no page-level combination of an
 * outdoor route and a legacy floor estimate is needed for room↔room travel.
 */
export function planAuthoredDestinationRoute(
  from: Destination,
  to: Destination,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
): PlannedRoute | null {
  // Accessibility is intentionally out of scope for this slice. Keep the
  // mode in the public type, but never return an unimplemented route.
  if (mode === "accessible") return null;
  const campusGraph = resolveCampusGraph(graph);
  if (!campusGraph || !from?.buildingId || !to?.buildingId) return null;

  const fromNode = authoredDestinationEndpoint(campusGraph.nodes, from, false);
  const toNode = authoredDestinationEndpoint(campusGraph.nodes, to, false);
  if (!fromNode || !toNode) return null;

  const path = findNavigationRoute(
    campusGraph.nodes,
    campusGraph.edges,
    fromNode.id,
    toNode.id,
    false,
    mode === "emergency",
    { useDerivedTransitions: false },
  );
  if (!path) return null;

  const fromCode = endpointLabel(from);
  const toCode = endpointLabel(to);
  const planned = toPlannedRoute(
    path,
    mode,
    fromCode,
    toCode,
    undefined,
    campusGraph.nodes,
    campusGraph.edges,
  );
  if (!planned) return null;
  const contexts = authoredRouteContexts(path, campusGraph.nodes, campusGraph.edges, from, to);
  planned.points = contexts.campusPoints;
  planned.campusPoints = contexts.campusPoints;
  planned.indoorSegments = contexts.indoorSegments;
  planned.transitionDetails = contexts.transitionDetails;
  if (to.type === "room") {
    planned.destinationRoom = {
      buildingId: to.buildingId,
      floorNumber: to.floorNumber,
      roomId: to.roomId,
    };
  }
  if (!hasNavigableRoute(planned)) return null;
  return planned;
}

/**
 * Resolve the campus-published nav graph (navNodes/navEdges) into the generic
 * shape expected by `findNavigationRoute`, or `null` when the campus has none.
 */
function resolveCampusGraph(graph?: CampusNavGraph | null): {
  nodes: CampusNavNode[];
  edges: CampusNavEdge[];
} | null {
  // A supplied graph is an authored contract, including an explicitly empty
  // published graph. Only an omitted/null graph retains legacy fallback.
  if (graph === undefined || graph === null) return null;
  const nodes = Array.isArray(graph.navNodes) ? graph.navNodes : [];
  const edges = Array.isArray(graph.navEdges) ? graph.navEdges : [];
  return { nodes, edges };
}

/** Pick the outdoor Entrance node for a building, never an indoor room/door
 * node.  Published buildings can have several entrances; the primary/main
 * candidate is preferred so the outdoor route hands off at the real gate. */
function resolveBuildingEntranceNode(
  nodes: CampusNavNode[],
  buildingId: string,
  preferredNodeId?: string,
  accessibleOnly = false,
): CampusNavNode | undefined {
  const preferred = preferredNodeId
    ? nodes.find((node) => node.id === preferredNodeId
      && node.buildingId === buildingId
      && !node.floorId
      && (!accessibleOnly || node.accessible !== false))
    : undefined;
  if (preferred) return preferred;

  const candidates = nodes.filter((node) =>
    node.buildingId === buildingId
    && !node.floorId
    && (node.entranceId || node.type === "entrance")
  );
  if (candidates.length === 0) {
    return nodes.find((node) => node.buildingId === buildingId && !node.floorId);
  }
  return [...candidates].sort((a, b) => {
    const score = (node: CampusNavNode) => {
      const label = `${node.name ?? ""} ${node.entranceId ?? ""}`.toLowerCase();
      return (label.includes("main") || label.includes("primary") || label.includes("lobby") ? 100 : 0)
        + (node.type === "entrance" ? 10 : 0);
    };
    return score(b) - score(a);
  })[0];
}

/** Expand the selected admin graph route with each edge's authored bends. */
function authoredGraphWaypoints(
  path: GraphPath,
  nodes: CampusNavNode[],
  edges: CampusNavEdge[],
): Pt[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const points: Pt[] = [];
  const append = (point: Pt) => {
    const previous = points[points.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  };
  for (let index = 0; index < path.nodeIds.length; index += 1) {
    const fromId = path.nodeIds[index - 1];
    const toId = path.nodeIds[index];
    const current = nodeById.get(toId);
    if (!current) continue;
    if (index > 0) {
      const direct = edges.find((edge) => edge.startNodeId === fromId && edge.endNodeId === toId);
      const reverse = direct ? undefined : edges.find((edge) =>
        edge.bidirectional && edge.startNodeId === toId && edge.endNodeId === fromId
      );
      const bends = direct?.bendPoints ?? (reverse?.bendPoints ? [...reverse.bendPoints].reverse() : []);
      bends.forEach(append);
    }
    append({ x: current.x, y: current.y });
  }
  return points.length >= 2 ? points : path.waypoints;
}

type AuthoredContext = {
  kind: "campus" | "floor";
  key: string;
  buildingId?: string;
  floorId?: string;
  floorNumber?: number;
  waypoints: Pt[];
  steps: RouteStep[];
  rawDistance: number;
};

function authoredEdgeFor(
  edges: CampusNavEdge[],
  fromId: string,
  toId: string,
): { edge?: CampusNavEdge; reversed: boolean } {
  // Match the open edge A* can select. Closed duplicates must not contribute
  // bend geometry, and lower-cost duplicates win just like graph search.
  const openEdges = edges.filter((edge) => edge.closed !== true);
  const byDistance = (a: CampusNavEdge, b: CampusNavEdge) => a.distance - b.distance;
  const direct = openEdges
    .filter((edge) => edge.startNodeId === fromId && edge.endNodeId === toId)
    .sort(byDistance)[0];
  if (direct) return { edge: direct, reversed: false };
  const reverse = openEdges
    .filter((edge) => edge.bidirectional && edge.startNodeId === toId && edge.endNodeId === fromId)
    .sort(byDistance)[0];
  return { edge: reverse, reversed: true };
}

function transitionKindFor(
  from: CampusNavNode,
  to: CampusNavNode,
  edge?: CampusNavEdge,
): "stairs" | "elevator" {
  const text = `${edge?.type ?? ""} ${from.type ?? ""} ${to.type ?? ""} ${from.transitionSharedId ?? ""}`.toLowerCase();
  return text.includes("elev") || text.includes("lift") || from.elevatorId || to.elevatorId
    ? "elevator"
    : "stairs";
}

/** Split a selected authored graph path by coordinate space. */
function authoredRouteContexts(
  path: GraphPath,
  nodes: CampusNavNode[],
  edges: CampusNavEdge[],
  from: Destination,
  to: Destination,
): {
  campusPoints: Pt[];
  indoorSegments: RouteIndoorSegment[];
  transitionDetails: RouteTransitionDetail[];
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const floorNumberById = new Map<string, number>();
  const addRoomFloorNumber = (destination: Destination) => {
    if (destination.type !== "room") return;
    if (destination.accessNodeId) floorNumberById.set(destination.accessNodeId, destination.floorNumber);
    nodes
      .filter((node) => node.buildingId === destination.buildingId && node.roomId === destination.roomId)
      .forEach((node) => floorNumberById.set(node.id, destination.floorNumber));
  };
  addRoomFloorNumber(from);
  addRoomFloorNumber(to);
  const contexts: AuthoredContext[] = [];
  const transitions: RouteTransitionDetail[] = [];
  const pointKey = (node: CampusNavNode) => node.floorId
    ? `floor:${node.buildingId ?? ""}:${node.floorId}`
    : "campus";
  const appendPoint = (points: Pt[], point: Pt) => {
    const previous = points[points.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  };
  const startContext = (node: CampusNavNode): AuthoredContext => ({
    kind: node.floorId ? "floor" : "campus",
    key: pointKey(node),
    buildingId: node.buildingId,
    floorId: node.floorId,
    floorNumber: floorNumberById.get(node.id),
    waypoints: [{ x: node.x, y: node.y }],
    steps: [],
    rawDistance: 0,
  });

  const first = nodeById.get(path.nodeIds[0]);
  if (!first) return { campusPoints: [], indoorSegments: [], transitionDetails: [] };
  let current = startContext(first);
  for (let index = 1; index < path.nodeIds.length; index += 1) {
    const fromNode = nodeById.get(path.nodeIds[index - 1]);
    const toNode = nodeById.get(path.nodeIds[index]);
    if (!fromNode || !toNode) continue;
    const { edge, reversed } = authoredEdgeFor(edges, fromNode.id, toNode.id);
    const edgeDistance = Math.max(0, Number(edge?.distance) || Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y));
    const nextKey = pointKey(toNode);
    if (nextKey !== current.key) {
      contexts.push(current);
      if (fromNode.floorId && toNode.floorId && fromNode.floorId !== toNode.floorId) {
        const kind = transitionKindFor(fromNode, toNode, edge);
        const transitionNode = kind === "elevator"
          ? (toNode.elevatorId || toNode.type === "elevator" ? toNode : fromNode)
          : (toNode.stairId || toNode.type === "stair" ? toNode : fromNode);
        transitions.push({
          kind,
          nodeId: transitionNode.id,
          label: transitionNode.name || transitionNode.id,
          fromFloorId: fromNode.floorId,
          toFloorId: toNode.floorId,
        });
      }
      current = startContext(toNode);
      current.floorNumber = floorNumberById.get(toNode.id)
        ?? (to.type === "room" && to.buildingId === toNode.buildingId && toNode.floorId ? to.floorNumber : undefined);
      continue;
    }
    const bends = edge?.bendPoints ? (reversed ? [...edge.bendPoints].reverse() : edge.bendPoints) : [];
    bends.forEach((bend) => appendPoint(current.waypoints, { x: bend.x, y: bend.y }));
    appendPoint(current.waypoints, { x: toNode.x, y: toNode.y });
    current.rawDistance += edgeDistance;
  }
  contexts.push(current);

  const totalRawDistance = contexts.reduce((sum, context) => sum + context.rawDistance, 0);
  const metersPerRawUnit = totalRawDistance > 0 ? path.distanceM / totalRawDistance : 0;
  const toFloorId = to.type === "room"
    ? nodes.find((node) => node.roomId === to.roomId && node.buildingId === to.buildingId)?.floorId
    : undefined;
  const campusPoints: Pt[] = [];
  const indoorSegments: RouteIndoorSegment[] = [];
  for (const context of contexts) {
    if (context.kind === "campus") {
      context.waypoints.forEach((point) => appendPoint(campusPoints, point));
      continue;
    }
    const distanceM = Number((context.rawDistance * metersPerRawUnit).toFixed(1));
    const isTargetFloor = Boolean(toFloorId && context.floorId === toFloorId);
    const steps: RouteStep[] = context.waypoints.slice(1).map((point, index) => ({
      id: `indoor-context-${indoorSegments.length}-${index}`,
      icon: "walk",
      instruction: `Continue to floor waypoint ${index + 1}`,
    }));
    indoorSegments.push({
      buildingId: context.buildingId ?? (to.type === "room" ? to.buildingId : from.buildingId),
      floorId: context.floorId,
      floorNumber: context.floorNumber ?? (isTargetFloor && to.type === "room" ? to.floorNumber : undefined),
      waypoints: context.waypoints,
      distanceM,
      seconds: Math.max(0, Math.round((distanceM / Math.max(0.1, path.distanceM)) * path.minutes * 60)),
      steps,
    });
  }
  return { campusPoints, indoorSegments, transitionDetails: transitions };
}

/**
 * Plan a building → building route on the campus map.
 *
 * Prefers the published campus navigation graph (navNodes/navEdges — real
 * distances + ETA + turn-by-turn). Standard mode retains the built-in walkway
 * graph and SVG estimate for legacy campuses; emergency mode requires the
 * authored graph so stairs and safety flags are verifiable.
 *
 * @param positions optional building rectangles — required for the fallback
 * @param graph optional published-campus nav graph (C4 Phase 2 bridge)
 */
export function planBuildingRoute(
  from: BuildingLike,
  to: BuildingLike,
  mode: RouteMode,
  positions?: Record<string, RoutePosition>,
  graph?: CampusNavGraph | null
): PlannedRoute | null {
  if (!from?.id || !to?.id || from.id === to.id || mode === "accessible") return null;

  // 0. Published-campus nav graph (real routes for any campus with one)
  const campusGraph = resolveCampusGraph(graph);
  if (campusGraph) {
    const fromNode = resolveBuildingEntranceNode(campusGraph.nodes, from.id, from.entranceNodeId, false);
    const toNode = resolveBuildingEntranceNode(campusGraph.nodes, to.id, to.entranceNodeId, false);
    if (fromNode && toNode) {
      const p = findNavigationRoute(
        campusGraph.nodes,
        campusGraph.edges,
        fromNode.id,
        toNode.id,
        false,
        mode === "emergency",
        { useDerivedTransitions: false }
      );
      if (p) {
        const planned = toPlannedRoute(p, mode, from.code, to.code, undefined, campusGraph.nodes, campusGraph.edges);
        if (planned) return planned;
      }
    }
    // A published graph is authoritative. Do not silently replace a missing
    // endpoint or disconnected route with the static graph/orthogonal guess.
    return null;
  }

  // Emergency routing must never present the legacy graph as stair-safe. The
  // admin-authored graph is the only source that carries emergency semantics.
  if (mode === "emergency") return null;

  // 1. Built-in walkway graph (legacy b1-b6 ids)
  const graphPath = findBuildingPath(from.id, to.id, false);
  if (graphPath && graphPath.waypoints.length >= 2) {
    return toPlannedRoute(graphPath, mode, from.code, to.code) ?? null;
  }

  // 2. SVG estimate fallback when the graph has no entries for these buildings
  const fp = positions?.[from.id];
  const tp = positions?.[to.id];
  if (!fp || !tp) return null;

  const points = svgRoutePoints(fp, tp);
  const dist = estimateDistance(points);
  return {
    points,
    campusPoints: points,
    dist,
    mins: Math.max(1, Math.round(dist / 80)),
    steps: fallbackSteps(from, to, dist),
    isGraphBased: false,
    mode,
    fromCode: from.code,
    toCode: to.code,
    transitions: [],
  };
}

/**
 * Plan a route starting from a free-form SVG point (the "You are here"
 * marker — GPS fix or tap-on-map) to a destination building.
 *
 * The start point is snapped to the nearest walkway node, so standard routes
 * begin on the path network. Emergency routes require an authored graph;
 * standard legacy maps may use a straight-line estimate when no node exists.
 */
export function planRouteFromPoint(
  fromPt: Pt,
  to: BuildingLike,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
  positions?: Record<string, RoutePosition>
): PlannedRoute | null {
  if (!fromPt || !to?.id || mode === "accessible") return null;

  const campusGraph = resolveCampusGraph(graph);
  if (!campusGraph && mode === "emergency") return null;
  const nodes: CampusNavNode[] = campusGraph ? campusGraph.nodes : STATIC_NODES;
  const edges: CampusNavEdge[] = campusGraph
    ? campusGraph.edges
    : STATIC_EDGES.map((e) => ({
        startNodeId: e.from,
        endNodeId: e.to,
        distance: e.distance,
        bidirectional: true,
        accessible: e.accessible,
      }));

  // Destination node: campus graph building node, or static entrance map.
  let toNodeId: string | undefined;
  if (campusGraph) {
    toNodeId = resolveBuildingEntranceNode(campusGraph.nodes, to.id, to.entranceNodeId, false)?.id;
  } else {
    toNodeId = BUILDING_ENTRANCE_MAP[to.id];
  }
  if (!toNodeId || nodes.length === 0) {
    if (campusGraph) return null;
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  // Snap the start point to the nearest node.
  const outdoorNodes = nodes.filter((node) => !node.floorId);
  let fromNodeId: string | null = null;
  let bestD = Infinity;
  for (const n of outdoorNodes) {
    const d = Math.hypot(n.x - fromPt.x, n.y - fromPt.y);
    if (d < bestD) {
      bestD = d;
      fromNodeId = n.id;
    }
  }
  if (!fromNodeId) {
    if (campusGraph) return null;
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  const path = findNavigationRoute(
    nodes,
    edges,
    fromNodeId,
    toNodeId,
    false,
    mode === "emergency",
    { useDerivedTransitions: !campusGraph }
  );
  if (!path || path.waypoints.length < 2) {
    if (campusGraph) return null;
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  return toPlannedRoute(path, mode, "You are here", to.code, fromPt, campusGraph?.nodes, campusGraph?.edges);
}

/**
 * Plan a point/GPS origin directly to a room endpoint on an authored graph.
 * This avoids adding an indoor tail after an outdoor route has already been
 * calculated, which would omit authored floor-transition cost and identity.
 * Legacy campuses intentionally return null so the page can retain its
 * backward-compatible floor-layout behavior.
 */
export function planPointToDestinationRoute(
  fromPt: Pt,
  to: Destination,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
  positions?: Record<string, RoutePosition>,
): PlannedRoute | null {
  if (to.type === "building") {
    return planRouteFromPoint(
      fromPt,
      { id: to.buildingId, code: to.code, name: to.label, entranceNodeId: to.entranceNodeId },
      mode,
      graph,
      positions,
    );
  }
  if (!fromPt || mode === "accessible") return null;
  const campusGraph = resolveCampusGraph(graph);
  if (!campusGraph) return null;

  const outdoorNodes = campusGraph.nodes.filter((node) => !node.floorId);
  const fromNode = outdoorNodes.reduce<CampusNavNode | undefined>((best, node) => {
    if (!best) return node;
    return Math.hypot(node.x - fromPt.x, node.y - fromPt.y) < Math.hypot(best.x - fromPt.x, best.y - fromPt.y)
      ? node
      : best;
  }, undefined);
  const toNode = authoredDestinationEndpoint(campusGraph.nodes, to, false);
  if (!fromNode || !toNode) return null;

  const path = findNavigationRoute(
    campusGraph.nodes,
    campusGraph.edges,
    fromNode.id,
    toNode.id,
    false,
    mode === "emergency",
    { useDerivedTransitions: false },
  );
  if (!path || path.waypoints.length < 2) return null;

  const planned = toPlannedRoute(
    path,
    mode,
    "You are here",
    to.roomName,
    fromPt,
    campusGraph.nodes,
    campusGraph.edges,
  );
  if (!planned) return null;
  const pointOrigin: BuildingDest = {
    type: "building",
    buildingId: "__point_origin__",
    label: "You are here",
    code: "You are here",
  };
  const contexts = authoredRouteContexts(path, campusGraph.nodes, campusGraph.edges, pointOrigin, to);
  planned.points = contexts.campusPoints;
  planned.campusPoints = contexts.campusPoints;
  planned.indoorSegments = contexts.indoorSegments;
  planned.transitionDetails = contexts.transitionDetails;
  planned.destinationRoom = {
    buildingId: to.buildingId,
    floorNumber: to.floorNumber,
    roomId: to.roomId,
  };
  return planned;
}

/** Straight-line SVG estimate from a free point to a building center. */
function svgFallbackFromPoint(
  fromPt: Pt,
  to: BuildingLike,
  mode: RouteMode,
  positions?: Record<string, RoutePosition>
): PlannedRoute | null {
  const tp = positions?.[to.id];
  if (!tp) return null;
  const tCx = tp.x + tp.w / 2;
  const tCy = tp.y + tp.h / 2;
  const points: Pt[] = [
    { x: fromPt.x, y: fromPt.y },
    { x: fromPt.x, y: 289 },
    { x: tCx, y: 289 },
    { x: tCx, y: tCy },
  ];
  const dist = estimateDistance(points);
  return {
    points,
    dist,
    mins: Math.max(1, Math.round(dist / 80)),
    steps: [
      { id: "start", icon: "start", instruction: "You are here" },
      { id: "walk", icon: "walk", instruction: `Walk ${dist} m toward ${to.code}`, distanceM: dist },
      { id: "arrive", icon: "arrive", instruction: `Arrive at ${to.code}` },
    ],
    isGraphBased: false,
    mode,
    fromCode: "You are here",
    toCode: to.code,
    transitions: [],
  };
}

/**
 * Plan a route between any destinations (buildings or rooms) using the
 * combined engine — handles indoor segments and floor transitions.
 */
export function planDestinationRoute(
  from: Destination,
  to: Destination,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
): PlannedRoute | null {
  if (!from?.buildingId || !to?.buildingId || mode === "accessible") return null;

  if (resolveCampusGraph(graph)) {
    return planAuthoredDestinationRoute(from, to, mode, graph);
  }
  if (mode === "emergency") return null;
  const combined = findCompleteRoute(from, to, false);
  if (!combined) return null;

  const fromCode = endpointLabel(from);
  const toCode = endpointLabel(to);
  const campusPoints = combined.segments
    .filter((segment) => !segment.isIndoor)
    .flatMap((segment) => segment.waypoints);
  const indoorSegments = combined.segments
    .filter((segment) => segment.isIndoor && segment.buildingId)
    .map((segment, index) => ({
      buildingId: segment.buildingId!,
      floorNumber: segment.floorNumber ?? undefined,
      waypoints: segment.waypoints,
      distanceM: segment.distanceM,
      seconds: segment.seconds,
      steps: segment.steps.map((instruction, stepIndex) => ({
        id: `combined-indoor-${index}-${stepIndex}`,
        icon: classifyStep(instruction),
        instruction,
        distanceM: extractDistanceM(instruction),
      })),
    }));

  return {
    points: campusPoints,
    campusPoints,
    indoorSegments,
    dist: combined.totalDistanceM,
    mins: combined.totalMinutes,
    steps: stepsFromCombined(combined.segments, fromCode, toCode),
    isGraphBased: true,
    isAuthoredGraph: false,
    mode,
    fromCode,
    toCode,
    transitions: detectFloorTransitions(combined.segments),
    destinationRoom: combined.destinationRoom,
  };
}

// ── Formatting helpers (used by the steps panel) ───────────────────────────

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "<1 min";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes} min`;
}
