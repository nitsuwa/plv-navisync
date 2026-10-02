/**
 * routePlanner.ts — Student route planning wrapper (C4 Phase 1).
 *
 * This module does NOT implement new pathfinding. It wraps the existing
 * engines (pathfinding / indoorPathfinding / combinedPathfinding) behind a
 * single typed API used by the student campus map:
 *
 *   - Real graph-based stats (distance + ETA) for standard/accessible/emergency routes
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
import { exteriorFloorPointToCampusWorld } from "./exteriorApproachNavigation";
import { filterRoutineNavigationEdges, filterRoutineNavigationNodes } from "./routineNavigationGraph";
import {
  reconcileRoomDoorEdges,
  ROOM_DOOR_EDGE_TYPE,
  syncIndoorLinkedNodePositions,
} from "./indoorNavigationGraph";
import type {
  FloorDoor,
  FloorElevatorItem,
  FloorRamp,
  FloorRoom,
  FloorStairs,
  FloorWall,
  NavigationEdge,
  NavigationNode,
} from "../components/map-builder/types";

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
  exteriorEmergencyStairId?: string;
  type?: string;
  accessible?: boolean;
  color?: string;
  width?: number;
  /** Authored/derived Floor nodes hosted by an exterior Veranda approach. */
  exteriorZoneId?: string;
  derivedOwnerType?: string;
  derivedRole?: string;
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
  derivedOwnerType?: string;
}

export interface CampusNavGraph {
  navNodes?: CampusNavNode[] | null;
  navEdges?: CampusNavEdge[] | null;
  /** Minimal physical frame data used only to project Floor-local exterior
   * nodes into the public campus route overlay. */
  buildings?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    entrances?: Array<{
      id: string;
      type?: "general" | "service" | "emergency_exit" | "main" | "secondary" | "emergency";
      direction?: "both" | "entrance_only" | "exit_only";
      isPrimary?: boolean;
      accessible?: boolean;
    }>;
  floors?: Array<{
    id: string;
    number?: number;
    canvasW?: number;
    canvasH?: number;
      /** Full floor structure is present on published Campus objects. */
      rooms?: FloorRoom[];
      doors?: FloorDoor[];
      walls?: FloorWall[];
      stairs?: FloorStairs[];
      ramps?: FloorRamp[];
      elevators?: FloorElevatorItem[];
    }>;
  }>;
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
  /** True once the authored path has entered the campus coordinate space. */
  afterOutdoor?: boolean;
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
  emergencyDestinationLabel?: string;
}

/** Adapt an already selected authored path without recalculating it. Emergency
 * stairs must retain the exact descent/discharge chain chosen by the tester. */
export function plannedRouteFromAuthoredPath(
  path: GraphPath,
  graph: CampusNavGraph,
  edges: CampusNavEdge[],
  fromLabel: string,
  toLabel: string,
): PlannedRoute | null {
  return toPlannedRoute(path, "emergency", fromLabel, toLabel, undefined, graph.navNodes ?? [], edges, graph);
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
  graph?: CampusNavGraph | null,
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
        { type: "building", buildingId: "", label: toCode, code: toCode },
        graph ?? undefined)
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

/**
 * Published snapshots can contain graph records written before a linked Door
 * or Room was moved in the floor editor.  Those node coordinates are derived
 * geometry, not independent authoring values.  The admin Test Route rebuilds
 * against the current floor objects, so the student planner must do the same
 * before it resolves a room endpoint or renders its first waypoint.
 */
function syncPublishedIndoorNodes(
  graph: CampusNavGraph,
  sourceNodes: CampusNavNode[],
): { nodes: CampusNavNode[]; movedNodeIds: Set<string> } {
  let nodes = [...sourceNodes];
  const movedNodeIds = new Set<string>();

  for (const building of graph.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      const scopedNodes = nodes.filter((node) =>
        node.buildingId === building.id && node.floorId === floor.id,
      );
      if (scopedNodes.length === 0) continue;

      const synced = syncIndoorLinkedNodePositions(
        scopedNodes as unknown as NavigationNode[],
        {
          rooms: floor.rooms ?? [],
          doors: floor.doors ?? [],
          stairs: floor.stairs ?? [],
          ramps: floor.ramps ?? [],
          elevators: floor.elevators ?? [],
        },
      ) as unknown as CampusNavNode[];
      const syncedById = new Map(synced.map((node) => [node.id, node]));
      nodes = nodes.map((node) => {
        const next = syncedById.get(node.id);
        if (!next) return node;
        if (next.x !== node.x || next.y !== node.y) movedNodeIds.add(node.id);
        return next;
      });
    }
  }

  return { nodes, movedNodeIds };
}

