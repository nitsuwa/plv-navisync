import type { BuildingEntranceEdge, CampusBuilding, CampusDecorAsset, CampusMarker, ExteriorZoneType, FloorEntranceRamp, FloorEntranceSteps } from "../components/map-builder/types";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "./readonlyOutdoorCampus";
import { entranceWorldPosition } from "./buildingEntrances";

/** Small offset keeps grounded meshes clear of the ground plane without a visible gap. */
export const STUDENT_CAMPUS_3D_GROUND_EPSILON = 0.002;

/** Student 3D only: the authored veranda has no elevation field, so render it
 * as a modest raised porch using the same rise as legacy unattached steps. */
export const STUDENT_VERANDA_3D_RISE = 0.42;

/** Keep exterior zones recognizable while giving the Student 3D veranda a
 * thin, integrated platform treatment. Access ramps and steps are separate
 * authored features and are not affected by this surface styling. */
export function studentExteriorZone3dPresentation(type: ExteriorZoneType) {
  if (type === "veranda") return { thickness: 0.035, color: "#cbbb9f", sideRails: false } as const;
  return {
    thickness: 0.08,
    color: "#c9d2d1",
    sideRails: type !== "entrance_landing",
  } as const;
}

/** Keep the zone surface's rendered center and top elevations in one place so
 * attached access features meet the same platform that the Student renderer draws. */
export function studentExteriorZone3dHeights(type: ExteriorZoneType, floorSurfaceY: number) {
  const { thickness } = studentExteriorZone3dPresentation(type);
  const centerY = type === "veranda"
    ? floorSurfaceY + STUDENT_VERANDA_3D_RISE - thickness / 2
    : floorSurfaceY + 0.03;
  return { centerY, topY: centerY + thickness / 2 };
}

export interface StudentEntranceStairFlightLayout {
  stepCount: number;
  fromZ: number;
  toZ: number;
  treadDepth: number;
  stepRise: number;
  treadSurfaceHeights: readonly number[];
  treadThickness: number;
  lowerLandingDepth: number;
  lowerLandingCenterZ: number;
}

/** Lay out an attached entrance stair from ground to its actual parent-zone
 * surface. The veranda itself supplies the upper landing, avoiding a second
 * coplanar slab at the stair junction. */
export function studentEntranceStairFlightLayout(
  depth: number,
  rise: number,
  requestedSteps: number,
): StudentEntranceStairFlightLayout {
  const safeDepth = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const safeRise = Number.isFinite(rise) ? Math.max(0, rise) : 0;
  const stepCount = Number.isFinite(requestedSteps) ? Math.max(3, Math.floor(requestedSteps)) : 3;
  const fromZ = safeDepth / 2;
  const toZ = -safeDepth / 2;
  const stepRise = safeRise / stepCount;
  const lowerLandingDepth = Math.min(0.34, safeDepth * 0.28);
  return {
    stepCount,
    fromZ,
    toZ,
    treadDepth: safeDepth / stepCount,
    stepRise,
    // The final tread is the walking surface that meets the veranda. Keep
    // elevations at the upper edge of each physical riser, with the last
    // tread exactly flush to the parent platform.
    treadSurfaceHeights: Array.from({ length: stepCount }, (_, index) => safeRise * ((index + 1) / stepCount)),
    treadThickness: Math.min(0.07, Math.max(0.025, stepRise * 0.84)),
    lowerLandingDepth,
    lowerLandingCenterZ: fromZ + lowerLandingDepth / 2,
  };
}

export interface StudentEntranceStairPlacement {
  center: StudentMapDirection;
  width: number;
  depth: number;
  rise: number;
  yaw: number;
  outwardDirection?: StudentMapDirection;
}

export interface StudentEntranceRampPlacement {
  center: StudentMapDirection;
  width: number;
  depth: number;
  /** Rise above the ramp's small ground clearance, in renderer world units. */
  rise: number;
  yaw: number;
  /** Attached ramps descend along local +Z, outward from their parent zone. */
  direction: -1;
  outwardDirection: StudentMapDirection;
}

