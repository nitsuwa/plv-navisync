/**
 * Campus walkway graph + A* pathfinding for PLV NaviSync.
 *
 * Graph nodes represent building entrances and walkway junctions.
 * Edges represent paved walkways with real distances.
 *
 * The SVG coordinate space is 900×680. All positions are in SVG coordinates
 * and converted to real-world meters using a calibrated scale factor.
 */

// ── Scale calibration ──────────────────────────────────────────────────────
// The campus map is approximately 200m × 150m based on PLV's actual size.
// SVG space: 900 × 680 → ~0.22 m per SVG unit
const M_PER_UNIT = 0.22;

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  /** Human-readable label (optional) */
  label?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Pre-computed distance in SVG units */
  distance: number;
  /** true = wheelchair accessible, false = stairs only */
  accessible: boolean;
}

export interface GraphPath {
  nodeIds: string[];
  /** Total distance in meters */
  distanceM: number;
  /** Estimated walking time in minutes */
  minutes: number;
  /** Waypoints in SVG coordinates (for drawing on map) */
  waypoints: { x: number; y: number }[];
  /** Human-readable step-by-step directions */
  steps: string[];
}

/**
 * Keep a semantic route endpoint terminal.  A Building destination is an
 * exterior Entrance by contract; if a legacy/session route contains an
 * appended indoor tail, trim it at that canonical endpoint before the route
 * is published to any editor context.  This helper is intentionally local to
 * the route result and never mutates graph nodes or edges.
 */
export function truncateGraphPathAtNode(
  path: GraphPath,
  terminalNodeId: string,
  nodes: { id: string; x: number; y: number }[],
  edges: { startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean }[],
): GraphPath {
  const terminalIndex = path.nodeIds.indexOf(terminalNodeId);
  if (terminalIndex < 0 || terminalIndex === path.nodeIds.length - 1) return path;
  const nodeIds = path.nodeIds.slice(0, terminalIndex + 1);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const waypoints = nodeIds.map((id) => {
    const node = nodeMap.get(id);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  });
  let totalUnits = 0;
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    const edge = edges.find((candidate) =>
      (candidate.startNodeId === from && candidate.endNodeId === to)
      || (candidate.bidirectional && candidate.startNodeId === to && candidate.endNodeId === from),
    );
    if (edge) totalUnits += Math.max(0, Number(edge.distance) || 0);
  }
  const distanceM = Math.round(totalUnits * M_PER_UNIT);
  return {
    ...path,
    nodeIds,
    waypoints,
    distanceM,
    minutes: distanceM > 0 ? Math.max(1, Math.round(distanceM / 80)) : 0,
    steps: path.steps.slice(0, Math.max(1, nodeIds.length)),
  };
}

// ── Campus walkway graph — PLV Main Campus ────────────────────────────────
// Nodes are key locations: building entrances, gates, walkway intersections.

const NODES: GraphNode[] = [
  // Gates
  { id: "gate_main",  x: 100, y: 272, label: "Main Gate" },
  { id: "gate_east",  x: 672, y: 272, label: "East Gate" },

  // Road junctions (along the main horizontal road at y=285)
  { id: "jct_mab",    x: 155, y: 285, label: "MAB Junction" },
  { id: "jct_adm",    x: 395, y: 285, label: "ADM Junction" },
  { id: "jct_center", x: 401, y: 285, label: "Center Junction" },
  { id: "jct_lrc",    x: 540, y: 285, label: "LRC Junction" },

  // Vertical road junctions (along Main Road at x=401)
  { id: "jct_north",  x: 401, y: 200, label: "North Junction" },
  { id: "jct_south",  x: 401, y: 435, label: "South Junction" },

  // Building entrances
  { id: "ent_mab",    x: 155, y: 210, label: "MAB Entrance" },
  { id: "ent_adm",    x: 395, y: 115, label: "ADM Entrance" },
  { id: "ent_lrc",    x: 540, y: 295, label: "LRC Entrance" },
  { id: "ent_elb",    x: 165, y: 305, label: "ELB Entrance" },
  { id: "ent_gym",    x: 305, y: 435, label: "GYM Entrance" },
  { id: "ent_ssc",    x: 605, y: 415, label: "SSC Entrance" },

  // ── Real PLV campus layout (matches the seeded published campus) ────────
  { id: "gate_plv",  x: 110, y: 300, label: "Main Gate" },
  { id: "jct_plv_w", x: 310, y: 300, label: "West Junction" },
  { id: "q_nw",      x: 310, y: 250, label: "Quadrangle NW" },
  { id: "q_ne",      x: 570, y: 250, label: "Quadrangle NE" },
  { id: "q_se",      x: 570, y: 460, label: "Quadrangle SE" },
  { id: "q_sw",      x: 310, y: 460, label: "Quadrangle SW" },
  { id: "ent_scb",    x: 280, y: 180, label: "SCB Entrance" },
  { id: "ent_canteen", x: 520, y: 150, label: "Canteen Entrance" },
  { id: "ent_coed",   x: 650, y: 125, label: "COED Entrance" },
  { id: "ent_caba",   x: 230, y: 495, label: "CABA Entrance" },
  { id: "ent_ceit",   x: 660, y: 445, label: "CEIT Entrance" },
  { id: "ent_guard",  x: 130, y: 360, label: "Guard House Entrance" },
];

