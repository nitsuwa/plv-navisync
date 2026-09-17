import type {
  Campus,
  CampusBuilding,
  CampusEntrance,
  FloorEntranceRamp,
  FloorEntranceSteps,
  FloorExteriorZone,
  FloorPlan,
  NavigationEdge,
  NavigationNode,
} from "../components/map-builder/types";
import {
  exteriorZoneAccessFeatureGeometry,
  exteriorZoneCoversEntrance,
  exteriorZoneGeometry,
  isExteriorAccessParent,
} from "./exteriorFloorZones";
import {
  doorNodeForEdge,
  entranceNodeForEdge,
  findEntranceOutdoorConnection,
  findEntranceTransitionForEntrance,
} from "./entranceTransitions";
import { normalizeEntranceDirection, normalizeEntranceType } from "./buildingEntrances";
import { navEdgeDistance } from "./navigationGraph";

/**
 * Navigation derived from exterior architecture is still the canonical
 * NavigationNode/NavigationEdge graph.  These small provenance fields make
 * ownership explicit, so a Veranda/Ramp/Steps delete can remove only its own
 * topology without a nearest-node repair pass.
 */
export type ExteriorApproachOwnerType =
  | "exterior_zone"
  | "entrance_steps"
  | "entrance_ramp"
  | "entrance_threshold";

export const EXTERIOR_APPROACH_EDGE_TYPE = "exterior_approach";
export const EXTERIOR_APPROACH_THRESHOLD_EDGE_TYPE = "entrance_threshold";

/** Deterministic RFC-4122-shaped UUID for derived graph identities. */
export function stableExteriorApproachUuid(seed: string): string {
  // Four independent FNV-style lanes avoid depending on crypto APIs while
  // still producing a stable UUID across browser sessions and reloads.
  const lanes = [0x811c9dc5, 0x9e3779b9, 0x243f6a88, 0xb7e15162];
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= (code + lane * 17 + index * 13) & 0xff;
      lanes[lane] = Math.imul(lanes[lane], 0x01000193) >>> 0;
      // Keep every lane unsigned after the mixing step. Without this final
      // normalization a negative signed 32-bit value can stringify with a
      // leading '-' and produce an invalid/non-RFC UUID (and therefore fail
      // persistence in UUID-backed navigation columns).
      lanes[lane] = (lanes[lane] ^ (lanes[(lane + 1) % lanes.length] >>> 7)) >>> 0;
    }
  }
  const hex = lanes.map((lane) => lane.toString(16).padStart(8, "0")).join("").slice(0, 32).split("");
  // RFC 4122 version 5 + RFC variant.  The value is deterministic, but is
  // intentionally not used as a DB foreign key to any physical object.
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export function exteriorApproachNodeId(
  campusId: string,
  buildingId: string,
  floorId: string,
  ownerType: ExteriorApproachOwnerType,
  ownerId: string,
  role: "outer" | "inner" | "zone" | "threshold",
): string {
  return stableExteriorApproachUuid(`plv:exterior-approach:node:${campusId}:${buildingId}:${floorId}:${ownerType}:${ownerId}:${role}`);
}

export function exteriorApproachEdgeId(
  campusId: string,
  buildingId: string,
  floorId: string,
  ownerType: ExteriorApproachOwnerType,
  ownerId: string,
  role: string,
): string {
  return stableExteriorApproachUuid(`plv:exterior-approach:edge:${campusId}:${buildingId}:${floorId}:${ownerType}:${ownerId}:${role}`);
}

type ApproachNode = NavigationNode & {
  derivedOwnerType: ExteriorApproachOwnerType;
  derivedOwnerId: string;
  derivedRole: "outer" | "inner" | "zone" | "threshold";
};

type ApproachEdge = NavigationEdge & {
  derivedOwnerType: ExteriorApproachOwnerType;
  derivedOwnerId: string;
  derivedRole: "outer" | "inner" | "zone" | "threshold" | "handoff" | "fallback";
};

function nodeForOwner(
  previous: Map<string, NavigationNode>,
  next: ApproachNode,
): NavigationNode {
  const existing = previous.get(next.id);
  return existing && JSON.stringify(existing) === JSON.stringify(next) ? existing : next;
}

function edgeForOwner(
  previous: Map<string, NavigationEdge>,
  next: ApproachEdge,
): NavigationEdge {
  const existing = previous.get(next.id);
  return existing && JSON.stringify(existing) === JSON.stringify(next) ? existing : next;
}

function approachNode(
  campus: Campus,
  building: CampusBuilding,
  floor: FloorPlan,
  ownerType: ExteriorApproachOwnerType,
  ownerId: string,
  role: ApproachNode["derivedRole"],
  point: { x: number; y: number },
  extras: Partial<NavigationNode> = {},
): ApproachNode {
  return {
    id: exteriorApproachNodeId(campus.id, building.id, floor.id, ownerType, ownerId, role),
    name: role === "outer" ? "Approach" : role === "inner" ? "Landing" : role === "threshold" ? "Entrance threshold" : "Veranda",
    type: role === "outer" ? (ownerType === "entrance_ramp" ? "ramp" : "transition") : role === "inner" ? (ownerType === "entrance_ramp" ? "ramp" : "transition") : role === "threshold" ? "entrance" : "hallway",
    x: Math.round(point.x),
    y: Math.round(point.y),
    campusId: campus.id,
    buildingId: building.id,
    ...(role === "outer" ? {} : { floorId: floor.id }),
    accessible: extras.accessible !== false,
    color: ownerType === "entrance_ramp" ? "#0f766e" : "#7c3aed",
    emergencySafe: extras.emergencySafe,
    ...extras,
    derivedOwnerType: ownerType,
    derivedOwnerId: ownerId,
    derivedRole: role,
  };
}

function approachEdge(
  campus: Campus,
  building: CampusBuilding,
  floor: FloorPlan,
  ownerType: ExteriorApproachOwnerType,
  ownerId: string,
  role: ApproachEdge["derivedRole"],
  startNodeId: string,
  endNodeId: string,
  nodes: NavigationNode[],
  extras: Partial<NavigationEdge> = {},
  identityRole = role,
): ApproachEdge {
  const start = nodes.find((node) => node.id === startNodeId);
  const end = nodes.find((node) => node.id === endNodeId);
  const accessible = extras.accessible !== false;
  const autoBends = start && end && start.x !== end.x && start.y !== end.y
    ? [{ x: end.x, y: start.y }]
    : [];
  const bendPoints = extras.bendPoints ?? (autoBends.length > 0 ? autoBends : undefined);
  const points = start && end ? [start, ...(bendPoints ?? []), end] : [];
  const distance = extras.distance ?? (points.length > 1
    ? points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0)
    : navEdgeDistance(start, end));
  return {
    // A single Veranda may serve several Entrances.  Keep provenance owned by
    // the zone while adding the Entrance to the deterministic identity key so
    // each zone-to-threshold edge survives reconciliation instead of the last
    // plan overwriting the earlier one.
    id: exteriorApproachEdgeId(campus.id, building.id, floor.id, ownerType, ownerId, identityRole),
    startNodeId,
    endNodeId,
    distance,
    bidirectional: true,
    accessible,
    emergencySafe: extras.emergencySafe === true,
    type: extras.type ?? EXTERIOR_APPROACH_EDGE_TYPE,
    color: ownerType === "entrance_ramp" ? "#0f766e" : "#7c3aed",
    width: 3,
    ...(bendPoints ? { bendPoints } : {}),
    ...extras,
    derivedOwnerType: ownerType,
    derivedOwnerId: ownerId,
    derivedRole: role,
  };
}

