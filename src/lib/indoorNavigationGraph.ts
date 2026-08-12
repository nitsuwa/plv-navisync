import type {
  NavigationNode, NavigationEdge, FloorPlan, FloorRoom, FloorDoor,
  FloorStairs, FloorRamp, FloorElevatorItem, FloorWall, NavigationNodeType,
} from "../components/map-builder/types";
import { createNavNode, createNavEdge, findNavNodeAtPoint } from "./navigationGraph";
import { genId } from "../components/map-builder/constants";

// ── B5 Phase 2 — Indoor Navigation Authoring Foundation ─────────────────────
// Pure, testable helpers for SINGLE-FLOOR indoor routing authoring inside the
// Floor Editor. The model is the SAME canonical NavigationNode / NavigationEdge
// (stored on Campus.navNodes / navEdges with buildingId + floorId), so nothing
// here invents a parallel indoor path data model. Linked nodes (room / door /
// stair / elevator / ramp) are DERIVED geometry — their x/y always follows the
// physical owner, mirroring the outdoor entrance-linked node philosophy.

/** Floor-scoped view of the campus nav graph. */
export function indoorNavNodes(
  nodes: NavigationNode[] | undefined,
  buildingId: string,
  floorId: string
): NavigationNode[] {
  return (nodes ?? []).filter((n) => n.buildingId === buildingId && n.floorId === floorId);
}

/** Floor-scoped edges — both endpoints must be indoor nodes of this floor. */
export function indoorNavEdges(
  edges: NavigationEdge[] | undefined,
  indoorNodes: NavigationNode[],
  buildingId: string,
  floorId: string
): NavigationEdge[] {
  const ids = new Set(indoorNodes.map((n) => n.id));
  return (edges ?? []).filter(
    (e) => ids.has(e.startNodeId) && ids.has(e.endNodeId)
  );
}

/** Accessibility authoring default per linked-object kind. */
export function indoorNodeAccessibleDefault(type: NavigationNodeType | string): boolean {
  if (type === "stair") return false;    // stairs are not accessible by default
  if (type === "elevator") return true;  // elevators are accessible
  if (type === "ramp") return true;      // ramps are accessible
  return true;                           // free waypoints + rooms default accessible
}

export interface CreateIndoorNodeInput {
  id: string;
  x: number;
  y: number;
  campusId?: string;
  buildingId: string;
  floorId: string;
  name?: string;
  type?: NavigationNodeType;
  /** Linked physical object refs (exactly one is set for a linked node). */
  roomId?: string;
  doorId?: string;
  stairId?: string;
  elevatorId?: string;
  rampId?: string;
  accessible?: boolean;
}

/** Canonical indoor node creation — every authoring surface creates through here. */
export function createIndoorNavNode(input: CreateIndoorNodeInput): NavigationNode {
  // createNavNode stamps the canonical fields; the indoor linked-object refs are
  // NOT part of its return shape, so they must be carried on top of it.
  const base = createNavNode({
    id: input.id,
    x: input.x,
    y: input.y,
    campusId: input.campusId,
    buildingId: input.buildingId,
    floorId: input.floorId,
    name: input.name,
    type: input.type,
    accessible: input.accessible ?? indoorNodeAccessibleDefault(input.type ?? "hallway"),
  });
  return {
    ...base,
    ...(input.roomId ? { roomId: input.roomId } : {}),
    ...(input.doorId ? { doorId: input.doorId } : {}),
    ...(input.stairId ? { stairId: input.stairId } : {}),
    ...(input.elevatorId ? { elevatorId: input.elevatorId } : {}),
    ...(input.rampId ? { rampId: input.rampId } : {}),
  };
}

/** Linked physical object IDs on a node (at most one is expected). */
export function linkedObjectRef(node: NavigationNode): { kind: string; id: string } | null {
  if (node.roomId) return { kind: "room", id: node.roomId };
  if (node.doorId) return { kind: "door", id: node.doorId };
  if (node.stairId) return { kind: "stair", id: node.stairId };
  if (node.elevatorId) return { kind: "elevator", id: node.elevatorId };
  if (node.rampId) return { kind: "ramp", id: node.rampId };
  return null;
}