const EDGES: GraphEdge[] = [
  // Main horizontal road (y=285)
  { from: "gate_main", to: "jct_mab",     distance: 55,  accessible: true },
  { from: "jct_mab",   to: "jct_center",  distance: 246, accessible: true },
  { from: "jct_center", to: "jct_lrc",    distance: 139, accessible: true },
  { from: "jct_lrc",   to: "gate_east",   distance: 132, accessible: true },

  // Vertical Main Road (x=401)
  { from: "jct_north",  to: "jct_adm",    distance: 85,  accessible: true },
  { from: "jct_adm",    to: "jct_center", distance: 6,   accessible: true },
  { from: "jct_center", to: "jct_south",  distance: 150, accessible: true },

  // Walkways from road to building entrances
  { from: "jct_mab",    to: "ent_mab",    distance: 75,  accessible: true },
  { from: "jct_adm",    to: "ent_adm",    distance: 170, accessible: true },
  { from: "jct_lrc",    to: "ent_lrc",    distance: 10,  accessible: true },
  { from: "jct_mab",    to: "ent_elb",    distance: 20,  accessible: true },
  { from: "jct_south",  to: "ent_gym",    distance: 96,  accessible: true },
  { from: "jct_south",  to: "ent_ssc",    distance: 204, accessible: true },

  // Diagonal shortcuts
  { from: "jct_north",  to: "gate_main",  distance: 301, accessible: true },

  // East-west connectors (rear)
  { from: "ent_elb",    to: "jct_south",  distance: 130, accessible: true },

  // ── Real PLV campus walkways (red brick paths only) ─────────────────────
  { from: "gate_plv",   to: "jct_plv_w", distance: 200, accessible: true },
  { from: "jct_plv_w",  to: "q_nw",     distance: 50,  accessible: true },
  { from: "jct_plv_w",  to: "q_sw",     distance: 160, accessible: true },
  { from: "q_nw",       to: "q_ne",     distance: 260, accessible: true },
  { from: "q_ne",       to: "q_se",     distance: 210, accessible: true },
  { from: "q_se",       to: "q_sw",     distance: 260, accessible: true },
  { from: "q_sw",       to: "q_nw",     distance: 210, accessible: true },
  { from: "q_nw",       to: "ent_scb",  distance: 67,  accessible: true },
  { from: "q_ne",       to: "ent_canteen", distance: 103, accessible: true },
  { from: "q_ne",       to: "ent_coed", distance: 136, accessible: true },
  { from: "q_sw",       to: "ent_caba", distance: 97,  accessible: true },
  { from: "q_se",       to: "ent_ceit", distance: 84,  accessible: true },
  { from: "gate_plv",   to: "ent_guard", distance: 60,  accessible: true },
];

// ── Adjacency list ─────────────────────────────────────────────────────────
function buildAdjacency(): Map<string, { node: string; edge: GraphEdge }[]> {
  const adj = new Map<string, { node: string; edge: GraphEdge }[]>();
  for (const edge of EDGES) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.from)!.push({ node: edge.to, edge });
    adj.get(edge.to)!.push({ node: edge.from, edge });
  }
  return adj;
}

const adjacency = buildAdjacency();

// ── A* pathfinding ─────────────────────────────────────────────────────────
function heuristic(a: string, b: string): number {
  const na = NODES.find(n => n.id === a);
  const nb = NODES.find(n => n.id === b);
  if (!na || !nb) return 0;
  return Math.hypot(na.x - nb.x, na.y - nb.y);
}

interface AStarNode {
  id: string;
  g: number;
  f: number;
  parent: string | null;
  edge: GraphEdge | null;
}

/**
 * Find the shortest path between two graph nodes using A*.
 */
export function findPath(fromNodeId: string, toNodeId: string, accessibleOnly = false): GraphPath | null {
  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();
  // Persistent parent/edge maps — survive nodes being moved open → closed
  // (nodes expanded earlier are removed from `open`, so reconstruction must
  // not rely on `open.get(parentId)`). Same pattern as findNavigationRoute.
  const parentMap = new Map<string, string | null>();
  const edgeMap = new Map<string, GraphEdge | null>();

  const start: AStarNode = { id: fromNodeId, g: 0, f: heuristic(fromNodeId, toNodeId), parent: null, edge: null };
  open.set(fromNodeId, start);
  parentMap.set(fromNodeId, null);
  edgeMap.set(fromNodeId, null);

  while (open.size > 0) {
    // Find node with lowest f
    let current: AStarNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.id === toNodeId) {
      // Reconstruct path from the persistent maps
      const nodeIds: string[] = [];
      const edges: GraphEdge[] = [];
      let nodeId: string | null = current.id;
      while (nodeId !== null) {
        nodeIds.unshift(nodeId);
        const edge = edgeMap.get(nodeId) ?? null;
        if (edge) edges.unshift(edge);
        nodeId = parentMap.get(nodeId) ?? null;
      }

      const totalUnits = edges.reduce((sum, e) => sum + e.distance, 0);
      const distanceM = Math.round(totalUnits * M_PER_UNIT);
      const minutes = Math.max(1, Math.round(distanceM / 80)); // 80 m/min avg walking speed

      // Build waypoints from node positions
      const waypoints = nodeIds.map(id => {
        const n = NODES.find(nd => nd.id === id);
        return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
      });

      // Build step-by-step directions
      const steps = buildSteps(nodeIds, edges);

      return { nodeIds, distanceM, minutes, waypoints, steps };
    }

    open.delete(current.id);
    closed.add(current.id);

    const neighbors = adjacency.get(current.id) ?? [];
    for (const { node: neighborId, edge } of neighbors) {
      if (closed.has(neighborId)) continue;

      // Skip non-accessible edges if filtering
      if (accessibleOnly && !edge.accessible) continue;

      const tentG = current.g + edge.distance;
      const existing = open.get(neighborId);

      if (!existing || tentG < existing.g) {
        parentMap.set(neighborId, current.id);
        edgeMap.set(neighborId, edge);
        open.set(neighborId, {
          id: neighborId,
          g: tentG,
          f: tentG + heuristic(neighborId, toNodeId),
          parent: current.id,
          edge,
        });
      }
    }
  }

  return null; // No path found
}