/** Resolve a veranda/landing ramp from its authored attachment, so its high
 * edge meets the rendered parent surface and its low edge faces outward. The
 * authored floor record has no elevation, therefore this uses the same
 * renderer-only zone elevation as Student 3D. */
export function resolveStudentEntranceRampPlacement(input: {
  authored: Pick<FloorEntranceRamp, "x" | "y" | "width" | "height" | "rotation">;
  attachment: { x: number; y: number; width: number; height: number; side?: BuildingEntranceEdge } | null | undefined;
  floorSurfaceY: number;
  platformTopY: number;
}): StudentEntranceRampPlacement | null {
  const attachment = input.attachment;
  if (!attachment || ![attachment.x, attachment.y, attachment.width, attachment.height, input.floorSurfaceY, input.platformTopY].every(Number.isFinite)) return null;
  const side = attachment.side;
  const outwardDirection = side === "top" ? { x: 0, y: -1 }
    : side === "bottom" ? { x: 0, y: 1 }
      : side === "left" ? { x: -1, y: 0 }
        : side === "right" ? { x: 1, y: 0 }
          : null;
  if (!outwardDirection) return null;
  const sideMounted = side === "left" || side === "right";
  const rise = Math.max(0, input.platformTopY - input.floorSurfaceY - STUDENT_CAMPUS_3D_GROUND_EPSILON);
  return {
    center: { x: attachment.x + attachment.width / 2, y: attachment.y + attachment.height / 2 },
    width: sideMounted ? attachment.height : attachment.width,
    depth: sideMounted ? attachment.width : attachment.height,
    rise,
    yaw: Math.atan2(outwardDirection.x, outwardDirection.y),
    direction: -1,
    outwardDirection,
  };
}

/** Resolve Student 3D stairs from their authored parent attachment when one
 * exists. The exterior edge owns the outward direction; a sibling ramp cannot
 * turn an edge-mounted stair sideways along the facade. Legacy unattached stairs
 * retain their saved coordinates and use the established 0.42-unit rise. */
export function resolveStudentEntranceStairPlacement(input: {
  authored: Pick<FloorEntranceSteps, "x" | "y" | "width" | "height" | "rotation">;
  attachment?: { x: number; y: number; width: number; height: number; side?: BuildingEntranceEdge } | null;
  floorSurfaceY: number;
  platformTopY?: number;
  connectionDirection?: StudentMapDirection;
}): StudentEntranceStairPlacement {
  const attachment = input.attachment ?? null;
  const side = attachment?.side;
  const sideMounted = side === "left" || side === "right";
  const center = attachment
    ? { x: attachment.x + attachment.width / 2, y: attachment.y + attachment.height / 2 }
    : { x: input.authored.x + input.authored.width / 2, y: input.authored.y + input.authored.height / 2 };
  const width = attachment
    ? sideMounted ? attachment.height : attachment.width
    : input.authored.width;
  const depth = attachment
    ? sideMounted ? attachment.width : attachment.height
    : input.authored.height;
  const outwardDirection = side === "top" ? { x: 0, y: -1 }
    : side === "bottom" ? { x: 0, y: 1 }
      : side === "left" ? { x: -1, y: 0 }
        : side === "right" ? { x: 1, y: 0 }
          : undefined;
  const platformTopY = Number.isFinite(input.platformTopY)
    ? input.platformTopY!
    : input.floorSurfaceY + 0.42;
  const yaw = resolveStudentEntranceStairYaw({
    authoredRotation: input.authored.rotation,
    connectionDirection: outwardDirection ? undefined : input.connectionDirection,
    outwardDirection,
  });
  return {
    center,
    width,
    depth,
    rise: Math.max(0, platformTopY - input.floorSurfaceY),
    yaw,
    outwardDirection,
  };
}

export interface CampusParkingMarkingSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  kind: "stall-divider" | "stall-row-edge" | "drive-aisle";
}

export interface StudentMapDirection {
  x: number;
  y: number;
}

/** Direction from attached entrance steps toward the downhill end of their
 * authored entrance ramp. Ramp yaw/direction matches the Student 3D ramp model. */
