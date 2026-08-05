/**
 * Indoor room pathfinding for floor plan SVG.
 *
 * Each building floor has rooms positioned on a 440×290 SVG coordinate space.
 * Rooms are arranged in rows with a central corridor. This module:
 * 1. Auto-detects corridor lines based on room positions
 * 2. Builds a walkway graph from stairs/elevator → corridor → target room
 * 3. Returns route waypoints and human-readable directions
 */

import { FLOOR_PLANS, type Room } from "../data/floorPlans";

export interface IndoorWaypoint {
  x: number;
  y: number;
  label?: string;
}

export interface IndoorRoute {
  /** SVG waypoints to draw a path from start to target */
  waypoints: IndoorWaypoint[];
  /** Human-readable step-by-step directions */
  steps: string[];
  /** Estimated walking distance in meters (scaled) */
  distanceMeters: number;
  /** Estimated walking time in seconds */
  estimatedSeconds: number;
}

// ── Graph node used internally for A* ──────────────────────────────────────
interface CorridorNode {
  id: string;
  x: number;
  y: number;
}

interface CorridorEdge {
  from: string;
  to: string;
  dist: number;
}

/** Minimal room shape accepted by the graph builder */
export interface RoomLike {
  id: string; name: string;
  x: number; y: number; w: number; h: number;
  type: string;
  /** Whether this room is wheelchair-accessible (used in accessible-only routing) */
  accessibility?: boolean;
}

// ── Build floor navigation graph from room data ───────────────────────────
/**
 * Build a corridor graph from an array of room-like objects.
 * Rooms with type "stairs", "elevator", or "lobby" become "stair/service"
 * nodes that connect to the corridor; every other room gets a "door" node.
 *
 * @param accessibleOnly If true, only elevator and lobby nodes are treated as
 *   viable entry/exit points (stairs are excluded). Rooms without an explicit
 *   `accessibility: true` flag are skipped.
 */
export function buildFloorGraphFromRooms(
  rooms: RoomLike[],
  accessibleOnly = false
): { nodes: CorridorNode[]; edges: CorridorEdge[]; roomNodeMap: Map<string, string>; stairNodes: string[] } | null {
  if (rooms.length === 0) return null;

  // 1. Sort rooms by their vertical center to detect rows
  const roomCenterY = rooms.map(r => ({ id: r.id, cy: r.y + r.h / 2 }));
  const sorted = [...roomCenterY].sort((a, b) => a.cy - b.cy);
  const medianY = sorted[Math.floor(sorted.length / 2)].cy;

  // 2. Separate into top row (above corridor) and bottom row (below corridor)
  const topRooms = rooms.filter(r => r.y + r.h / 2 < medianY).sort((a, b) => a.x - b.x);
  const bottomRooms = rooms.filter(r => r.y + r.h / 2 >= medianY).sort((a, b) => a.x - b.x);
  const serviceRooms = rooms.filter(r => r.type === "stairs" || r.type === "elevator" || r.type === "lobby");

  // 3. Determine corridor Y position (gap between rows)
  const topMaxY = topRooms.reduce((max, r) => Math.max(max, r.y + r.h), 0);
  const bottomMinY = bottomRooms.reduce((min, r) => Math.min(min, r.y), 440);
  const corridorY = topMaxY + (bottomMinY - topMaxY) / 2;

  // If rows aren't well separated, use median
  const effectiveCY = bottomMinY - topMaxY > 15 ? corridorY : medianY;

  // 4. Build corridor nodes at regular intervals
  const nodes: CorridorNode[] = [];
  const edges: CorridorEdge[] = [];
  const roomNodeMap = new Map<string, string>();
  const stairNodes: string[] = [];

  // Get x-range for the corridor
  const allX = rooms.map(r => r.x);
  const allRight = rooms.map(r => r.x + r.w);
  const minX = Math.min(...allX) - 10;
  const maxX = Math.max(...allRight) + 10;

  // Place corridor spine nodes every 15 SVG units
  const spacing = 15;
  const steps_count = Math.ceil((maxX - minX) / spacing) + 1;
  for (let i = 0; i < steps_count; i++) {
    const x = minX + i * spacing;
    const id = `cor_${i}`;
    nodes.push({ id, x, y: effectiveCY });
    if (i > 0) {
      edges.push({ from: `cor_${i - 1}`, to: id, dist: spacing });
    }
  }

  // 5. For service rooms (stairs/elevator/lobby), connect to nearest corridor node
  const validServiceRooms = accessibleOnly
    ? serviceRooms.filter(sr => sr.type === "elevator" || sr.type === "lobby")
    : serviceRooms;

  for (const sr of validServiceRooms) {
    const cx = sr.x + sr.w / 2;
    const cy = sr.y + sr.h / 2;

    if (sr.type === "stairs" || sr.type === "elevator") {
      const nodeId = `service_${sr.id}`;
      nodes.push({ id: nodeId, x: cx, y: cy });
      stairNodes.push(nodeId);

      // Connect to nearest corridor node
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < steps_count; i++) {
        const dx = cx - (minX + i * spacing);
        const dy = cy - effectiveCY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        edges.push({ from: nodeId, to: `cor_${bestIdx}`, dist: bestDist });
      }
    }

    if (sr.type === "lobby") {
      const nodeId = `entrance_${sr.id}`;
      nodes.push({ id: nodeId, x: cx, y: sr.y + sr.h });
      stairNodes.push(nodeId);

      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < steps_count; i++) {
        const dx = cx - (minX + i * spacing);
        const dy = sr.y + sr.h - effectiveCY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        edges.push({ from: nodeId, to: `cor_${bestIdx}`, dist: bestDist });
      }
    }
  }

  // 6. For each room, create a "door" node on the side facing the corridor
  //    In accessible-only mode, skip rooms not marked as accessible
  //    If a room has an explicit navConnection, use that as the door position.
  for (const room of rooms) {
    if (room.type === "stairs" || room.type === "elevator" || room.type === "lobby") continue;
    // In accessible-only mode, only include rooms that have accessibility: true
    if (accessibleOnly && room.accessibility !== true) continue;
    const doorNodeId = `door_${room.id}`;
    let doorX: number;
    let doorY: number;

    if (room.navConnection) {
      // Use the explicit navigation connection point set in the Floor Editor
      doorX = room.navConnection.x;
      doorY = room.navConnection.y;
    } else {
      // Auto-detect which side faces the corridor
      const roomCx = room.x + room.w / 2;
      const roomCy = room.y + room.h / 2;
      if (roomCy < effectiveCY) {
        doorX = roomCx;
        doorY = room.y + room.h;
      } else {
        doorX = roomCx;
        doorY = room.y;
      }
    }

    nodes.push({ id: doorNodeId, x: doorX, y: doorY });

    // Connect door to nearest corridor node
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < steps_count; i++) {
      const dx = doorX - (minX + i * spacing);
      const dy = doorY - effectiveCY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      edges.push({ from: doorNodeId, to: `cor_${bestIdx}`, dist: bestDist });
    }

    roomNodeMap.set(room.id, doorNodeId);
  }

  return { nodes, edges, roomNodeMap, stairNodes };
}