// ── Build human-readable directions ────────────────────────────────────────
function buildSteps(nodeIds: string[], edges: GraphEdge[]): string[] {
  if (nodeIds.length < 2) return [];

  const steps: string[] = [];
  const getLabel = (id: string) => NODES.find(n => n.id === id)?.label ?? id;

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const from = nodeIds[i];
    const to = nodeIds[i + 1];
    const fromLabel = getLabel(from);
    const toLabel = getLabel(to);
    const edge = edges[i];
    const distM = Math.round(edge.distance * M_PER_UNIT);

    if (distM <= 5) {
      steps.push(`Go to ${toLabel}`);
    } else if (from.includes("gate") || from.includes("jct")) {
      steps.push(`Walk ${distM}m along the walkway toward ${toLabel}`);
    } else if (to.includes("ent")) {
      steps.push(`Enter ${toLabel.replace(" Entrance", "")}`);
    } else {
      steps.push(`Walk ${distM}m to ${toLabel}`);
    }
  }
  // Final step
  const last = nodeIds[nodeIds.length - 1];
  const lastNode = NODES.find(n => n.id === last);
  if (lastNode?.label && !last.includes("ent")) {
    steps.push(`Arrive at ${lastNode.label}`);
  }

  return steps;
}

// ── Building entrance map ──────────────────────────────────────────────────
// Maps building IDs to nearest graph node IDs.
// Includes BOTH the legacy mock ids (b1-b6) and the published-campus seed
// ids (b_mab, …) so routes work whether the student map is fed by the
// legacy fallback or the seeded PLV campus (Developer 3 / C4 scope).
const BUILDING_ENTRANCE_MAP: Record<string, string> = {
  // Legacy mock ids
  b1: "ent_mab",
  b2: "ent_adm",
  b3: "ent_lrc",
  b4: "ent_elb",
  b5: "ent_gym",
  b6: "ent_ssc",
  // Published-campus seed ids
  b_mab: "ent_mab",
  b_adm: "ent_adm",
  b_lrc: "ent_lrc",
  b_elb: "ent_elb",
  b_gym: "ent_gym",
  b_ssc: "ent_ssc",
  // Real PLV campus seed ids (SCB / Canteen / CABA / COED / CEIT / Guard)
  b_scb: "ent_scb",
  b_canteen: "ent_canteen",
  b_caba: "ent_caba",
  b_coed: "ent_coed",
  b_ceit: "ent_ceit",
  b_guard: "ent_guard",
};

/**
 * Find the shortest walkway path between two buildings.
 * Returns null if either building has no entrance node.
 */
export function findBuildingPath(
  fromBuildingId: string,
  toBuildingId: string,
  accessibleOnly = false
): GraphPath | null {
  const fromNode = BUILDING_ENTRANCE_MAP[fromBuildingId];
  const toNode = BUILDING_ENTRANCE_MAP[toBuildingId];
  if (!fromNode || !toNode) return null;
  return findPath(fromNode, toNode, accessibleOnly);
}

/**
 * Calculate transition time between two buildings including indoor navigation.
 * Adds time for entering/exiting buildings and floor changes.
 */
export function calculateTransition(
  fromBuildingId: string,
  toBuildingId: string,
  fromFloor?: number,
  toFloor?: number
): { minutes: number; seconds: number; path: GraphPath | null } {
  const path = findBuildingPath(fromBuildingId, toBuildingId);
  if (!path) return { minutes: 0, seconds: 0, path: null };

  let totalSec = path.minutes * 60;

  // Add time for exiting the current building (stairs/elevator)
  if (fromFloor && fromFloor > 1) {
    // ~15 seconds per floor for stairs, ~8 seconds per floor for elevator
    totalSec += (fromFloor - 1) * 15;
  }

  // Add time for entering the destination building
  if (toFloor && toFloor > 1) {
    totalSec += (toFloor - 1) * 15;
  }

  // Add a constant buffer for getting to/from the entrance (30 sec each)
  totalSec += 60;

  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  return { minutes, seconds, path };
}

export { NODES, EDGES, BUILDING_ENTRANCE_MAP };

// ── Navigation graph route finder (for map-builder nav graph) ────────────────

/**
 * Find the shortest path on a custom NavigationNode/NavigationEdge graph
 * (the map-builder's nav graph) using A*.
 *
 * @param navNodes - array of NavigationNode objects (must have id, x, y)
 * @param navEdges - array of NavigationEdge objects (must have startNodeId, endNodeId, distance, bidirectional)
 * @param fromNodeId - starting node id
 * @param toNodeId - target node id
 * @param accessibleOnly - if true, only traverse accessible edges
 * @returns GraphPath or null if no path exists
 */
/**
 * Build virtual floor-transition edges from stair/elevator sharedIds.
 * Creates virtual edges between nav nodes on different floors that share
 * the same transitionSharedId, enabling multi-floor pathfinding.
 */