export function studentEntranceRampGroundDirection(
  from: StudentMapDirection,
  ramp: Pick<FloorEntranceRamp, "x" | "y" | "width" | "height" | "rotation" | "direction">,
): StudentMapDirection {
  const yaw = -((ramp.rotation ?? 0) * Math.PI) / 180;
  const downhillSign = ramp.direction === "reverse" ? 1 : -1;
  const halfRun = Math.max(0, ramp.height) / 2;
  const rampCenterX = ramp.x + ramp.width / 2;
  const rampCenterY = ramp.y + ramp.height / 2;
  const downhillX = rampCenterX + Math.sin(yaw) * halfRun * downhillSign;
  const downhillY = rampCenterY + Math.cos(yaw) * halfRun * downhillSign;
  return { x: downhillX - from.x, y: downhillY - from.y };
}

/** Resolve the downhill facing of attached veranda steps from authored
 * connections, falling back to the parent facade normal. */
export function resolveStudentEntranceStairYaw(input: {
  authoredRotation?: number;
  connectionDirection?: StudentMapDirection;
  outwardDirection?: StudentMapDirection;
}): number {
  const validDirection = (direction?: StudentMapDirection) => {
    if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return null;
    const length = Math.hypot(direction.x, direction.y);
    return length > 1e-6 ? { x: direction.x / length, y: direction.y / length } : null;
  };
  const target = validDirection(input.connectionDirection) ?? validDirection(input.outwardDirection);
  const authoredYaw = typeof input.authoredRotation === "number" && Number.isFinite(input.authoredRotation)
    ? -(input.authoredRotation * Math.PI) / 180
    : null;
  if (!target) return authoredYaw ?? 0;
  if (authoredYaw !== null) {
    const authoredFacing = { x: Math.sin(authoredYaw), y: Math.cos(authoredYaw) };
    // Preserve an authored angle when it faces into the physical connection
    // hemisphere. Small alignment tolerances are common in hand-authored
    // ramps, so do not require near-perfect mathematical collinearity.
    if (authoredFacing.x * target.x + authoredFacing.y * target.y >= 0.5) return authoredYaw;
  }
  return Math.atan2(target.x, target.y);
}

/**
 * Renderer-only parking stripes for an authored parking rectangle. Coordinates
 * stay in the rectangle's local map units so the asset's existing position and
 * rotation remain the single source of truth. The layout follows the same
 * two-row/center-aisle rhythm as the Student 2D ground-area artwork.
 */
export function campusParkingMarkingSegments(width: number, depth: number): CampusParkingMarkingSegment[] {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (w < 18 || d < 12) return [];

  const horizontal = w >= d;
  const span = horizontal ? w : d;
  const rowDepth = horizontal ? d : w;
  const aisleDepth = Math.min(rowDepth * 0.48, Math.max(14, Math.min(24, rowDepth * 0.28)));
  const edge = Math.min(3, rowDepth * 0.08);
  const aisleHalf = aisleDepth / 2;
  const bayDepth = Math.max(0, (rowDepth - aisleDepth) / 2);
  // Cap divider density so distant/oblique views do not alias into scratchy
  // moire patterns across the asphalt.
  const count = Math.max(2, Math.min(8, Math.floor(span / 42)));
  const points = (along: number, across: number) => horizontal
    ? { x: along, z: across }
    : { x: across, z: along };
  const lines: CampusParkingMarkingSegment[] = [];
  const add = (aAlong: number, aAcross: number, bAlong: number, bAcross: number, kind: CampusParkingMarkingSegment["kind"]) => {
    const a = points(aAlong, aAcross);
    const b = points(bAlong, bAcross);
    lines.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, kind });
  };

  // Each bay divider is split around the drive aisle, as in the 2D artwork.
  for (let index = 0; index <= count; index += 1) {
    const along = -span / 2 + span * index / count;
    add(along, -rowDepth / 2 + edge, along, -aisleHalf - edge, "stall-divider");
    add(along, aisleHalf + edge, along, rowDepth / 2 - edge, "stall-divider");
  }
  const rowEdge = Math.min(bayDepth, Math.max(edge, bayDepth * 0.78));
  add(-span / 2 + edge, -rowDepth / 2 + rowEdge, span / 2 - edge, -rowDepth / 2 + rowEdge, "stall-row-edge");
  add(-span / 2 + edge, rowDepth / 2 - rowEdge, span / 2 - edge, rowDepth / 2 - rowEdge, "stall-row-edge");
  add(-span / 2 + edge, 0, span / 2 - edge, 0, "drive-aisle");
  return lines;
}