// ── Auto-generate corridor graph for a given floor (legacy, hardcoded data) ─
function buildFloorGraph(
  buildingId: string,
  floorNumber: number
): { nodes: CorridorNode[]; edges: CorridorEdge[]; roomNodeMap: Map<string, string>; stairNodes: string[] } | null {
  const plan = FLOOR_PLANS[buildingId];
  if (!plan) return null;
  const floor = plan.floors.find(f => f.number === floorNumber);
  if (!floor) return null;
  return buildFloorGraphFromRooms(floor.rooms);
}

// ── A* pathfinding on the floor graph ─────────────────────────────────────
interface AStarNode {
  id: string;
  g: number;
  f: number;
  parent: string | null;
}

function aStarFloor(
  fromNodeId: string,
  toNodeId: string,
  nodes: CorridorNode[],
  edges: CorridorEdge[]
): { pathIds: string[]; totalDist: number } | null {
  const nodeMap = new Map<string, CorridorNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build adjacency
  const adj = new Map<string, { node: string; dist: number }[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ node: e.to, dist: e.dist });
    adj.get(e.to)!.push({ node: e.from, dist: e.dist });
  }

  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();
  // Persist parent pointers separately so reconstruction doesn't break
  // when a node gets moved from open → closed.
  const parentMap = new Map<string, string | null>();
  parentMap.set(fromNodeId, null);

  const h = (id: string, targetId: string): number => {
    const a = nodeMap.get(id);
    const b = nodeMap.get(targetId);
    if (!a || !b) return 0;
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  };

  open.set(fromNodeId, { id: fromNodeId, g: 0, f: h(fromNodeId, toNodeId), parent: null });

  while (open.size > 0) {
    // Find node with lowest f
    let current: AStarNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.id === toNodeId) {
      // Reconstruct using persistent parentMap
      const pathIds: string[] = [];
      let nodeId: string | null = current.id;
      while (nodeId !== null) {
        pathIds.unshift(nodeId);
        nodeId = parentMap.get(nodeId) ?? null;
      }
      return { pathIds, totalDist: current.g };
    }

    open.delete(current.id);
    closed.add(current.id);

    const neighbors = adj.get(current.id) ?? [];
    for (const { node: neighborId, dist } of neighbors) {
      if (closed.has(neighborId)) continue;
      const tentG = current.g + dist;
      const existing = open.get(neighborId);
      if (!existing || tentG < existing.g) {
        parentMap.set(neighborId, current.id);
        open.set(neighborId, {
          id: neighborId,
          g: tentG,
          f: tentG + h(neighborId, toNodeId),
          parent: current.id,
        });
      }
    }
  }

  return null; // No path
}

