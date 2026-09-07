import type {
  Campus,
  CampusBuilding,
  BuildingEntranceEdge,
  ExteriorEmergencyStair,
  FloorPlan,
  FloorStairs,
  NavigationEdge,
  NavigationNode,
} from "../components/map-builder/types";
import { reconcileCrossFloorTransitions } from "./indoorNavigationGraph";

/**
 * Exterior Emergency Stairs are authored once on a Building.  Floor landing
 * occurrences are derived from the building attachment and the explicitly
 * served floor list; they still use the normal FloorStairs/sharedId graph
 * representation so routing and persistence stay on the existing path.
 */
export const EXTERIOR_EMERGENCY_STAIR_ROLE = "exterior_emergency" as const;

export interface ExteriorEmergencyStairReadiness {
  ready: boolean;
  /** Concise, actionable reason shown in editor validation when not ready. */
  issue?: string;
}

export interface ExteriorEmergencyStairRouteReadiness extends ExteriorEmergencyStairReadiness {
  /** Generated stair occurrence node IDs keyed by served Floor ID. */
  occurrenceNodeIds?: Record<string, string>;
  /** Ground occurrence node used by the discharge transition. */
  groundNodeId?: string;
  /** Building-independent outdoor node at the discharge. */
  outdoorNodeId?: string;
}

/**
 * Structural readiness for the Building-owned emergency egress option.
 *
 * This is intentionally an authoring/readiness check only.  It does not
 * inspect or mutate the navigation graph (routing remains authoritative in
 * pathfinding/graph validation).  The check prevents the generic
 * "no emergency exit" warning from masking an incomplete exterior stair.
 */
export function exteriorEmergencyStairReadiness(
  building: Pick<CampusBuilding, "floors">,
  stair: Pick<ExteriorEmergencyStair, "state" | "servedFloorIds" | "emergencySafe">,
): ExteriorEmergencyStairReadiness {
  if (stair.state === "closed") return { ready: false, issue: "Exterior Emergency Stair is closed." };
  if (stair.emergencySafe === false) return { ready: false, issue: "Exterior Emergency Stair is not marked emergency-safe." };
  const floors = building.floors ?? [];
  const served = new Set((stair.servedFloorIds ?? []).filter((id) => floors.some((floor) => floor.id === id)));
  if (served.size === 0) return { ready: false, issue: "Exterior Emergency Stair has no served Floors." };
  const hasGroundDischarge = floors.some((floor) => served.has(floor.id) && (floor.number === 1 || /ground/i.test(floor.label ?? "")));
  if (!hasGroundDischarge) return { ready: false, issue: "Exterior Emergency Stair has no Ground Floor discharge." };
  return { ready: true };
}

/**
 * Canonical check for the final Ground-discharge leg.  Both route readiness
 * and the generated Stair Exit inspector use this boundary so an internal
 * floor-transition bridge cannot be mistaken for an actual outdoor network
 * connection.
 */
export function exteriorEmergencyStairOutdoorDischargeConnected(
  dischargeNodeId: string,
  nodes: NavigationNode[] = [],
  edges: NavigationEdge[] = [],
): boolean {
  return edges.some((edge) => {
    if (edge.type === "floor_transition" || edge.type === "cross_floor" || edge.closed || edge.emergencySafe === false) return false;
    if (edge.startNodeId !== dischargeNodeId && edge.endNodeId !== dischargeNodeId) return false;
    const otherId = edge.startNodeId === dischargeNodeId ? edge.endNodeId : edge.startNodeId;
    const other = nodes.find((candidate) => candidate.id === otherId);
    return !!other && !other.floorId && !other.entranceId && other.id !== dischargeNodeId
      && (other.type === "outdoor" || !other.buildingId)
      && ((edge.startNodeId === dischargeNodeId && edge.endNodeId === other.id)
        || (edge.bidirectional && edge.startNodeId === other.id && edge.endNodeId === dischargeNodeId));
  });
}

/**
 * Validate the complete graph-backed evacuation chain for one canonical
 * Building-owned Exterior Emergency Stair.  This remains an adapter/readiness
 * check; the persisted NavigationNode/NavigationEdge graph and the existing
 * A* implementation remain authoritative.
 *
 * A stair is ready only when every served landing is connected to its local
 * Floor Walking Network, adjacent served occurrences are joined by the
 * reconciled floor transitions, and the Ground occurrence discharges through
 * the generated outdoor anchor into a real outdoor Walking Network node.
 */
