import type { CampusBuilding, CampusDecorAsset, CampusMarker } from "../components/map-builder/types";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "./readonlyOutdoorCampus";
import { entranceWorldPosition } from "./buildingEntrances";

/** Small offset keeps grounded meshes clear of the ground plane without a visible gap. */
export const STUDENT_CAMPUS_3D_GROUND_EPSILON = 0.002;

export interface CampusParkingMarkingSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  kind: "stall-divider" | "stall-row-edge" | "drive-aisle";
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
  const count = Math.max(2, Math.min(14, Math.floor(span / 22)));
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

/** Project authored served Floors into renderer-only fire-escape landings.
 * A single elevated Floor gets one direct flight to grade; multiple served
 * Floors receive only the intermediate landings needed to connect them. */
export function campusFireEscapeLevels(
  floors: readonly { id: string; number: number }[],
  servedFloorIds: readonly string[],
  floorStep: number,
): CampusFireEscapeLevel[] {
  const ordered = [...floors].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  const servedIds = new Set(servedFloorIds);
  const servedIndexes = ordered.flatMap((floor, index) => servedIds.has(floor.id) ? [index] : []);
  const highest = servedIndexes.length ? Math.max(...servedIndexes) : 0;
  const indices = servedIndexes.length > 1
    ? Array.from({ length: highest + 1 }, (_, index) => index)
    : highest > 0 ? [0, highest] : [0];
  const served = new Set(servedIndexes);
  const step = Math.max(0, Number.isFinite(floorStep) ? floorStep : 0);
  return indices.map((floorIndex) => ({ floorIndex, elevation: floorIndex * step, served: served.has(floorIndex) }));
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
  const named = monuments.find((asset) => /suhay\s*(?:ng\s*)?husay/i.test(`${asset.id} ${asset.name ?? ""}`));
  return named?.id ?? (monuments.length === 1 ? monuments[0].id : null);
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
    return Math.atan2(dx, dy);
  }
  if (typeof authoredRotation === "number" && Number.isFinite(authoredRotation)) {
    return -(authoredRotation * Math.PI) / 180;
  }
  return Math.atan2(inwardX / inwardLength, inwardY / inwardLength);
}