// ── Public API ──────────────────────────────────────────────────────────────

const SVG_TO_METERS = 0.12; // ~12 cm per SVG unit for indoor spaces

/**
 * Find an indoor route from the entrance (nearest stair/elevator/lobby)
 * to a target room on the same floor.
 *
 * @param buildingId - e.g. "b1" for MAB
 * @param floorNumber - floor number (1 = ground)
 * @param targetRoomId - room id like "m203"
 * @returns IndoorRoute with waypoints, steps, and time estimate, or null
 */
export function findIndoorRoute(
  buildingId: string,
  floorNumber: number,
  targetRoomId: string
): IndoorRoute | null {
  const graph = buildFloorGraph(buildingId, floorNumber);
  if (!graph) return null;

  const doorNode = graph.roomNodeMap.get(targetRoomId);
  if (!doorNode || graph.stairNodes.length === 0) return null;

  // Find the closest stair/elevator to the target room
  const targetNode = graph.nodes.find(n => n.id === doorNode);
  if (!targetNode) return null;

  let bestRoute: { pathIds: string[]; totalDist: number; entryNodeId: string } | null = null;

  for (const entryNodeId of graph.stairNodes) {
    const result = aStarFloor(entryNodeId, doorNode, graph.nodes, graph.edges);
    if (result) {
      if (!bestRoute || result.totalDist < bestRoute.totalDist) {
        bestRoute = { ...result, entryNodeId };
      }
    }
  }

  if (!bestRoute) return null;

  // Build waypoints from node positions
  const nodeMap = new Map<string, CorridorNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  const waypoints: IndoorWaypoint[] = [];
  for (const id of bestRoute.pathIds) {
    const nd = nodeMap.get(id);
    if (nd) {
      waypoints.push({ x: nd.x, y: nd.y });
    }
  }

  // Build human-readable steps
  const steps = buildIndoorSteps(bestRoute.pathIds, nodeMap, graph, targetRoomId, FLOOR_PLANS[buildingId]?.floors.find(f => f.number === floorNumber)?.rooms ?? []);

  // Distance & time
  const distanceMeters = parseFloat((bestRoute.totalDist * SVG_TO_METERS).toFixed(1));
  const estimatedSeconds = Math.round(distanceMeters / 1.2); // ~1.2 m/s walking indoors

  return { waypoints, steps, distanceMeters, estimatedSeconds };
}

function buildIndoorSteps(
  pathIds: string[],
  nodeMap: Map<string, CorridorNode>,
  graph: { nodes: CorridorNode[]; edges: CorridorEdge[]; roomNodeMap: Map<string, string>; stairNodes: string[] },
  targetRoomId: string,
  rooms: Room[]
): string[] {
  const steps: string[] = [];
  if (pathIds.length < 2) return steps;

  const targetRoom = rooms.find(r => r.id === targetRoomId);
  const targetName = targetRoom?.name ?? "room";

  // First node should be stair/elevator
  const firstNode = nodeMap.get(pathIds[0]);
  if (firstNode) {
    // Determine if it's a stair or elevator
    const isElevator = graph.nodes.some(n => n.id === pathIds[0] && n.id.startsWith("service_"));
    if (isElevator) {
      // Try to match to a room
      const roomId = pathIds[0].replace("service_", "").replace("entrance_", "");
      const room = rooms.find(r => r.id === roomId);
      if (room) {
        steps.push(`Start from the ${room.type === "elevator" ? "elevator" : "stairs"}: ${room.name}`);
      } else {
        steps.push("Start from the nearest stairway or elevator");
      }
    } else {
      steps.push("Start from the building entrance");
    }
  }

  // For corridor portions, add simple directions
  // We'll summarize corridor walking into one step
  let lastLabel = "";
  for (let i = 1; i < pathIds.length; i++) {
    const curr = nodeMap.get(pathIds[i]);
    const prev = nodeMap.get(pathIds[i - 1]);
    if (!curr || !prev) continue;

    const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);

    // Determine direction
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let dir = "";
    if (absDx > absDy) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    const distM = parseFloat((dist * SVG_TO_METERS).toFixed(1));
    if (distM > 0.5) {
      const label = `Walk ${distM}m ${dir}`;
      if (label !== lastLabel) {
        steps.push(label);
        lastLabel = label;
      }
    }

    // If we've reached the door of the target room
    if (pathIds[i] === `door_${targetRoomId}`) {
      steps.push(`Arrive at ${targetName}`);
    }
  }

  // If no corridor steps were generated, add a simple instruction
  if (steps.length <= 1) {
    steps.push(`Proceed through the corridor toward ${targetName}`);
    steps.push(`Arrive at ${targetName}`);
  }

  return steps;
}