export function exteriorEmergencyStairRouteReadiness(
  building: Pick<CampusBuilding, "id" | "floors">,
  stair: Pick<ExteriorEmergencyStair, "id" | "state" | "servedFloorIds" | "emergencySafe" | "outdoorNodeId">,
  nodes: NavigationNode[] = [],
  edges: NavigationEdge[] = [],
): ExteriorEmergencyStairRouteReadiness {
  const edgeAllows = (edge: NavigationEdge, fromNodeId: string, toNodeId: string) =>
    (edge.startNodeId === fromNodeId && edge.endNodeId === toNodeId)
    || (edge.bidirectional && edge.startNodeId === toNodeId && edge.endNodeId === fromNodeId);
  const structural = exteriorEmergencyStairReadiness(building, stair);
  if (!structural.ready) return structural;
  const floors = building.floors ?? [];
  const servedFloors = floors
    .filter((floor) => stair.servedFloorIds?.includes(floor.id))
    .sort((a, b) => floors.indexOf(a) - floors.indexOf(b));
  const occurrenceNodeIds: Record<string, string> = {};
  const occurrenceNodes = new Map<string, NavigationNode>();
  for (const floor of servedFloors) {
    const node = nodes.find((candidate) => candidate.exteriorEmergencyStairId === stair.id && candidate.floorId === floor.id)
      ?? nodes.find((candidate) => candidate.buildingId === building.id
        && candidate.floorId === floor.id
        && candidate.stairId === floor.stairs?.find((item) => item.exteriorEmergencyStairId === stair.id)?.id);
    if (!node) {
      return { ready: false, issue: `Exterior Emergency Stair needs a generated landing on ${floor.label || "this Floor"}.`, occurrenceNodeIds };
    }
    occurrenceNodeIds[floor.id] = node.id;
    occurrenceNodes.set(floor.id, node);
    const localConnected = edges.some((edge) => {
      if (edge.type === "floor_transition" || edge.type === "cross_floor" || edge.closed || edge.emergencySafe === false) return false;
      if (edge.startNodeId !== node.id && edge.endNodeId !== node.id) return false;
      const otherId = edge.startNodeId === node.id ? edge.endNodeId : edge.startNodeId;
      const other = nodes.find((candidate) => candidate.id === otherId);
      return !!other && other.buildingId === building.id && other.floorId === floor.id
        && edgeAllows(edge, node.id, other.id);
    });
    if (!localConnected) {
      return { ready: false, issue: `Connect the Exterior Emergency Stair to the Walking Network on ${floor.label || "this Floor"}.`, occurrenceNodeIds };
    }
  }

  for (let index = 0; index < servedFloors.length - 1; index += 1) {
    const lower = occurrenceNodes.get(servedFloors[index].id);
    const upper = occurrenceNodes.get(servedFloors[index + 1].id);
    if (!lower || !upper) continue;
    const transition = edges.some((edge) => (edge.type === "floor_transition" || edge.type === "cross_floor")
      && !edge.closed && edge.emergencySafe !== false
      // Evacuation descends from the upper served landing to the next lower
      // landing; a one-way transition in the opposite direction is not a
      // complete emergency continuation.
      && edgeAllows(edge, upper.id, lower.id));
    if (!transition) {
      return { ready: false, issue: `Exterior Emergency Stair continuation is missing between ${servedFloors[index].label || "this Floor"} and ${servedFloors[index + 1].label || "the next Floor"}.`, occurrenceNodeIds };
    }
  }

  const groundFloor = servedFloors.find((floor) => floor.number === 1 || /ground/i.test(floor.label ?? ""));
  const groundNode = groundFloor ? occurrenceNodes.get(groundFloor.id) : undefined;
  const outdoorNode = stair.outdoorNodeId
    ? nodes.find((candidate) => candidate.id === stair.outdoorNodeId && !candidate.floorId)
    : nodes.find((candidate) => candidate.exteriorEmergencyStairId === stair.id && !candidate.floorId);
  if (!groundFloor || !groundNode || !outdoorNode) {
    return { ready: false, issue: "Exterior Emergency Stair has no Ground Floor discharge anchor.", occurrenceNodeIds };
  }
  const dischargeTransition = edges.some((edge) => (edge.type === "floor_transition" || edge.type === "cross_floor")
    && !edge.closed && edge.emergencySafe !== false
    && edgeAllows(edge, groundNode.id, outdoorNode.id));
  if (!dischargeTransition) {
    return { ready: false, issue: "Connect the Ground discharge of the Exterior Emergency Stair to its outdoor anchor.", occurrenceNodeIds, groundNodeId: groundNode.id, outdoorNodeId: outdoorNode.id };
  }
  const outdoorConnected = exteriorEmergencyStairOutdoorDischargeConnected(outdoorNode.id, nodes, edges);
  if (!outdoorConnected) {
    return { ready: false, issue: "Connect the Ground discharge to the Outdoor Walking Network.", occurrenceNodeIds, groundNodeId: groundNode.id, outdoorNodeId: outdoorNode.id };
  }
  return { ready: true, occurrenceNodeIds, groundNodeId: groundNode.id, outdoorNodeId: outdoorNode.id };
}

/**
 * A Building owns one physical exterior emergency stair.  Keep this boundary
 * in the synchronizer so hydrated/legacy records cannot re-expand into several
 * independent owners during occurrence or graph reconciliation.  The first
 * authored record is the stable canonical choice; malformed records without
 * an id are ignored when a valid record exists.
 */
export function canonicalExteriorEmergencyStairsForBuilding(
  building: Pick<CampusBuilding, "exteriorEmergencyStairs">,
): ExteriorEmergencyStair[] {
  const authored = building.exteriorEmergencyStairs ?? [];
  if (authored.length === 0) return [];
  const canonical = authored.find((stair) => typeof stair?.id === "string" && stair.id.trim()) ?? authored[0];
  return canonical ? [canonical] : [];
}

/**
 * Remove generated Exterior Emergency Stair graph nodes that no longer have a
 * live Building-owned stair.  Building deletion used to prune only entrance
 * anchors, leaving the stair's floor landings, outdoor discharge, and every
 * incident edge behind as orphaned navigation objects.  Scope legacy nodes
 * without a buildingId to the surviving stair's canonical node IDs so two
 * Buildings with the same hydrated legacy id are not cross-deleted.
 */