export function buildTransitionEdges(
  navNodes: {
    id: string;
    x: number;
    y: number;
    name?: string;
    transitionSharedId?: string;
    floorId?: string;
    type?: string;
    stairId?: string;
    elevatorId?: string;
    /** Optional emergency override for a transition-capable physical node. */
    emergencySafe?: boolean;
    emergencyStair?: boolean;
    accessible?: boolean;
  }[],
  navEdges: {
    startNodeId: string;
    endNodeId: string;
    distance: number;
    bidirectional: boolean;
    accessible: boolean;
    type?: string;
    closed?: boolean;
  }[],
): {
  startNodeId: string;
  endNodeId: string;
  distance: number;
  bidirectional: boolean;
  accessible: boolean;
  emergencySafe?: boolean;
}[] {
  const extraEdges: {
    startNodeId: string;
    endNodeId: string;
    distance: number;
    bidirectional: boolean;
    accessible: boolean;
    emergencySafe?: boolean;
  }[] = [];

  // Cross-floor transitions are persisted by the Floor Editor when linked
  // stair/elevator nodes are reconciled.  Do not add a second virtual edge for
  // an existing transition pair: a closed persisted transition must remain
  // closed instead of being bypassed by the derived fallback edge.
  const persistedTransitionPairs = new Map<string, boolean>();
  for (const edge of navEdges) {
    if (edge.type !== "floor_transition") continue;
    const key = [edge.startNodeId, edge.endNodeId].sort().join("|");
    const prior = persistedTransitionPairs.get(key);
    // If duplicate transition records exist, an open record keeps the pair
    // available; otherwise a closed record blocks it.
    persistedTransitionPairs.set(key, prior === false ? false : edge.closed === true);
  }

  // Group nav nodes by transitionSharedId
  const groups = new Map<string, typeof navNodes>();
  for (const node of navNodes) {
    if (!node.transitionSharedId) continue;
    if (!groups.has(node.transitionSharedId)) groups.set(node.transitionSharedId, []);
    groups.get(node.transitionSharedId)!.push(node);
  }

  // For each shared transition, create virtual edges between all pairs on different floors
  for (const [sharedId, nodes] of groups.entries()) {
    if (nodes.length < 2) continue;
    // Persisted transition records are authoritative for this shared group.
    // Avoid virtual all-pairs edges that could bypass a closed transition.
    const groupNodeIds = new Set(nodes.map((node) => node.id));
    const hasPersistedTransition = Array.from(persistedTransitionPairs.keys()).some((key) => {
      const [a, b] = key.split("|");
      return groupNodeIds.has(a) && groupNodeIds.has(b);
    });
    if (hasPersistedTransition) continue;

    // Determine type from IDs — elevator or stairs
    const normalizedSharedId = sharedId.toLowerCase();
    const isElevator = nodes.some((node) => node.elevatorId || node.type === "elevator")
      || normalizedSharedId.includes("elev")
      || normalizedSharedId.includes("lift")
      || normalizedSharedId.startsWith("el");
    // Designated emergency stairs are the preferred emergency egress when a
    // valid route exists.  This is only a cost hint on the existing virtual
    // transition edges; it does not alter A* or create a second graph.
    const virtualDist = nodes.some((node) => node.emergencyStair === true) ? 1 : 5;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        // Only create edge if they're on different floors
        if (a.floorId === b.floorId) continue;
        const edge = {
          startNodeId: a.id,
          endNodeId: b.id,
          distance: virtualDist,
          bidirectional: true,
          accessible: isElevator && nodes.every((node) => node.accessible !== false),
          // Stairs are a valid emergency egress by default. Elevators are
          // intentionally opt-in until their physical/transition metadata
          // explicitly marks them emergency-safe.
          emergencySafe: isElevator
            ? nodes.some((node) => node.emergencySafe === true)
            : nodes.every((node) => node.emergencySafe !== false),
        };
        extraEdges.push(edge);
      }
    }
  }

  return extraEdges;
}

export type NavigationRouteNode = {
  id: string;
  x: number;
  y: number;
  name?: string;
  transitionSharedId?: string;
  floorId?: string;
  type?: string;
  accessible?: boolean;
  stairId?: string;
  elevatorId?: string;
  emergencySafe?: boolean;
  emergencyStair?: boolean;
  rampId?: string;
  entranceId?: string;
  gateId?: string;
};

export type NavigationRouteEdge = {
  startNodeId: string;
  endNodeId: string;
  distance: number;
  bidirectional: boolean;
  accessible: boolean;
  emergencySafe?: boolean;
  type?: string;
  closed?: boolean;
  bendPoints?: { x: number; y: number }[];
};

export type NavigationRouteOptions = {
  transitionPreference?: "stairs" | "elevator";
  preferredElevatorSharedIds?: string[];
  useDerivedTransitions?: boolean;
  /** Reuse a graph prepared for these exact node/edge arrays. */
  preparedGraph?: PreparedNavigationGraph;
  /** Limit a prepared graph search to a node subset without rebuilding adjacency. */
  allowedNodeIds?: ReadonlySet<string>;
  /** Memoize identical route legs for this calculation and prepared graph. */
  searchCache?: NavigationRouteSearchCache;
};

export type PreparedNavigationNeighbor = {
  nodeId: string;
  distance: number;
  accessible: boolean;
  emergencySafe: boolean;
  transitionKind?: "stair" | "elevator" | "ramp";
  transitionSharedId?: string;
  crossesFloor: boolean;
  edge?: NavigationRouteEdge;
  reversed: boolean;
};

export interface PreparedNavigationAllowedView {
  readonly derivedAdjacency: ReadonlyMap<string, readonly PreparedNavigationNeighbor[]>;
  readonly heuristicScale: number;
}