/** Resolve the stable world position for a linked node from its physical owner. */
export function resolveIndoorLinkedPosition(
  node: NavigationNode,
  floor: Pick<FloorPlan, "rooms" | "doors" | "stairs" | "ramps" | "elevators">
): { x: number; y: number } | null {
  const ref = linkedObjectRef(node);
  if (!ref) return null;
  if (ref.kind === "room") {
    const room = (floor.rooms ?? []).find((r) => r.id === ref.id);
    if (!room) return null;
    // B5 Phase 2.4: the room-linked node's canonical position IS the routing
    // anchor — a deterministic offset from the room center (roomLinkedCuePosition)
    // — so navigation edges terminate at the nav cue, never at the room's
    // centered name label. Label placement stays presentation-only.
    return roomLinkedCuePosition(room);
  }
  if (ref.kind === "door") {
    const door = (floor.doors ?? []).find((d) => d.id === ref.id);
    if (!door) return null;
    return { x: Math.round(door.x), y: Math.round(door.y) };
  }
  if (ref.kind === "stair") {
    const s = (floor.stairs ?? []).find((x) => x.id === ref.id);
    if (!s) return null;
    return { x: Math.round(s.x + s.width / 2), y: Math.round(s.y + s.height / 2) };
  }
  if (ref.kind === "ramp") {
    const r = (floor.ramps ?? []).find((x) => x.id === ref.id);
    if (!r) return null;
    // B5 Phase 2.6: the ramp's LOGICAL routing anchor is the transformed object
    // CENTER — route edges terminate exactly there. The visual "linked" badge
    // may render offset (rampLinkedCuePosition) so it never covers the centered
    // accessibility icon; routing geometry stays centered.
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }
  const el = (floor.elevators ?? []).find((x) => x.id === ref.id);
  if (!el) return null;
  return { x: Math.round(el.x + el.width / 2), y: Math.round(el.y + el.height / 2) };
}

/**
 * B5 Phase 2: linked indoor nodes are DERIVED geometry — recompute every linked
 * node's x/y from its CURRENT physical owner so moves/resizes/rotates keep the
 * graph visually correct without manual repair. Free waypoints are untouched.
 */
export function syncIndoorLinkedNodePositions(
  nodes: NavigationNode[] | undefined,
  floor: Pick<FloorPlan, "rooms" | "doors" | "stairs" | "ramps" | "elevators">
): NavigationNode[] {
  return (nodes ?? []).map((n) => {
    const pos = linkedObjectRef(n) ? resolveIndoorLinkedPosition(n, floor) : null;
    if (!pos) return n;
    if (pos.x === n.x && pos.y === n.y) return n;
    return { ...n, x: pos.x, y: pos.y };
  });
}

/**
 * Remove linked indoor nodes whose physical owner no longer exists, plus every
 * edge connected to a removed node. Returns the pruned graph (nodes + edges).
 */
export function pruneOrphanedIndoorNodes(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  floor: Pick<FloorPlan, "rooms" | "doors" | "stairs" | "ramps" | "elevators">
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const safeNodes = nodes ?? [];
  const safeEdges = edges ?? [];
  const roomIds = new Set((floor.rooms ?? []).map((r) => r.id));
  const doorIds = new Set((floor.doors ?? []).map((d) => d.id));
  const stairIds = new Set((floor.stairs ?? []).map((s) => s.id));
  const rampIds = new Set((floor.ramps ?? []).map((r) => r.id));
  const elevatorIds = new Set((floor.elevators ?? []).map((e) => e.id));
  const orphaned = safeNodes.filter((n) => {
    if (n.roomId) return !roomIds.has(n.roomId);
    if (n.doorId) return !doorIds.has(n.doorId);
    if (n.stairId) return !stairIds.has(n.stairId);
    if (n.rampId) return !rampIds.has(n.rampId);
    if (n.elevatorId) return !elevatorIds.has(n.elevatorId);
    return false;
  });
  if (orphaned.length === 0) return { nodes: safeNodes, edges: safeEdges };
  const orphanIds = new Set(orphaned.map((n) => n.id));
  return {
    nodes: safeNodes.filter((n) => !orphanIds.has(n.id)),
    edges: safeEdges.filter((e) => !orphanIds.has(e.startNodeId) && !orphanIds.has(e.endNodeId)),
  };
}

/** Hover/destination target helpers — the authoring equivalents of the outdoor
 *  entrance target affordance. */

export function findRoomAtPoint(rooms: FloorRoom[] | undefined, point: { x: number; y: number }): FloorRoom | null {
  for (const r of rooms ?? []) {
    if (r.visible === false) continue;
    const inside = point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;
    if (inside) return r;
  }
  return null;
}

export function findDoorAtPoint(doors: FloorDoor[] | undefined, point: { x: number; y: number }, threshold = 14): FloorDoor | null {
  let best: FloorDoor | null = null;
  let bestD = threshold;
  for (const d of doors ?? []) {
    if (d.visible === false) continue;
    const dist = Math.hypot(point.x - d.x, point.y - d.y);
    if (dist <= bestD) { best = d; bestD = dist; }
  }
  return best;
}

export function findCirculationAtPoint(
  stairs: FloorStairs[] | undefined,
  elevators: FloorElevatorItem[] | undefined,
  ramps: FloorRamp[] | undefined,
  point: { x: number; y: number }
): { kind: "stairs" | "elevator" | "ramp"; id: string } | null {
  const items: { kind: "stairs" | "elevator" | "ramp"; id: string; cx: number; cy: number }[] = [
    ...(stairs ?? []).map((s) => ({ kind: "stairs" as const, id: s.id, cx: s.x + s.width / 2, cy: s.y + s.height / 2 })),
    ...(elevators ?? []).map((el) => ({ kind: "elevator" as const, id: el.id, cx: el.x + el.width / 2, cy: el.y + el.height / 2 })),
    ...(ramps ?? []).map((r) => ({ kind: "ramp" as const, id: r.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2 })),
  ];
  let best: typeof items[number] | null = null;
  let bestD = 20;
  for (const item of items) {
    const dist = Math.hypot(point.x - item.cx, point.y - item.cy);
    if (dist <= bestD) { best = item; bestD = dist; }
  }
  return best ? { kind: best.kind, id: best.id } : null;
}