export function pruneOrphanedExteriorEmergencyStairNodes(
  buildings: Pick<CampusBuilding, "id" | "exteriorEmergencyStairs">[],
  nodes: NavigationNode[],
  edges: NavigationEdge[],
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const owners = buildings.flatMap((building) =>
    canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => ({ buildingId: building.id, stair })),
  );
  const hasOwner = (node: NavigationNode) => owners.some(({ buildingId, stair }) => {
    if (stair.id !== node.exteriorEmergencyStairId) return false;
    if (node.buildingId) return node.buildingId === buildingId;
    // Legacy generated nodes may not carry buildingId.  Keep them only when
    // their persisted canonical owner points at this exact node; never keep a
    // same-id discharge from a deleted Building merely because another
    // Building happens to reuse that legacy stair id.
    if (!node.floorId) return stair.outdoorNodeId === node.id;
    return Object.values(stair.occurrenceNodeIds ?? {}).includes(node.id)
      || Object.values(stair.occurrenceIds ?? {}).includes(node.stairId ?? node.id);
  });
  const removedIds = new Set(
    nodes
      .filter((node) => node.exteriorEmergencyStairId && !hasOwner(node))
      .map((node) => node.id),
  );
  if (removedIds.size === 0) return { nodes, edges };
  return {
    nodes: nodes.filter((node) => !removedIds.has(node.id)),
    edges: edges.filter((edge) => !removedIds.has(edge.startNodeId) && !removedIds.has(edge.endNodeId)),
  };
}

/**
 * Resolve the perimeter side a drag is previewing.  A pointer must clearly
 * approach/cross a different footprint edge before the side changes; this
 * keeps normal along-wall movement stable while still allowing a side switch
 * before the pointer leaves the SVG viewport (the rendered module itself is
 * intentionally outside that footprint).
 */
export function exteriorEmergencyStairEdgeForPointer(
  point: { x: number; y: number },
  bounds: { width: number; height: number },
  currentEdge: BuildingEntranceEdge,
  switchDistance = 24,
): BuildingEntranceEdge {
  const distance = Math.max(12, switchDistance);
  const edgePenetration = (edge: BuildingEntranceEdge) => edge === "left"
    ? -point.x
    : edge === "right"
      ? point.x - bounds.width
      : edge === "top"
        ? -point.y
        : point.y - bounds.height;
  const edgeDistance = (edge: BuildingEntranceEdge) => Math.abs(edgePenetration(edge));
  const currentOutside = Math.max(0, edgePenetration(currentEdge));
  const hysteresis = Math.max(6, distance * 0.4);
  const outside = [
    { edge: "left" as const, penetration: -point.x },
    { edge: "right" as const, penetration: point.x - bounds.width },
    { edge: "top" as const, penetration: -point.y },
    { edge: "bottom" as const, penetration: point.y - bounds.height },
  ].filter((candidate) => candidate.penetration >= distance)
    .sort((a, b) => b.penetration - a.penetration);
  if (outside[0]) {
    // Keep the current edge in the corner transition zone.  A side only wins
    // after it is both outside the activation distance and clearly farther
    // across its edge than the side currently being previewed.  This prevents
    // alternating North/East candidates when pointer events land on adjacent
    // corner pixels, while still allowing a deliberate side switch.
    if (outside[0].edge === currentEdge) return currentEdge;
    if (outside[0].penetration - currentOutside >= hysteresis) return outside[0].edge;
    return currentEdge;
  }

  // The outside module can overflow the SVG viewport, so waiting for a full
  // outside crossing would make East/West -> North/South impossible with a
  // normal mouse drag.  Near-edge detection provides the same deliberate
  // side-switch affordance while retaining the current wall hysteresis.
  const nearEdge = [
    { edge: "left" as const, distance: Math.abs(point.x) },
    { edge: "right" as const, distance: Math.abs(point.x - bounds.width) },
    { edge: "top" as const, distance: Math.abs(point.y) },
    { edge: "bottom" as const, distance: Math.abs(point.y - bounds.height) },
  ]
    .filter((candidate) => candidate.edge !== currentEdge && candidate.distance <= distance)
    .sort((a, b) => a.distance - b.distance);
  // Inside the footprint, require a meaningful improvement over the current
  // edge before switching.  Equal-distance corner samples therefore remain
  // attached to the current side instead of flickering between two sides.
  if (nearEdge[0] && edgeDistance(currentEdge) - nearEdge[0].distance >= hysteresis) return nearEdge[0].edge;
  return currentEdge;
}

/** Return the pointer's normalized position along a perimeter side. */
export function exteriorEmergencyStairOffsetForPointer(
  point: { x: number; y: number },
  bounds: { width: number; height: number },
  edge: BuildingEntranceEdge,
) {
  const span = edge === "top" || edge === "bottom" ? Math.max(1, bounds.width) : Math.max(1, bounds.height);
  const along = edge === "top" || edge === "bottom" ? point.x : point.y;
  return Math.max(0, Math.min(1, along / span));
}

/** Wall-span overlap in normalized attachment coordinates. */
export function exteriorEmergencyStairWallSpansOverlap(
  aOffset: number,
  aSpan: number,
  bOffset: number,
  bSpan: number,
  wallSpan: number,
  clearance = 4,
) {
  const span = Math.max(1, wallSpan);
  const aCenter = Math.max(0, Math.min(span, aOffset * span));
  const bCenter = Math.max(0, Math.min(span, bOffset * span));
  return Math.abs(aCenter - bCenter) < (Math.max(0, aSpan) + Math.max(0, bSpan)) / 2 + clearance;
}