/** Immutable route graph indexes shared by searches over the same snapshot. */
export interface PreparedNavigationGraph {
  readonly nodes: NavigationRouteNode[];
  readonly edges: NavigationRouteEdge[];
  readonly nodeMap: ReadonlyMap<string, NavigationRouteNode>;
  readonly firstNodeById: ReadonlyMap<string, NavigationRouteNode>;
  readonly nodesById: ReadonlyMap<string, readonly NavigationRouteNode[]>;
  readonly explicitAdjacency: ReadonlyMap<string, readonly PreparedNavigationNeighbor[]>;
  readonly derivedAdjacency: ReadonlyMap<string, readonly PreparedNavigationNeighbor[]>;
  readonly adjacency: ReadonlyMap<string, readonly PreparedNavigationNeighbor[]>;
  readonly heuristicScale: number;
  /** Preserve exact filtered-graph transitions and heuristic for candidate searches. */
  allowedViewFor(allowedNodeIds: ReadonlySet<string>): PreparedNavigationAllowedView;
  readonly useDerivedTransitions: boolean;
}

/** A per-calculation memo for identical route legs on one prepared snapshot. */
export interface NavigationRouteSearchCache {
  readonly graph: PreparedNavigationGraph;
  readonly values: Map<string, GraphPath | null>;
  readonly allowedSetIds: WeakMap<object, number>;
  nextAllowedSetId: number;
}

export function createNavigationRouteSearchCache(graph: PreparedNavigationGraph): NavigationRouteSearchCache {
  return { graph, values: new Map(), allowedSetIds: new WeakMap(), nextAllowedSetId: 0 };
}

export function prepareNavigationGraph(
  navNodes: NavigationRouteNode[],
  navEdges: NavigationRouteEdge[],
  options: Pick<NavigationRouteOptions, "useDerivedTransitions"> = {},
): PreparedNavigationGraph {
  const nodeMap = new Map<string, NavigationRouteNode>();
  const firstNodeById = new Map<string, NavigationRouteNode>();
  const mutableNodesById = new Map<string, NavigationRouteNode[]>();
  for (const node of navNodes) {
    nodeMap.set(node.id, node);
    if (!firstNodeById.has(node.id)) firstNodeById.set(node.id, node);
    const matches = mutableNodesById.get(node.id);
    if (matches) matches.push(node);
    else mutableNodesById.set(node.id, [node]);
  }

  const transitionKindFor = (fromId: string, toId: string, edgeType?: string): "stair" | "elevator" | "ramp" | undefined => {
    const from = nodeMap.get(fromId);
    const to = nodeMap.get(toId);
    const normalizedType = edgeType?.toLowerCase() ?? "";
    if (normalizedType.includes("elevator")) return "elevator";
    if (normalizedType.includes("stair")) return "stair";
    if (normalizedType.includes("step")) return "stair";
    if (normalizedType.includes("ramp")) return "ramp";
    if (from?.elevatorId || to?.elevatorId || from?.type === "elevator" || to?.type === "elevator") return "elevator";
    if (from?.stairId || to?.stairId || from?.type === "stair" || to?.type === "stair") return "stair";
    const sharedId = from?.transitionSharedId && from.transitionSharedId === to?.transitionSharedId
      ? from.transitionSharedId.toLowerCase()
      : "";
    if (sharedId.includes("elev") || sharedId.includes("lift") || sharedId.startsWith("el")) return "elevator";
    if (sharedId.includes("stair") || sharedId.includes("stairs") || sharedId.startsWith("st")) return "stair";
    return undefined;
  };
  const transitionSharedIdFor = (fromId: string, toId: string): string | undefined => {
    const from = nodeMap.get(fromId);
    const to = nodeMap.get(toId);
    return from?.transitionSharedId && from.transitionSharedId === to?.transitionSharedId
      ? from.transitionSharedId
      : undefined;
  };

  const explicitAdjacency = new Map<string, PreparedNavigationNeighbor[]>();
  const derivedAdjacency = new Map<string, PreparedNavigationNeighbor[]>();
  const addNeighbor = (
    fromId: string,
    toId: string,
    distance: number,
    accessible: boolean,
    emergencySafe: boolean,
    isTransition: boolean,
    edgeType?: string,
    edge?: NavigationRouteEdge,
    reversed = false,
    targetAdjacency: Map<string, PreparedNavigationNeighbor[]> = explicitAdjacency,
  ) => {
    const from = nodeMap.get(fromId);
    const to = nodeMap.get(toId);
    const crossesFloor = !!from?.floorId && !!to?.floorId && from.floorId !== to.floorId;
    const transitionKind = isTransition ? transitionKindFor(fromId, toId, edgeType) : undefined;
    const transitionSharedId = transitionKind === "elevator" ? transitionSharedIdFor(fromId, toId) : undefined;
    const neighbors = targetAdjacency.get(fromId);
    const neighbor: PreparedNavigationNeighbor = {
      nodeId: toId,
      distance,
      accessible,
      emergencySafe,
      transitionKind,
      transitionSharedId,
      crossesFloor,
      edge,
      reversed,
    };
    if (neighbors) neighbors.push(neighbor);
    else targetAdjacency.set(fromId, [neighbor]);
  };

  for (const edge of navEdges) {
    if (edge.closed === true) continue;
    const safe = edge.emergencySafe !== false;
    const normalizedEdgeType = edge.type?.toLowerCase() ?? "";
    const isTransition = edge.type === "floor_transition" || edge.type === "cross_floor"
      || normalizedEdgeType.includes("entrance_ramp")
      || normalizedEdgeType.includes("entrance_steps")
      || normalizedEdgeType.includes("entrance_step")
      || (nodeMap.get(edge.startNodeId)?.floorId !== undefined
        && nodeMap.get(edge.endNodeId)?.floorId !== undefined
        && nodeMap.get(edge.startNodeId)?.floorId !== nodeMap.get(edge.endNodeId)?.floorId);
    addNeighbor(edge.startNodeId, edge.endNodeId, edge.distance, edge.accessible, safe, isTransition, edge.type, edge, false);
    if (edge.bidirectional) {
      addNeighbor(edge.endNodeId, edge.startNodeId, edge.distance, edge.accessible, safe, isTransition, edge.type, edge, true);
    }
  }

  const useDerivedTransitions = options.useDerivedTransitions !== false;
  const transitionEdges = useDerivedTransitions ? buildTransitionEdges(navNodes, navEdges) : [];
  for (const edge of transitionEdges) {
    const safe = edge.emergencySafe !== false;
    addNeighbor(edge.startNodeId, edge.endNodeId, edge.distance, edge.accessible, safe, true, undefined, undefined, false, derivedAdjacency);
    if (edge.bidirectional) {
      addNeighbor(edge.endNodeId, edge.startNodeId, edge.distance, edge.accessible, safe, true, undefined, undefined, true, derivedAdjacency);
    }
  }

  const adjacency = new Map<string, PreparedNavigationNeighbor[]>();
  for (const [nodeId, neighbors] of explicitAdjacency) adjacency.set(nodeId, [...neighbors]);
  for (const [nodeId, neighbors] of derivedAdjacency) {
    const combined = adjacency.get(nodeId);
    if (combined) combined.push(...neighbors);
    else adjacency.set(nodeId, [...neighbors]);
  }

  const heuristicEdges = [...navEdges, ...transitionEdges];
  const heuristicScaleForEdges = (edges: readonly NavigationRouteEdge[]) => edges.reduce((scale, edge) => {
    const start = nodeMap.get(edge.startNodeId);
    const end = nodeMap.get(edge.endNodeId);
    const geometric = start && end ? Math.hypot(start.x - end.x, start.y - end.y) : 0;
    const cost = Number.isFinite(edge.distance) ? Math.max(0, edge.distance) : 0;
    return geometric > 0 ? Math.min(scale, cost / geometric) : scale;
  }, 1);
  const heuristicScale = heuristicScaleForEdges(heuristicEdges);
  const allowedViews = new WeakMap<object, PreparedNavigationAllowedView>();
  const allowedViewFor = (allowedNodeIds: ReadonlySet<string>): PreparedNavigationAllowedView => {
    const key = allowedNodeIds as object;
    const cached = allowedViews.get(key);
    if (cached) return cached;
    const filteredNodes = navNodes.filter((node) => allowedNodeIds.has(node.id));
    const filteredEdges = navEdges.filter((edge) => allowedNodeIds.has(edge.startNodeId) && allowedNodeIds.has(edge.endNodeId));
    const filteredTransitions = useDerivedTransitions ? buildTransitionEdges(filteredNodes, filteredEdges) : [];
    const subsetDerivedAdjacency = new Map<string, PreparedNavigationNeighbor[]>();
    for (const edge of filteredTransitions) {
      const safe = edge.emergencySafe !== false;
      addNeighbor(edge.startNodeId, edge.endNodeId, edge.distance, edge.accessible, safe, true, undefined, undefined, false, subsetDerivedAdjacency);
      if (edge.bidirectional) {
        addNeighbor(edge.endNodeId, edge.startNodeId, edge.distance, edge.accessible, safe, true, undefined, undefined, true, subsetDerivedAdjacency);
      }
    }
    const view = {
      derivedAdjacency: subsetDerivedAdjacency,
      heuristicScale: heuristicScaleForEdges([...filteredEdges, ...filteredTransitions]),
    };
    allowedViews.set(key, view);
    return view;
  };

  return {
    nodes: navNodes,
    edges: navEdges,
    nodeMap,
    firstNodeById,
    nodesById: mutableNodesById,
    explicitAdjacency,
    derivedAdjacency,
    adjacency,
    heuristicScale,
    allowedViewFor,
    useDerivedTransitions,
  };
}