/**
 * B5 Phase 2.3 placement rule: does a FREE Waypoint / Destination placement
 * at `point` land directly on a semantic linked-location object? Those objects
 * have their own Link Location workflow, so free placement there would create
 * duplicate/overlapping concepts. Returns the blocking kind or null.
 *
 * Room rule (deliberately NOT a blanket ban): only the room's semantic target
 * (the center label/link-cue zone) blocks free placement — the interior of a
 * large room remains walkable floor space, so waypoints placed away from the
 * center are allowed. Doors and circulation objects have precise positions and
 * always block.
 */
export function linkedPlacementBlockAt(
  point: { x: number; y: number },
  rooms: FloorRoom[] | undefined,
  doors: FloorDoor[] | undefined,
  stairs: FloorStairs[] | undefined,
  elevators: FloorElevatorItem[] | undefined,
  ramps: FloorRamp[] | undefined
): "room" | "door" | "stairs" | "elevator" | "ramp" | null {
  if (findDoorAtPoint(doors, point)) return "door";
  const circ = findCirculationAtPoint(stairs, elevators, ramps, point);
  if (circ) return circ.kind;
  for (const r of rooms ?? []) {
    if (r.visible === false) continue;
    if (point.x < r.x || point.x > r.x + r.w || point.y < r.y || point.y > r.y + r.h) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const zone = Math.max(8, Math.min(r.w, r.h) * 0.25);
    if (Math.hypot(point.x - cx, point.y - cy) <= zone) return "room";
  }
  return null;
}

/**
 * B5 Phase 2.3 label-occlusion fix: the room-linked navigation cue must NOT sit
 * on top of the room's own name label (which is centered on the room). Returns a
 * stable position slightly above the room center in room-local space, rotated
 * with the room so it follows predictable geometry and stays inside bounds.
 */
export function roomLinkedCuePosition(room: FloorRoom): { x: number; y: number } {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const d = Math.max(6, Math.min(room.h, 30) * 0.35);
  const rad = ((room.rotation ?? 0) * Math.PI) / 180;
  return {
    x: Math.round(cx + Math.sin(rad) * d),
    y: Math.round(cy - Math.cos(rad) * d),
  };
}

/**
 * B5 Phase 2.9: walls are geometry with EFFECTIVE thickness — an authored route
 * must keep this clearance from the wall centerline (beyond the physical
 * thickness) to genuinely occupy WALKABLE floor space. Modest on purpose: it
 * must never block a normal hallway corridor. Perpendicular distance from the
 * wall centerline within `thickness/2 + WALL_ROUTE_CLEARANCE` counts as "in the
 * wall band" for wall-hug detection.
 */
export const WALL_ROUTE_CLEARANCE = 6;

/**
 * B5 Phase 2.9: a linked routing anchor may legitimately sit ON a room/doorway
 * boundary — a crossing within this very short distance of a segment endpoint
 * is treated as endpoint contact (the edge may touch the wall at the anchor
 * itself, but must leave into open floor immediately after). Anything beyond
 * this small radius is a real wall crossing and requires a door opening.
 */
export const WALL_ENDPOINT_TOLERANCE = 4;

/**
 * B5 Phase 2.10: the effective obstacle half-width around a wall centerline —
 * the wall's rendered thickness PLUS the navigation clearance. Walls are NEVER
 * treated as infinitely thin lines: any navigation geometry that enters this
 * band is inside the wall's blocked area (unless a real Door opening is there).
 */
export function wallObstacleRadius(wall: FloorWall): number {
  return wall.thickness / 2 + WALL_ROUTE_CLEARANCE;
}

/** Perpendicular distance from a point to the wall centerline SEGMENT. */
function pointToWallDistance(p: NavPoint, wall: FloorWall): number {
  const ax = wall.x2 - wall.x1;
  const ay = wall.y2 - wall.y1;
  const lenSq = ax * ax + ay * ay;
  if (lenSq === 0) return Math.hypot(p.x - wall.x1, p.y - wall.y1);
  const t = Math.max(0, Math.min(1, ((p.x - wall.x1) * ax + (p.y - wall.y1) * ay) / lenSq));
  return Math.hypot(p.x - (wall.x1 + t * ax), p.y - (wall.y1 + t * ay));
}

/** Projection of a point onto the wall's axis (0 at the wall start, wallLen at the end). */
function pointToWallProjection(p: NavPoint, wall: FloorWall): number {
  const ax = wall.x2 - wall.x1;
  const ay = wall.y2 - wall.y1;
  const len = Math.hypot(ax, ay);
  if (len === 0) return 0;
  return ((p.x - wall.x1) * ax + (p.y - wall.y1) * ay) / len;
}