export interface CampusFireEscapeLevel {
  /** Index in the Building's ordered Floor list; zero is the ground level. */
  floorIndex: number;
  elevation: number;
  served: boolean;
}

/** Raised visual threshold for the compact ground-level emergency module. */
export const CAMPUS_GROUND_EXIT_LANDING_ELEVATION = 0.18;

export function campusEmergencyExitVisualElevation(floorIndex: number, elevation: number): number {
  return floorIndex === 0 ? Math.max(elevation, CAMPUS_GROUND_EXIT_LANDING_ELEVATION) : elevation;
}

/** Project authored served Floors into renderer-only fire-escape landings.
 * Any elevated egress uses the side-fire-escape presentation, with landings at
 * intervening levels so the run stays stair-like. Only a ground-only exit is
 * rendered as the compact short-stair module. Intermediate landings do not
 * create authored doors or navigation connections. */
export function campusFireEscapeLevels(
  floors: readonly { id: string; number: number }[],
  servedFloorIds: readonly string[],
  floorStep: number,
): CampusFireEscapeLevel[] {
  const ordered = [...floors].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  const servedIds = new Set(servedFloorIds);
  const servedIndexes = ordered.flatMap((floor, index) => servedIds.has(floor.id) ? [index] : []);
  const highest = servedIndexes.length ? Math.max(...servedIndexes) : 0;
  const indices = highest > 0 ? Array.from({ length: highest + 1 }, (_, index) => index) : [0];
  const served = new Set(servedIndexes);
  const step = Math.max(0, Number.isFinite(floorStep) ? floorStep : 0);
  return indices.map((floorIndex) => ({ floorIndex, elevation: floorIndex * step, served: served.has(floorIndex) }));
}

/** Compact exterior egress is appropriate only for a single ground-level
 * served door. Elevated single-floor exits still need the side escape. */
export function usesCompactGroundEmergencyExit(levels: readonly CampusFireEscapeLevel[]): boolean {
  const served = levels.filter((level) => level.served);
  return served.length === 1 && served[0].floorIndex === 0;
}

/** Keep emergency-door detailing within the vertical clearance of a story. */
export function campusEmergencyExitDoorHeight(levels: readonly CampusFireEscapeLevel[], maximumHeight = 0.28): number {
  const smallestSpacing = levels.slice(1)
    .map((level, index) => Math.abs(level.elevation - levels[index].elevation))
    .filter((spacing) => spacing > 0)
    .reduce((smallest, spacing) => Math.min(smallest, spacing), Number.POSITIVE_INFINITY);
  return Number.isFinite(smallestSpacing)
    ? Math.max(0, Math.min(maximumHeight, smallestSpacing * 0.82))
    : maximumHeight;
}

/** Convert an authored campus-map outward angle (0° east, 90° south) to the
 * Three.js yaw that points a model's local +Z face outward. Campus map Y grows
 * southward and maps to world +Z, so the yaw is 90° minus the authored angle. */
export function campusEntranceFacingYaw(mapOutwardAngle?: number): number {
  if (typeof mapOutwardAngle !== "number" || !Number.isFinite(mapOutwardAngle)) return 0;
  return ((90 - mapOutwardAngle) * Math.PI) / 180;
}

/** Convert a geometry's local-space bottom into the world-space group offset. */
export function groundedModelOffset(localBoundsMinY: number, verticalScale = 1, groundY = 0): number {
  if (!Number.isFinite(localBoundsMinY) || !Number.isFinite(verticalScale)) return groundY;
  return groundY - localBoundsMinY * verticalScale;
}