class NavigationMinHeap<T extends { f: number; sequence: number }> {
  private readonly values: T[] = [];

  get size(): number { return this.values.length; }

  push(value: T): void {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(values[index], values[parent])) break;
      [values[index], values[parent]] = [values[parent], values[index]];
      index = parent;
    }
  }

  pop(): T | undefined {
    const values = this.values;
    if (values.length === 0) return undefined;
    const minimum = values[0];
    const last = values.pop()!;
    if (values.length > 0) {
      values[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < values.length && this.less(values[left], values[smallest])) smallest = left;
        if (right < values.length && this.less(values[right], values[smallest])) smallest = right;
        if (smallest === index) break;
        [values[index], values[smallest]] = [values[smallest], values[index]];
        index = smallest;
      }
    }
    return minimum;
  }

  private less(left: T, right: T): boolean {
    if (left.f < right.f) return true;
    if (right.f < left.f) return false;
    return left.sequence < right.sequence;
  }
}

function runPreparedNavigationRoute(
  graph: PreparedNavigationGraph,
  fromNodeId: string,
  toNodeId: string,
  accessibleOnly = false,
  emergencySafeOnly = false,
  options: Pick<NavigationRouteOptions, "transitionPreference" | "preferredElevatorSharedIds" | "allowedNodeIds"> = {},
): GraphPath | null {
  if (!fromNodeId || !toNodeId) return null;
  const allowedView = options.allowedNodeIds ? graph.allowedViewFor(options.allowedNodeIds) : undefined;
  const isAllowed = (nodeId: string) => !options.allowedNodeIds || options.allowedNodeIds.has(nodeId);
  const allowedEndpointNodes = [
    ...(graph.nodesById.get(fromNodeId) ?? []),
    ...(fromNodeId === toNodeId ? [] : graph.nodesById.get(toNodeId) ?? []),
  ].filter((node) => isAllowed(node.id));
  if (accessibleOnly) {
    if (allowedEndpointNodes.length < 2 && fromNodeId !== toNodeId) return null;
    if (allowedEndpointNodes.some((node) => node.type === "stair" || node.stairId || node.accessible === false)) return null;
  }

  const firstNodeFor = (nodeId: string) => {
    const node = graph.firstNodeById.get(nodeId);
    return node && isAllowed(nodeId) ? node : undefined;
  };
  const emergencyNodeSafe = (node: NavigationRouteNode | undefined): boolean => {
    if (!node) return false;
    return node.type !== "elevator" && !node.elevatorId && node.emergencySafe !== false;
  };
  if (emergencySafeOnly) {
    if (!emergencyNodeSafe(firstNodeFor(fromNodeId)) || !emergencyNodeSafe(firstNodeFor(toNodeId))) return null;
  }
  if (fromNodeId === toNodeId) {
    const node = firstNodeFor(fromNodeId);
    if (!node) return null;
    return {
      nodeIds: [fromNodeId],
      distanceM: 0,
      minutes: 0,
      waypoints: [{ x: node.x, y: node.y }],
      steps: [`Already at ${node.name || "destination"}.`],
    };
  }

  const nodeMap = graph.nodeMap;
  const preferredTransitionKind = options.transitionPreference === "stairs" ? "stair" : options.transitionPreference;
  const transitionPenalty = (fromId: string, neighbor: PreparedNavigationNeighbor): number => {
    const transitionKind = neighbor.transitionKind;
    if (!preferredTransitionKind || !transitionKind || transitionKind === preferredTransitionKind) return 0;
    const from = nodeMap.get(fromId);
    const to = nodeMap.get(neighbor.nodeId);
    const edgeType = neighbor.edge?.type?.toLowerCase() ?? "";
    const exteriorAccessTransition = transitionKind === "ramp"
      || (transitionKind === "stair" && (edgeType.includes("entrance") || from?.floorId !== to?.floorId));
    const appliesPreference = !(preferredTransitionKind === "elevator" && exteriorAccessTransition);
    if (!appliesPreference) return 0;
    return transitionKind === "ramp" && preferredTransitionKind === "stair" ? 100_000 : 1_000_000;
  };
  const accessibleNode = (node: NavigationRouteNode | undefined): boolean =>
    !!node && node.type !== "stair" && !node.stairId && node.accessible !== false;
  if (accessibleOnly && (!accessibleNode(firstNodeFor(fromNodeId)) || !accessibleNode(firstNodeFor(toNodeId)))) return null;

  const routeHeuristicScale = allowedView?.heuristicScale ?? graph.heuristicScale;
  const h = (a: string, b: string): number => {
    const na = nodeMap.get(a);
    const nb = nodeMap.get(b);
    if (!na || !nb) return 0;
    return Math.hypot(na.x - nb.x, na.y - nb.y) * Math.max(0, Math.min(1, routeHeuristicScale));
  };
  type SearchEntry = { id: string; g: number; f: number; sequence: number; edgeDist: number };
  type ParentArc = {
    edge?: NavigationRouteEdge;
    reversed: boolean;
    distance: number;
    transitionKind?: "stair" | "elevator" | "ramp";
    crossesFloor: boolean;
  };

  const open = new Map<string, SearchEntry>();
  const sequenceByNode = new Map<string, number>();
  const openHeap = new NavigationMinHeap<SearchEntry>();
  const closed = new Set<string>();
  const parentMap = new Map<string, string | null>();
  const parentArcMap = new Map<string, ParentArc>();
  let nextSequence = 0;
  const startEntry: SearchEntry = {
    id: fromNodeId,
    g: 0,
    f: h(fromNodeId, toNodeId),
    sequence: nextSequence++,
    edgeDist: 0,
  };
  open.set(fromNodeId, startEntry);
  sequenceByNode.set(fromNodeId, startEntry.sequence);
  openHeap.push(startEntry);
  parentMap.set(fromNodeId, null);

  const sameScore = (left: number, right: number) => left === right || (Number.isNaN(left) && Number.isNaN(right));
  while (open.size > 0) {
    const popped = openHeap.pop();
    if (!popped) break;
    const current = open.get(popped.id);
    // A better path may have been pushed while this older heap entry waited.
    if (!current || !sameScore(current.g, popped.g) || !sameScore(current.f, popped.f) || current.sequence !== popped.sequence) continue;

    if (current.id === toNodeId) {
      const pathIds: string[] = [];
      let nodeId: string | null = current.id;
      const arcs: ParentArc[] = [];
      while (nodeId !== null) {
        pathIds.unshift(nodeId);
        const arc = parentArcMap.get(nodeId);
        if (arc) arcs.unshift(arc);
        nodeId = parentMap.get(nodeId) ?? null;
      }

      const waypoints: { x: number; y: number }[] = [];
      const append = (point: { x: number; y: number }) => {
        const previous = waypoints[waypoints.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) waypoints.push(point);
      };
      const first = nodeMap.get(pathIds[0]);
      if (first) append({ x: first.x, y: first.y });
      let totalUnits = 0;
      let crossedDerivedArc = false;
      const steps: string[] = [];
      for (let index = 0; index < arcs.length; index += 1) {
        const from = pathIds[index];
        const to = pathIds[index + 1];
        const arc = arcs[index];
        const edge = arc.edge;
        totalUnits += arc.distance;
        if (edge?.bendPoints) {
          const bends = arc.reversed ? [...edge.bendPoints].reverse() : edge.bendPoints;
          bends.forEach(append);
        }
        const destination = nodeMap.get(to);
        if (destination) append({ x: destination.x, y: destination.y });
        const fromLabel = nodeMap.get(from)?.name || from;
        const toLabel = destination?.name || to;
        const distM = Math.round(arc.distance * M_PER_UNIT);
        if (steps.length === 0 && !crossedDerivedArc) steps.push(`Start from ${fromLabel}`);
        if (arc.crossesFloor && arc.transitionKind) {
          const transitionLabel = arc.transitionKind === "stair" ? "stairs" : "elevator";
          steps.push(`Take the ${transitionLabel} to ${toLabel}`);
        } else if (edge) {
          steps.push(`Walk ${Math.max(1, distM)}m to ${toLabel}`);
        }
        if (!edge) crossedDerivedArc = true;
      }
      const distanceM = Math.round(totalUnits * M_PER_UNIT);
      const minutes = Math.max(1, Math.round(distanceM / 80));
      return { nodeIds: pathIds, distanceM, minutes, waypoints, steps };
    }

    open.delete(current.id);
    closed.add(current.id);
    const visitNeighbor = (neighbor: PreparedNavigationNeighbor) => {
      const neighborId = neighbor.nodeId;
      if (closed.has(neighborId) || !isAllowed(neighborId)) return;
      const transitionKind = neighbor.transitionKind;
      if (transitionKind === "elevator" && options.preferredElevatorSharedIds?.length) {
        if (!neighbor.transitionSharedId || !options.preferredElevatorSharedIds.includes(neighbor.transitionSharedId)) return;
      }
      if (accessibleOnly && !neighbor.accessible) return;
      if (accessibleOnly && !accessibleNode(firstNodeFor(neighborId))) return;
      if (emergencySafeOnly && (!neighbor.emergencySafe || transitionKind === "elevator" || (neighbor.crossesFloor && transitionKind !== "stair"))) return;
      if (emergencySafeOnly && !emergencyNodeSafe(firstNodeFor(neighborId))) return;

      const dist = neighbor.distance + transitionPenalty(current.id, neighbor);
      const tentativeG = current.g + dist;
      const existing = open.get(neighborId);
      if (!existing || tentativeG < existing.g) {
        parentMap.set(neighborId, current.id);
        parentArcMap.set(neighborId, {
          edge: neighbor.edge,
          reversed: neighbor.reversed,
          distance: neighbor.distance,
          transitionKind,
          crossesFloor: neighbor.crossesFloor,
        });
        let sequence = sequenceByNode.get(neighborId);
        if (sequence === undefined) {
          sequence = nextSequence++;
          sequenceByNode.set(neighborId, sequence);
        }
        const entry: SearchEntry = {
          id: neighborId,
          g: tentativeG,
          f: tentativeG + h(neighborId, toNodeId),
          sequence,
          edgeDist: dist,
        };
        open.set(neighborId, entry);
        openHeap.push(entry);
      }
    };
    if (allowedView) {
      for (const neighbor of graph.explicitAdjacency.get(current.id) ?? []) visitNeighbor(neighbor);
      for (const neighbor of allowedView.derivedAdjacency.get(current.id) ?? []) visitNeighbor(neighbor);
    } else {
      for (const neighbor of graph.adjacency.get(current.id) ?? []) visitNeighbor(neighbor);
    }
  }
  return null;
}