/**
 * Pick a safe first attachment for a newly authored exterior stair.  The
 * preferred right-side midpoint is retained when it is free; otherwise we
 * walk the perimeter and try deterministic offsets so creation never drops a
 * generated door/landing on top of an existing wall attachment.
 */
export function defaultExteriorEmergencyStairAttachment(
  building: Pick<CampusBuilding, "width" | "height" | "entrances" | "exteriorEmergencyStairs" | "floors">,
  options: { width?: number; height?: number; visualSize?: ExteriorEmergencyStair["visualSize"] } = {},
): { edge: BuildingEntranceEdge; offset: number } | null {
  const width = Math.max(18, options.width ?? 28);
  const height = Math.max(24, options.height ?? 42);
  const edges: BuildingEntranceEdge[] = ["right", "bottom", "left", "top"];
  const offsets = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
  for (const edge of edges) {
    const wallSpan = edge === "top" || edge === "bottom" ? building.width : building.height;
    const visualAlong = edge === "top" || edge === "bottom"
      ? exteriorEmergencyStairVisualSpan(width, options.visualSize)
      : exteriorEmergencyStairVisualSpan(height, options.visualSize);
    const inset = Math.min(0.45, (visualAlong / 2 + 6) / Math.max(1, wallSpan));
    const range = { min: inset, max: 1 - inset };
    const candidateSpan = (edge === "top" || edge === "bottom"
      ? exteriorEmergencyStairVisualSpan(width, options.visualSize)
      : exteriorEmergencyStairVisualSpan(height, options.visualSize)) + 12;
    for (const rawOffset of offsets) {
      const offset = Math.round(Math.max(range.min, Math.min(range.max, rawOffset)) * 1000) / 1000;
      const entranceBlocked = (building.entrances ?? []).some((entrance) => entrance.edge === edge
        && exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5, 24, wallSpan, 4));
      const floorDoorBlocked = (building.floors ?? []).some((floor) => (floor.doors ?? []).some((door) => {
        const canvasW = Math.max(1, floor.canvasW ?? building.width);
        const canvasH = Math.max(1, floor.canvasH ?? building.height);
        const wall = door.wallId ? (floor.walls ?? []).find((candidate) => candidate.id === door.wallId) : undefined;
        const wallEdge = wall
          ? Math.abs(wall.x1 - wall.x2) < 1
            ? (wall.x1 <= 8 ? "left" : wall.x1 >= canvasW - 8 ? "right" : null)
            : (wall.y1 <= 8 ? "top" : wall.y1 >= canvasH - 8 ? "bottom" : null)
          : door.x <= 8 ? "left" : door.x >= canvasW - 8 ? "right" : door.y <= 8 ? "top" : door.y >= canvasH - 8 ? "bottom" : null;
        if (wallEdge !== edge) return false;
        const doorOffset = edge === "top" || edge === "bottom" ? door.x / canvasW : door.y / canvasH;
        const floorSpan = edge === "top" || edge === "bottom" ? canvasW : canvasH;
        return exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, doorOffset, Math.max(12, door.width ?? 12), floorSpan, 4);
      }));
      const stairBlocked = canonicalExteriorEmergencyStairsForBuilding(building).some((stair) => stair.attachment.edge === edge
        && exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(stair.attachment.offset)) ? Number(stair.attachment.offset) : 0.5,
          (edge === "top" || edge === "bottom"
            ? exteriorEmergencyStairVisualSpan(Math.max(18, stair.width || 28), stair.visualSize)
            : exteriorEmergencyStairVisualSpan(Math.max(24, stair.height || 42), stair.visualSize)) + 12, wallSpan, 4));
      if (!entranceBlocked && !floorDoorBlocked && !stairBlocked) return { edge, offset };
    }
  }
  return null;
}

function exteriorEmergencyStairVisualSpan(base: number, visualSize?: ExteriorEmergencyStair["visualSize"]): number {
  const factor = visualSize === "small" ? 0.96 : visualSize === "large" ? 1.58 : 1.35;
  return Math.max(24, Math.round(base * factor));
}

export function exteriorEmergencyStairWorldPosition(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  stair: Pick<ExteriorEmergencyStair, "attachment" | "width" | "height">,
) {
  const edge = stair.attachment.edge;
  const offset = Math.max(0, Math.min(1, Number(stair.attachment.offset) || 0.5));
  const width = Math.max(18, stair.width || 28);
  const height = Math.max(24, stair.height || 42);
  const local = edge === "top"
    ? { x: building.width * offset, y: -height / 2 - 10 }
    : edge === "right"
      ? { x: building.width + width / 2 + 10, y: building.height * offset }
      : edge === "bottom"
        ? { x: building.width * offset, y: building.height + height / 2 + 10 }
        : { x: -width / 2 - 10, y: building.height * offset };
  const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const relative = { x: local.x - building.width / 2, y: local.y - building.height / 2 };
  return {
    x: cx + relative.x * Math.cos(rotation) - relative.y * Math.sin(rotation),
    y: cy + relative.x * Math.sin(rotation) + relative.y * Math.cos(rotation),
    angle: (Math.atan2(
      (edge === "top" ? -1 : edge === "bottom" ? 1 : 0),
      edge === "left" ? -1 : edge === "right" ? 1 : 0,
    ) * 180) / Math.PI + (building.rotation ?? 0),
  };
}