/**
 * Group authored assets without cloning, sorting, moving, filtering, or
 * synthesizing instances. The renderer may batch by type, but every published
 * record keeps its original identity and anchor.
 */
export function groupCampusDecorAssetsByType(assets: readonly CampusDecorAsset[]) {
  const groups = new Map<string, CampusDecorAsset[]>();
  for (const asset of assets) {
    const items = groups.get(asset.type) ?? [];
    items.push(asset);
    groups.set(asset.type, items);
  }
  return groups;
}

/** Resolve the authored monument instance used for Suhay Husay consistently
 * across the Student 2D symbol and the 3D model/camera. Legacy maps without a
 * descriptive asset name retain the single-monument fallback. */
export function resolveSuhayHusayDecorAssetId(assets: readonly CampusDecorAsset[]): string | null {
  const monuments = assets.filter((asset) => asset.type === "monument");
  const explicit = monuments.find((asset) => asset.visualVariant === "suhay-husay");
  if (explicit) return explicit.id;
  const named = monuments.find((asset) => /suhay\s*(?:ng\s*)?husay/i.test(`${asset.id} ${asset.name ?? ""}`));
  return named?.id ?? (monuments.length === 1 ? monuments[0].id : null);
}

/** Resolve each explicitly identified Suhay instance while retaining the
 * legacy single-monument fallback. Unnamed monuments in multi-asset maps stay
 * generic; visual similarity alone never changes their identity. */
export function resolveSuhayHusayDecorAssetIds(assets: readonly CampusDecorAsset[]): ReadonlySet<string> {
  const monuments = assets.filter((asset) => asset.type === "monument");
  const explicit = monuments.filter((asset) => asset.visualVariant === "suhay-husay"
    || /suhay\s*(?:ng\s*)?husay/i.test(`${asset.id} ${asset.name ?? ""}`));
  if (explicit.length) return new Set(explicit.map((asset) => asset.id));
  return monuments.length === 1 ? new Set([monuments[0].id]) : new Set();
}

function entrancePoint(building: CampusBuilding, entrance: ReadonlyOutdoorEntrance) {
  return entrance.legacyPosition ?? entranceWorldPosition(building, entrance);
}

/**
 * Collapse duplicate authored records for one physical Campus doorway.
 * Callers first apply the shared Student entry-eligibility rule, so this is a
 * presentation-only dedupe and never decides whether a route transition exists.
 */
export function dedupePhysicalCampusEntrances(
  entrances: readonly ReadonlyOutdoorEntrance[],
  buildings: readonly CampusBuilding[],
  tolerance = 2.5,
): ReadonlyOutdoorEntrance[] {
  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  const kept: Array<{ entrance: ReadonlyOutdoorEntrance; point: { x: number; y: number } }> = [];
  const priority = (entrance: ReadonlyOutdoorEntrance) => Number(Boolean(entrance.isPrimary)) * 2
    + Number(entrance.direction === "entrance_only");

  for (const entrance of entrances) {
    const building = buildingById.get(entrance.buildingId);
    if (!building) continue;
    const point = entrancePoint(building, entrance);
    const duplicateIndex = kept.findIndex((candidate) => candidate.entrance.buildingId === entrance.buildingId
      && (candidate.entrance.id === entrance.id
        || Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) <= tolerance));
    if (duplicateIndex < 0) {
      kept.push({ entrance, point });
    } else if (priority(entrance) > priority(kept[duplicateIndex].entrance)) {
      kept[duplicateIndex] = { entrance, point };
    }
  }
  return kept.map(({ entrance }) => entrance);
}

export interface CampusEntrancePresentation {
  /** One authored record for the physical doorway drawn in 3D. */
  entrance: ReadonlyOutdoorEntrance;
  /** Whether the shared Student 2D rule permits an Enter action from Campus. */
  canEnterFromCampus: boolean;
}

/**
 * Keep every authored physical doorway in the scene, while resolving its
 * Campus-side action from the same eligibility rule used by the 2D Student
 * map. Duplicate records at one physical doorway become one model; any valid
 * enterable record at that location may supply its action.
 */