/** Re-price only edges whose derived endpoint geometry was corrected above. */
function repriceMovedIndoorEdges(
  edges: CampusNavEdge[],
  nodes: CampusNavNode[],
  movedNodeIds: Set<string>,
): CampusNavEdge[] {
  if (movedNodeIds.size === 0) return edges;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    if (!movedNodeIds.has(edge.startNodeId) && !movedNodeIds.has(edge.endNodeId)) return edge;
    // A floor transition has logical cost supplied by the transition
    // reconciler, not the distance between two floor-local coordinate frames.
    if (edge.type === "floor_transition" || edge.type === "cross_floor") return edge;
    const start = nodeById.get(edge.startNodeId);
    const end = nodeById.get(edge.endNodeId);
    if (!start || !end) return edge;
    const points = [
      { x: start.x, y: start.y },
      ...(edge.bendPoints ?? []),
      { x: end.x, y: end.y },
    ];
    let distance = 0;
    for (let index = 1; index < points.length; index += 1) {
      distance += Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].y - points[index - 1].y,
      );
    }
    return { ...edge, distance };
  });
}

/**
 * Match the admin Test Route graph contract on the student side:
 * room_access nodes are semantic anchors only.  A student route may enter or
 * leave a room through its linked physical Door, but must never use an
 * ordinary edge that cuts through the room center.  The small reconciliation
 * step also covers published snapshots created before the semantic
 * Room↔Door edge was persisted by the editor.
 */
function effectiveAuthoredRouteEdges(
  graph: CampusNavGraph,
  nodes: CampusNavNode[],
  edges: CampusNavEdge[],
): CampusNavEdge[] {
  const roomNodeIds = new Set(nodes
    .filter((node) => Boolean(node.roomId) || node.type === "room_access")
    .map((node) => node.id));
  const routeEdges = edges.filter((edge) =>
    edge.type === ROOM_DOOR_EDGE_TYPE
    || (!roomNodeIds.has(edge.startNodeId) && !roomNodeIds.has(edge.endNodeId))
  );

  const rooms: FloorRoom[] = [];
  const doors: FloorDoor[] = [];
  const walls: FloorWall[] = [];
  for (const building of graph.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      rooms.push(...(floor.rooms ?? []));
      doors.push(...(floor.doors ?? []));
      walls.push(...(floor.walls ?? []));
    }
  }
  if (rooms.length === 0 || doors.length === 0) return routeEdges;

  const reconciled = reconcileRoomDoorEdges(
    nodes as unknown as NavigationNode[],
    routeEdges as unknown as NavigationEdge[],
    rooms,
    doors,
    walls,
  );
  return reconciled as unknown as CampusNavEdge[];
}

