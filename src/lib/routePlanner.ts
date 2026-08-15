/**
 * routePlanner.ts — Student route planning wrapper (C4 Phase 1).
 *
 * This module does NOT implement new pathfinding. It wraps the existing
 * engines (pathfinding / indoorPathfinding / combinedPathfinding) behind a
 * single typed API used by the student campus map:
 *
 *   - Real graph-based stats (distance + ETA) in ALL modes, not just accessible
 *   - Structured turn-by-turn steps with icons (not plain strings)
 *   - Floor-transition detection for multi-floor / indoor segments
 *   - Graceful fallback to an SVG estimate when a building is not on the
 *     walkway graph (e.g. a published campus without a nav graph yet)
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
  type Destination,
  type RouteSegment,
} from "./combinedPathfinding";

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
}

export interface CampusNavEdge {
  startNodeId: string;
  endNodeId: string;
  distance: number;
  bidirectional: boolean;
  accessible: boolean;
  emergencySafe?: boolean;
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

export interface PlannedRoute {
  /** SVG waypoints for drawing on the campus map */
  points: Pt[];
  /** Total distance in meters */
  dist: number;
  /** Estimated walking time in minutes */
  mins: number;
  /** Structured turn-by-turn steps */
  steps: RouteStep[];
  /** Whether the stats come from the real walkway graph */
  isGraphBased: boolean;
  mode: RouteMode;
  fromCode: string;
  toCode: string;
  /** Floor-transition badges ("Take the elevator to Floor 3") */
  transitions: string[];
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
  fromPt?: Pt
): PlannedRoute | null {
  if (!path || path.waypoints.length < 2) return null;
  const steps = stepsFromGraphPath(path, fromCode, toCode);
  if (fromPt && steps.length > 0) {
    // The first step of a point-start route always reads "You are here".
    steps[0] = { id: "start", icon: "start", instruction: "You are here" };
  }
  return {
    points: path.waypoints,
    dist: path.distanceM,
    mins: path.minutes,
    steps,
    isGraphBased: true,
    mode,
    fromCode,
    toCode,
    transitions: [],
  };
}

/**
 * Resolve the campus-published nav graph (navNodes/navEdges) into the generic
 * shape expected by `findNavigationRoute`, or `null` when the campus has none.
 */
function resolveCampusGraph(graph?: CampusNavGraph | null): {
  nodes: CampusNavNode[];
  edges: CampusNavEdge[];
} | null {
  const nodes = graph?.navNodes;
  const edges = graph?.navEdges;
  if (!nodes || !edges || nodes.length === 0 || edges.length === 0) return null;
  return { nodes, edges };
}

/**
 * Plan a building → building route on the campus map.
 *
 * Prefers the published campus navigation graph (navNodes/navEdges — real
 * distances + ETA + turn-by-turn), then the built-in walkway graph, then an
 * SVG orthogonal estimate so the UI never breaks.
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
  if (!from?.id || !to?.id || from.id === to.id) return null;

  // 0. Published-campus nav graph (real routes for any campus with one)
  const campusGraph = resolveCampusGraph(graph);
  if (campusGraph) {
    const fromNode = campusGraph.nodes.find((n) => n.buildingId === from.id);
    const toNode = campusGraph.nodes.find((n) => n.buildingId === to.id);
    if (fromNode && toNode) {
      const p = findNavigationRoute(
        campusGraph.nodes,
        campusGraph.edges,
        fromNode.id,
        toNode.id,
        mode === "accessible",
        mode === "emergency"
      );
      if (p) {
        const planned = toPlannedRoute(p, mode, from.code, to.code);
        if (planned) return planned;
      }
    }
  }

  // 1. Built-in walkway graph (legacy b1-b6 ids)
  const graphPath = findBuildingPath(from.id, to.id, mode === "accessible");
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
 * The start point is snapped to the nearest walkway node, so the route
 * always begins on the path network. When no graph node can be reached,
 * falls back to a straight-line SVG estimate from the point to the
 * destination so the demo never breaks.
 */
export function planRouteFromPoint(
  fromPt: Pt,
  to: BuildingLike,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
  positions?: Record<string, RoutePosition>
): PlannedRoute | null {
  if (!fromPt || !to?.id) return null;

  const campusGraph = resolveCampusGraph(graph);
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
    toNodeId = campusGraph.nodes.find((n) => n.buildingId === to.id)?.id;
  } else {
    toNodeId = BUILDING_ENTRANCE_MAP[to.id];
  }
  if (!toNodeId || nodes.length === 0) {
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  // Snap the start point to the nearest node.
  let fromNodeId: string | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.x - fromPt.x, n.y - fromPt.y);
    if (d < bestD) {
      bestD = d;
      fromNodeId = n.id;
    }
  }
  if (!fromNodeId) {
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  const path = findNavigationRoute(
    nodes,
    edges,
    fromNodeId,
    toNodeId,
    mode === "accessible",
    mode === "emergency"
  );
  if (!path || path.waypoints.length < 2) {
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  return toPlannedRoute(path, mode, "You are here", to.code, fromPt);
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
  mode: RouteMode
): PlannedRoute | null {
  if (!from?.buildingId || !to?.buildingId) return null;
  const combined = findCompleteRoute(from, to, mode === "accessible");
  if (!combined) return null;

  const fromCode = from.type === "building" ? from.code : from.buildingCode;
  const toCode = to.type === "building" ? to.code : to.buildingCode;

  return {
    points: combined.campusWaypoints,
    dist: combined.totalDistanceM,
    mins: combined.totalMinutes,
    steps: stepsFromCombined(combined.segments, fromCode, toCode),
    isGraphBased: true,
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