/**
 * Same as `findIndoorRoute` but accepts room data directly instead
 * of reading from the hardcoded FLOOR_PLANS constant.
 *
 * Use this when routing inside a floor of a published campus that
 * was built with the Map Builder.
 *
 * @param accessibleOnly If true, only uses elevator/lobby nodes as entry
 *   points (avoids stairs) and only navigates to accessible rooms.
 */
export function findIndoorRouteForFloor(
  buildingId: string,
  floorNumber: number,
  targetRoomId: string,
  rooms: RoomLike[],
  accessibleOnly = false
): IndoorRoute | null {
  const graph = buildFloorGraphFromRooms(rooms, accessibleOnly);
  if (!graph) return null;

  const doorNode = graph.roomNodeMap.get(targetRoomId);
  if (!doorNode || graph.stairNodes.length === 0) return null;

  const targetNode = graph.nodes.find(n => n.id === doorNode);
  if (!targetNode) return null;

  let bestRoute: { pathIds: string[]; totalDist: number; entryNodeId: string } | null = null;

  for (const entryNodeId of graph.stairNodes) {
    const result = aStarFloor(entryNodeId, doorNode, graph.nodes, graph.edges);
    if (result) {
      if (!bestRoute || result.totalDist < bestRoute.totalDist) {
        bestRoute = { ...result, entryNodeId };
      }
    }
  }

  if (!bestRoute) return null;

  const nodeMap = new Map<string, CorridorNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  const waypoints: IndoorWaypoint[] = [];
  for (const id of bestRoute.pathIds) {
    const nd = nodeMap.get(id);
    if (nd) {
      waypoints.push({ x: nd.x, y: nd.y });
    }
  }

  const steps = buildIndoorSteps(bestRoute.pathIds, nodeMap, graph, targetRoomId, rooms);

  const distanceMeters = parseFloat((bestRoute.totalDist * SVG_TO_METERS).toFixed(1));
  const estimatedSeconds = Math.round(distanceMeters / 1.2);

  return { waypoints, steps, distanceMeters, estimatedSeconds };
}

// ── Multi-floor indoor route segment ───────────────────────────────────────

export interface MultiFloorSegment {
  /** Human-readable label for this segment */
  label: string;
  /** SVG waypoints for this segment */
  waypoints: IndoorWaypoint[];
  /** Distance in meters */
  distanceM: number;
  /** Estimated time in seconds */
  seconds: number;
  /** Step-by-step directions for this segment */
  steps: string[];
  /** The floor number this segment is on (null = vertical transit) */
  floorNumber: number | null;
}

export interface MultiFloorRoute {
  /** All segments that make up the multi-floor route */
  segments: MultiFloorSegment[];
  /** Total distance in meters */
  totalDistanceM: number;
  /** Total estimated time in seconds */
  totalSeconds: number;
  /** All steps flattened */
  allSteps: string[];
}

/**
 * Find a route to a room that may span multiple floors.
 *
 * For same-floor routing this delegates to `findIndoorRouteForFloor`.
 * For cross-floor routing it creates: exit-source-floor → vertical-transit
 * → enter-target-floor segments.
 *
 * @param buildingId   building identifier
 * @param targetFloor  target floor number
 * @param targetRoomId room to navigate to
 * @param fromFloor    starting floor number (defaults to 1 / ground)
 * @param floorData    map of floor-number → rooms for *all* floors
 * @param accessibleOnly If true, uses elevators instead of stairs and
 *   only navigates to accessible rooms.
 */
