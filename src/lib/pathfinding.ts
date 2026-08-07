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

  // Persistent parent map — survives nodes being moved from open → closed.
  // (Without this, reconstructing the path via the open set truncates the
  // route once any ancestor has been closed, returning a single-node path.)
  const parentMap = new Map<string, { parent: string | null; edge: GraphEdge | null }>();

  const start: AStarNode = { id: fromNodeId, g: 0, f: heuristic(fromNodeId, toNodeId), parent: null, edge: null };
  open.set(fromNodeId, start);
  parentMap.set(fromNodeId, { parent: null, edge: null });

  while (open.size > 0) {
    // Find node with lowest f
    let current: AStarNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.id === toNodeId) {
      // Reconstruct path using the persistent parent map
      const nodeIds: string[] = [];
      const edges: GraphEdge[] = [];
      let cId: string | null = current.id;
      while (cId !== null) {
        nodeIds.unshift(cId);
        const entry = parentMap.get(cId);
        if (entry?.edge) edges.unshift(entry.edge);
        cId = entry?.parent ?? null;
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
        parentMap.set(neighborId, { parent: current.id, edge });
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
// Maps building IDs to nearest graph node IDs
const BUILDING_ENTRANCE_MAP: Record<string, string> = {
  b1: "ent_mab",
  b2: "ent_adm",
  b3: "ent_lrc",
  b4: "ent_elb",
  b5: "ent_gym",
  b6: "ent_ssc",
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
  navNodes: { id: string; x: number; y: number; name?: string; transitionSharedId?: string; floorId?: string }[],
  navEdges: { startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean; accessible: boolean }[],
): { startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean; accessible: boolean }[] {
  const extraEdges: { startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean; accessible: boolean }[] = [];

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

    // Determine type from IDs — elevator or stairs
    const isElevator = sharedId.includes("el_");
    const virtualDist = 5; // Short virtual distance for floor transitions

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
          accessible: isElevator, // Elevator transitions are always accessible
        };
        extraEdges.push(edge);
      }
    }
  }

  return extraEdges;
}

export function findNavigationRoute(
  navNodes: { id: string; x: number; y: number; name?: string; transitionSharedId?: string; floorId?: string }[],
  navEdges: { startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean; accessible: boolean; emergencySafe?: boolean }[],
  fromNodeId: string,
  toNodeId: string,
  accessibleOnly = false,
  emergencySafeOnly = false
): GraphPath | null {
  if (!fromNodeId || !toNodeId) return null;
  if (fromNodeId === toNodeId) {
    const node = navNodes.find(n => n.id === fromNodeId);
    if (!node) return null;
    return {
      nodeIds: [fromNodeId],
      distanceM: 0,
      minutes: 0,
      waypoints: [{ x: node.x, y: node.y }],
      steps: [`Already at ${node.name || "destination"}.`],
    };
  }

  // Build adjacency list (include emergencySafe for emergency routing)
  const adj = new Map<string, { nodeId: string; dist: number; accessible: boolean; emergencySafe: boolean }[]>();
  for (const edge of navEdges) {
    if (!adj.has(edge.startNodeId)) adj.set(edge.startNodeId, []);
    if (!adj.has(edge.endNodeId)) adj.set(edge.endNodeId, []);
    const safe = edge.emergencySafe !== false; // default to safe if not set
    adj.get(edge.startNodeId)!.push({ nodeId: edge.endNodeId, dist: edge.distance, accessible: edge.accessible, emergencySafe: safe });
    if (edge.bidirectional) {
      adj.get(edge.endNodeId)!.push({ nodeId: edge.startNodeId, dist: edge.distance, accessible: edge.accessible, emergencySafe: safe });
    }
  }

  // Add virtual floor-transition edges from shared stair/elevator IDs
  const transitionEdges = buildTransitionEdges(navNodes, navEdges);
  for (const edge of transitionEdges) {
    if (!adj.has(edge.startNodeId)) adj.set(edge.startNodeId, []);
    if (!adj.has(edge.endNodeId)) adj.set(edge.endNodeId, []);
    const safe = edge.emergencySafe !== false;
    adj.get(edge.startNodeId)!.push({ nodeId: edge.endNodeId, dist: edge.distance, accessible: edge.accessible, emergencySafe: safe });
    if (edge.bidirectional) {
      adj.get(edge.endNodeId)!.push({ nodeId: edge.startNodeId, dist: edge.distance, accessible: edge.accessible, emergencySafe: safe });
    }
  }

  // Node position map for heuristic
  const nodeMap = new Map<string, { x: number; y: number; name?: string }>();
  for (const n of navNodes) nodeMap.set(n.id, n);

  const h = (a: string, b: string): number => {
    const na = nodeMap.get(a);
    const nb = nodeMap.get(b);
    if (!na || !nb) return 0;
    return Math.hypot(na.x - nb.x, na.y - nb.y);
  };

  interface NavAStarNode {
    id: string;
    g: number;
    f: number;
    parent: string | null;
    edgeDist: number;
  }

  const open = new Map<string, NavAStarNode>();
  const closed = new Set<string>();

  // Persistent parent map — survives nodes being moved from open → closed
  const parentMap = new Map<string, string | null>();

  open.set(fromNodeId, { id: fromNodeId, g: 0, f: h(fromNodeId, toNodeId), parent: null, edgeDist: 0 });
  parentMap.set(fromNodeId, null);

  while (open.size > 0) {
    let current: NavAStarNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.id === toNodeId) {
      // Reconstruct path using the persistent parentMap
      const pathIds: string[] = [];
      let nodeId: string | null = current.id;
      while (nodeId !== null) {
        pathIds.unshift(nodeId);
        nodeId = parentMap.get(nodeId) ?? null;
      }

      const waypoints = pathIds.map(id => {
        const n = nodeMap.get(id);
        return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
      });

      // Calculate distance from edges between consecutive path nodes
      let totalUnits = 0;
      const steps: string[] = [];
      for (let i = 0; i < pathIds.length - 1; i++) {
        const from = pathIds[i];
        const to = pathIds[i + 1];
        const edge = navEdges.find(
          e => (e.startNodeId === from && e.endNodeId === to) ||
               (e.bidirectional && e.startNodeId === to && e.endNodeId === from)
        );
        if (edge) {
          totalUnits += edge.distance;
          const fromLabel = nodeMap.get(from)?.name || from;
          const toLabel = nodeMap.get(to)?.name || to;
          const distM = Math.round(edge.distance * M_PER_UNIT);
          if (i === 0) {
            steps.push(`Start from ${fromLabel}`);
          }
          steps.push(`Walk ${Math.max(1, distM)}m to ${toLabel}`);
        }
      }

      const distanceM = Math.round(totalUnits * M_PER_UNIT);
      const minutes = Math.max(1, Math.round(distanceM / 80));

      return { nodeIds: pathIds, distanceM, minutes, waypoints, steps };
    }

    open.delete(current.id);
    closed.add(current.id);

    const neighbors = adj.get(current.id) ?? [];
    for (const { nodeId: neighborId, dist, accessible, emergencySafe } of neighbors) {
      if (closed.has(neighborId)) continue;
      if (accessibleOnly && !accessible) continue;
      if (emergencySafeOnly && !emergencySafe) continue;

      const tentG = current.g + dist;
      const existing = open.get(neighborId);

      if (!existing || tentG < existing.g) {
        parentMap.set(neighborId, current.id);
        open.set(neighborId, {
          id: neighborId,
          g: tentG,
          f: tentG + h(neighborId, toNodeId),
          parent: current.id,
          edgeDist: dist,
        });
      }
    }
  }

  return null; // No path
}