function floorPointForFeature(
  zone: FloorExteriorZone,
  feature: FloorEntranceSteps | FloorEntranceRamp,
  floor: FloorPlan,
): { outer: { x: number; y: number }; inner: { x: number; y: number } } | null {
  const parent = exteriorZoneGeometry(zone, floor.canvasW ?? 600, floor.canvasH ?? 450);
  const geometry = exteriorZoneAccessFeatureGeometry(zone, feature, floor.canvasW ?? 600, floor.canvasH ?? 450);
  if (!geometry) return null;
  const center = { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
  const inner = { ...center };
  const edge = geometry.edge;
  if (edge === "outer") {
    // `zone.side` is the wall the veranda is attached to. The inner landing
    // is on the veranda's exposed/outer boundary (where the approach feature
    // meets the walkable zone), not on the building-facing wall. Keeping this
    // explicit for all four sides prevents the anchor from appearing inside
    // the building, especially for South/Bottom verandas.
    if (zone.side === "top") inner.y = parent.y;
    else if (zone.side === "bottom") inner.y = parent.y + parent.height;
    else if (zone.side === "left") inner.x = parent.x;
    else inner.x = parent.x + parent.width;
  } else if (edge === "start") {
    if (zone.side === "top" || zone.side === "bottom") inner.x = parent.x;
    else inner.y = parent.y;
  } else {
    if (zone.side === "top" || zone.side === "bottom") inner.x = parent.x + parent.width;
    else inner.y = parent.y + parent.height;
  }
  return { outer: center, inner };
}

/** Project a Floor-local point into the Campus coordinate space used by the
 * outdoor graph.  Exterior zones/features are authored in the Floor canvas,
 * while Building Entrance nodes are campus-level; using the existing
 * Building frame keeps the derived outer anchor attached through building
 * moves/rotation without any proximity matching. */
export function exteriorFloorPointToCampusWorld(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  floor: Pick<FloorPlan, "canvasW" | "canvasH">,
  point: { x: number; y: number },
): { x: number; y: number } {
  const floorW = Math.max(1, Number(floor.canvasW) || 600);
  const floorH = Math.max(1, Number(floor.canvasH) || 450);
  const local = {
    x: building.x + (point.x / floorW) * building.width,
    y: building.y + (point.y / floorH) * building.height,
  };
  const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
  if (!rotation) return { x: Math.round(local.x), y: Math.round(local.y) };
  const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const dx = local.x - center.x;
  const dy = local.y - center.y;
  return {
    x: Math.round(center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation)),
    y: Math.round(center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation)),
  };
}

/** Inverse of exteriorFloorPointToCampusWorld for Floor-editor overlays. */
export function campusWorldPointToExteriorFloor(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  floor: Pick<FloorPlan, "canvasW" | "canvasH">,
  point: { x: number; y: number },
): { x: number; y: number } {
  const rotation = -((building.rotation ?? 0) * Math.PI) / 180;
  const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const local = rotation === 0
    ? point
    : {
      x: center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation),
      y: center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation),
    };
  const floorW = Math.max(1, Number(floor.canvasW) || 600);
  const floorH = Math.max(1, Number(floor.canvasH) || 450);
  return {
    x: ((local.x - building.x) / Math.max(1, building.width)) * floorW,
    y: ((local.y - building.y) / Math.max(1, building.height)) * floorH,
  };
}

function hasOutdoorConnection(
  edges: NavigationEdge[],
  nodes: NavigationNode[],
  nodeId: string,
  blockedEdgeIds?: ReadonlySet<string>,
  accessibleOnly = false,
  entranceNodeId?: string,
): boolean {
  const anchors = [...new Set([nodeId, entranceNodeId].filter((id): id is string => !!id))];
  return edges.some((edge) => {
    if ((edge.derivedOwnerType && !(edge.exteriorApproachAutoHandoffTargetId && (edge.startNodeId === nodeId || edge.endNodeId === nodeId)))
      || edge.closed === true
      || blockedEdgeIds?.has(edge.id)) return false;
    if (accessibleOnly && edge.accessible === false) return false;
    const anchorId = anchors.find((id) => edge.startNodeId === id || edge.endNodeId === id);
    if (!anchorId || (anchorId === entranceNodeId && edge.type === "entrance_transition")) return false;
    const otherId = edge.startNodeId === anchorId ? edge.endNodeId : edge.startNodeId;
    const other = nodes.find((node) => node.id === otherId);
    return !!other && !other.floorId && !other.entranceId && !other.exteriorEmergencyStairId
      && !other.derivedOwnerType
      && (!accessibleOnly || other.accessible !== false);
  });
}

/**
 * Completion is explicit authoring, not proximity: the physical traversal
 * (outer -> inner) is derived, but its Veranda-side connection to the
 * Entrance threshold must be a normal authored walking path.  This keeps the
 * direct Entrance bridge available until the admin actually completes the
 * approach.
 */
function hasAuthoredConnection(
  edges: NavigationEdge[],
  startId: string,
  endId: string,
  allowedNodeIds?: ReadonlySet<string>,
  blockedEdgeIds?: ReadonlySet<string>,
  accessibleOnly = false,
): boolean {
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.derivedOwnerType || edge.closed === true || blockedEdgeIds?.has(edge.id) || (accessibleOnly && edge.accessible === false)) continue;
    if (allowedNodeIds && (!allowedNodeIds.has(edge.startNodeId) || !allowedNodeIds.has(edge.endNodeId))) continue;
    if (!adjacent.has(edge.startNodeId)) adjacent.set(edge.startNodeId, []);
    if (!adjacent.has(edge.endNodeId)) adjacent.set(edge.endNodeId, []);
    adjacent.get(edge.startNodeId)!.push(edge.endNodeId);
    adjacent.get(edge.endNodeId)!.push(edge.startNodeId);
  }
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === endId) return true;
    for (const next of adjacent.get(id) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

export type ExteriorApproachStatus =
  | "Ready"
  | "Needs Entrance"
  | "Needs walking connection"
  | "Entrance outside Veranda"
  | "Campus connection needed"
  | "Path blocked"
  | "Entrance ready · Exit needs connection"
  | "Exit ready · Entrance needs connection"
  | "Not walkable";

export interface ExteriorApproachEntranceReadiness {
  status: ExteriorApproachStatus;
  standardReady: boolean;
  accessibleReady: boolean;
  hasWalkingConnection: boolean;
  hasOutdoorConnection: boolean;
  hasBlockedConnection: boolean;
  /** Direction-specific routine readiness for a shared Veranda summary. */
  inboundReady: boolean;
  outboundReady: boolean;
  accessibleInboundReady: boolean;
  accessibleOutboundReady: boolean;
}

function servedEntranceIds(zone: FloorExteriorZone): string[] {
  return [...new Set([
    ...(zone.linkedEntranceIds ?? []),
    ...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []),
  ])];
}

/**
 * Canonical graph truth for one Veranda/Entrance pair.  Properties, route
 * fallback selection, and validation should all consume this result rather
 * than independently inferring readiness from the visual relationship.
 */