export function findMultiFloorIndoorRoute(
  buildingId: string,
  targetFloor: number,
  targetRoomId: string,
  fromFloor: number,
  floorData: Record<number, RoomLike[]>,
  accessibleOnly = false
): MultiFloorRoute | null {
  const segments: MultiFloorSegment[] = [];

  // Same floor — simple case
  if (fromFloor === targetFloor) {
    const route = findIndoorRouteForFloor(buildingId, targetFloor, targetRoomId, floorData[targetFloor] ?? [], accessibleOnly);
    if (!route) return null;
    segments.push({
      label: `Navigate to room on ${describeFloor(targetFloor)}`,
      waypoints: route.waypoints,
      distanceM: route.distanceMeters,
      seconds: route.estimatedSeconds,
      steps: route.steps,
      floorNumber: targetFloor,
    });
    return {
      segments,
      totalDistanceM: route.distanceMeters,
      totalSeconds: route.estimatedSeconds,
      allSteps: route.steps,
    };
  }

  // Different floors — need stairs/elevator transit
  const fromRooms = floorData[fromFloor];
  const toRooms = floorData[targetFloor];
  if (!fromRooms || !toRooms) return null;

  // 1. Route from target room → nearest stair/elevator on target floor
  const toGraph = buildFloorGraphFromRooms(toRooms, accessibleOnly);
  if (!toGraph || toGraph.stairNodes.length === 0) return null;

  const toDoorNode = toGraph.roomNodeMap.get(targetRoomId);
  if (!toDoorNode) return null;

  // Find the best stair for the target room
  let bestStair: { pathIds: string[]; totalDist: number; entryNodeId: string } | null = null;
  for (const entryNodeId of toGraph.stairNodes) {
    const result = aStarFloor(entryNodeId, toDoorNode, toGraph.nodes, toGraph.edges);
    if (result) {
      if (!bestStair || result.totalDist < bestStair.totalDist) {
        bestStair = { ...result, entryNodeId };
      }
    }
  }
  if (!bestStair) return null;

  // Build the entry segment (stairs → target room on target floor)
  const toNodeMap = new Map<string, CorridorNode>();
  for (const n of toGraph.nodes) toNodeMap.set(n.id, n);

  const entryWaypoints: IndoorWaypoint[] = [];
  for (const id of bestStair.pathIds) {
    const nd = toNodeMap.get(id);
    if (nd) entryWaypoints.push({ x: nd.x, y: nd.y });
  }
  const entrySteps = buildIndoorSteps(bestStair.pathIds, toNodeMap, toGraph, targetRoomId, toRooms);

  segments.push({
    label: `Navigate on ${describeFloor(targetFloor)}`,
    waypoints: entryWaypoints,
    distanceM: parseFloat((bestStair.totalDist * SVG_TO_METERS).toFixed(1)),
    seconds: Math.round(bestStair.totalDist * SVG_TO_METERS / 1.2),
    steps: entrySteps,
    floorNumber: targetFloor,
  });

  // 2. Vertical transit segment
  const floorDiff = Math.abs(targetFloor - fromFloor);
  const direction = targetFloor > fromFloor ? "up" : "down";
  const hasElevator = toRooms.some(r => r.type === "elevator");
  // In accessible-only mode, force elevator transit (stairs are excluded)
  const transitType = accessibleOnly
    ? (hasElevator ? "elevator" : "stairs — no elevator available")
    : hasElevator ? "elevator" : "stairs";
  const transitLabel = accessibleOnly
    ? `Take elevator ${direction} from ${describeFloor(fromFloor)} to ${describeFloor(targetFloor)}`
    : `Take ${transitType} ${direction} from ${describeFloor(fromFloor)} to ${describeFloor(targetFloor)}`;

  segments.unshift({
    label: transitLabel,
    waypoints: [],
    distanceM: 0,
    seconds: hasElevator ? floorDiff * 8 : floorDiff * 15,
    steps: [transitLabel],
    floorNumber: null,
  });

  // 3. Exit segment (source floor: room → stairs) - simplified
  //    We'll just include the transit step from the entrance side
  segments.unshift({
    label: `Exit from entrance on ${describeFloor(fromFloor)}`,
    waypoints: [],
    distanceM: 0,
    seconds: 15,
    steps: [`Enter ${buildingId} on ${describeFloor(fromFloor)}`],
    floorNumber: fromFloor,
  });

  const totalDistanceM = segments.reduce((s, seg) => s + seg.distanceM, 0);
  const totalSeconds = segments.reduce((s, seg) => s + seg.seconds, 0);
  const allSteps = segments.flatMap(seg => seg.steps);

  return { segments, totalDistanceM, totalSeconds, allSteps };
}

function describeFloor(floorNumber: number): string {
  if (floorNumber === 1) return "Ground Floor";
  if (floorNumber === 2) return "2nd Floor";
  if (floorNumber === 3) return "3rd Floor";
  return `${floorNumber}th Floor`;
}