function occurrencePosition(floor: Pick<FloorPlan, "canvasW" | "canvasH">, stair: ExteriorEmergencyStair) {
  const w = Math.max(18, stair.width || 28);
  const h = Math.max(24, stair.height || 42);
  const width = floor.canvasW ?? 900;
  const height = floor.canvasH ?? 680;
  const offset = Math.max(0, Math.min(1, Number(stair.attachment.offset) || 0.5));
  switch (stair.attachment.edge) {
    case "top": return { x: width * offset, y: Math.max(2, h / 2) };
    case "right": return { x: Math.max(2, width - w / 2), y: height * offset };
    case "bottom": return { x: width * offset, y: Math.max(2, height - h / 2) };
    case "left": return { x: Math.max(2, w / 2), y: height * offset };
  }
}

/**
 * Resolve the indoor-facing access cue for a generated Floor occurrence.
 * Exterior stair occurrences sit on a perimeter wall, so their navigation
 * anchor belongs on that wall-facing side rather than at the centre/bottom
 * entry used by an ordinary interior stair.  Keep a tiny inset so the marker
 * remains visible inside the Floor SVG while still terminating at the correct
 * wall side.
 */
export function exteriorEmergencyStairIndoorAccessPosition(
  floor: Pick<FloorPlan, "canvasW" | "canvasH">,
  item: Pick<FloorStairs, "x" | "y" | "width" | "height" | "attachment">,
) {
  const width = Math.max(1, floor.canvasW ?? 900);
  const height = Math.max(1, floor.canvasH ?? 680);
  const edge = item.attachment?.edge ?? "right";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inset = Math.max(3, Math.min(8, Math.min(item.width, item.height) * 0.2));
  if (edge === "left") return { x: Math.round(Math.max(2, inset)), y: Math.round(cy) };
  if (edge === "top") return { x: Math.round(cx), y: Math.round(Math.max(2, inset)) };
  if (edge === "bottom") return { x: Math.round(cx), y: Math.round(Math.min(height - 2, height - inset)) };
  return { x: Math.round(Math.min(width - 2, width - inset)), y: Math.round(cy) };
}

function occurrenceId(stair: ExteriorEmergencyStair, floor: FloorPlan, existing?: FloorStairs) {
  return existing?.id
    ?? stair.occurrenceIds?.[floor.id]
    ?? crypto.randomUUID();
}

/** Sync only the physical occurrences; no graph mutation is performed here. */
export function syncExteriorEmergencyStairOccurrences(building: CampusBuilding): CampusBuilding {
  const exterior = canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => ({
    ...stair,
    buildingId: building.id,
    sharedId: stair.sharedId || stair.id,
    attachment: {
      edge: stair.attachment?.edge ?? "right",
      offset: Math.max(0, Math.min(1, Number(stair.attachment?.offset) || 0.5)),
    },
    servedFloorIds: Array.from(new Set((stair.servedFloorIds ?? []).filter((id) => building.floors.some((floor) => floor.id === id)))),
    width: Math.max(18, stair.width ?? 28),
    height: Math.max(24, stair.height ?? 42),
  }));
  const occurrenceIds: Record<string, string> = {};
  const floors = building.floors.map((floor) => {
    let nextStairs = (floor.stairs ?? []).filter((candidate) => !candidate.exteriorEmergencyStairId || exterior.some((stair) => stair.id === candidate.exteriorEmergencyStairId));
    for (const stair of exterior) {
      if (!stair.servedFloorIds.includes(floor.id)) {
        nextStairs = nextStairs.filter((candidate) => candidate.exteriorEmergencyStairId !== stair.id);
        continue;
      }
      const current = nextStairs.find((candidate) => candidate.exteriorEmergencyStairId === stair.id);
      // A generated landing is one occurrence per served Floor.  If an older
      // edit left duplicate generated records behind, retain the established
      // ID and remove only the extras; unrelated authored Stairs are untouched.
      nextStairs = nextStairs.filter((candidate) =>
        candidate.exteriorEmergencyStairId !== stair.id || candidate.id === current?.id,
      );
      const id = occurrenceId(stair, floor, current);
      occurrenceIds[`${stair.id}:${floor.id}`] = id;
      const pos = occurrencePosition(floor, stair);
      const occurrence: FloorStairs = {
        ...(current ?? {}),
        id,
        x: pos.x - stair.width / 2,
        y: pos.y - stair.height / 2,
        width: stair.width,
        height: stair.height,
        rotation: current?.rotation ?? 0,
        flip: current?.flip,
        direction: "both",
        label: stair.label || "Exterior Emergency Stair",
        sharedId: stair.sharedId,
        accessible: false,
        emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
        exteriorEmergencyStairId: stair.id,
        attachment: stair.attachment,
        locked: true,
        visible: stair.state !== "closed",
        zOrder: current?.zOrder ?? 1000,
      };
      nextStairs = current
        ? nextStairs.map((candidate) => candidate.id === current.id ? occurrence : candidate)
        : [...nextStairs, occurrence];
    }
    return { ...floor, stairs: nextStairs };
  });
  const nextExterior = exterior.map((stair) => ({
    ...stair,
    occurrenceIds: { ...(stair.occurrenceIds ?? {}), ...Object.fromEntries(
      Object.entries(occurrenceIds)
        .filter(([key]) => key.startsWith(`${stair.id}:`))
        .map(([key, id]) => [key.slice(stair.id.length + 1), id]),
    ) },
  }));
  return { ...building, floors, exteriorEmergencyStairs: nextExterior };
}