export function exteriorApproachEntranceReadiness(
  campus: Campus,
  buildingId: string,
  floorId: string,
  zoneId: string,
  entranceId: string,
  blockedEdgeIds?: ReadonlySet<string>,
): ExteriorApproachEntranceReadiness {
  const building = (campus.buildings ?? []).find((item) => item.id === buildingId);
  const floor = building?.floors?.find((item) => item.id === floorId);
  const zone = floor?.exteriorZones?.find((item) => item.id === zoneId);
  const entrance = building?.entrances?.find((item) => item.id === entranceId);
  if (!building || !floor || !zone || zone.walkable !== true) {
    return { status: "Not walkable", standardReady: false, accessibleReady: false, hasWalkingConnection: false, hasOutdoorConnection: false, hasBlockedConnection: false, inboundReady: false, outboundReady: false, accessibleInboundReady: false, accessibleOutboundReady: false };
  }
  const children: { feature: FloorEntranceSteps | FloorEntranceRamp; featureType: "entrance_steps" | "entrance_ramp" }[] = [
    ...(floor.entranceSteps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_steps" as const })),
    ...(floor.entranceRamps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_ramp" as const })),
  ];
  const zoneLinksEntrance = servedEntranceIds(zone).includes(entranceId)
    || children.some(({ feature }) => feature.linkedEntranceId === entranceId);
  if (!entrance || !zoneLinksEntrance) {
    return { status: "Needs Entrance", standardReady: false, accessibleReady: false, hasWalkingConnection: false, hasOutdoorConnection: false, hasBlockedConnection: false, inboundReady: false, outboundReady: false, accessibleInboundReady: false, accessibleOutboundReady: false };
  }

  // Preserve legacy links for inspection, but never treat a physically
  // detached Entrance as a complete Veranda approach. The relationship is
  // canonical side + normalized wall-span metadata, not visual proximity.
  if (!exteriorZoneCoversEntrance(zone, entrance, floor.canvasW ?? 600, floor.canvasH ?? 450)) {
    return { status: "Entrance outside Veranda", standardReady: false, accessibleReady: false, hasWalkingConnection: false, hasOutdoorConnection: false, hasBlockedConnection: false, inboundReady: false, outboundReady: false, accessibleInboundReady: false, accessibleOutboundReady: false };
  }

  const nodes = campus.navNodes ?? [];
  const edges = campus.navEdges ?? [];
  const threshold = nodes.find((node) =>
    node.id === exteriorApproachNodeId(campus.id, building.id, floor.id, "entrance_threshold", entrance.id, "threshold")
      && node.derivedOwnerType === "entrance_threshold"
      && node.derivedOwnerId === entrance.id
      && node.derivedRole === "threshold",
  );
  if (!threshold) {
    return { status: "Needs walking connection", standardReady: false, accessibleReady: false, hasWalkingConnection: false, hasOutdoorConnection: false, hasBlockedConnection: false, inboundReady: false, outboundReady: false, accessibleInboundReady: false, accessibleOutboundReady: false };
  }

  const canvasW = floor.canvasW ?? 600;
  const canvasH = floor.canvasH ?? 450;
  const zoneGeometry = exteriorZoneGeometry(zone, canvasW, canvasH);
  const zonePoint = { x: zoneGeometry.x + zoneGeometry.width / 2, y: zoneGeometry.y + zoneGeometry.height / 2 };
  const zoneWalkingPoints = nodes.filter((node) => (
    !node.derivedOwnerType
    && node.exteriorZoneId === zone.id
    && node.floorId === floor.id
    && node.visible !== false
    && node.x >= zoneGeometry.x
    && node.x <= zoneGeometry.x + zoneGeometry.width
    && node.y >= zoneGeometry.y
    && node.y <= zoneGeometry.y + zoneGeometry.height
  ));
  const linkedChildren = children.filter(({ feature }) => feature.linkedEntranceId
    ? feature.linkedEntranceId === entranceId
    : zoneLinksEntrance);
   // A linked zone without an applicable physical access feature is not an
   // exterior transition.  Its ordinary Walking Points remain authorable, but
   // the direct Entrance fallback is the only route option until a Ramp or
   // Steps feature is linked and connected.
  const choices = linkedChildren;
  const zoneNodeIds = new Set([
    threshold.id,
    ...zoneWalkingPoints.map((node) => node.id),
    ...nodes.filter((node) => node.floorId === floor.id && node.exteriorZoneId === zone.id).map((node) => node.id),
  ]);

  let hasWalking = false;
  let hasOutdoor = false;
  let hasBlocked = false;
  let standardReady = false;
  let accessibleReady = false;
  let inboundReady = false;
  let outboundReady = false;
  let accessibleInboundReady = false;
  let accessibleOutboundReady = false;
  const generalEntranceCount = (building.entrances ?? []).filter((candidate) =>
    normalizeEntranceType(candidate.type) === "general"
      && !!findEntranceTransitionForEntrance(nodes, edges, building.id, candidate.id),
  ).length;
  for (const choice of choices) {
    const feature = choice.feature;
    const featureType = choice.featureType;
    const featurePoints = feature ? floorPointForFeature(zone, feature, floor) : null;
    const ownerId = feature?.id ?? zone.id;
    const outerId = exteriorApproachNodeId(campus.id, building.id, floor.id, featureType, ownerId, "outer");
    const handoffId = feature
      ? exteriorApproachNodeId(campus.id, building.id, floor.id, featureType, feature.id, "inner")
      : zoneWalkingPoints
        .map((node) => ({ node, distance: Math.hypot(node.x - (featurePoints?.inner ?? zonePoint).x, node.y - (featurePoints?.inner ?? zonePoint).y) }))
        .sort((a, b) => a.distance - b.distance)[0]?.node.id;
    if (!handoffId) continue;
    zoneNodeIds.add(handoffId);
    const completeWalking = hasAuthoredConnection(edges, handoffId, threshold.id, zoneNodeIds, blockedEdgeIds);
    // Some existing authoring sessions connect the first Veranda Walking
    // Point to the physical Entrance anchor. The stable derived threshold is
    // the semantic route anchor, but the threshold→Entrance bridge is derived
    // and intentionally excluded from authored-edge evidence above. Accept
    // either canonical Entrance-side anchor so readiness reflects the actual
    // authored green path without counting a direct campus edge or proximity.
    const entranceNode = nodes.find((node) => node.buildingId === building.id
      && node.entranceId === entrance.id
      && !node.floorId);
    if (entranceNode) zoneNodeIds.add(entranceNode.id);
    const completeWalkingFromEntrance = entranceNode
      ? hasAuthoredConnection(edges, handoffId, entranceNode.id, zoneNodeIds, blockedEdgeIds)
      : false;
    const walkingIgnoringBlocked = hasAuthoredConnection(edges, handoffId, threshold.id, zoneNodeIds);
    const walkingFromEntranceIgnoringBlocked = entranceNode
      ? hasAuthoredConnection(edges, handoffId, entranceNode.id, zoneNodeIds)
      : false;
    const completeOutdoor = hasOutdoorConnection(edges, nodes, outerId, blockedEdgeIds, false, entranceNode?.id);
    const outdoorIgnoringBlocked = hasOutdoorConnection(edges, nodes, outerId, undefined, false, entranceNode?.id);
    const completeAccessibleOutdoor = hasOutdoorConnection(edges, nodes, outerId, blockedEdgeIds, true, entranceNode?.id);
    const completeAccessibleWalking = featureType === "entrance_ramp"
      && hasAuthoredConnection(edges, handoffId, threshold.id, zoneNodeIds, blockedEdgeIds, true);
    hasWalking ||= completeWalking || completeWalkingFromEntrance;
    hasOutdoor ||= completeOutdoor;
    hasBlocked ||= (walkingIgnoringBlocked && !completeWalking && !(walkingFromEntranceIgnoringBlocked && completeWalkingFromEntrance)) || (outdoorIgnoringBlocked && !completeOutdoor);
    const standardComplete = (completeWalking || completeWalkingFromEntrance) && completeOutdoor;
    const accessibleComplete = (completeAccessibleWalking || (featureType === "entrance_ramp" && !!entranceNode
      && hasAuthoredConnection(edges, handoffId, entranceNode.id, zoneNodeIds, blockedEdgeIds, true))) && completeAccessibleOutdoor
      && featureType === "entrance_ramp"
      && entrance.accessible !== false
      && feature?.accessible !== false;
    standardReady ||= standardComplete;
    accessibleReady ||= accessibleComplete;
    const direction = normalizeEntranceDirection(entrance);
    const bidirectionalCompatibility = normalizeEntranceType(entrance.type) === "general" && generalEntranceCount === 1;
    const allowsInbound = bidirectionalCompatibility || direction !== "exit_only";
    const allowsOutbound = bidirectionalCompatibility || direction !== "entrance_only";
    inboundReady ||= standardComplete && allowsInbound;
    outboundReady ||= standardComplete && allowsOutbound;
    accessibleInboundReady ||= accessibleComplete && allowsInbound;
    accessibleOutboundReady ||= accessibleComplete && allowsOutbound;
  }

  const status: ExteriorApproachStatus = standardReady
    ? "Ready"
    : hasBlocked
      ? "Path blocked"
      : !hasOutdoor
        ? "Campus connection needed"
        : !hasWalking
          ? "Needs walking connection"
          : "Needs walking connection";
  return { status, standardReady, accessibleReady, hasWalkingConnection: hasWalking, hasOutdoorConnection: hasOutdoor, hasBlockedConnection: hasBlocked, inboundReady, outboundReady, accessibleInboundReady, accessibleOutboundReady };
}

export function exteriorApproachZoneReadiness(
  campus: Campus,
  buildingId: string,
  floorId: string,
  zoneId: string,
  blockedEdgeIds?: ReadonlySet<string>,
): { status: ExteriorApproachStatus; standardReady: boolean; accessibleReady: boolean; inboundReady: boolean; outboundReady: boolean; entrances: ExteriorApproachEntranceReadiness[] } {
  const building = (campus.buildings ?? []).find((item) => item.id === buildingId);
  const floor = building?.floors?.find((item) => item.id === floorId);
  const zone = floor?.exteriorZones?.find((item) => item.id === zoneId);
  if (!zone || zone.walkable !== true) return { status: "Not walkable", standardReady: false, accessibleReady: false, inboundReady: false, outboundReady: false, entrances: [] };
  const ids = [...new Set([
    ...servedEntranceIds(zone),
    ...(floor.entranceSteps ?? []).filter((item) => item.parentZoneId === zone.id && item.linkedEntranceId).map((item) => item.linkedEntranceId as string),
    ...(floor.entranceRamps ?? []).filter((item) => item.parentZoneId === zone.id && item.linkedEntranceId).map((item) => item.linkedEntranceId as string),
  ])];
  if (ids.length === 0) return { status: "Needs Entrance", standardReady: false, accessibleReady: false, inboundReady: false, outboundReady: false, entrances: [] };
  const entrances = ids.map((entranceId) => exteriorApproachEntranceReadiness(campus, buildingId, floorId, zoneId, entranceId, blockedEdgeIds));
  // A Veranda is one shared routing workspace, but applicability is per
  // Entrance. The summary therefore needs one usable routine branch in each
  // travel direction; an inbound-only Entrance must not make outbound status
  // look Ready, and vice versa. A single normal General door keeps the
  // compatibility fallback through both directions.
  const inboundReady = entrances.some((entry) => entry.inboundReady);
  const outboundReady = entrances.some((entry) => entry.outboundReady);
  const accessibleInboundReady = entrances.some((entry) => entry.accessibleInboundReady);
  const accessibleOutboundReady = entrances.some((entry) => entry.accessibleOutboundReady);
  const standardReady = inboundReady && outboundReady;
  const accessibleReady = accessibleInboundReady && accessibleOutboundReady;
  const partialDirectionalStatus: ExteriorApproachStatus | undefined = inboundReady && !outboundReady
    ? "Entrance ready · Exit needs connection"
    : outboundReady && !inboundReady
      ? "Exit ready · Entrance needs connection"
      : undefined;
  const status = standardReady
    ? "Ready"
    : entrances.some((entry) => entry.status === "Path blocked")
      ? "Path blocked"
      : partialDirectionalStatus
        ?? entrances.find((entry) => entry.status === "Campus connection needed")?.status
        ?? entrances.find((entry) => entry.status === "Entrance outside Veranda")?.status
        ?? entrances.find((entry) => entry.status === "Needs walking connection")?.status
        ?? "Needs Entrance";
  return { status, standardReady, accessibleReady, inboundReady, outboundReady, entrances };
}

/**
 * Determine readiness from the canonical graph rather than from the visual
 * Veranda/Entrance relationship.  A served Entrance is ready only when its
 * explicit outer approach is connected to the outdoor network and an
 * authored, non-derived path reaches that Entrance's stable threshold node.
 * The helper intentionally mirrors the plan selection in the reconciler so a
 * status badge cannot report Ready for a merely nearby or incomplete path.
 */
export function exteriorApproachEntranceIsReady(
  campus: Campus,
  buildingId: string,
  floorId: string,
  zoneId: string,
  entranceId: string,
): boolean {
  return exteriorApproachEntranceReadiness(campus, buildingId, floorId, zoneId, entranceId).standardReady;
}

/**
 * Remove one Veranda/Entrance relationship and reconcile the derived approach
 * graph in the same pure update. Older feature records may also contain a
 * copied `linkedEntranceId`, so clear that stale child association when it
 * refers to the relationship being removed. Authored Walking Points/edges are
 * intentionally untouched; reconciliation removes only derived approach
 * records and their incident edges.
 */
export function unlinkExteriorApproachEntrance(
  campus: Campus,
  buildingId: string,
  floorId: string,
  zoneId: string,
  entranceId: string,
): Campus {
  const building = (campus.buildings ?? []).find((item) => item.id === buildingId);
  const floor = building?.floors?.find((item) => item.id === floorId);
  const zone = floor?.exteriorZones?.find((item) => item.id === zoneId);
  if (!building || !floor || !zone) return campus;

  const currentIds = servedEntranceIds(zone);
  if (!currentIds.includes(entranceId)) return campus;
  const remainingIds = currentIds.filter((id) => id !== entranceId);
  const nextZone: FloorExteriorZone = {
    ...zone,
    linkedEntranceIds: remainingIds.length > 0 ? remainingIds : undefined,
    linkedEntranceId: remainingIds[0],
  };
  const clearCopiedLink = <T extends FloorEntranceSteps | FloorEntranceRamp>(item: T): T => (
    item.parentZoneId === zoneId && item.linkedEntranceId === entranceId
      ? { ...item, linkedEntranceId: undefined }
      : item
  );
  const nextFloor: FloorPlan = {
    ...floor,
    exteriorZones: (floor.exteriorZones ?? []).map((item) => item.id === zoneId ? nextZone : item),
    entranceSteps: (floor.entranceSteps ?? []).map(clearCopiedLink),
    entranceRamps: (floor.entranceRamps ?? []).map(clearCopiedLink),
  };
  const next: Campus = {
    ...campus,
    buildings: (campus.buildings ?? []).map((item) => item.id === buildingId
      ? { ...item, floors: item.floors.map((candidate) => candidate.id === floorId ? nextFloor : candidate) }
      : item),
  };
  return reconcileExteriorApproachNavigation(next);
}

function restoreFallbackEdge(edge: NavigationEdge): NavigationEdge {
  if (!edge.exteriorApproachFallbackEntranceId) return edge;
  const {
    exteriorApproachFallbackEntranceId: _entrance,
    exteriorApproachFallbackOriginalClosed: originalClosed,
    exteriorApproachFallbackOriginalDistance: originalDistance,
    ...rest
  } = edge;
  const restored = { ...rest };
  if (originalClosed === undefined) delete restored.closed;
  else restored.closed = originalClosed;
  if (originalDistance !== undefined) restored.distance = originalDistance;
  return restored;
}

function restoreSuspendedApproachEdge(edge: NavigationEdge, zoneById: Map<string, FloorExteriorZone>): NavigationEdge {
  const zoneId = edge.exteriorApproachSuspendedZoneId;
  if (!zoneId || zoneById.get(zoneId)?.walkable !== true) return edge;
  const {
    exteriorApproachSuspendedZoneId: _zone,
    exteriorApproachSuspendedOriginalClosed: originalClosed,
    ...rest
  } = edge;
  const restored = { ...rest };
  if (originalClosed === undefined) delete restored.closed;
  else restored.closed = originalClosed;
  return restored;
}

function edgeTouchesEntrance(edge: NavigationEdge, entranceNodeId: string): boolean {
  return edge.startNodeId === entranceNodeId || edge.endNodeId === entranceNodeId;
}

/**
 * Rebuild only exterior-approach-owned topology.  It is deliberately pure and
 * idempotent: physical edits call it after their ordinary Floor update, while
 * hydration/tests may call it directly without creating duplicate nodes.
 */
export function reconcileExteriorApproachNavigation(campus: Campus): Campus {
  const sourceNodes = campus.navNodes ?? [];
  const sourceEdges = campus.navEdges ?? [];
  // Authored Walking Points placed on a Veranda carry an explicit host ID.
  // Keep those nodes when a zone is merely made non-walkable (so re-enabling
  // the zone does not duplicate points), but suspend their incident edges.
  // If the physical zone is deleted, remove only its hosted points and their
  // incident edges; unrelated graph data is untouched.
  const zoneById = new Map<string, FloorExteriorZone>();
  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      for (const zone of floor.exteriorZones ?? []) zoneById.set(zone.id, zone);
    }
  }
  const removedZoneNodeIds = new Set(sourceNodes
    .filter((node) => node.exteriorZoneId && !zoneById.has(node.exteriorZoneId))
    .map((node) => node.id));
  // Derived outer anchors live in campus coordinates and therefore do not
  // carry an exteriorZoneId themselves. Resolve their explicit physical owner
  // once so an authored outdoor connection can be suspended/restored without
  // any proximity-based retargeting.
  const derivedNodeZoneIds = new Map<string, string>();
  for (const node of sourceNodes) {
    if (!node.derivedOwnerType || !node.derivedOwnerId) continue;
    if (node.derivedOwnerType === "exterior_zone" && zoneById.has(node.derivedOwnerId)) {
      derivedNodeZoneIds.set(node.id, node.derivedOwnerId);
      continue;
    }
    if (node.derivedOwnerType !== "entrance_steps" && node.derivedOwnerType !== "entrance_ramp") continue;
    for (const building of campus.buildings ?? []) {
      for (const floor of building.floors ?? []) {
        const feature = node.derivedOwnerType === "entrance_steps"
          ? (floor.entranceSteps ?? []).find((item) => item.id === node.derivedOwnerId)
          : (floor.entranceRamps ?? []).find((item) => item.id === node.derivedOwnerId);
        if (feature?.parentZoneId && zoneById.has(feature.parentZoneId)) derivedNodeZoneIds.set(node.id, feature.parentZoneId);
      }
    }
  }
  const previousDerivedNodes = new Map(sourceNodes.filter((node) => node.derivedOwnerType).map((node) => [node.id, node]));
  const previousDerivedEdges = new Map(sourceEdges.filter((edge) => edge.derivedOwnerType).map((edge) => [edge.id, edge]));

  // Remove only topology owned by this helper. Restore direct entrance edges
  // before deciding whether an explicit approach can replace them.
  let baseEdges = sourceEdges
    .filter((edge) => !edge.derivedOwnerType)
    .map(restoreFallbackEdge)
    .map((edge) => restoreSuspendedApproachEdge(edge, zoneById))
    .filter((edge) => !removedZoneNodeIds.has(edge.startNodeId)
      && !removedZoneNodeIds.has(edge.endNodeId));
  baseEdges = baseEdges
    .map((edge) => {
      const explicitZoneId = edge.exteriorApproachSuspendedZoneId
        ?? sourceNodes.find((node) => node.id === edge.startNodeId)?.exteriorZoneId
        ?? sourceNodes.find((node) => node.id === edge.endNodeId)?.exteriorZoneId
        ?? derivedNodeZoneIds.get(edge.startNodeId)
        ?? derivedNodeZoneIds.get(edge.endNodeId);
      if (!explicitZoneId) return edge;
      const zone = zoneById.get(explicitZoneId);
      // A deleted zone owns its hosted points and authored connections; do not
      // leave a dangling edge behind. A temporarily disabled zone, however,
      // keeps the explicit connection as a closed record for deterministic
      // restoration when walkability is enabled again.
      if (!zone) return null;
      if (zone.walkable !== true) {
        return edge.exteriorApproachSuspendedZoneId
          ? edge
          : {
              ...edge,
              closed: true,
              exteriorApproachSuspendedZoneId: explicitZoneId,
              exteriorApproachSuspendedOriginalClosed: edge.closed,
            };
      }
      return edge;
    })
    .filter((edge): edge is NavigationEdge => Boolean(edge));
  const sourceDerivedNodeIds = new Set(previousDerivedNodes.keys());
  const plans: {
    building: CampusBuilding;
    floor: FloorPlan;
    zone: FloorExteriorZone;
    entrance: CampusEntrance;
    entranceNode: NavigationNode;
    doorNode: NavigationNode;
    outer: ApproachNode;
    inner?: ApproachNode;
    /** Explicit authored Walking Point on this linked Veranda.  A zone
     * center is deliberately never synthesized as a navigation handoff: an
     * admin must author a real same-zone network first. */
    zoneNode?: NavigationNode;
    /** Campus-side target of the Building Entrance's existing Outdoor edge. */
    outdoorTargetId?: string;
    threshold: ApproachNode;
    feature?: FloorEntranceSteps | FloorEntranceRamp;
     featureType: "entrance_steps" | "entrance_ramp" | "exterior_zone";
     /** Keep a linked Entrance's stable threshold without making the zone
      * itself a context portal when no physical feature belongs to it. */
     thresholdOnly?: boolean;
  }[] = [];
  const legacyInvalidThresholds = new Map<string, NavigationNode>();

  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      for (const zone of floor.exteriorZones ?? []) {
        if (zone.walkable !== true || !isExteriorAccessParent(zone)) continue;
        const canvasW = floor.canvasW ?? 600;
        const canvasH = floor.canvasH ?? 450;
        const zoneGeometry = exteriorZoneGeometry(zone, canvasW, canvasH);
        const zonePoint = { x: zoneGeometry.x + zoneGeometry.width / 2, y: zoneGeometry.y + zoneGeometry.height / 2 };
        const zoneWalkingPoints = sourceNodes.filter((node) => (
          !node.derivedOwnerType
          && node.exteriorZoneId === zone.id
          && node.floorId === floor.id
          && node.visible !== false
          && node.x >= zoneGeometry.x
          && node.x <= zoneGeometry.x + zoneGeometry.width
          && node.y >= zoneGeometry.y
          && node.y <= zoneGeometry.y + zoneGeometry.height
        ));
        const children: { feature: FloorEntranceSteps | FloorEntranceRamp; featureType: "entrance_steps" | "entrance_ramp" }[] = [
          ...(floor.entranceSteps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_steps" as const })),
          ...(floor.entranceRamps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_ramp" as const })),
        ];
        // Either the parent zone or a child access feature may carry the
        // explicit Entrance relationship.  Supporting both keeps legacy
        // records readable while ensuring a feature linked in Properties is
        // not silently ignored when its parent is unlinked.
        const entranceIds = new Set<string>([
          ...(zone.linkedEntranceIds ?? []),
          ...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []),
          ...children.map(({ feature }) => feature.linkedEntranceId).filter((id): id is string => Boolean(id)),
        ]);
        for (const entranceId of entranceIds) {
          const entrance = (building.entrances ?? []).find((item) => item.id === entranceId);
          if (!entrance) continue;
          const transition = findEntranceTransitionForEntrance(sourceNodes, sourceEdges, building.id, entrance.id);
          const entranceNode = transition ? entranceNodeForEdge(transition, sourceNodes) : undefined;
          const doorNode = transition ? doorNodeForEdge(transition, sourceNodes) : undefined;
          if (!entranceNode || !doorNode) continue;
          // A stale/legacy relationship remains persisted for inspection, but
          // cannot create a route branch after the Veranda no longer covers
          // the Entrance's canonical side/span. Preserve its stable threshold
          // identity and updated Door position, while omitting every derived
          // connection so the direct fallback remains the only route option.
          if (!exteriorZoneCoversEntrance(zone, entrance, canvasW, canvasH)) {
            const staleThreshold = approachNode(campus, building, floor, "entrance_threshold", entrance.id, "threshold", { x: doorNode.x, y: doorNode.y }, {
              accessible: entrance.accessible !== false,
              buildingEntranceId: entrance.id,
            });
            legacyInvalidThresholds.set(staleThreshold.id, staleThreshold);
            continue;
          }
          const outdoorConnection = findEntranceOutdoorConnection(sourceNodes, baseEdges, building.id, entrance.id);
          const outdoorTargetId = outdoorConnection
            ? (outdoorConnection.startNodeId === entranceNode.id ? outdoorConnection.endNodeId : outdoorConnection.startNodeId)
            : undefined;
          const outdoorTarget = outdoorTargetId ? sourceNodes.find((node) => node.id === outdoorTargetId) : undefined;
          const validOutdoorTargetId = outdoorTarget
            && !outdoorTarget.floorId
            && !outdoorTarget.entranceId
            && !outdoorTarget.exteriorEmergencyStairId
            && !outdoorTarget.derivedOwnerType
            ? outdoorTarget.id
            : undefined;
          const threshold = approachNode(campus, building, floor, "entrance_threshold", entrance.id, "threshold", { x: doorNode.x, y: doorNode.y }, {
            accessible: entrance.accessible !== false,
            buildingEntranceId: entrance.id,
          });
          // A child feature must be linked to this Entrance when it has an
          // explicit link. An unlinked child inherits its parent's link only;
          // this prevents one feature from being duplicated across multiple
          // entrances served by the same zone.
          const linkedChildren = children.filter(({ feature }) => feature.linkedEntranceId
            ? feature.linkedEntranceId === entrance.id
            : (zone.linkedEntranceIds ?? []).includes(entrance.id) || zone.linkedEntranceId === entrance.id);
           // A generic Veranda point can never become a context portal. Keep a
           // threshold-only plan for a linked Entrance whose physical feature
           // is explicitly owned by another Entrance, but do not create any
           // zone/Outdoor topology for that placeholder.
           const zoneServesEntrance = (zone.linkedEntranceIds ?? []).includes(entrance.id)
             || zone.linkedEntranceId === entrance.id;
           const choices = linkedChildren.length > 0
             ? linkedChildren
             : zoneServesEntrance
               ? [{ feature: undefined, featureType: "exterior_zone" as const, thresholdOnly: true }]
               : [];
          for (const choice of choices) {
            const feature = choice.feature;
            const featureType = choice.featureType;
            const featurePoints = feature ? floorPointForFeature(zone, feature, floor) : null;
            const ownerId = feature?.id ?? zone.id;
            const outerFloorPoint = featurePoints?.outer ?? zonePoint;
            const outer = approachNode(campus, building, floor, featureType, ownerId, "outer", exteriorFloorPointToCampusWorld(building, floor, outerFloorPoint), {
              accessible: featureType === "entrance_ramp" ? true : featureType === "entrance_steps" ? false : entrance.accessible !== false,
              emergencySafe: feature?.emergencySafe === true,
            });
            const inner = feature && featurePoints
              ? approachNode(campus, building, floor, featureType, feature.id, "inner", featurePoints.inner, {
                  accessible: featureType === "entrance_ramp",
                  emergencySafe: feature.emergencySafe === true,
                })
              : undefined;
            // The Veranda side of an approach must terminate at an authored
            // Walking Point belonging to THIS zone. Choose the nearest point
            // only within the explicitly linked zone; never search the whole
            // floor/campus and never fall back to the zone's visual center.
            const handoffPoint = (featurePoints?.inner ?? zonePoint);
            const zoneNode = zoneWalkingPoints
              .map((node) => ({ node, distance: Math.hypot(node.x - handoffPoint.x, node.y - handoffPoint.y) }))
              .sort((a, b) => a.distance - b.distance)[0]?.node;
           plans.push({ building, floor, zone, entrance, entranceNode, doorNode, outer, inner, zoneNode, outdoorTargetId: validOutdoorTargetId, threshold, feature, featureType, thresholdOnly: choice.thresholdOnly });
          }
        }
      }
    }
  }

  const liveDerivedNodes = new Map<string, NavigationNode>();
  const liveDerivedEdges = new Map<string, NavigationEdge>();
  for (const [id, node] of legacyInvalidThresholds) liveDerivedNodes.set(id, nodeForOwner(previousDerivedNodes, node));
  for (const plan of plans) {
    // `zoneNode` is an existing authored Walking Point, not a derived record.
    // Only physical-approach/threshold anchors are owned by reconciliation.
    for (const node of [plan.thresholdOnly ? undefined : plan.outer, plan.inner, plan.threshold].filter(Boolean) as ApproachNode[]) {
      liveDerivedNodes.set(node.id, nodeForOwner(previousDerivedNodes, node));
    }
    if (plan.thresholdOnly) continue;
  }
  const liveNodeIds = new Set(liveDerivedNodes.keys());
  // Old derived nodes are removed with every incident edge. Manual nodes and
  // manual edges are never claimed by coordinate proximity.
  baseEdges = baseEdges.filter((edge) => {
    if (!sourceDerivedNodeIds.has(edge.startNodeId) && !sourceDerivedNodeIds.has(edge.endNodeId)) return true;
    if (edge.exteriorApproachSuspendedZoneId) return true;
    // Preserve authored edges that connect one live derived anchor to an
    // ordinary outdoor/Walking Point node. Only an endpoint that was formerly
    // derived needs to be checked for liveness; requiring *both* endpoints to
    // be derived would incorrectly drop the admin's outer-network connection.
    return (!sourceDerivedNodeIds.has(edge.startNodeId) || liveNodeIds.has(edge.startNodeId))
      && (!sourceDerivedNodeIds.has(edge.endNodeId) || liveNodeIds.has(edge.endNodeId));
  });

  const readinessCampus: Campus = {
    ...campus,
    // Readiness is evaluated before derived edges are appended, but it needs
    // the stable live anchors. Authored outdoor/Veranda edges remain the only
    // evidence of a user-created connection.
    navNodes: [...sourceNodes.filter((node) => !node.derivedOwnerType), ...liveDerivedNodes.values()],
    navEdges: baseEdges,
  };
  const completeByEntrance = new Map<string, boolean>();
  for (const plan of plans) {
    const key = `${plan.building.id}:${plan.entrance.id}`;
    if (completeByEntrance.has(key)) continue;
    const readiness = exteriorApproachEntranceReadiness(
      readinessCampus,
      plan.building.id,
      plan.floor.id,
      plan.zone.id,
      plan.entrance.id,
    );
    completeByEntrance.set(key, readiness.standardReady);
  }

  // Deprioritize (rather than destroy) a direct Entrance shortcut while a
  // complete explicit approach is present. Keeping it available preserves an
  // accessible compatibility fallback when only Steps exist.
  const fallbackEntranceIds = new Set(
    [...completeByEntrance.entries()].filter(([, complete]) => complete).map(([key]) => key),
  );
  baseEdges = baseEdges.map((edge) => {
    const plan = plans.find((candidate) => edgeTouchesEntrance(edge, candidate.entranceNode.id));
    // Emergency graph ownership is separate from normal Entrance fallback;
    // never retag or deprioritize a dedicated emergency connector here.
    if (!plan || edge.type === "entrance_transition" || edge.type === "emergency" || edge.generatedFromPathIds?.length) return edge;
    const otherId = edge.startNodeId === plan.entranceNode.id ? edge.endNodeId : edge.startNodeId;
    const other = sourceNodes.find((node) => node.id === otherId);
    // Only the existing outdoor shortcut is a compatibility fallback.  An
    // Entrance can also have an authored indoor connection (for example to a
    // lobby Walking Point); that edge must retain its authored cost and
    // accessibility even while an exterior approach is complete.
    if (!other || other.floorId || other.entranceId || other.exteriorEmergencyStairId) return edge;
    const key = `${plan.building.id}:${plan.entrance.id}`;
    if (!fallbackEntranceIds.has(key) || edge.closed === true && !edge.exteriorApproachFallbackEntranceId) return edge;
    if (edge.exteriorApproachFallbackEntranceId) return edge;
    return {
      ...edge,
      distance: Math.max(1_000_000, edge.distance),
      exteriorApproachFallbackEntranceId: plan.entrance.id,
      exteriorApproachFallbackOriginalClosed: edge.closed,
      exteriorApproachFallbackOriginalDistance: edge.distance,
    };
  });

  for (const plan of plans) {
    const key = `${plan.building.id}:${plan.entrance.id}`;
    const complete = completeByEntrance.get(key) === true;
    const nodes = [...sourceNodes.filter((node) => !node.derivedOwnerType), ...liveDerivedNodes.values()];
    if (!plan.thresholdOnly) {
      if (plan.inner) {
        const edge = approachEdge(campus, plan.building, plan.floor, plan.featureType, plan.feature!.id, "inner", plan.outer.id, plan.inner.id, nodes, {
          accessible: plan.featureType === "entrance_ramp",
          emergencySafe: plan.feature?.emergencySafe === true,
          type: plan.featureType === "entrance_ramp" ? "entrance_ramp" : "entrance_steps",
        });
        liveDerivedEdges.set(edge.id, edgeForOwner(previousDerivedEdges, edge));
        // The inner anchor is intentionally not auto-connected to a Veranda
        // point.  That walking segment is admin-authored (or created through the
        // explicit Connect authoring), never a hidden physical side effect.
      } else if (plan.zoneNode) {
        const edge = approachEdge(campus, plan.building, plan.floor, "exterior_zone", plan.zone.id, "outer", plan.outer.id, plan.zoneNode.id, nodes, {
            accessible: plan.entrance.accessible !== false,
            emergencySafe: false,
          });
        liveDerivedEdges.set(edge.id, edgeForOwner(previousDerivedEdges, edge));
      }
      const hasExplicitOuterConnection = plan.outdoorTargetId
        ? baseEdges.some((edge) => !edge.derivedOwnerType
          && (edge.startNodeId === plan.outer.id || edge.endNodeId === plan.outer.id)
          && (edge.startNodeId === plan.outdoorTargetId || edge.endNodeId === plan.outdoorTargetId))
        : false;
      if (plan.outdoorTargetId && !hasExplicitOuterConnection) {
        const outdoorConnection = findEntranceOutdoorConnection(sourceNodes, baseEdges, plan.building.id, plan.entrance.id);
        const handoff = approachEdge(campus, plan.building, plan.floor, plan.featureType, plan.feature?.id ?? plan.zone.id, "handoff", plan.outer.id, plan.outdoorTargetId, nodes, {
          accessible: outdoorConnection?.accessible !== false,
          // Emergency routing owns its own discharge/stair topology. This
          // normal-campus projection must never become an evacuation shortcut.
          emergencySafe: false,
          type: EXTERIOR_APPROACH_EDGE_TYPE,
          exteriorApproachAutoHandoffTargetId: plan.outdoorTargetId,
        // The outer access feature and the Building's campus handoff are shared
        // by multiple Entrances served through the same feature, but distinct
        // physical Ramps/Steps each need their own outer handoff. Key by the
        // feature owner + Outdoor target: Entrance identity is intentionally
        // excluded (which removes the duplicate pair on multi-Entrance saves),
        // while separate access features remain routable candidates.
        }, `handoff:${plan.featureType}:${plan.feature?.id ?? plan.zone.id}:${plan.outdoorTargetId}`);
        liveDerivedEdges.set(handoff.id, edgeForOwner(previousDerivedEdges, handoff));
      }
    }
    // Likewise, an Entrance threshold is a protected target, not an
    // automatically-drawn Veranda connection.  The semantic threshold ->
    // canonical Entrance bridge below remains derived and intact.
    const approachEmergencySafe = plan.feature?.emergencySafe === true;
    // Preserve the canonical Entrance -> generated Door bridge.  The
    // threshold is an exterior approach anchor; it joins the existing
    // Entrance node rather than creating a parallel threshold -> Door bridge
    // that would bypass the Entrance semantic endpoint for building routes.
    const thresholdToEntrance = approachEdge(campus, plan.building, plan.floor, "entrance_threshold", plan.entrance.id, "threshold", plan.threshold.id, plan.entranceNode.id, nodes, {
      type: EXTERIOR_APPROACH_THRESHOLD_EDGE_TYPE,
      accessible: plan.entrance.accessible !== false,
      emergencySafe: approachEmergencySafe,
    });
    liveDerivedEdges.set(thresholdToEntrance.id, edgeForOwner(previousDerivedEdges, thresholdToEntrance));
  }

  const nextNodes = [
    ...sourceNodes.filter((node) => !node.derivedOwnerType && !removedZoneNodeIds.has(node.id)),
    ...[...liveDerivedNodes.values()],
  ].filter((node, index, all) => all.findIndex((candidate) => candidate.id === node.id) === index);
  const nextEdges = [
    ...baseEdges,
    ...[...liveDerivedEdges.values()],
  ].filter((edge, index, all) => all.findIndex((candidate) => candidate.id === edge.id) === index);

  // Reconciliation deliberately rebuilds small derived records, so compare
  // their value rather than object identity. This keeps repeated save/render
  // passes idempotent and avoids creating a new Campus object for no-op work.
  const sameNodes = nextNodes.length === sourceNodes.length && nextNodes.every((node, index) => JSON.stringify(node) === JSON.stringify(sourceNodes[index]));
  const sameEdges = nextEdges.length === sourceEdges.length && nextEdges.every((edge, index) => JSON.stringify(edge) === JSON.stringify(sourceEdges[index]));
  return sameNodes && sameEdges ? campus : { ...campus, navNodes: nextNodes, navEdges: nextEdges };
}