export function resolveCampusEntrancePresentations(
  entrances: readonly ReadonlyOutdoorEntrance[],
  buildings: readonly CampusBuilding[],
  canEnterFromCampus: (entrance: ReadonlyOutdoorEntrance) => boolean,
  tolerance = 2.5,
): CampusEntrancePresentation[] {
  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  return dedupePhysicalCampusEntrances(entrances, buildings, tolerance).map((entrance) => {
    const building = buildingById.get(entrance.buildingId);
    if (!building) return { entrance, canEnterFromCampus: false };
    const point = entrancePoint(building, entrance);
    const hasEnterAction = entrances.some((candidate) => {
      if (candidate.buildingId !== entrance.buildingId || !canEnterFromCampus(candidate)) return false;
      const candidateBuilding = buildingById.get(candidate.buildingId);
      if (!candidateBuilding) return false;
      const candidatePoint = entrancePoint(candidateBuilding, candidate);
      return candidate.id === entrance.id
        || Math.hypot(candidatePoint.x - point.x, candidatePoint.y - point.y) <= tolerance;
    });
    return { entrance, canEnterFromCampus: hasEnterAction };
  });
}

function closestPathDirection(marker: CampusMarker, campus: ReadonlyOutdoorCampus) {
  let closest: { distance: number; dx: number; dy: number } | null = null;
  for (const path of campus.paths) {
    for (let index = 1; index < path.points.length; index += 1) {
      const a = path.points[index - 1];
      const b = path.points[index];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared <= 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((marker.x - a.x) * dx + (marker.y - a.y) * dy) / lengthSquared));
      const distance = Math.hypot(marker.x - (a.x + t * dx), marker.y - (a.y + t * dy));
      if (!closest || distance < closest.distance) closest = { distance, dx, dy };
    }
  }
  return closest;
}

/**
 * Face the local +Z gate opening toward campus circulation. When a gate is
 * close to an authored approach path, the path tangent defines the clean
 * perpendicular gate alignment; authored rotation is the fallback when no
 * nearby approach exists. The campus content center is the final fallback.
 */
export function campusGateFacingRotation(marker: CampusMarker, campus: ReadonlyOutdoorCampus): number {
  const snapToQuarterTurn = (angle: number) => Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const authoredRotation = (marker as CampusMarker & { rotation?: number }).rotation;

  const buildingCenters = campus.buildings.map((building) => ({
    x: building.x + building.width / 2,
    y: building.y + building.height / 2,
  }));
  const center = buildingCenters.length
    ? buildingCenters.reduce((sum, point) => ({ x: sum.x + point.x / buildingCenters.length, y: sum.y + point.y / buildingCenters.length }), { x: 0, y: 0 })
    : { x: campus.canvasW / 2, y: campus.canvasH / 2 };
  const inwardX = center.x - marker.x;
  const inwardY = center.y - marker.y;
  const inwardLength = Math.hypot(inwardX, inwardY) || 1;
  const nearestPath = closestPathDirection(marker, campus);
  const gateWidth = marker.width ?? 44;
  if (nearestPath && nearestPath.distance <= Math.max(30, gateWidth * 1.25)) {
    const pathLength = Math.hypot(nearestPath.dx, nearestPath.dy) || 1;
    let dx = nearestPath.dx / pathLength;
    let dy = nearestPath.dy / pathLength;
    if (dx * inwardX + dy * inwardY < 0) { dx *= -1; dy *= -1; }
    // The Student 3D gate is a rigid, renderer-only landmark. Snap noisy path
    // tangents to the nearest cardinal yaw so the physical leaves stay square.
    return snapToQuarterTurn(Math.atan2(dx, dy));
  }
  if (typeof authoredRotation === "number" && Number.isFinite(authoredRotation)) {
    return snapToQuarterTurn(-(authoredRotation * Math.PI) / 180);
  }
  return snapToQuarterTurn(Math.atan2(inwardX / inwardLength, inwardY / inwardLength));
}