function roomDoorIds(destination: Extract<Destination, { type: "room" }>): string[] {
  return Array.from(new Set([
    ...(destination.accessDoorId ? [destination.accessDoorId] : []),
    ...(destination.accessDoorIds ?? []),
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
}

function roomFloorId(
  nodes: CampusNavNode[],
  destination: Extract<Destination, { type: "room" }>,
): string | undefined {
  const accessNode = destination.accessNodeId
    ? nodes.find((node) =>
        node.id === destination.accessNodeId
        && node.buildingId === destination.buildingId
        && !!node.floorId,
      )
    : undefined;
  return accessNode?.floorId
    ?? nodes.find((node) =>
      node.buildingId === destination.buildingId
      && node.roomId === destination.roomId
    )?.floorId;
}

/** Resolve only physical Door nodes for a room endpoint. */
function resolveRoomDoorNodes(
  nodes: CampusNavNode[],
  destination: Extract<Destination, { type: "room" }>,
  edges: CampusNavEdge[] = [],
): CampusNavNode[] {
  const floorId = roomFloorId(nodes, destination);
  const linkedIds = roomDoorIds(destination);
  const roomNode = nodes.find((node) =>
    node.buildingId === destination.buildingId
    && node.roomId === destination.roomId
    && (!floorId || node.floorId === floorId),
  );
  const semanticDoorIds = roomNode
    ? edges
      .filter((edge) => edge.type === ROOM_DOOR_EDGE_TYPE)
      .flatMap((edge) => {
        if (edge.startNodeId === roomNode.id) return [edge.endNodeId];
        if (edge.endNodeId === roomNode.id && edge.bidirectional) return [edge.startNodeId];
        return [];
      })
    : [];
  const preferredNode = destination.accessNodeId
    ? nodes.find((node) =>
        node.id === destination.accessNodeId
        && node.buildingId === destination.buildingId
        && !!node.floorId
        && !!node.doorId,
      )
    : undefined;
  const candidates = [
    ...(preferredNode ? [preferredNode] : []),
    ...linkedIds.map((doorId) => nodes.find((node) =>
      node.buildingId === destination.buildingId
      && !!node.floorId
      && (!floorId || node.floorId === floorId)
      && node.doorId === doorId,
    )),
    ...semanticDoorIds.map((nodeId) => nodes.find((node) => node.id === nodeId)),
  ];
  const seen = new Set<string>();
  return candidates.filter((node): node is CampusNavNode => {
    if (!node || !node.doorId || node.buildingId !== destination.buildingId || !node.floorId) return false;
    if (floorId && node.floorId !== floorId) return false;
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function authoredDestinationEndpoints(
  nodes: CampusNavNode[],
  destination: Destination,
  accessibleOnly: boolean,
  edges: CampusNavEdge[] = [],
  graph?: CampusNavGraph | null,
  role: "outbound" | "inbound" = "inbound",
  emergencyOnly = false,
): CampusNavNode[] {
  if (destination.type === "room") {
    return resolveRoomDoorNodes(nodes, destination, edges)
      .filter((node) => !accessibleOnly || node.accessible !== false);
  }
  return resolveBuildingEntranceNodes(nodes, destination.buildingId, destination.entranceNodeId, accessibleOnly, graph, role, emergencyOnly);
}

/**
 * Route any authored destination pair directly through the campus graph.
 * Room endpoints resolve to physical Door nodes, so no route terminates in a
 * room center or begins from one.  Building endpoints resolve to the selected
 * outdoor entrance/door handoff.
 */
export function planAuthoredDestinationRoute(
  from: Destination,
  to: Destination,
  mode: RouteMode,
  graph?: CampusNavGraph | null,
): PlannedRoute | null {
  const campusGraph = resolveCampusGraph(graph, mode);
  if (!campusGraph || !from?.buildingId || !to?.buildingId) return null;

  const accessibleOnly = mode === "accessible";
  const fromNodes = authoredDestinationEndpoints(campusGraph.nodes, from, accessibleOnly, campusGraph.edges, graph, "outbound", mode === "emergency");
  const toNodes = authoredDestinationEndpoints(campusGraph.nodes, to, accessibleOnly, campusGraph.edges, graph, "inbound", mode === "emergency");
  if (fromNodes.length === 0 || toNodes.length === 0) return null;

  // A room may have more than one linked Door.  Resolve the actual route for
  // every authored Door candidate and keep the shortest connected option,
  // exactly as the admin route tester does when selecting a viable room Door.
  let selected: { fromNode: CampusNavNode; toNode: CampusNavNode; path: GraphPath } | null = null;
  for (const fromNode of fromNodes) {
    for (const toNode of toNodes) {
      if (fromNode.id === toNode.id) continue;
      const candidatePath = findNavigationRoute(
        campusGraph.nodes,
        campusGraph.edges,
        fromNode.id,
        toNode.id,
        accessibleOnly,
        mode === "emergency",
        { useDerivedTransitions: false },
      );
      if (!candidatePath) continue;
      if (!selected || candidatePath.distanceM < selected.path.distanceM) {
        selected = { fromNode, toNode, path: candidatePath };
      }
    }
  }
  if (!selected) return null;
  const { path } = selected;

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
    graph,
  );
  if (!planned) return null;
  const contexts = authoredRouteContexts(path, campusGraph.nodes, campusGraph.edges, from, to, graph ?? undefined);
  planned.points = contexts.campusPoints;
  planned.campusPoints = contexts.campusPoints;
  planned.indoorSegments = contexts.indoorSegments;
  planned.transitionDetails = contexts.transitionDetails;
  planned.steps = authoredRouteGuidanceSteps(from, to, planned, campusGraph.nodes, graph ?? undefined);
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
function resolveCampusGraph(graph?: CampusNavGraph | null, mode: RouteMode = "standard"): {
  nodes: CampusNavNode[];
  edges: CampusNavEdge[];
} | null {
  // A supplied graph is an authored contract, including an explicitly empty
  // published graph. Only an omitted/null graph retains legacy fallback.
  if (graph === undefined || graph === null) return null;
  const sourceNodes = Array.isArray(graph.navNodes) ? graph.navNodes : [];
  const authoredEdges = Array.isArray(graph.navEdges) ? graph.navEdges : [];
  const { nodes: syncedNodes, movedNodeIds } = syncPublishedIndoorNodes(graph, sourceNodes);
  const nodes = mode === "emergency"
    ? syncedNodes
    : filterRoutineNavigationNodes(graph, syncedNodes);
  const routableNodeIds = new Set(nodes.map((node) => node.id));
  const availableEdges = (mode === "emergency" ? authoredEdges : filterRoutineNavigationEdges(authoredEdges))
    .filter((edge) => routableNodeIds.has(edge.startNodeId) && routableNodeIds.has(edge.endNodeId));
  const edges = repriceMovedIndoorEdges(
    effectiveAuthoredRouteEdges(graph, nodes, availableEdges)
      .filter((edge) => routableNodeIds.has(edge.startNodeId) && routableNodeIds.has(edge.endNodeId)),
    nodes,
    movedNodeIds,
  );
  return { nodes, edges };
}

/** Evaluate every published entrance, as the admin tester does. The primary
 * entrance is a presentation preference, not proof that it is connected or
 * legal in both directions. The graph still decides the shortest valid path. */
function resolveBuildingEntranceNodes(
  nodes: CampusNavNode[],
  buildingId: string,
  preferredNodeId: string | undefined,
  accessibleOnly: boolean,
  graph: CampusNavGraph | null | undefined,
  role: "outbound" | "inbound",
  emergencyOnly: boolean,
): CampusNavNode[] {
  const building = graph?.buildings?.find((candidate) => candidate.id === buildingId);
  const entrances = building?.entrances ?? [];
  if (entrances.length === 0) {
    const candidates = nodes.filter((node) => node.buildingId === buildingId && !node.floorId
      && (node.entranceId || node.type === "entrance" || node.type === "emergency_exit")
      && (!accessibleOnly || node.accessible !== false));
    return candidates.sort((left, right) => Number(right.id === preferredNodeId) - Number(left.id === preferredNodeId));
  }
  const general = entrances.filter((entrance) => entrance.type === undefined
    || entrance.type === "general" || entrance.type === "main" || entrance.type === "secondary");
  const hasOutbound = general.some((entrance) => entrance.direction !== "entrance_only");
  const candidates = entrances.filter((entrance) => {
    const type = entrance.type;
    const isGeneral = type === undefined || type === "general" || type === "main" || type === "secondary";
    const isEmergencyExit = type === "emergency_exit" || type === "emergency";
    if (!isGeneral && !(emergencyOnly && isEmergencyExit)) return false;
    if (accessibleOnly && entrance.accessible === false) return false;
    if (isGeneral && general.length > 1) {
      if (role === "inbound" && entrance.direction === "exit_only") return false;
      if (role === "outbound" && entrance.direction === "entrance_only" && hasOutbound) return false;
    }
    if (isEmergencyExit && role === "inbound") return false;
    return true;
  }).flatMap((entrance) => nodes.filter((node) => node.buildingId === buildingId
    && node.entranceId === entrance.id && !node.floorId
    && (!accessibleOnly || node.accessible !== false)));
  return candidates.sort((left, right) => Number(right.id === preferredNodeId) - Number(left.id === preferredNodeId));
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

function isExteriorRouteNode(node: CampusNavNode | undefined): boolean {
  return Boolean(node && (
    !node.floorId
    || node.exteriorZoneId
    || (node.derivedOwnerType && !node.exteriorEmergencyStairId)
  ));
}

function campusPointForRouteNode(node: CampusNavNode, graph?: CampusNavGraph): Pt {
  if (!node.floorId || !isExteriorRouteNode(node) || !graph?.buildings?.length) {
    return { x: node.x, y: node.y };
  }
  const building = graph.buildings.find((candidate) => candidate.id === node.buildingId);
  const floor = building?.floors?.find((candidate) => candidate.id === node.floorId);
  if (!building || !floor) return { x: node.x, y: node.y };
  return exteriorFloorPointToCampusWorld(building, floor, node);
}

/** Split a selected authored graph path by coordinate space.  Exterior
 * Veranda nodes are authored in a Floor frame but belong to the campus route;
 * only ordinary indoor nodes remain floor-local. */
function authoredRouteContexts(
  path: GraphPath,
  nodes: CampusNavNode[],
  edges: CampusNavEdge[],
  from: Destination,
  to: Destination,
  graph?: CampusNavGraph,
): {
  campusPoints: Pt[];
  indoorSegments: RouteIndoorSegment[];
  transitionDetails: RouteTransitionDetail[];
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const floorNumberById = new Map<string, number>();
  // Published campus snapshots already carry the canonical floor number on
  // each floor. Keep that identity on every floor-local route context, not
  // only on room endpoint nodes, so the student handoff can walk Ground Floor
  // → stairs → Floor 2 in the same order as the authored graph.
  for (const building of graph?.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      if (typeof floor.number === "number" && floor.id) {
        floorNumberById.set(floor.id, floor.number);
      }
    }
  }
  const addRoomFloorNumber = (destination: Destination) => {
    if (destination.type !== "room") return;
    if (destination.accessNodeId) floorNumberById.set(destination.accessNodeId, destination.floorNumber);
    const accessDoorIds = new Set(roomDoorIds(destination));
    nodes
      .filter((node) => node.buildingId === destination.buildingId && (
        node.roomId === destination.roomId
        || (!!node.doorId && accessDoorIds.has(node.doorId))
      ))
      .forEach((node) => floorNumberById.set(node.id, destination.floorNumber));
  };
  addRoomFloorNumber(from);
  addRoomFloorNumber(to);
  const contexts: AuthoredContext[] = [];
  const transitions: RouteTransitionDetail[] = [];
  const pointKey = (node: CampusNavNode) => !isExteriorRouteNode(node)
    ? `floor:${node.buildingId ?? ""}:${node.floorId}`
    : "campus";
  const appendPoint = (points: Pt[], point: Pt) => {
    const previous = points[points.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  };
  const startContext = (node: CampusNavNode): AuthoredContext => ({
    kind: isExteriorRouteNode(node) ? "campus" : "floor",
    key: pointKey(node),
    buildingId: node.buildingId,
    floorId: node.floorId,
    floorNumber: (node.floorId ? floorNumberById.get(node.floorId) : undefined)
      ?? floorNumberById.get(node.id),
    waypoints: [campusPointForRouteNode(node, graph)],
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
      current.floorNumber = (toNode.floorId ? floorNumberById.get(toNode.floorId) : undefined)
        ?? floorNumberById.get(toNode.id)
        ?? (to.type === "room"
          && to.buildingId === toNode.buildingId
          && (toNode.roomId === to.roomId || toNode.id === to.accessNodeId)
          ? to.floorNumber
          : undefined);
      continue;
    }
    const projectedFrom = campusPointForRouteNode(fromNode, graph);
    const projectedTo = campusPointForRouteNode(toNode, graph);
    const floorNode = [fromNode, toNode].find((node) => node.floorId && isExteriorRouteNode(node));
    const building = floorNode && graph?.buildings?.find((candidate) => candidate.id === floorNode.buildingId);
    const floor = building?.floors?.find((candidate) => candidate.id === floorNode?.floorId);
    const bends = edge?.bendPoints ? (reversed ? [...edge.bendPoints].reverse() : edge.bendPoints) : [];
    const projectedBends = edge?.derivedOwnerType && projectedFrom.x !== projectedTo.x && projectedFrom.y !== projectedTo.y
      ? [{ x: projectedTo.x, y: projectedFrom.y }]
      : floorNode && building && floor
        ? bends.map((bend) => exteriorFloorPointToCampusWorld(building, floor, bend))
        : bends;
    projectedBends.forEach((bend) => appendPoint(current.waypoints, { x: bend.x, y: bend.y }));
    appendPoint(current.waypoints, projectedTo);
    current.rawDistance += edgeDistance;
  }
  contexts.push(current);

  const totalRawDistance = contexts.reduce((sum, context) => sum + context.rawDistance, 0);
  const metersPerRawUnit = totalRawDistance > 0 ? path.distanceM / totalRawDistance : 0;
  const toFloorId = to.type === "room"
    ? (resolveRoomDoorNodes(nodes, to, edges)[0]?.floorId
      ?? nodes.find((node) => node.roomId === to.roomId && node.buildingId === to.buildingId)?.floorId)
    : undefined;
  const campusPoints: Pt[] = [];
  const indoorSegments: RouteIndoorSegment[] = [];
  let afterOutdoor = false;
  for (let contextIndex = 0; contextIndex < contexts.length; contextIndex += 1) {
    const context = contexts[contextIndex];
    if (context.kind === "campus") {
      afterOutdoor = true;
      context.waypoints.forEach((point) => appendPoint(campusPoints, point));
      continue;
    }
    const distanceM = Number((context.rawDistance * metersPerRawUnit).toFixed(1));
    const isTargetFloor = Boolean(toFloorId && context.floorId === toFloorId);
    const nextContext = contexts[contextIndex + 1];
    const nextFloorTransition = nextContext?.kind === "floor"
      && nextContext.buildingId === context.buildingId
      && context.floorId !== nextContext.floorId
      ? transitions.find((transition) =>
          transition.fromFloorId === context.floorId
          && transition.toFloorId === nextContext.floorId
          && nodeById.get(transition.nodeId)?.buildingId === context.buildingId,
        )
      : undefined;
    const segmentInstruction = nextFloorTransition
      ? `Follow the indoor path to ${routePlaceLabel(nextFloorTransition.label, nextFloorTransition.kind === "elevator" ? "elevator" : "stairs")}.`
      : !afterOutdoor && from.type === "room" && from.buildingId !== to.buildingId
        ? "Follow the indoor path to the building exit door."
        : to.type === "room" && context.buildingId === to.buildingId
          ? `Follow the indoor path to the door of ${to.roomName}.`
          : "Follow the connected indoor path.";
    const steps: RouteStep[] = context.waypoints.length > 0
      ? [{
          id: `indoor-context-${indoorSegments.length}`,
          icon: "walk",
          instruction: segmentInstruction,
          distanceM,
        }]
      : [];
    indoorSegments.push({
      buildingId: context.buildingId ?? (to.type === "room" ? to.buildingId : from.buildingId),
      floorId: context.floorId,
      floorNumber: context.floorNumber ?? (isTargetFloor && to.type === "room" ? to.floorNumber : undefined),
      afterOutdoor,
      waypoints: context.waypoints,
      distanceM,
      seconds: Math.max(0, Math.round((distanceM / Math.max(0.1, path.distanceM)) * path.minutes * 60)),
      steps,
    });
  }
  return { campusPoints, indoorSegments, transitionDetails: transitions };
}

function destinationBuildingCode(destination: Destination): string {
  return destination.type === "room"
    ? destination.buildingCode || destination.buildingLabel
    : destination.code || destination.label;
}

function routePlaceLabel(label: string, fallback: string): string {
  const place = label.trim() || fallback;
  return /^(the|a|an)\s/i.test(place) ? place : `the ${place}`;
}

function destinationFloorId(
  destination: Destination,
  nodes: CampusNavNode[],
): string | undefined {
  return destination.type === "room" ? roomFloorId(nodes, destination) : undefined;
}

function authoredRouteGuidanceSteps(
  from: Destination,
  to: Destination,
  route: PlannedRoute,
  nodes: CampusNavNode[],
  graph?: CampusNavGraph,
): RouteStep[] {
  const steps: RouteStep[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const floorNumberById = new Map<string, number>();
  for (const building of graph?.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      if (floor.id && typeof floor.number === "number") floorNumberById.set(floor.id, floor.number);
    }
  }
  for (const destination of [from, to]) {
    if (destination.type !== "room") continue;
    const floorId = destinationFloorId(destination, nodes);
    if (floorId) floorNumberById.set(floorId, destination.floorNumber);
  }

  let nextStepId = 0;
  const append = (icon: RouteStep["icon"], instruction: string, distanceM?: number) => {
    if (steps.at(-1)?.instruction === instruction) return;
    steps.push({ id: `guidance-${nextStepId++}`, icon, instruction, ...(distanceM === undefined ? {} : { distanceM }) });
  };
  const fromName = destinationBuildingCode(from);
  const toName = destinationBuildingCode(to);
  append("start", from.buildingId === "__point_origin__"
    ? "You are here"
    : from.type === "room"
      ? `Start at the door of ${from.roomName}.`
      : `Start at the entrance of ${fromName} building.`);

  const indoorSegments = route.indoorSegments ?? [];
  const originSegments = indoorSegments.filter((segment) => !segment.afterOutdoor);
  const destinationSegments = indoorSegments.filter((segment) => segment.afterOutdoor);
  const directSameBuildingRoomRoute = from.type === "room"
    && to.type === "room"
    && from.buildingId === to.buildingId
    && destinationSegments.length === 0;
  const transitionBetween = (current: RouteIndoorSegment, next: RouteIndoorSegment) =>
    route.transitionDetails?.find((transition) =>
      transition.fromFloorId === current.floorId
      && transition.toFloorId === next.floorId
      && nodeById.get(transition.nodeId)?.buildingId === current.buildingId,
    );
  const appendTransition = (transition: RouteTransitionDetail) => {
    const fromFloorNumber = transition.fromFloorId ? floorNumberById.get(transition.fromFloorId) : undefined;
    const toFloorNumber = transition.toFloorId ? floorNumberById.get(transition.toFloorId) : undefined;
    const targetFloor = toFloorNumber === undefined
      ? "the connected floor"
      : toFloorNumber === 1 ? "Ground Floor" : `Floor ${toFloorNumber}`;
    const direction = fromFloorNumber !== undefined && toFloorNumber !== undefined
      ? toFloorNumber > fromFloorNumber ? "up" : "down"
      : toFloorNumber === 1 ? "down" : undefined;
    const articleLabel = routePlaceLabel(
      transition.label,
      transition.kind === "elevator" ? "elevator" : "stairs",
    );
    if (transition.kind === "elevator") {
      append("elevator", `Take ${articleLabel} to ${targetFloor}.`);
    } else if (direction) {
      append("stairs", `Take ${articleLabel} ${direction} to ${targetFloor}.`);
    } else {
      append("stairs", `Take ${articleLabel} to ${targetFloor}.`);
    }
  };
  const appendIndoorGroup = (
    segments: RouteIndoorSegment[],
    finalInstruction: string,
  ) => {
    segments.forEach((segment, index) => {
      const next = segments[index + 1];
      const transition = next ? transitionBetween(segment, next) : undefined;
      const instruction = transition
        ? `Follow the indoor path to ${routePlaceLabel(transition.label, transition.kind === "elevator" ? "elevator" : "stairs")}.`
        : finalInstruction;
      append("walk", instruction, segment.distanceM);
      if (transition) appendTransition(transition);
    });
  };

  const leavesOriginBuilding = from.type === "room"
    && (from.buildingId !== to.buildingId || to.type === "building");
  const originFinalInstruction = directSameBuildingRoomRoute
    ? `Follow the indoor path to the door of ${to.type === "room" ? to.roomName : to.label}.`
    : "Follow the indoor path to the building exit door.";
  appendIndoorGroup(originSegments, originFinalInstruction);
  if (leavesOriginBuilding && originSegments.length > 0) {
    append("enter", `Exit ${fromName} building.`);
  }

  const hasCampusLeg = from.buildingId !== to.buildingId
    || (originSegments.length > 0 && destinationSegments.length > 0);
  const totalIndoorDistance = indoorSegments.reduce((total, segment) => total + segment.distanceM, 0);
  if (hasCampusLeg) {
    append("walk", `Follow the campus path to the entrance of ${toName} building.`, Math.max(0, route.dist - totalIndoorDistance));
  }

  if (destinationSegments.length > 0) {
    append("enter", `Enter ${toName} building.`);
    appendIndoorGroup(
      destinationSegments,
      to.type === "room"
        ? `Follow the indoor path to the door of ${to.roomName}.`
        : `Follow the indoor path through ${toName} building.`,
    );
  }

  if (to.type === "room") {
    append("arrive", `Arrive at ${to.roomName}.`);
  } else {
    append("arrive", `Arrive at the entrance of ${toName} building.`);
  }
  return steps;
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
  if (!from?.id || !to?.id || from.id === to.id) return null;

  // 0. Published-campus nav graph (real routes for any campus with one)
  const campusGraph = resolveCampusGraph(graph, mode);
  if (campusGraph) {
    const accessibleOnly = mode === "accessible";
    const fromNodes = resolveBuildingEntranceNodes(campusGraph.nodes, from.id, from.entranceNodeId, accessibleOnly, graph, "outbound", mode === "emergency");
    const toNodes = resolveBuildingEntranceNodes(campusGraph.nodes, to.id, to.entranceNodeId, accessibleOnly, graph, "inbound", mode === "emergency");
    let bestPath: GraphPath | null = null;
    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        const path = findNavigationRoute(campusGraph.nodes, campusGraph.edges, fromNode.id, toNode.id,
          accessibleOnly, mode === "emergency", { useDerivedTransitions: false });
        if (path && (!bestPath || path.distanceM < bestPath.distanceM)) bestPath = path;
      }
    }
    if (bestPath) {
      const planned = toPlannedRoute(bestPath, mode, from.code, to.code, undefined, campusGraph.nodes, campusGraph.edges, graph);
      if (planned) return planned;
    }
    // A published graph is authoritative. Do not silently replace a missing
    // endpoint or disconnected route with the static graph/orthogonal guess.
    return null;
  }

  // Emergency routing must never present the legacy graph as stair-safe. The
  // admin-authored graph is the only source that carries emergency semantics.
  // Accessible routing likewise requires the authored graph so the planner
  // can enforce Ramp-only traversal instead of silently using the legacy map.
  if (mode === "accessible") return null;
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
  if (!fromPt || !to?.id) return null;

  const campusGraph = resolveCampusGraph(graph, mode);
  if (!campusGraph && mode === "accessible") return null;
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

  // Destination node: all direction-eligible published entrances, or the
  // single static legacy entrance. A blocked primary must not hide a valid door.
  const destinationNodeIds = campusGraph
    ? resolveBuildingEntranceNodes(campusGraph.nodes, to.id, to.entranceNodeId, mode === "accessible", graph, "inbound", mode === "emergency").map((node) => node.id)
    : [BUILDING_ENTRANCE_MAP[to.id]].filter((id): id is string => !!id);
  if (destinationNodeIds.length === 0 || nodes.length === 0) {
    if (campusGraph) return null;
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  // Snap the start point to the nearest node.
  const outdoorNodes = nodes.filter((node) => !node.floorId && (mode !== "accessible" || node.accessible !== false));
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

  let path: GraphPath | null = null;
  for (const toNodeId of destinationNodeIds) {
    const candidate = findNavigationRoute(nodes, edges, fromNodeId, toNodeId,
      mode === "accessible", mode === "emergency", { useDerivedTransitions: !campusGraph });
    if (candidate && (!path || candidate.distanceM < path.distanceM)) path = candidate;
  }
  if (!path || path.waypoints.length < 2) {
    if (campusGraph) return null;
    return svgFallbackFromPoint(fromPt, to, mode, positions);
  }

  const planned = toPlannedRoute(path, mode, "You are here", to.code, fromPt, campusGraph?.nodes, campusGraph?.edges, graph);
  if (planned && campusGraph) {
    const pointOrigin: BuildingDest = {
      type: "building",
      buildingId: "__point_origin__",
      label: "You are here",
      code: "You are here",
    };
    const buildingDestination: BuildingDest = {
      type: "building",
      buildingId: to.id,
      label: to.name,
      code: to.code,
      entranceNodeId: to.entranceNodeId,
    };
    planned.steps = authoredRouteGuidanceSteps(pointOrigin, buildingDestination, planned, campusGraph.nodes, graph ?? undefined);
  }
  return planned;
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
  if (!fromPt) return null;
  const campusGraph = resolveCampusGraph(graph, mode);
  if (!campusGraph && mode === "accessible") return null;
  if (!campusGraph) return null;

  const outdoorNodes = campusGraph.nodes.filter((node) => !node.floorId && (mode !== "accessible" || node.accessible !== false));
  const fromNode = outdoorNodes.reduce<CampusNavNode | undefined>((best, node) => {
    if (!best) return node;
    return Math.hypot(node.x - fromPt.x, node.y - fromPt.y) < Math.hypot(best.x - fromPt.x, best.y - fromPt.y)
      ? node
      : best;
  }, undefined);
  const toNodes = authoredDestinationEndpoints(campusGraph.nodes, to, mode === "accessible", campusGraph.edges);
  if (!fromNode || toNodes.length === 0) return null;

  let path: GraphPath | null = null;
  for (const toNode of toNodes) {
    const candidatePath = findNavigationRoute(
      campusGraph.nodes,
      campusGraph.edges,
      fromNode.id,
      toNode.id,
      mode === "accessible",
      mode === "emergency",
      { useDerivedTransitions: false },
    );
    if (candidatePath && (!path || candidatePath.distanceM < path.distanceM)) path = candidatePath;
  }
  if (!path || path.waypoints.length < 2) return null;

  const planned = toPlannedRoute(
    path,
    mode,
    "You are here",
    to.roomName,
    fromPt,
    campusGraph.nodes,
    campusGraph.edges,
    graph,
  );
  if (!planned) return null;
  const pointOrigin: BuildingDest = {
    type: "building",
    buildingId: "__point_origin__",
    label: "You are here",
    code: "You are here",
  };
  const contexts = authoredRouteContexts(path, campusGraph.nodes, campusGraph.edges, pointOrigin, to, graph ?? undefined);
  planned.points = contexts.campusPoints;
  planned.campusPoints = contexts.campusPoints;
  planned.indoorSegments = contexts.indoorSegments;
  planned.transitionDetails = contexts.transitionDetails;
  planned.steps = authoredRouteGuidanceSteps(pointOrigin, to, planned, campusGraph.nodes, graph ?? undefined);
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
  if (!from?.buildingId || !to?.buildingId) return null;

  if (resolveCampusGraph(graph, mode)) {
    return planAuthoredDestinationRoute(from, to, mode, graph);
  }
  if (mode === "accessible") return null;
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