/** Resolve the explicit walkable Exterior Zone containing a point. */
export function walkableExteriorZoneAtPoint(
  point: { x: number; y: number },
  zones: FloorExteriorZone[] | undefined,
  canvasW: number,
  canvasH: number,
): FloorExteriorZone | undefined {
  return (zones ?? []).find((zone) => {
    if (zone.walkable !== true || zone.visible === false) return false;
    const geometry = exteriorZoneGeometry(zone, canvasW, canvasH);
    return point.x >= geometry.x && point.x <= geometry.x + geometry.width
      && point.y >= geometry.y && point.y <= geometry.y + geometry.height;
  });
}

/** True only for an explicit walkable Exterior Zone/Landing bound. */
export function isPointInsideWalkableExteriorZone(
  point: { x: number; y: number },
  zones: FloorExteriorZone[] | undefined,
  canvasW: number,
  canvasH: number,
): boolean {
  return !!walkableExteriorZoneAtPoint(point, zones, canvasW, canvasH);
}

export function isDerivedExteriorApproachNode(node: NavigationNode | undefined): boolean {
  return Boolean(node?.derivedOwnerType && node.derivedOwnerId && node.derivedRole);
}

/**
 * Creates a deliberately small, editable starting network for a walkable
 * Veranda.  This is authoring assistance, not derived topology: the points
 * and edges it returns are ordinary Walking Points/paths and remain under the
 * admin's normal Connect, bend and delete controls.  It only acts on an empty
 * zone and only targets the explicit approach anchors already owned by that
 * zone.
 */
