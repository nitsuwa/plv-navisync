import type { CampusBuilding, CampusDecorAsset, CampusEntrance, BuildingEntranceEdge } from "../components/map-builder/types";
import { entranceWorldPosition } from "./buildingEntrances";
import { polylineCrossesObstacle } from "./editorPlacement";

export interface EntranceConnectorResult {
  /** The complete committed route, including the outward clearance leg. */
  points: { x: number; y: number }[];
  /** Intermediate points persisted on NavigationEdge.bendPoints. */
  bends: { x: number; y: number }[];
  blocked: boolean;
}

type ConnectorBuilding = Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation"> & { id?: string };
type ConnectorEntrance = Pick<CampusEntrance, "edge" | "offset">;
type ConnectorObstacle = Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation"> & { id?: string };

const roundPoint = (point: { x: number; y: number }) => ({
  x: Math.round(point.x),
  y: Math.round(point.y),
});

const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

const compactOrthogonalPoints = (points: { x: number; y: number }[]) => {
  const compact: { x: number; y: number }[] = [];
  for (const point of points.map(roundPoint)) {
    if (compact.length > 0 && samePoint(compact[compact.length - 1], point)) continue;
    compact.push(point);
    while (compact.length >= 3) {
      const a = compact[compact.length - 3];
      const b = compact[compact.length - 2];
      const c = compact[compact.length - 1];
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!collinear) break;
      compact.splice(compact.length - 2, 1);
    }
  }
  return compact;
};

const isOrthogonalPolyline = (points: { x: number; y: number }[]) => points.slice(1).every((point, index) => {
  const previous = points[index];
  return previous.x === point.x || previous.y === point.y;
});

const ALIGNMENT_EPSILON = 3;

function outwardVector(edge: BuildingEntranceEdge, rotation = 0) {
  const angle = ((edge === "top" ? -90 : edge === "right" ? 0 : edge === "bottom" ? 90 : 180) + rotation) * Math.PI / 180;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Resolve a Building Entrance connector as an outward clearance stub followed
 * by the shortest valid orthogonal route to the selected Walking Point.
 *
 * The first boundary-to-stub segment is intentionally treated as the legal
 * exit from the owning building. Collision checks begin at the stub, so the
 * boundary itself is never misclassified as a building collision.
 */
export function entranceConnectorGeometry(
  building: ConnectorBuilding,
  entrance: ConnectorEntrance,
  target: { x: number; y: number },
  buildings: ConnectorObstacle[] = [],
  assets: CampusDecorAsset[] = [],
): EntranceConnectorResult {
  const origin = roundPoint(entranceWorldPosition(building, entrance));
  const vector = outwardVector(entrance.edge, building.rotation ?? 0);
  // Scale the stub from the owning building's size, with a modest lower and
  // upper bound so it clears the border without creating a visually huge leg.
  const clearance = Math.max(12, Math.min(28, Math.round(Math.min(building.width, building.height) * 0.06)));
  const stub = roundPoint({ x: origin.x + vector.x * clearance, y: origin.y + vector.y * clearance });
  const end = roundPoint(target);

  // The first segment is the deliberate exit through this Entrance. Ignore
  // only the owning Building for that segment; every later segment still
  // checks it, so a route cannot re-enter the source footprint or cross any
  // unrelated Building. Comparing ids as well as references keeps this safe
  // when callers pass a freshly mapped building array.
  const crossesConnectorObstacle = (points: { x: number; y: number }[]) => {
    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentBuildings = index === 0
        ? buildings.filter((candidate) => candidate !== building && (!building.id || candidate.id !== building.id))
        : buildings;
      if (polylineCrossesObstacle([points[index], points[index + 1]], segmentBuildings, assets)) return true;
    }
    return false;
  };

  // A target that is effectively on the Entrance's outward centerline should
  // not acquire a one-pixel dog-leg from rounding or pointer noise. Preserve
  // the exact target center, but use the direct route when it is collision-safe.
  const delta = { x: end.x - origin.x, y: end.y - origin.y };
  const along = delta.x * vector.x + delta.y * vector.y;
  const lateral = Math.abs(delta.x * vector.y - delta.y * vector.x);
  if (Math.hypot(delta.x, delta.y) > ALIGNMENT_EPSILON
    && along > 0
    && lateral <= ALIGNMENT_EPSILON
    && !crossesConnectorObstacle([origin, end])) {
    return { points: [origin, end], bends: [], blocked: false };
  }

  const candidates = [
    [origin, stub, end],
    [origin, stub, { x: end.x, y: stub.y }, end],
    [origin, stub, { x: stub.x, y: end.y }, end],
  ].map(compactOrthogonalPoints);

  const usable = candidates.filter((points) => {
    if (points.length < 2) return false;
    if (!isOrthogonalPolyline(points)) return false;
    return !crossesConnectorObstacle(points);
  });

  if (usable.length === 0) {
    const fallback = compactOrthogonalPoints([origin, stub, end]);
    return { points: fallback, bends: fallback.slice(1, -1), blocked: true };
  }

  const score = (points: { x: number; y: number }[]) => {
    const length = points.slice(1).reduce((total, point, index) => {
      const previous = points[index];
      return total + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    return length + (points.length - 2) * 0.01;
  };
  const selected = usable.sort((a, b) => score(a) - score(b))[0];
  return { points: selected, bends: selected.slice(1, -1), blocked: false };
}

export function entranceConnectorDistance(points: { x: number; y: number }[]) {
  return Math.round(points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0));
}