/** Where a door sits along the wall axis (projection of its position). */
function doorPositionOnWall(door: FloorDoor, wall: FloorWall): number {
  return pointToWallProjection({ x: door.x, y: door.y }, wall);
}

/**
 * Parameter interval along the nav segment a→b that lies inside ONE wall's
 * effective obstacle RECTANGLE (centerline ± wallObstacleRadius, spanning the
 * wall's full length — the wall's end corners are walkable, like walking around
 * a real wall). The obstacle is convex, so the overlap is a single interval;
 * the math is exact for any wall orientation (no sampling). Returns null when
 * the segment never enters the obstacle.
 */
function segmentWallOverlap(
  a: NavPoint,
  b: NavPoint,
  wall: FloorWall
): { t0: number; t1: number } | null {
  const r = wallObstacleRadius(wall);
  const ax = wall.x2 - wall.x1;
  const ay = wall.y2 - wall.y1;
  const wallLen = Math.hypot(ax, ay);
  if (wallLen === 0) return null; // degenerate wall — no blocked area
  const ux = ax / wallLen;
  const uy = ay / wallLen;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Signed perpendicular distance from S(t) to the wall LINE: |c0 + c1·t| ≤ r.
  const c0 = (a.x - wall.x1) * uy - (a.y - wall.y1) * ux;
  const c1 = dx * uy - dy * ux;
  // Projection of S(t) along the wall axis: 0 ≤ p0 + p1·t ≤ wallLen.
  const p0 = (a.x - wall.x1) * ux + (a.y - wall.y1) * uy;
  const p1 = dx * ux + dy * uy;
  let lo = 0;
  let hi = 1;
  if (c1 === 0) {
    if (Math.abs(c0) > r) return null;
  } else {
    const ta = (-r - c0) / c1;
    const tb = (r - c0) / c1;
    lo = Math.max(lo, Math.min(ta, tb));
    hi = Math.min(hi, Math.max(ta, tb));
  }
  if (p1 === 0) {
    if (p0 < 0 || p0 > wallLen) return null;
  } else {
    const ta = -p0 / p1;
    const tb = (wallLen - p0) / p1;
    lo = Math.max(lo, Math.min(ta, tb));
    hi = Math.min(hi, Math.max(ta, tb));
  }
  if (lo > hi) return null;
  return { t0: Math.max(0, lo), t1: Math.min(1, hi) };
}

/** Blocking wall + obstruction point reported to the UI for one segment. */
export interface WallBlock {
  wall: FloorWall;
  x: number;
  y: number;
}

/**
 * B5 Phase 2.10 — ONE authoritative wall-validity primitive. Decides whether a
 * proposed navigation SEGMENT occupies any meaningful portion of a solid wall's
 * effective obstacle (thickness/2 + clearance around the centerline). This is
 * the ONLY wall rule every Connect operation funnels through: automatic preview,
 * automatic L route, detour route, empty-space pinned bend, destination
 * connection, bend drag, segment drag, Add Bend and the final commit. Walls are
 * thick geometry — perpendicular crossings, diagonal cuts, collinear overlap and
 * wall-hugging runs are all caught by the same distance-to-obstacle test.
 *
 * The only legitimate ways through the obstacle:
 *  1. the overlap lies ENTIRELY within an actual Door opening — the exception is
 *     LOCAL to the opening; the rest of the wall stays blocked;
 *  2. anchored endpoint contact (a linked node may sit on a wall/doorway
 *     boundary): the overlap must be localized (no meaningful run ALONG the
 *     wall) and short (the path must leave into open floor at once);
 *  3. passing around a wall END (the effective body ends flat — walking around
 *     the wall corner is legal navigation).
 */