export function createSuggestedExteriorZonePath(input: {
  zone: FloorExteriorZone;
  floor: Pick<FloorPlan, "id" | "canvasW" | "canvasH">;
  buildingId: string;
  campusId: string;
  nodes: NavigationNode[];
  entranceSteps?: FloorEntranceSteps[];
  entranceRamps?: FloorEntranceRamp[];
  nextId: (prefix: "nn" | "ne") => string;
}): { nodes: NavigationNode[]; edges: NavigationEdge[]; created: boolean } {
  const { zone, floor, buildingId, campusId, nodes, nextId } = input;
  if (zone.walkable !== true || !isExteriorAccessParent(zone)) return { nodes: [], edges: [], created: false };

  // Never replace even a partial authored network.  A point deliberately
  // placed in this zone is authoring and is therefore authoritative.
  if (nodes.some((node) => !node.derivedOwnerType && node.floorId === floor.id && node.exteriorZoneId === zone.id)) {
    return { nodes: [], edges: [], created: false };
  }

  const entranceIds = new Set([
    ...(zone.linkedEntranceIds ?? []),
    ...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []),
  ]);
  const featureIds = new Set([
    ...(input.entranceSteps ?? []).filter((item) => item.parentZoneId === zone.id).map((item) => item.id),
    ...(input.entranceRamps ?? []).filter((item) => item.parentZoneId === zone.id).map((item) => item.id),
  ]);
  if (entranceIds.size === 0 || featureIds.size === 0) return { nodes: [], edges: [], created: false };

  const targets = nodes.filter((node) => (
    node.floorId === floor.id
    && ((node.derivedOwnerType === "entrance_threshold" && entranceIds.has(node.derivedOwnerId ?? ""))
      || ((node.derivedOwnerType === "entrance_steps" || node.derivedOwnerType === "entrance_ramp")
        && node.derivedRole === "inner" && featureIds.has(node.derivedOwnerId ?? "")))
  ));
  if (targets.length === 0) return { nodes: [], edges: [], created: false };

  const bounds = exteriorZoneGeometry(zone, floor.canvasW ?? 600, floor.canvasH ?? 450);
  const horizontal = zone.side === "top" || zone.side === "bottom";
  const pad = Math.min(16, horizontal ? bounds.width / 4 : bounds.height / 4);
  const fixed = horizontal ? bounds.y + bounds.height / 2 : bounds.x + bounds.width / 2;
  const min = horizontal ? bounds.x + pad : bounds.y + pad;
  const max = horizontal ? bounds.x + bounds.width - pad : bounds.y + bounds.height - pad;
  const projected = (node: NavigationNode) => Math.max(min, Math.min(max, horizontal ? node.x : node.y));
  const locations = [...new Set([min, max, ...targets.map(projected)])].sort((a, b) => a - b);
  const spineNodes = locations.map((value) => ({
    id: nextId("nn"),
    name: "Veranda waypoint",
    type: "hallway" as const,
    x: Math.round(horizontal ? value : fixed),
    y: Math.round(horizontal ? fixed : value),
    campusId,
    buildingId,
    floorId: floor.id,
    exteriorZoneId: zone.id,
    accessible: true,
    color: "#16a34a",
  }));
  const edgeFor = (start: NavigationNode, end: NavigationNode, accessible = true): NavigationEdge => {
    const bends = start.x !== end.x && start.y !== end.y ? [{ x: end.x, y: start.y }] : undefined;
    const points = [start, ...(bends ?? []), end];
    return {
      id: nextId("ne"), startNodeId: start.id, endNodeId: end.id,
      distance: Math.round(points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0)),
      bidirectional: true, accessible, emergencySafe: false,
      type: "hallway", color: "#16a34a", width: 4,
      ...(bends ? { bendPoints: bends } : {}),
    };
  };
  const edges: NavigationEdge[] = [];
  for (let index = 1; index < spineNodes.length; index += 1) edges.push(edgeFor(spineNodes[index - 1], spineNodes[index]));
  for (const target of targets) {
    const point = projected(target);
    const spine = spineNodes.find((node) => (horizontal ? node.x : node.y) === Math.round(point));
    if (spine) edges.push(edgeFor(spine, target, target.accessible !== false));
  }
  return { nodes: spineNodes, edges, created: true };
}