export function findPreparedNavigationRoute(
  graph: PreparedNavigationGraph,
  fromNodeId: string,
  toNodeId: string,
  accessibleOnly = false,
  emergencySafeOnly = false,
  options: Pick<NavigationRouteOptions, "transitionPreference" | "preferredElevatorSharedIds" | "allowedNodeIds" | "searchCache"> = {},
): GraphPath | null {
  const cache = options.searchCache;
  if (!cache || cache.graph !== graph) {
    return runPreparedNavigationRoute(graph, fromNodeId, toNodeId, accessibleOnly, emergencySafeOnly, options);
  }

  let allowedSetId = 0;
  if (options.allowedNodeIds) {
    const existingId = cache.allowedSetIds.get(options.allowedNodeIds as object);
    if (existingId !== undefined) allowedSetId = existingId;
    else {
      allowedSetId = ++cache.nextAllowedSetId;
      cache.allowedSetIds.set(options.allowedNodeIds as object, allowedSetId);
    }
  }
  const key = JSON.stringify([
    fromNodeId,
    toNodeId,
    accessibleOnly,
    emergencySafeOnly,
    options.transitionPreference ?? null,
    options.preferredElevatorSharedIds ? [...options.preferredElevatorSharedIds].sort() : [],
    allowedSetId,
  ]);
  if (cache.values.has(key)) return cache.values.get(key) ?? null;
  const result = runPreparedNavigationRoute(graph, fromNodeId, toNodeId, accessibleOnly, emergencySafeOnly, options);
  cache.values.set(key, result);
  return result;
}

export function findNavigationRoute(
  navNodes: NavigationRouteNode[],
  navEdges: NavigationRouteEdge[],
  fromNodeId: string,
  toNodeId: string,
  accessibleOnly = false,
  emergencySafeOnly = false,
  options: NavigationRouteOptions = {},
): GraphPath | null {
  if (!fromNodeId || !toNodeId) return null;
  const useDerivedTransitions = options.useDerivedTransitions !== false;
  const prepared = options.preparedGraph
      && options.preparedGraph.nodes === navNodes
      && options.preparedGraph.edges === navEdges
      && options.preparedGraph.useDerivedTransitions === useDerivedTransitions
    ? options.preparedGraph
    : prepareNavigationGraph(navNodes, navEdges, { useDerivedTransitions });
  return findPreparedNavigationRoute(prepared, fromNodeId, toNodeId, accessibleOnly, emergencySafeOnly, options);
}