export function segmentBlockedByWall(
  a: NavPoint,
  b: NavPoint,
  wall: FloorWall,
  doors: FloorDoor[] | undefined
): WallBlock | null {
  if (wall.visible === false) return null;
  const ov = segmentWallOverlap(a, b, wall);
  if (!ov) return null;
  const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  const overlapLen = (ov.t1 - ov.t0) * segLen;
  // Projection of the overlap onto the wall axis — how much of the wall the
  // segment covers separates a wall-hug from a localized contact.
  const projAt = (t: number) =>
    pointToWallProjection({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, wall);
  const projMin = Math.min(projAt(ov.t0), projAt(ov.t1));
  const projMax = Math.max(projAt(ov.t0), projAt(ov.t1));
  const axisSpan = projMax - projMin;
  // 1) LOCAL door opening: only the wall portion actually occupied by a Door's
  //    opening is passable — the WHOLE overlap must fit inside one opening.
  const door = (doors ?? []).find((d) => {
    if (d.visible === false) return false;
    if (d.wallId && d.wallId !== wall.id) return false;
    const doorPos = doorPositionOnWall(d, wall);
    return projMin >= doorPos - d.width / 2 && projMax <= doorPos + d.width / 2;
  });
  if (door) return null;
  const anchoredAtA = ov.t0 <= 1e-6;
  const anchoredAtB = ov.t1 >= 1 - 1e-6;
  const localized = axisSpan <= WALL_ENDPOINT_TOLERANCE;
  // 2) Endpoint contact: an anchored overlap is legal only when localized (the
  //    segment does not run ALONG the wall) and short. When the WHOLE segment
  //    sits inside the obstacle both ends are anchored — bounded by the tiny
  //    contact tolerance so a genuinely short on-wall run stays anchor contact.
  if (anchoredAtA && anchoredAtB) {
    if (localized && overlapLen <= WALL_ENDPOINT_TOLERANCE) return null;
  } else if ((anchoredAtA || anchoredAtB) && localized) {
    if (overlapLen <= WALL_ENDPOINT_TOLERANCE + wallObstacleRadius(wall)) return null;
  }
  // 3) Around a wall END: the whole overlap within a short distance of the
  //    wall's start/end is the legitimate walk-around-the-corner passage.
  if (localized && (projMin <= WALL_ENDPOINT_TOLERANCE || projMax >= wallLen - WALL_ENDPOINT_TOLERANCE)) {
    return null;
  }
  const tMid = (ov.t0 + ov.t1) / 2;
  return {
    wall,
    x: Math.round(a.x + (b.x - a.x) * tMid),
    y: Math.round(a.y + (b.y - a.y) * tMid),
  };
}

/**
 * B5 Phase 2.10: thin wrapper over the ONE authoritative wall-validity check —
 * any segment that enters a wall's effective obstacle (crossing, diagonal cut,
 * collinear overlap or wall-hug) without a LOCAL door opening is blocked.
 */
export function edgeCrossesWallWithoutDoor(
  a: { x: number; y: number },
  b: { x: number; y: number },
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined
): WallBlock | null {
  for (const wall of walls ?? []) {
    const blocked = segmentBlockedByWall(a, b, wall, doors);
    if (blocked) return blocked;
  }
  return null;
}

/**
 * B5 Phase 2.10: does a POINT (a pinned bend, a dragged bend, an Add Bend
 * midpoint) sit inside a solid wall's effective obstacle? Bends may never
 * settle inside/on a wall body or its clearance band — the local Door opening
 * is the only exception (physically a doorway is open floor).
 */
export function pointInsideWallObstacle(
  point: NavPoint,
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined
): FloorWall | null {
  for (const wall of walls ?? []) {
    if (wall.visible === false) continue;
    const ax = wall.x2 - wall.x1;
    const ay = wall.y2 - wall.y1;
    const wallLen = Math.hypot(ax, ay);
    const r = wallObstacleRadius(wall);
    if (wallLen === 0) {
      // Degenerate wall — treat as a point obstacle.
      if (pointToWallDistance(point, wall) > r) continue;
      return wall;
    }
    const ux = ax / wallLen;
    const uy = ay / wallLen;
    // Same rectangle semantics as the segment check: within the perpendicular
    // band AND within the wall's span (its end corners are walkable).
    const perp = Math.abs((point.x - wall.x1) * uy - (point.y - wall.y1) * ux);
    const proj = (point.x - wall.x1) * ux + (point.y - wall.y1) * uy;
    if (perp > r || proj < 0 || proj > wallLen) continue;
    const inDoor = (doors ?? []).some((d) => {
      if (d.visible === false) return false;
      if (d.wallId && d.wallId !== wall.id) return false;
      const doorPos = doorPositionOnWall(d, wall);
      return proj >= doorPos - d.width / 2 && proj <= doorPos + d.width / 2;
    });
    if (inDoor) continue;
    return wall;
  }
  return null;
}

/** Find a single nav node near a point (re-exported for FloorEditor use). */
export { findNavNodeAtPoint, createNavEdge, genId };

// ── B5 Phase 2.5 — Segmented (orthogonal) path geometry ────────────────────
// Indoor navigation edges may carry optional bend/control points so routes stay
// axis-aligned through rectangular hallways. Bends are pure geometry — routing
// endpoints remain startNodeId/endNodeId — and are persisted through the edge's
// metadata JSON. Legacy straight edges (no bendPoints) are untouched.

export interface NavPoint {
  x: number;
  y: number;
}

/**
 * Full polyline for an edge: start → authored bends → end. Endpoint coordinates
 * are resolved from the CURRENT nodes so edges always follow node movement;
 * authored bends are absolute floor coordinates and remain stable. Returns null
 * when either endpoint is missing.
 */
export function edgePolylinePoints(
  edge: Pick<NavigationEdge, "startNodeId" | "endNodeId" | "bendPoints">,
  nodes: Pick<NavigationNode, "id" | "x" | "y">[]
): NavPoint[] | null {
  const a = nodes.find((n) => n.id === edge.startNodeId);
  const b = nodes.find((n) => n.id === edge.endNodeId);
  if (!a || !b) return null;
  return [
    { x: a.x, y: a.y },
    ...(edge.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
    { x: b.x, y: b.y },
  ];
}

/** Total polyline length (sum of segment lengths), rounded to world units. */
export function navEdgePolylineDistance(points: NavPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return Math.round(total);
}

/** Point at the half-distance along a polyline (arrow anchors / add-bend). */
export function navEdgeMidpoint(points: NavPoint[]): NavPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const total = navEdgePolylineDistance(points);
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (target <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : target / seg;
      return {
        x: Math.round(points[i - 1].x + (points[i].x - points[i - 1].x) * t),
        y: Math.round(points[i - 1].y + (points[i].y - points[i - 1].y) * t),
      };
    }
    target -= seg;
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

/**
 * Wall-crossing safety across EVERY segment of a polyline — a segmented path
 * that routes AROUND a wall is allowed; any single segment crossing a wall
 * without a door opening blocks the whole path. Returns the first blocked
 * crossing (reused by Connect + bend editing for consistent guidance).
 */
export function edgePolylineCrossesWallWithoutDoor(
  points: NavPoint[],
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined
): { wall: FloorWall; x: number; y: number } | null {
  for (let i = 1; i < points.length; i++) {
    const blocked = edgeCrossesWallWithoutDoor(points[i - 1], points[i], walls, doors);
    if (blocked) return blocked;
  }
  return null;
}

/**
 * B5 Phase 2.11: LIVE validity of an EXISTING authored edge — the same strict
 * thick-wall model as Connect creation, evaluated against the CURRENT node
 * positions and authored bendPoints. An authored edge is never assumed valid
 * forever: Remove Bend, bend/segment drags, Straighten and node movement can
 * all invalidate it, and this derived check (no persisted field, no migration)
 * is what marks it red in the editor and will gate future routing/publish code.
 * Returns false for a straight edge too when its direct line crosses a wall.
 */
export function navEdgeIsBlocked(
  edge: Pick<NavigationEdge, "startNodeId" | "endNodeId" | "bendPoints">,
  nodes: Pick<NavigationNode, "id" | "x" | "y">[],
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined
): boolean {
  const pts = edgePolylinePoints(edge, nodes);
  if (!pts || pts.length < 2) return false;
  return edgePolylineCrossesWallWithoutDoor(pts, walls, doors) !== null;
}

/**
 * B5 Phase 2.9: when the START anchor lies on/near wall geometry, report which
 * candidate's FIRST segment leaves the wall PERPENDICULARLY into open floor —
 * a horizontal wall is escaped vertically ('v'), a vertical wall horizontally
 * ('h'). This is how the route "leaves the wall boundary first, then turns
 * toward its destination" instead of running along the wall. The "which side
 * is open" question is resolved by L-candidate wall validation: the vertical
 * exit can only stay valid when the side it heads toward is genuinely open
 * (or a door/anchor crossing is legal), so the rejected candidate can never
 * win. Returns null when the anchor is not near any axis-aligned wall.
 */
function wallExitPreference(
  p: NavPoint,
  walls: FloorWall[] | undefined
): "h" | "v" | null {
  let nearest: { axis: "h" | "v"; dist: number } | null = null;
  for (const wall of walls ?? []) {
    if (wall.visible === false) continue;
    const horizontal = wall.y1 === wall.y2;
    const vertical = wall.x1 === wall.x2;
    if (!horizontal && !vertical) continue;
    const perp = horizontal ? Math.abs(p.y - wall.y1) : Math.abs(p.x - wall.x1);
    if (perp > wall.thickness / 2 + WALL_ROUTE_CLEARANCE) continue;
    if (!nearest || perp < nearest.dist) nearest = { axis: horizontal ? "v" : "h", dist: perp };
  }
  return nearest?.axis ?? null;
}

/**
 * Candidate orthogonal bends for a new indoor edge A→B. Prefers a single 90°
 * L-shape (horizontal-then-vertical, then vertical-then-horizontal) so routes
 * follow hallways; when the nodes are already axis-aligned no bend is needed.
 * A candidate is only returned when its segments are wall-safe — including
 * B5 Phase 2.8 wall-hug rejection, so a linked node on a wall edge naturally
 * leaves toward the WALKABLE side (the L that runs along the wall is rejected).
 *
 * B5 Phase 2.9: when BOTH candidates are safe, the wall-exit preference still
 * picks the one whose first segment leaves a wall-side anchor perpendicularly
 * — the connector NEVER wins by running along a wall just because that L is
 * shorter. Wall validity (clearance + crossing + endpoint contact) is checked
 * on every candidate and every detour segment.
 *
 * When BOTH simple L candidates are blocked, tries a small deterministic
 * orthogonal detour (2-bend U-shapes on each side of the bounding box) before
 * giving up. Returns [] only when no safe orthogonal geometry exists — the
 * caller then reports the wall crossing instead of drawing through a wall.
 *
 * B5 Phase 2.10: when `bounds` (the floor canvas) is provided, a detour whose
 * geometry leaves the floor is never generated — "around the wall" must stay
 * inside walkable floor space (a full-height wall therefore rejects cleanly).
 */
export function orthogonalBendsFor(
  a: NavPoint,
  b: NavPoint,
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined,
  bounds?: { width: number; height: number }
): NavPoint[] {
  if (a.x === b.x || a.y === b.y) return [];
  const cornerH = { x: b.x, y: a.y }; // A ────┐ → B
  const cornerV = { x: a.x, y: b.y }; // A ─┐ then down to B
  const safe = (c: NavPoint) => !edgePolylineCrossesWallWithoutDoor([a, c, b], walls, doors);
  const hSafe = safe(cornerH);
  const vSafe = safe(cornerV);
  if (hSafe && vSafe) {
    // B5 Phase 2.9: both are geometrically valid — prefer the perpendicular
    // wall exit so the first automatic segment leaves a wall-side anchor into
    // open floor instead of gliding along the wall. Deterministic tie-break.
    const exit = wallExitPreference(a, walls);
    if (exit === "v") return [cornerV];
    if (exit === "h") return [cornerH];
    return [cornerH];
  }
  if (hSafe) return [cornerH];
  if (vSafe) return [cornerV];
  // Both L candidates blocked — deterministic orthogonal detour around the wall.
  const offset = Math.max(16, Math.round((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 2));
  const inBounds = (p: NavPoint) =>
    !bounds || (p.x >= 0 && p.x <= bounds.width && p.y >= 0 && p.y <= bounds.height);
  const detours: NavPoint[][] = [
    [{ x: a.x + offset, y: a.y }, { x: a.x + offset, y: b.y }],
    [{ x: a.x - offset, y: a.y }, { x: a.x - offset, y: b.y }],
    [{ x: a.x, y: a.y + offset }, { x: b.x, y: a.y + offset }],
    [{ x: a.x, y: a.y - offset }, { x: b.x, y: a.y - offset }],
  ];
  for (const detour of detours) {
    if (!detour.every(inBounds)) continue;
    if (!edgePolylineCrossesWallWithoutDoor([a, ...detour, b], walls, doors)) return detour;
  }
  return [];
}

/**
 * B5 Phase 2.8: normalize an authored orthogonal polyline's bend list after a
 * committed edit — remove duplicate consecutive points, zero-length segments,
 * and three consecutive collinear points (A─B─C on the same axis drops B).
 * Intentional corners are never removed.
 */
export function normalizeBendPoints(bends: NavPoint[]): NavPoint[] {
  if (bends.length < 2) return bends;
  const out: NavPoint[] = [];
  for (const p of bends) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last && p.x === last.x && p.y === last.y) continue; // duplicate / zero-length
    // Drop a collinear middle point while the last two + p share an axis.
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (!collinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * B5 Phase 2.8: translate ONE segment of an orthogonal polyline perpendicular
 * to itself, computed from the IMMUTABLE drag-start snapshot (origPts /
 * origBends) so geometry is always original + current delta — never compounded
 * on already-modified bends, and never growing new bends per pointermove.
 *
 * Interior segments: both endpoint bends translate together (bend count
 * unchanged). Boundary segments: the single adjacent bend translates and AT
 * MOST one corner bend is derived from the drag-start topology so the fixed
 * node endpoint stays connected orthogonally.
 */
export function translateOrthogonalSegment(
  origPts: NavPoint[],
  origBends: NavPoint[],
  segIndex: number,
  delta: number,
  isHorizontal: boolean
): NavPoint[] {
  if (origBends.length === 0 || segIndex < 0 || segIndex >= origPts.length - 1) return origBends;
  const first = segIndex === 0;
  const last = segIndex === origPts.length - 2;
  const perp = (pt: NavPoint): NavPoint =>
    isHorizontal ? { x: pt.x, y: pt.y + delta } : { x: pt.x + delta, y: pt.y };
  if (first || last) {
    // Boundary: one endpoint is a fixed NODE — move the adjacent bend, insert
    // exactly one corner (from the snapshot) to reconnect the node.
    const nodePos = first ? origPts[0] : origPts[origPts.length - 1];
    const moved = first ? origPts[1] : origPts[origPts.length - 2];
    const bendIndex = first ? 0 : origBends.length - 1;
    const movedNext = perp(moved);
    const corner = isHorizontal
      ? { x: nodePos.x, y: movedNext.y }
      : { x: movedNext.x, y: nodePos.y };
    const arr = origBends.map((bp, i) => (i === bendIndex ? movedNext : bp));
    return first ? [corner, ...arr] : [...arr, corner];
  }
  // Interior: both segment endpoints are bends (polyline index i ↔ bend i-1).
  const bi0 = segIndex - 1;
  const bi1 = segIndex;
  return origBends.map((bp, i) => (i === bi0 || i === bi1) ? perp(bp) : bp);
}

/** Alignment-guide line rendered while snapping a node/bend drag. */
export interface NavAlignGuide {
  type: "h" | "v";
  pos: number;
}

/**
 * B5 Phase 2.8: always-on alignment assistance (replaces the Phase 2.7 Shift
 * snap). When a dragged free waypoint/destination (or bend) target comes within
 * `threshold` of another routing node's X or Y, snap to it and report the guide
 * line(s) to draw. Returns the corrected target + guides (empty when far away).
 */
export function navAlignSnap(
  target: NavPoint,
  others: { x: number; y: number }[],
  threshold = 8
): { x: number; y: number; guides: NavAlignGuide[] } {
  let bestX: { d: number; pos: number } | null = null;
  let bestY: { d: number; pos: number } | null = null;
  for (const o of others) {
    const dx = Math.abs(o.x - target.x);
    if (dx <= threshold && (!bestX || dx < bestX.d)) bestX = { d: dx, pos: o.x };
    const dy = Math.abs(o.y - target.y);
    if (dy <= threshold && (!bestY || dy < bestY.d)) bestY = { d: dy, pos: o.y };
  }
  const guides: NavAlignGuide[] = [];
  let x = target.x;
  let y = target.y;
  if (bestX) {
    x = bestX.pos;
    guides.push({ type: "v", pos: bestX.pos });
  }
  if (bestY) {
    y = bestY.pos;
    guides.push({ type: "h", pos: bestY.pos });
  }
  return { x, y, guides };
}

/**
 * B5 Phase 2.8: group-drag alignment — snap a rigid group of free nodes so its
 * bbox edges/center align with another routing node's X or Y. Returns the
 * adjusted group delta + guide lines.
 */
export function navGroupAlignSnap(
  bbox: { minX: number; minY: number; width: number; height: number },
  dx: number,
  dy: number,
  others: { x: number; y: number }[],
  threshold = 8
): { dx: number; dy: number; guides: NavAlignGuide[] } {
  const minX = bbox.minX + dx;
  const maxX = bbox.minX + bbox.width + dx;
  const centerX = (minX + maxX) / 2;
  const minY = bbox.minY + dy;
  const maxY = bbox.minY + bbox.height + dy;
  const centerY = (minY + maxY) / 2;
  let bestX: { d: number; pos: number } | null = null;
  let bestY: { d: number; pos: number } | null = null;
  for (const o of others) {
    for (const pos of [minX, maxX, centerX]) {
      const d = Math.abs(o.x - pos);
      if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, pos: o.x };
    }
    for (const pos of [minY, maxY, centerY]) {
      const d = Math.abs(o.y - pos);
      if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, pos: o.y };
    }
  }
  const guides: NavAlignGuide[] = [];
  let ndx = dx;
  let ndy = dy;
  if (bestX) {
    ndx += bestX.pos - minX;
    guides.push({ type: "v", pos: bestX.pos });
  }
  if (bestY) {
    ndy += bestY.pos - minY;
    guides.push({ type: "h", pos: bestY.pos });
  }
  return { dx: ndx, dy: ndy, guides };
}

/**
 * B5 Phase 2.6: the ramp-linked VISUAL badge position — a small connected cue
 * near the top-right corner of the footprint. The logical NavigationNode stays
 * at the ramp CENTER (routing anchor); the badge may offset for readability so
 * it never covers the centered white accessibility icon.
 */
export function rampLinkedCuePosition(ramp: Pick<FloorRamp, "x" | "y" | "width" | "height">): { x: number; y: number } {
  return {
    x: Math.round(ramp.x + ramp.width - 4),
    y: Math.round(ramp.y + 4),
  };
}

/**
 * Remap an indoor nav graph for a duplicated floor. Every node/edge gets a new
 * ID, floorId points at the copy, and linked physical-object refs are remapped
 * through the old→new id maps produced by the floor duplication (room/door/
 * stair/elevator/ramp). Returns the remapped campus-level graph.
 */
export function remapIndoorNavForFloorCopy(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  sourceFloorId: string,
  copyFloorId: string,
  idMaps: {
    rooms: Map<string, string>;
    doors: Map<string, string>;
    stairs: Map<string, string>;
    elevators: Map<string, string>;
    ramps: Map<string, string>;
  }
): { navNodes: NavigationNode[]; navEdges: NavigationEdge[] } {
  const sourceNodes = (nodes ?? []).filter((n) => n.floorId === sourceFloorId);
  const idMap = new Map<string, string>();
  const remappedNodes: NavigationNode[] = [];
  for (const n of sourceNodes) {
    const newId = genId("nn");
    idMap.set(n.id, newId);
    const remapped: NavigationNode = {
      ...n,
      id: newId,
      floorId: copyFloorId,
      roomId: n.roomId ? idMaps.rooms.get(n.roomId) : undefined,
      doorId: n.doorId ? idMaps.doors.get(n.doorId) : undefined,
      stairId: n.stairId ? idMaps.stairs.get(n.stairId) : undefined,
      elevatorId: n.elevatorId ? idMaps.elevators.get(n.elevatorId) : undefined,
      rampId: n.rampId ? idMaps.ramps.get(n.rampId) : undefined,
    };
    remappedNodes.push(remapped);
  }
  const remappedEdges = (edges ?? [])
    .filter((e) => idMap.has(e.startNodeId) && idMap.has(e.endNodeId))
    .map((e) => ({
      ...e,
      id: genId("ne"),
      startNodeId: idMap.get(e.startNodeId)!,
      endNodeId: idMap.get(e.endNodeId)!,
    }));
  return { navNodes: remappedNodes, navEdges: remappedEdges };
}