/** Normalize all building-owned occurrences while leaving unrelated data intact. */
export function syncExteriorEmergencyStairs(campus: Campus): Campus {
  return { ...campus, buildings: campus.buildings.map(syncExteriorEmergencyStairOccurrences) };
}

/** Ensure canonical local nodes and one outdoor discharge bridge for each stair. */
export function syncExteriorEmergencyStairGraph(campus: Campus): Campus {
  const synced = syncExteriorEmergencyStairs(campus);
  // Before removing an unserved generated landing, retain its authored local
  // Walking Network edges on the canonical Building owner.  The snapshots are
  // deliberately limited to physical local edges; generated floor transitions
  // are always reconciled from the current served-floor set.
  const sourceNodes = synced.navNodes ?? [];
  const sourceEdges = synced.navEdges ?? [];
  synced.buildings = synced.buildings.map((building) => {
    const owners = canonicalExteriorEmergencyStairsForBuilding(building);
    if (owners.length === 0) return building;
    const exteriorEmergencyStairs = owners.map((stair) => {
      const snapshots = { ...(stair.floorConnectionSnapshots ?? {}) };
      const occurrenceNodeIds = { ...(stair.occurrenceNodeIds ?? {}) };
      for (const floor of building.floors ?? []) {
        if (stair.servedFloorIds.includes(floor.id)) continue;
        const sourceOccurrence = sourceNodes.find((node) => node.exteriorEmergencyStairId === stair.id && node.floorId === floor.id);
        const occurrenceId = sourceOccurrence?.id
          ?? stair.occurrenceIds?.[floor.id];
        if (!occurrenceId) continue;
        // Legacy graphs may have a generated node id that differs from the
        // Floor occurrence id. Retain that derived node identity so a later
        // re-serve can reconnect the snapshot to the same live anchor.
        occurrenceNodeIds[floor.id] = sourceOccurrence?.id ?? occurrenceNodeIds[floor.id] ?? occurrenceId;
        const retained = sourceEdges.filter((edge) => {
          if (edge.type === "floor_transition" || edge.type === "cross_floor") return false;
          if (edge.startNodeId !== occurrenceId && edge.endNodeId !== occurrenceId) return false;
          const otherId = edge.startNodeId === occurrenceId ? edge.endNodeId : edge.startNodeId;
          const other = sourceNodes.find((node) => node.id === otherId);
          return !!other && other.buildingId === building.id && other.floorId === floor.id;
        });
        if (retained.length > 0) snapshots[floor.id] = retained.map((edge) => structuredClone(edge));
      }
      return Object.keys(snapshots).length > 0 || Object.keys(occurrenceNodeIds).length > 0
        ? { ...stair, occurrenceNodeIds, floorConnectionSnapshots: Object.keys(snapshots).length > 0 ? snapshots : undefined }
        : { ...stair, occurrenceNodeIds: undefined, floorConnectionSnapshots: undefined };
    });
    return { ...building, exteriorEmergencyStairs };
  });
  const occurrenceIds = new Set<string>();
  for (const building of synced.buildings) {
    for (const floor of building.floors ?? []) {
      for (const stair of floor.stairs ?? []) {
        if (stair.exteriorEmergencyStairId) occurrenceIds.add(stair.id);
      }
    }
  }
  // Resolve generated graph nodes by their owning Building as well as the
  // stair id.  IDs are normally globally unique, but scoping this lookup
  // keeps two hydrated Buildings with the same legacy stair id isolated.
  const ownerForNode = (node: NavigationNode) => {
    const candidates = synced.buildings.flatMap((building) =>
      canonicalExteriorEmergencyStairsForBuilding(building)
        .filter((stair) => stair.id === node.exteriorEmergencyStairId
          && (!node.buildingId || node.buildingId === building.id))
        .map((stair) => ({ building, stair }))
    );
    if (node.floorId) {
      return candidates.find(({ building }) => building.floors.some((floor) => floor.id === node.floorId));
    }
    return candidates.find(({ stair }) => stair.outdoorNodeId === node.id)
      ?? candidates.find(({ building }) => building.id === node.buildingId)
      ?? candidates[0];
  };
  // Pick one deterministic legacy outdoor occurrence per Building/stair owner
  // when older data has multiple copies but no persisted outdoorNodeId. This
  // lets us preserve the existing identity/edges without retaining duplicate
  // discharge anchors.
  const legacyOutdoorByOwner = new Map<string, string>();
  for (const node of sourceNodes) {
    if (node.floorId || node.type !== "stair" || !node.exteriorEmergencyStairId) continue;
    const ownerRecord = ownerForNode(node);
    if (!ownerRecord || ownerRecord.stair.outdoorNodeId) continue;
    const key = `${ownerRecord.building.id}:${ownerRecord.stair.id}`;
    const prior = legacyOutdoorByOwner.get(key);
    if (!prior || node.id.localeCompare(prior) < 0) legacyOutdoorByOwner.set(key, node.id);
  }
  const nodes = (synced.navNodes ?? []).filter((node) => {
    if (!node.exteriorEmergencyStairId) return true;
    const ownerRecord = ownerForNode(node);
    if (!ownerRecord) return false;
    const { building: ownerBuilding, stair: owner } = ownerRecord;
    if (node.floorId) return occurrenceIds.has(node.stairId ?? "")
      && node.buildingId === ownerBuilding.id;
    const hasGround = ownerBuilding.floors.some((floor) =>
      owner.servedFloorIds.includes(floor.id)
      && (floor.number === 1 || /ground/i.test(floor.label ?? "")),
    ) ?? false;
    // Legacy/hydrated stair owners may not yet have persisted outdoorNodeId.
    // Keep one unscoped outdoor occurrence as the canonical candidate in that
    // case so authored discharge edges are not discarded during reconciliation.
    // A node is still required to carry the same stair/building provenance;
    // this does not claim ordinary manual Walking Points by coordinate.
    const legacyOutdoorCandidate = !owner.outdoorNodeId
      && !node.floorId
      && node.type === "stair"
      && legacyOutdoorByOwner.get(`${ownerBuilding.id}:${owner.id}`) === node.id;
    return (owner.outdoorNodeId === node.id || legacyOutdoorCandidate) && hasGround;
  });
  const retainedNodeIds = new Set(nodes.map((node) => node.id));
  let edges = (synced.navEdges ?? []).filter((edge) => retainedNodeIds.has(edge.startNodeId) && retainedNodeIds.has(edge.endNodeId));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeByPair = new Set(edges.map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|")));

  for (const building of synced.buildings) {
    for (const stair of canonicalExteriorEmergencyStairsForBuilding(building)) {
      const occurrenceNodeIds: Record<string, string> = { ...(stair.occurrenceNodeIds ?? {}) };
      const occurrences = building.floors
        .filter((floor) => stair.servedFloorIds.includes(floor.id))
        .flatMap((floor) => (floor.stairs ?? []).filter((item) => item.exteriorEmergencyStairId === stair.id).map((item) => ({ floor, item })));
      for (const { floor, item } of occurrences) {
        const existing = nodes.find((candidate) => candidate.id === item.id
          && candidate.buildingId === building.id
          && candidate.floorId === floor.id
          && candidate.exteriorEmergencyStairId === stair.id)
          ?? nodes.find((candidate) => candidate.exteriorEmergencyStairId === stair.id
            && candidate.buildingId === building.id
            && candidate.floorId === floor.id
            && candidate.stairId === item.id);
        const authoredNodeId = occurrenceNodeIds[floor.id];
        const authoredNode = authoredNodeId ? nodeById.get(authoredNodeId) : undefined;
        const nodeId = authoredNodeId
          && (!authoredNode || (authoredNode.buildingId === building.id && authoredNode.floorId === floor.id))
          ? authoredNodeId
          : existing?.id ?? crypto.randomUUID();
        occurrenceNodeIds[floor.id] = nodeId;
        const indoorAccess = exteriorEmergencyStairIndoorAccessPosition(floor, item);
        const node: NavigationNode = {
          // A malformed/legacy id can occasionally point at a stale linked
          // node. Strip unrelated physical references before reusing that id
          // so the generated stair anchor cannot be filtered as a Room/Door
          // node or rendered with the wrong semantic owner.
          ...((() => {
            const prior = nodeById.get(nodeId);
            if (!prior) return {};
            const { roomId: _roomId, doorId: _doorId, elevatorId: _elevatorId, rampId: _rampId, pathJunction: _pathJunction, ...safePrior } = prior;
            return safePrior;
          })()),
          id: nodeId,
          name: item.label,
          type: "stair",
          x: indoorAccess.x,
          y: indoorAccess.y,
          campusId: synced.id,
          buildingId: building.id,
          floorId: floor.id,
          stairId: item.id,
          exteriorEmergencyStairId: stair.id,
          transitionSharedId: stair.sharedId || stair.id,
          accessible: false,
          emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
          emergencyStair: true,
          color: "#dc2626",
        };
        nodeById.set(nodeId, node);
        const index = nodes.findIndex((candidate) => candidate.id === nodeId);
        if (index >= 0) nodes[index] = node; else nodes.push(node);
      }
      // Ground is the only valid outdoor discharge floor. Floor order is
      // canonical in the editor, while the explicit number/label fallback
      // keeps hydrated legacy campuses deterministic if their array order was
      // changed. A stair that does not serve Ground still gets its configured
      // upper landings, but no false outdoor discharge is authored.
      const ground = occurrences.find(({ floor }) => floor.number === 1 || /ground/i.test(floor.label ?? ""));
      // The outdoor discharge anchor is generated for every authored stair,
      // even while Ground is not currently served.  This keeps the Outdoor
      // editor connect target present for legacy/partial configurations; the
      // readiness adapter still reports the stair incomplete until a Ground
      // occurrence and its discharge bridge exist.
      const pos = exteriorEmergencyStairWorldPosition(building, stair);
      const legacyOutdoorNode = !stair.outdoorNodeId
        ? sourceNodes.find((node) => node.exteriorEmergencyStairId === stair.id
          && !node.floorId
          && node.type === "stair"
          && (!node.buildingId || node.buildingId === building.id))
        : undefined;
      const authoredOutdoorId = stair.outdoorNodeId ?? legacyOutdoorNode?.id;
      const conflictingOutdoor = authoredOutdoorId
        ? nodes.find((node) => node.id === authoredOutdoorId && !!node.buildingId && node.buildingId !== building.id)
        : undefined;
      const outdoorId = authoredOutdoorId && !conflictingOutdoor ? authoredOutdoorId : crypto.randomUUID();
      const outdoorNode: NavigationNode = {
        ...(nodeById.get(outdoorId) ?? {}),
        id: outdoorId,
        name: stair.label,
        type: "stair",
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        campusId: synced.id,
        // Keep the generated outdoor discharge explicitly owned by the same
        // Building as its canonical stair.  It is still an outdoor node
        // (floorId remains absent), but cannot be mistaken for another
        // Building's generated discharge when multiple buildings are present.
        buildingId: building.id,
        exteriorEmergencyStairId: stair.id,
        transitionSharedId: stair.sharedId || stair.id,
        accessible: false,
        emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
        emergencyStair: true,
        color: "#dc2626",
      };
      nodeById.set(outdoorId, outdoorNode);
      const outdoorIndex = nodes.findIndex((candidate) => candidate.id === outdoorId);
      if (outdoorIndex >= 0) nodes[outdoorIndex] = outdoorNode; else nodes.push(outdoorNode);
      if (!ground) {
        synced.buildings = synced.buildings.map((candidate) => candidate.id !== building.id
          ? candidate
          : { ...candidate, exteriorEmergencyStairs: canonicalExteriorEmergencyStairsForBuilding(candidate).map((item) => item.id === stair.id ? { ...item, outdoorNodeId: outdoorId, occurrenceNodeIds } : item) });
        continue;
      }
      const groundNode = nodes.find((node) => node.stairId === ground.item.id && node.floorId === ground.floor.id);
      if (groundNode) {
        const pair = [outdoorId, groundNode.id].sort().join("|");
        if (!edgeByPair.has(pair)) {
          edges.push({ id: crypto.randomUUID(), startNodeId: outdoorId, endNodeId: groundNode.id, distance: 1, bidirectional: true, accessible: false, emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false, type: "floor_transition", color: "#dc2626", width: 1 });
          edgeByPair.add(pair);
        }
      }
      if (stair.outdoorNodeId !== outdoorId || Object.keys(occurrenceNodeIds).some((floorId) => stair.occurrenceNodeIds?.[floorId] !== occurrenceNodeIds[floorId])) {
        const updatedBuildings = synced.buildings.map((candidate) => candidate.id !== building.id
          ? candidate
          : { ...candidate, exteriorEmergencyStairs: canonicalExteriorEmergencyStairsForBuilding(candidate).map((item) => item.id === stair.id ? { ...item, outdoorNodeId: outdoorId, occurrenceNodeIds } : item) });
        synced.buildings = updatedBuildings;
      }
    }
  }

  // Restore a previously authored local connection when a served Floor is
  // re-enabled.  A snapshot is only restored when every endpoint is live and
  // still belongs to that Floor; deleted targets are discarded safely so no
  // dangling edge can return to the graph.
  const edgeIds = new Set(edges.map((edge) => edge.id));
  const edgePairs = new Set(edges.map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|")));
  synced.buildings = synced.buildings.map((building) => {
    const exteriorEmergencyStairs = canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => {
      const snapshots = { ...(stair.floorConnectionSnapshots ?? {}) };
      let changed = false;
      for (const floor of building.floors ?? []) {
        if (!stair.servedFloorIds.includes(floor.id)) continue;
        const snapshotEdges = snapshots[floor.id];
        if (!snapshotEdges || snapshotEdges.length === 0) continue;
        const occurrence = floor.stairs?.find((item) => item.exteriorEmergencyStairId === stair.id);
        const occurrenceNode = occurrence && nodes.find((node) => node.stairId === occurrence.id && node.floorId === floor.id);
        if (!occurrenceNode) continue;
        const liveSnapshots = snapshotEdges.filter((snapshot) => {
          if (snapshot.type === "floor_transition" || snapshot.type === "cross_floor") return false;
          if (snapshot.startNodeId !== occurrenceNode.id && snapshot.endNodeId !== occurrenceNode.id) return false;
          const otherId = snapshot.startNodeId === occurrenceNode.id ? snapshot.endNodeId : snapshot.startNodeId;
          const other = nodes.find((node) => node.id === otherId);
          return !!other && other.buildingId === building.id && other.floorId === floor.id;
        });
        if (liveSnapshots.length === 0) {
          delete snapshots[floor.id];
          changed = true;
          continue;
        }
        for (const snapshot of liveSnapshots) {
          const pair = [snapshot.startNodeId, snapshot.endNodeId].sort().join("|");
          if (edgeIds.has(snapshot.id) || edgePairs.has(pair)) continue;
          edges.push(structuredClone(snapshot));
          edgeIds.add(snapshot.id);
          edgePairs.add(pair);
        }
      }
      if (!changed) return stair;
      return Object.keys(snapshots).length > 0 ? { ...stair, floorConnectionSnapshots: snapshots } : { ...stair, floorConnectionSnapshots: undefined };
    });
    return { ...building, exteriorEmergencyStairs };
  });
  for (const building of synced.buildings) {
    edges = reconcileCrossFloorTransitions(nodes, edges, building.floors, building.id);
  }
  return { ...synced, navNodes: nodes, navEdges: edges };
}
