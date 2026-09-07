import type {
  Campus, NavigationNode, NavigationEdge, FloorPlan, FloorRoom, FloorDoor,
  FloorStairs, FloorRamp, FloorElevatorItem, FloorWall, NavigationNodeType, StairDirection,
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
  /** Shared circulation identity copied onto transition-capable nodes. */
  transitionSharedId?: string;
  /** Building-owned Entrance relationship for generated Ground-floor Doors. */
  buildingEntranceId?: string;
  accessible?: boolean;
  emergencySafe?: boolean;
  emergencyStair?: boolean;
  exteriorEmergencyStairId?: string;
  pathJunction?: boolean;
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
    ...(input.transitionSharedId ? { transitionSharedId: input.transitionSharedId } : {}),
    ...(input.buildingEntranceId ? { buildingEntranceId: input.buildingEntranceId } : {}),
    ...(input.emergencySafe !== undefined ? { emergencySafe: input.emergencySafe } : {}),
    ...(input.emergencyStair ? { emergencyStair: true } : {}),
    ...(input.exteriorEmergencyStairId ? { exteriorEmergencyStairId: input.exteriorEmergencyStairId } : {}),
    ...(input.pathJunction ? { pathJunction: true } : {}),
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

/**
 * Resolve a Stair's physical floor-entry anchor in its local frame, then carry
 * it through the object's rotation. The access point is intentionally neutral:
 * it is centred on the floor-facing edge, independent of Entry Side and
 * Direction. A Stair occurrence has one canonical node, so its location must
 * remain stable while traversal semantics and the artwork change.
 */
export function stairEntryPosition(
  stair: Pick<FloorStairs, "x" | "y" | "width" | "height" | "rotation" | "flip">
    & { direction?: StairDirection }
): { x: number; y: number } {
  const cx = stair.x + stair.width / 2;
  const cy = stair.y + stair.height / 2;
  // Keep the anchor aligned with the actual flight center rather than the
  // footprint center. This is the physical point where a local Walking Path
  // reaches the Stair. `flip` is retained for persistence compatibility but is
  // now intentionally only a horizontal entry-side mirror (Left ↔ Right).
  // Keep one neutral access point at the centre of the floor-facing edge,
  // rather than inside a flight. `flip` and `direction` remain presentation
  // and routing metadata; neither may move this canonical semantic node.
  const localX = cx;
  const localY = stair.y + stair.height;
  const rotation = ((stair.rotation ?? 0) * Math.PI) / 180;
  const dx = localX - cx;
  const dy = localY - cy;
  return {
    x: Math.round(cx + dx * Math.cos(rotation) - dy * Math.sin(rotation)),
    y: Math.round(cy + dx * Math.sin(rotation) + dy * Math.cos(rotation)),
  };
}

/**
 * Resolve the stable local access anchor for an Elevator occurrence.  Like a
 * Stair, an Elevator has one canonical navigation node; keep it at the centre
 * of the floor-facing edge so the local Walking Network reaches the entrance
 * rather than the middle of the shaft.  Rotation is presentation metadata and
 * does not change node identity.
 */
export function elevatorEntryPosition(
  elevator: Pick<FloorElevatorItem, "x" | "y" | "width" | "height" | "rotation">
): { x: number; y: number } {
  const cx = elevator.x + elevator.width / 2;
  const cy = elevator.y + elevator.height / 2;
  const localX = cx;
  const localY = elevator.y + elevator.height;
  const rotation = ((elevator.rotation ?? 0) * Math.PI) / 180;
  const dx = localX - cx;
  const dy = localY - cy;
  return {
    x: Math.round(cx + dx * Math.cos(rotation) - dy * Math.sin(rotation)),
    y: Math.round(cy + dx * Math.sin(rotation) + dy * Math.cos(rotation)),
  };
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
    return stairEntryPosition(s);
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
  return elevatorEntryPosition(el);
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
    const ref = linkedObjectRef(n);
    // Building-owned Exterior Emergency Stairs are positioned from their
    // perimeter attachment by the exterior-stair synchronizer.  Do not move
    // their canonical node to the ordinary indoor stair entry anchor when a
    // floor edit commits; doing so would detach the landing from the building
    // side until the next full hydration.
    if (ref?.kind === "stair") {
      const stair = (floor.stairs ?? []).find((item) => item.id === ref.id);
      if (stair?.exteriorEmergencyStairId) {
        const transitionSharedId = stair.sharedId;
        if (transitionSharedId === n.transitionSharedId) return n;
        return transitionSharedId ? { ...n, transitionSharedId } : n;
      }
    }
    const pos = ref ? resolveIndoorLinkedPosition(n, floor) : null;
    if (!pos) return n;
    let transitionSharedId: string | undefined;
    if (ref?.kind === "stair") transitionSharedId = (floor.stairs ?? []).find((item) => item.id === ref.id)?.sharedId;
    if (ref?.kind === "elevator") transitionSharedId = (floor.elevators ?? []).find((item) => item.id === ref.id)?.sharedId;
    const samePosition = pos.x === n.x && pos.y === n.y;
    const sameTransitionIdentity = transitionSharedId === n.transitionSharedId;
    if (samePosition && sameTransitionIdentity) return n;
    const next = { ...n, x: pos.x, y: pos.y };
    if (transitionSharedId) next.transitionSharedId = transitionSharedId;
    else delete next.transitionSharedId;
    return next;
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
  const items: { kind: "stairs" | "elevator" | "ramp"; id: string; cx: number; cy: number; entry?: { x: number; y: number } }[] = [
    ...(stairs ?? []).map((s) => ({ kind: "stairs" as const, id: s.id, cx: s.x + s.width / 2, cy: s.y + s.height / 2, entry: stairEntryPosition(s) })),
    ...(elevators ?? []).map((el) => ({ kind: "elevator" as const, id: el.id, cx: el.x + el.width / 2, cy: el.y + el.height / 2, entry: elevatorEntryPosition(el) })),
    ...(ramps ?? []).map((r) => ({ kind: "ramp" as const, id: r.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2 })),
  ];
  let best: typeof items[number] | null = null;
  let bestD = 20;
  for (const item of items) {
    const centerDist = Math.hypot(point.x - item.cx, point.y - item.cy);
    // A linked Stair is authored from its floor-facing entry edge. Keep the
    // existing center hit target, but also recognize that semantic entry point
    // so larger/resized stairs still resolve to the same canonical owner.
    const entryDist = item.entry ? Math.hypot(point.x - item.entry.x, point.y - item.entry.y) : Number.POSITIVE_INFINITY;
    const dist = Math.min(centerDist, entryDist);
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
 * Stable editor-facing name for a Room.  Custom names remain optional in the
 * editor, but validation and navigation UI must never fall back to an internal
 * UUID (or an empty string).  The ordinal is floor-local and display-only.
 */
export function roomDisplayName(room: Pick<FloorRoom, "name">, ordinal?: number): string {
  const name = typeof room.name === "string" ? room.name.trim() : "";
  if (name) return name;
  return ordinal !== undefined ? `Room ${ordinal + 1}` : "Room";
}

/**
 * A Room↔Door relationship is physical authoring metadata, not coordinate
 * proximity.  Prefer the existing wall endpoint→Room anchors; for legacy
 * floors without endpoint anchors, accept only a Door whose current wall
 * position lies on the Room boundary (with a small editing tolerance).
 */
export function roomDoorIsValid(
  room: FloorRoom | undefined,
  door: FloorDoor | undefined,
  walls: FloorWall[] | undefined,
): boolean {
  if (!room || !door || door.visible === false || !door.wallId) return false;
  const wall = (walls ?? []).find((candidate) => candidate.id === door.wallId);
  if (!wall || wall.visible === false) return false;
  // Explicit endpoint anchors are authoritative for the low-level relationship
  // helper. Shared-boundary handling belongs to the higher-level eligibility
  // helper, which has the complete Room set available to prove the boundary is
  // genuinely shared rather than merely nearby.
  if (wall.startAnchor || wall.endAnchor) return wall.startAnchor?.roomId === room.id || wall.endAnchor?.roomId === room.id;

  return roomDoorBoundaryContains(room, door);
}

function roomDoorBoundaryContains(room: FloorRoom, door: FloorDoor): boolean {

  // Legacy fallback: compare the Door's world position with the rotated Room
  // boundary.  This remains deliberately local; a Door elsewhere on the floor
  // cannot be linked merely because it shares a floor/building.
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const angle = -((room.rotation ?? 0) * Math.PI) / 180;
  const dx = door.x - cx;
  const dy = door.y - cy;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  const halfW = room.w / 2;
  const halfH = room.h / 2;
  const tolerance = Math.max(8, Math.min(door.width / 2 + 6, 18));
  const onVerticalEdge = Math.abs(Math.abs(localX) - halfW) <= tolerance && Math.abs(localY) <= halfH + tolerance;
  const onHorizontalEdge = Math.abs(Math.abs(localY) - halfH) <= tolerance && Math.abs(localX) <= halfW + tolerance;
  return onVerticalEdge || onHorizontalEdge;
}

/**
 * Single source of truth for Room → Door authoring and readiness eligibility.
 * Physical association, same-floor navigation identity, visibility, and
 * optional duplicate exclusion all live here so target cues, click commits,
 * validation, and semantic-edge reconciliation cannot drift apart.
 */
export function isDoorEligibleForRoom(
  room: FloorRoom | undefined,
  door: FloorDoor | undefined,
  walls: FloorWall[] | undefined,
  nodes: NavigationNode[] | undefined,
  options?: { excludeDoorIds?: Iterable<string>; rooms?: FloorRoom[] },
): boolean {
  if (!room || !door) return false;
  const wall = (walls ?? []).find((candidate) => candidate.id === door.wallId);
  const physicallyValid = roomDoorIsValid(room, door, walls) || Boolean(
    wall && (wall.startAnchor || wall.endAnchor)
      && (options?.rooms ?? []).some((candidate) => candidate.id !== room.id && roomDoorIsValid(candidate, door, walls))
      && roomDoorBoundaryContains(room, door),
  );
  if (!physicallyValid) return false;
  const excluded = options?.excludeDoorIds ? new Set(options.excludeDoorIds) : undefined;
  if (excluded?.has(door.id)) return false;
  const doorNode = (nodes ?? []).find((node) => node.doorId === door.id);
  if (!doorNode) return false;
  if (doorNode.buildingId !== room.buildingId || doorNode.floorId !== room.floorId) return false;
  return true;
}

/** Return the deduplicated Room access Doors while preserving legacy primary order. */
export function roomAccessDoorIds(room: Pick<FloorRoom, "accessDoorId" | "accessDoorIds"> | undefined): string[] {
  if (!room) return [];
  return Array.from(new Set([
    ...(room.accessDoorId ? [room.accessDoorId] : []),
    ...(Array.isArray(room.accessDoorIds) ? room.accessDoorIds : []),
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
}

/** Stable type for the semantic Room↔Door bridge edge. */
export const ROOM_DOOR_EDGE_TYPE = "room_door_transition";

/**
 * Reconcile semantic Room↔Door bridge edges from the persisted physical
 * relationship.  These edges are bidirectional graph links used to resolve a
 * Room destination through its Door; they are not ordinary indoor walking
 * connections and are therefore excluded from Door readiness validation.
 */
export function reconcileRoomDoorEdges(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  rooms: FloorRoom[] | undefined,
  doors: FloorDoor[] | undefined,
  walls: FloorWall[] | undefined,
): NavigationEdge[] {
  const safeNodes = nodes ?? [];
  const retained = (edges ?? []).filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE);
  const next = [...retained];
  for (const room of rooms ?? []) {
    const roomNode = safeNodes.find((node) => node.roomId === room.id);
    if (!roomNode) continue;
    for (const doorId of roomAccessDoorIds(room)) {
      const door = (doors ?? []).find((candidate) => candidate.id === doorId);
      if (!isDoorEligibleForRoom(room, door, walls, safeNodes, { rooms: rooms ?? [] })) continue;
      const doorNode = safeNodes.find((node) => node.doorId === doorId);
      if (!doorNode || roomNode.id === doorNode.id) continue;
      const exists = next.some((edge) =>
        (edge.startNodeId === roomNode.id && edge.endNodeId === doorNode.id)
        || (edge.startNodeId === doorNode.id && edge.endNodeId === roomNode.id),
      );
      if (exists) continue;
      next.push(createNavEdge({
        id: genId("ne"),
        startNodeId: roomNode.id,
        endNodeId: doorNode.id,
        nodes: safeNodes,
        type: ROOM_DOOR_EDGE_TYPE,
      }));
    }
  }
  return next;
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
  edge: Pick<NavigationEdge, "startNodeId" | "endNodeId" | "bendPoints"> & { type?: string },
  nodes: Pick<NavigationNode, "id" | "x" | "y">[],
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined
): boolean {
  // Room↔Door is a semantic destination/access relationship, not a physical
  // Walking Path.  It must remain in the canonical graph but is not validated
  // as a traversable floor segment.
  if (edge.type === ROOM_DOOR_EDGE_TYPE) return false;
  const pts = edgePolylinePoints(edge, nodes);
  if (!pts || pts.length < 2) return false;
  return edgePolylineCrossesWallWithoutDoor(pts, walls, doors) !== null;
}

// ── B5 Phase 6.10 + placement-reality fix — Indoor blocking furniture ───────
// EVERY placed furniture object physically occupies floor space, so ANY
// visible furniture piece (chair, bench, sofa, desk, table, cabinet,
// bookshelf, workstation, plant…) blocks navigation routing. This is what
// turns an edge red the moment you place a furniture item on top of it in the
// Floor Editor Navigation tab — and clears the moment it moves away.

/** B5 Phase 6.10: true when an edge's polyline intersects a furniture object's
 *  footprint. Checks every segment of the polyline against the rotated
 *  footprint of each visible furniture piece. Door-linked nodes that sit on a
 *  wall boundary are exempt (the existing wall-crossing model handles that). */
export function edgeCrossesBlockingFurniture(
  points: NavPoint[],
  furniture: Array<{ x: number; y: number; width: number; height: number; type: string; rotation?: number; visible?: boolean }> | undefined
): boolean {
  const blockers = (furniture ?? []).filter((f) => f.visible !== false);
  if (blockers.length === 0) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // Sample interior points along the segment (skip endpoints — a linked
    // node may legitimately sit inside a room that contains furniture).
    for (let t = 0.1; t <= 0.9; t += 0.2) {
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      for (const fb of blockers) {
        const rad = (-(fb.rotation ?? 0) * Math.PI) / 180;
        const cx = fb.x + fb.width / 2;
        const cy = fb.y + fb.height / 2;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = px - cx;
        const dy = py - cy;
        const ux = dx * cos - dy * sin;
        const uy = dx * sin + dy * cos;
        const halfW = fb.width / 2;
        const halfH = fb.height / 2;
        if (ux >= -halfW && ux <= halfW && uy >= -halfH && uy <= halfH) {
          return true;
        }
      }
    }
  }
  return false;
}

/** B5 Phase 6.10: extended edge-blocked check — wall crossing OR blocking
 *  furniture intersection. */
export function navEdgeIsBlockedExtended(
  edge: Pick<NavigationEdge, "startNodeId" | "endNodeId" | "bendPoints"> & { type?: string },
  nodes: Pick<NavigationNode, "id" | "x" | "y">[],
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined,
  furniture: Array<{ x: number; y: number; width: number; height: number; type: string; rotation?: number; visible?: boolean }> | undefined
): boolean {
  if (edge.type === ROOM_DOOR_EDGE_TYPE) return false;
  const pts = edgePolylinePoints(edge, nodes);
  if (!pts || pts.length < 2) return false;
  if (edgePolylineCrossesWallWithoutDoor(pts, walls, doors) !== null) return true;
  return edgeCrossesBlockingFurniture(pts, furniture);
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
 *
 * B5 Phase 6.8: also drops NEAR-duplicate consecutive points (within `eps`
 * world units) so Connect can never leave two almost-overlapping bend handles
 * around one corner (e.g. a manually pinned corner plus a regenerated auto-L
 * corner). The collinear pass stays exact so a legitimate turn is never lost.
 */
export function normalizeBendPoints(bends: NavPoint[], eps = 2): NavPoint[] {
  if (bends.length < 2) return bends;
  const out: NavPoint[] = [];
  for (const p of bends) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last && Math.abs(p.x - last.x) <= eps && Math.abs(p.y - last.y) <= eps) continue; // duplicate / near-duplicate / zero-length
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

/** Canonicalize authored edge geometry and remove duplicate semantic edges.
 *
 * `splitNodeIds` is intentionally explicit: merely placing a node on top of
 * an existing segment must not silently delete a valid edge.  Only an
 * authoring operation that actually split an edge may retire the old direct
 * segment.
 */
export function normalizeNavigationEdges(
  edges: NavigationEdge[],
  nodes: NavigationNode[],
  eps = 2,
  options?: { splitNodeIds?: Set<string> },
): NavigationEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const result: NavigationEdge[] = [];
  for (const edge of edges) {
    const a = nodeMap.get(edge.startNodeId);
    const b = nodeMap.get(edge.endNodeId);
    if (!a || !b) continue;
    // Only ordinary same-floor authored Walking Paths participate in this
    // duplicate/split normalization. Semantic bridges, floor transitions,
    // and pathway-generated edges retain their independent provenance.
    const manualPath = (edge.type === "hallway" || edge.type === "walkway")
      && !edge.generatedFromPathIds
      && ((!a.floorId && !b.floorId) || (!!a.floorId && !!b.floorId && a.floorId === b.floorId));
    // A same-endpoint pair is only an accidental duplicate when its authored
    // routing semantics and geometry also match.  Keep legitimate parallel
    // paths that differ in direction, accessibility/emergency availability,
    // closure, width, bends, or explicit junction provenance.  For
    // bidirectional edges, canonicalize the bend orientation alongside the
    // endpoint order so the same path authored in reverse is still recognized.
    const key = manualPath
      ? (() => {
        const bidirectional = edge.bidirectional !== false;
        const ordered = bidirectional
          ? [edge.startNodeId, edge.endNodeId].sort()
          : [edge.startNodeId, edge.endNodeId];
        const reverse = bidirectional && ordered[0] !== edge.startNodeId;
        const bends = (edge.bendPoints ?? []).map((point) => [
          Math.round(point.x * 1000) / 1000,
          Math.round(point.y * 1000) / 1000,
        ]);
        if (reverse) bends.reverse();
        const junctionIds = [...(edge.pathJunctionIds ?? [])].sort();
        const semanticSignature = [
          // Keep all routing flags in the identity key.  Hallway and walkway
          // are both ordinary manual Walking Paths, so their legacy type
          // spelling is intentionally not treated as a separate route.
          // Undefined legacy values use the same defaults as newly-created
          // edges, so an old `undefined`/new `true` pair is still recognized
          // as the same edge, while meaningful variants remain parallel.
          bidirectional ? "bi" : "directed",
          edge.accessible ?? true,
          edge.emergencySafe ?? true,
          edge.closed ?? false,
          edge.width ?? 4,
          edge.inaccessibleReason ?? null,
          edge.emergencyReason ?? null,
          edge.pathJunctionId ?? null,
          edge.pathJunctionParent ?? false,
          junctionIds,
          bends,
        ];
        return `manual|${ordered.join("::")}|${JSON.stringify(semanticSignature)}`;
      })()
      : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    // A floor transition is a logical Stair/Elevator transfer, not a
    // same-floor polyline.  Its distance is intentionally authored by the
    // transition reconciler (and must not become the Euclidean distance between
    // unrelated floor coordinate systems during normalization).
    if (edge.type === CROSS_FLOOR_EDGE_TYPE) {
      result.push({ ...edge, bendPoints: undefined });
      continue;
    }
    const bends = normalizeBendPoints((edge.bendPoints ?? []).filter((point) =>
      Math.hypot(point.x - a.x, point.y - a.y) > eps
      && Math.hypot(point.x - b.x, point.y - b.y) > eps), eps);
    const points = [{ x: a.x, y: a.y }, ...bends, { x: b.x, y: b.y }];
    // A split operation must not leave the old direct edge routable when a
    // newly inserted node lies exactly on its authored geometry.
    const splitNodeIds = options?.splitNodeIds;
    const hasInsertedNodeOnPath = manualPath && !!splitNodeIds && Array.from(nodeMap.entries())
      .some(([nodeId, node]) => nodeId !== edge.startNodeId && nodeId !== edge.endNodeId
        && splitNodeIds.has(nodeId)
        && node.buildingId === a.buildingId && node.floorId === a.floorId
        && points.slice(0, -1).some((start, index) => {
          const end = points[index + 1];
          const cross = (node.x - start.x) * (end.y - start.y) - (node.y - start.y) * (end.x - start.x);
          const dot = (node.x - start.x) * (node.x - end.x) + (node.y - start.y) * (node.y - end.y);
          return Math.abs(cross) <= eps && dot <= eps * eps;
        }));
    if (hasInsertedNodeOnPath) continue;
    result.push({ ...edge, bendPoints: bends, distance: navEdgePolylineDistance(points) });
  }
  return result;
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

/**
 * B5 Phase 6.8: drag geometry for a STRAIGHT (bend-less) edge segment. The
 * perpendicular offset produces a clean orthogonal U-dog-leg built from the
 * FIXED endpoints (A/B never move), matching Floor Editor's straight-segment
 * drag: A → (A.x, A.y+delta) → (B.x, B.y+delta) → B for a horizontal segment.
 * `isHorizontal` describes the ORIGINAL segment (a horizontal segment is
 * dragged vertically). The caller clamps/normalizes the result.
 */
export function translateStraightSegment(
  a: NavPoint,
  b: NavPoint,
  delta: number,
  isHorizontal: boolean
): NavPoint[] {
  const perp = (pt: NavPoint): NavPoint =>
    isHorizontal ? { x: pt.x, y: pt.y + delta } : { x: pt.x + delta, y: pt.y };
  return [perp(a), perp(b)];
}

/** Alignment-guide line rendered while snapping a node/bend drag. */
export interface NavAlignGuide {
  type: "h" | "v";
  pos: number;
}

/**
 * B5 Phase 2.8 / 6.10: always-on alignment assistance (replaces the Phase 2.7
 * Shift snap). When a dragged free waypoint/destination (or bend) target comes
 * within `threshold` of another routing node's X or Y, snap to it and report
 * the guide line(s) to draw. Returns the corrected target + guides (empty when
 * far away).
 *
 * B5 Phase 6.10: connected-node priority — nodes whose IDs appear in
 * `connectedIds` are checked FIRST so they win over a closer-but-unconnected
 * node at the same axis within threshold. This makes it easy to straighten an
 * edge by dragging one endpoint near the other's axis.
 */
export function navAlignSnap(
  target: NavPoint,
  others: { x: number; y: number; id?: string }[],
  threshold = 8,
  connectedIds?: Set<string>
): { x: number; y: number; guides: NavAlignGuide[] } {
  // B5 Phase 6.10: sort so connected nodes come first — they win when
  // two candidates are within threshold on the same axis.
  const sorted = connectedIds && connectedIds.size > 0
    ? [...others].sort((a, b) => {
        const aConn = a.id && connectedIds.has(a.id) ? 0 : 1;
        const bConn = b.id && connectedIds.has(b.id) ? 0 : 1;
        return aConn - bConn;
      })
    : others;
  let bestX: { d: number; pos: number; connected: boolean } | null = null;
  let bestY: { d: number; pos: number; connected: boolean } | null = null;
  for (const o of sorted) {
    const isConnected = Boolean(o.id && connectedIds?.has(o.id));
    const dx = Math.abs(o.x - target.x);
    if (dx <= threshold && (!bestX
      || (isConnected && !bestX.connected)
      || (isConnected === bestX.connected && dx < bestX.d))) {
      bestX = { d: dx, pos: o.x, connected: isConnected };
    }
    const dy = Math.abs(o.y - target.y);
    if (dy <= threshold && (!bestY
      || (isConnected && !bestY.connected)
      || (isConnected === bestY.connected && dy < bestY.d))) {
      bestY = { d: dy, pos: o.y, connected: isConnected };
    }
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
  // `ref` records WHICH candidate edge matched (min/max/center), so the
  // adjustment moves the group so that edge lands on the other node — never
  // minX/minY blindly (B5 correction: snapping maxX/centerX previously added
  // (bestX.pos - minX), teleporting the whole group).
  let bestX: { d: number; pos: number; ref: number } | null = null;
  let bestY: { d: number; pos: number; ref: number } | null = null;
  for (const o of others) {
    for (const pos of [minX, maxX, centerX]) {
      const d = Math.abs(o.x - pos);
      if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, pos: o.x, ref: pos };
    }
    for (const pos of [minY, maxY, centerY]) {
      const d = Math.abs(o.y - pos);
      if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, pos: o.y, ref: pos };
    }
  }
  const guides: NavAlignGuide[] = [];
  let ndx = dx;
  let ndy = dy;
  if (bestX) {
    ndx += bestX.pos - bestX.ref;
    guides.push({ type: "v", pos: bestX.pos });
  }
  if (bestY) {
    ndy += bestY.pos - bestY.ref;
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

// ── B5 Phase 3 — Cross-floor navigation transitions ────────────────────────
// Stairs and Elevators share a physical identity across floors via the
// circulation object's `sharedId`. Each floor keeps its OWN local NavigationNode
// (the routing anchor at the local physical object); cross-floor travel is
// represented by dedicated transition NavigationEdges between the floor-specific
// nodes of the SAME (kind, sharedId) chain. Transitions are fully DERIVED and
// idempotent — every campus write reconciles them, so there is never a separate
// in-memory-only transition system and never a duplicate edge.

/** The NavigationEdge.type used to mark a cross-floor transition edge. */
export const CROSS_FLOOR_EDGE_TYPE = "floor_transition";

export type CrossFloorKind = "stair" | "elevator";

/**
 * Accessibility default for a cross-floor transition: stairs are NOT accessible
 * (a stairwell cannot be used by wheelchairs), elevators ARE.
 */
export function crossFloorTransitionAccessible(kind: CrossFloorKind): boolean {
  return kind !== "stair";
}

/** Physical-circulation metadata needed to reconcile one node's transitions. */
export interface CrossFloorOwnerInfo {
  kind: CrossFloorKind;
  ownerId: string;
  sharedId: string;
  floorId: string;
  floorOrder: number;
  floorNumber: number;
  floorLabel: string;
  /** Stair direction as authored on this floor. Elevators do not use it. */
  direction?: StairDirection;
  /** Elevator served floors (floor NUMBERS) — undefined when unspecified. */
  servedFloors?: number[];
}

/**
 * Resolve the cross-floor identity of a linked circulation node: its physical
 * owner, the owner's `sharedId`, and the floor it sits on. Returns null for
 * free nodes, non-transition circulation links, objects WITHOUT a sharedId, and
 * nodes of a different building. Ramps are local accessible path anchors, not
 * floor-to-floor transition devices. A physical object that was never linked
 * has no node, so it can never create a transition (the admin's Link Location
 * workflow is preserved — §10).
 */
export function findCrossFloorOwnerInfo(
  node: NavigationNode,
  floors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] | undefined,
  buildingId: string
): CrossFloorOwnerInfo | null {
  if (node.buildingId !== buildingId) return null;
  const floorOrder = (floors ?? []).findIndex((f) => f.id === node.floorId);
  const floor = floorOrder >= 0 ? (floors ?? [])[floorOrder] : undefined;
  if (!floor) return null;
  if (node.stairId) {
    const owner = (floor.stairs ?? []).find((s) => s.id === node.stairId);
    if (!owner?.sharedId) return null;
    return {
      kind: "stair", ownerId: node.stairId, sharedId: owner.sharedId,
      floorId: floor.id, floorOrder, floorNumber: floor.number ?? 0,
      floorLabel: floor.label, direction: owner.direction,
    };
  }
  if (node.elevatorId) {
    const owner = (floor.elevators ?? []).find((e) => e.id === node.elevatorId);
    if (!owner?.sharedId) return null;
    return {
      kind: "elevator", ownerId: node.elevatorId, sharedId: owner.sharedId,
      floorId: floor.id, floorOrder,
      floorNumber: floor.number ?? 0, floorLabel: floor.label,
      servedFloors: owner.floors && owner.floors.length > 0 ? owner.floors : undefined,
    };
  }
  return null;
}

/**
 * Reconcile the building's cross-floor transition edges against the CURRENT
 * linked circulation nodes (pure + idempotent — safe to run on every campus
 * write):
 *  - nodes sharing the same (kind, sharedId) form one chain;
 *  - Stairs link ADJACENT canonical floors only (1↔2, 2↔3 — never 1↔3);
 *  - Elevators additionally respect the physical served `floors` list — nodes
 *    on floors the shaft does not serve never participate, and adjacent served
 *    stops are connected in current canonical building-floor order;
 *  - at most ONE edge per node pair: an existing transition edge for the exact
 *    pair is REUSED (same id), otherwise one is created;
 *  - stale transition edges (pair no longer valid, kind mismatch, sharedId
 *    changed, or one endpoint deleted) are removed;
 *  - non-transition edges pass through untouched.
 * Transition edges carry `type: CROSS_FLOOR_EDGE_TYPE` so the semantic intent
 * is explicit (never inferred from endpoint floorIds) and so the Floor Editor
 * can exclude them from walkable-floor editing (bend handles, wall checks).
 */
export function reconcileCrossFloorTransitions(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  floors: Pick<FloorPlan, "id" | "number" | "label" | "stairs" | "ramps" | "elevators">[] | undefined,
  buildingId: string
): NavigationEdge[] {
  const safeNodes = nodes ?? [];
  const safeEdges = edges ?? [];
  // 1) Group linked circulation nodes by (kind, sharedId).
  const groups = new Map<string, { node: NavigationNode; info: CrossFloorOwnerInfo }[]>();
  for (const node of safeNodes) {
    const info = findCrossFloorOwnerInfo(node, floors, buildingId);
    if (!info) continue;
    const key = `${info.kind}:${info.sharedId}`;
    const list = groups.get(key) ?? [];
    list.push({ node, info });
    groups.set(key, list);
  }
  // 2) Desired pairs: adjacent canonical floors/stops only; elevators filtered
  // to served floors.
  const desired = new Map<string, { a: string; b: string; accessible: boolean; bidirectional: boolean; emergencyStair: boolean; emergencySafe: boolean }>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const kind = group[0].info.kind;
    const exteriorEmergencyGroup = kind === "stair"
      && group.some((entry) => !!entry.node.exteriorEmergencyStairId);
    // A Stair identity may have at most one occurrence on a Floor.  Legacy
    // label/count-based IDs could put two same-floor Stairs in one group; do
    // not let the sorted list pair one of them with the next Floor by accident.
    // The authoring UI can then surface the conflict for an explicit repair.
    if (kind === "stair" && new Set(group.map((entry) => entry.info.floorId)).size !== group.length) continue;
    // Elevator served floors: as soon as ANY member of the chain declares a
    // served-floor list, the list set is authoritative — a node whose floor is
    // in NO member's served list never participates (no invented stops), while
    // partial/inconsistent authoring (one owner lists, another doesn't) still
    // links the floors that ARE served by at least one member.
    const servedLists = kind === "elevator"
      ? group.map((p) => p.info.servedFloors).filter((l): l is number[] => !!l && l.length > 0)
      : [];
    const participants = servedLists.length > 0
      ? group.filter((p) => servedLists.some((l) => l.includes(p.info.floorNumber)))
      : group;
    const sorted = [...participants].sort((a, b) => a.info.floorOrder - b.info.floorOrder);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.info.floorId === b.info.floorId) continue; // same floor — not a transition
      // Normal indoor stairs remain adjacent-floor only. A building-attached
      // Exterior Emergency Stair is different: its explicit served-floor list
      // is authoritative, so configured landings may skip an unserved floor
      // (for example Ground, Floor 2, Floor 3, Floor 5).
      if (kind === "stair" && !exteriorEmergencyGroup && Math.abs(a.info.floorOrder - b.info.floorOrder) !== 1) continue;
      const pairKey = [a.node.id, b.node.id].sort().join("|");
      if (kind === "stair") {
        // The lower occurrence's Up permission and the upper occurrence's
        // Down permission are independent.  Keep a one-way NavigationEdge
        // when only one direction is authored; use a bidirectional edge only
        // when both directions are valid.  This preserves the canonical
        // NavigationEdge contract without teaching A* about Stair semantics.
        const lower = a.info.floorOrder < b.info.floorOrder ? a : b;
        const upper = lower === a ? b : a;
        const lowerDirection = lower.info.direction ?? "both";
        const upperDirection = upper.info.direction ?? "both";
        const canGoUp = lowerDirection === "up" || lowerDirection === "both";
        const canGoDown = upperDirection === "down" || upperDirection === "both";
        if (!canGoUp && !canGoDown) continue;
        const bidirectional = canGoUp && canGoDown;
        const emergencySafe = kind === "elevator"
          ? group.every((entry) => entry.node.emergencySafe === true)
          : group.every((entry) => entry.node.emergencySafe !== false);
        desired.set(pairKey, {
          a: bidirectional || canGoUp ? lower.node.id : upper.node.id,
          b: bidirectional || canGoUp ? upper.node.id : lower.node.id,
          accessible: crossFloorTransitionAccessible(kind),
          bidirectional,
          emergencyStair: group.some((entry) => entry.node.emergencyStair === true),
          emergencySafe,
        });
        continue;
      }
      desired.set(pairKey, {
        a: a.node.id,
        b: b.node.id,
        accessible: crossFloorTransitionAccessible(kind),
        bidirectional: true,
        emergencyStair: group.some((entry) => entry.node.emergencyStair === true),
        emergencySafe: kind === "elevator"
          ? group.every((entry) => entry.node.emergencySafe === true)
          : group.every((entry) => entry.node.emergencySafe !== false),
      });
    }
  }
  // 3) Reuse existing transition edges for identical pairs (idempotent ids).
  const existingByPair = new Map<string, NavigationEdge>();
  for (const e of safeEdges) {
    if (e.type !== CROSS_FLOOR_EDGE_TYPE) continue;
    existingByPair.set([e.startNodeId, e.endNodeId].sort().join("|"), e);
  }
  const transitionEdges: NavigationEdge[] = [];
  for (const entry of desired.values()) {
    const pairKey = [entry.a, entry.b].sort().join("|");
    const existing = existingByPair.get(pairKey);
    transitionEdges.push(existing
      ? {
          ...existing,
          startNodeId: entry.a,
          endNodeId: entry.b,
          bidirectional: entry.bidirectional,
          accessible: entry.accessible,
          emergencySafe: entry.emergencySafe,
          ...(entry.emergencyStair && entry.emergencySafe
            ? { distance: Math.min(existing.distance, 0.5), emergencySafe: true }
            : {}),
        }
      : {
          id: genId("ne"),
          startNodeId: entry.a,
          endNodeId: entry.b,
          distance: entry.emergencyStair ? 0.5 : 1,
          bidirectional: entry.bidirectional,
          accessible: entry.accessible,
          emergencySafe: entry.emergencySafe,
          type: CROSS_FLOOR_EDGE_TYPE,
          color: "#475569",
          width: 1,
        });
  }
  // 4) Non-transition edges pass through; stale transitions are dropped.
  const nodeById = new Map(safeNodes.map((node) => [node.id, node]));
  const isTargetBuildingTransition = (edge: NavigationEdge) => {
    if (edge.type !== CROSS_FLOOR_EDGE_TYPE) return false;
    const start = nodeById.get(edge.startNodeId);
    const end = nodeById.get(edge.endNodeId);
    // A transition whose endpoint was deleted is stale regardless of which
    // building owned it; never leave an orphaned floor edge in the graph.
    if (!start || !end) return true;
    // Exterior Emergency Stair Ground discharge bridges use this same
    // transition edge type, but connect a floor occurrence to its
    // Building-owned outdoor anchor. Their lifecycle is owned by the
    // Exterior Stair synchronizer, so preserve the bridge here.
    const exteriorDischarge = start.exteriorEmergencyStairId
      && end.exteriorEmergencyStairId
      && start.exteriorEmergencyStairId === end.exteriorEmergencyStairId
      && start.buildingId === end.buildingId
      && (!start.floorId || !end.floorId);
    if (exteriorDischarge) return false;
    return start.buildingId === buildingId && end.buildingId === buildingId;
  };
  return [
    ...safeEdges.filter((e) => e.type !== CROSS_FLOOR_EDGE_TYPE || !isTargetBuildingTransition(e)),
    ...transitionEdges,
  ];
}

/**
 * Canonical floor-order mutation used by both the outer Campus hierarchy and
 * the Floor Editor. Replacing the floors array changes the building's canonical
 * order, then immediately reconciles derived cross-floor transition edges
 * against that same order. Callers additionally reconcile persisted Stair
 * direction values before invoking this helper so floor-order changes cannot
 * leave an impossible boundary direction behind.
 */
export function replaceBuildingFloorsAndReconcileTransitions(
  campus: Campus,
  buildingId: string,
  floors: FloorPlan[]
): Campus {
  const next: Campus = {
    ...campus,
    buildings: campus.buildings.map((building) =>
      building.id === buildingId ? { ...building, floors } : building
    ),
  };
  // Floor-order mutations can also reconcile a Stair's persisted direction
  // (for example, a former middle-floor Both Stair becoming the highest-floor
  // Down Stair). Re-resolve every linked indoor node from the updated owner in
  // the same mutation so its physical entry anchor and incident path endpoint
  // cannot lag behind the visible direction cue. Node IDs and free waypoints
  // remain untouched.
  const floorsById = new Map(floors.map((floor) => [floor.id, floor]));
  const movedLinkedNodeIds = new Set<string>();
  const syncedNodes = (next.navNodes ?? []).map((node) => {
    if (node.buildingId !== buildingId) return node;
    const ownerFloor = floorsById.get(node.floorId);
    if (!ownerFloor) return node;
    const synced = syncIndoorLinkedNodePositions([node], ownerFloor)[0] ?? node;
    if (synced.x !== node.x || synced.y !== node.y) movedLinkedNodeIds.add(node.id);
    return synced;
  });
  // A linked Stair anchor is part of the current edge geometry. Keep the
  // distance metadata in step with its new endpoint so route costs cannot use
  // a stale pre-direction-change length. Transition edges keep their derived
  // logical cost; all other affected edges use their current bends/endpoints.
  const syncedEdges = (next.navEdges ?? []).map((edge) => {
    if (edge.type === CROSS_FLOOR_EDGE_TYPE
      || (!movedLinkedNodeIds.has(edge.startNodeId) && !movedLinkedNodeIds.has(edge.endNodeId))) return edge;
    const points = edgePolylinePoints(edge, syncedNodes);
    return points ? { ...edge, distance: navEdgePolylineDistance(points) } : edge;
  });
  return {
    ...next,
    navNodes: syncedNodes,
    navEdges: reconcileCrossFloorTransitions(
      syncedNodes, syncedEdges,
      next.buildings.find((building) => building.id === buildingId)?.floors,
      buildingId
    ),
  };
}
