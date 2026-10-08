import type { FloorFurniture, FloorPlan } from "../components/map-builder/types";

export interface LayoutWarning {
  code: "outside-boundary" | "overlap" | "blocked-access" | "building-overlap" | "narrow-aisle";
  severity: "info" | "warning" | "critical";
  itemIds: string[];
  message: string;
}

interface Rect { x: number; y: number; width: number; height: number }

export interface EventProtectedRegion extends Rect {
  label: string;
  rotation?: number;
  kind?: "building";
}

interface Point { x: number; y: number }

function rotatedRectPoints(item: Rect & { rotation?: number }): Point[] {
  const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
  const radians = ((item.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    { x: -item.width / 2, y: -item.height / 2 },
    { x: item.width / 2, y: -item.height / 2 },
    { x: item.width / 2, y: item.height / 2 },
    { x: -item.width / 2, y: item.height / 2 },
  ].map((point) => ({
    x: center.x + point.x * cosine - point.y * sine,
    y: center.y + point.x * sine + point.y * cosine,
  }));
}

function polygonBounds(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function polygonAxes(points: readonly Point[]): Point[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edge = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(edge.x, edge.y) || 1;
    return { x: -edge.y / length, y: edge.x / length };
  });
}

function projectPolygon(points: readonly Point[], axis: Point) {
  const projections = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...projections), max: Math.max(...projections) };
}

function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  return [...polygonAxes(a), ...polygonAxes(b)].every((axis) => {
    const first = projectPolygon(a, axis);
    const second = projectPolygon(b, axis);
    return first.min < second.max && second.min < first.max;
  });
}

function projectionsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function validateEventLayout(input: {
  furniture: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  blockedRegions?: readonly EventProtectedRegion[];
}): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const furniture = input.furniture;

  for (const item of furniture) {
    const points = rotatedRectPoints(item);
    const outside = points.some((point) => point.x < 0 || point.y < 0 || point.x > input.canvasWidth || point.y > input.canvasHeight);
    if (outside) {
      warnings.push({
        code: "outside-boundary",
        severity: "critical",
        itemIds: [item.id],
        message: `${item.name} sits outside the editable canvas boundary.`,
      });
    }
    for (const region of input.blockedRegions ?? []) {
      const blockedPoints = rotatedRectPoints(region);
      if (polygonsOverlap(points, blockedPoints)) {
        warnings.push({
          code: region.kind === "building" ? "building-overlap" : "blocked-access",
          severity: "critical",
          itemIds: [item.id],
          message: region.kind === "building"
            ? `${item.name} overlaps building ${region.label}. Place it on open campus grounds, or use the requested building floor map for indoor items.`
            : `${item.name} overlaps ${region.label}. Move it away to keep access clear.`,
        });
      }
    }
  }

  for (let first = 0; first < furniture.length; first += 1) {
    const a = furniture[first];
    for (let second = first + 1; second < furniture.length; second += 1) {
      const b = furniture[second];
      const itemIds = [a.id, b.id];
      const aPoints = rotatedRectPoints(a);
      const bPoints = rotatedRectPoints(b);
      if (polygonsOverlap(aPoints, bPoints)) {
        warnings.push({
          code: "overlap",
          severity: "warning",
          itemIds,
          message: `${a.name} overlaps ${b.name}. Consider adding clearance between them.`,
        });
        continue;
      }

      // Adjacent seats are intentional seating, not an inferred walking aisle.
      // Real intersections are still reported above.
      if (a.type === "chair" && b.type === "chair") continue;
      const spacingHintThreshold = Math.min(4, Math.min(a.width, a.height, b.width, b.height) * 0.15);
      const aBounds = polygonBounds(aPoints);
      const bBounds = polygonBounds(bPoints);
      const horizontalGap = Math.max(aBounds.x - (bBounds.x + bBounds.width), bBounds.x - (aBounds.x + aBounds.width));
      const verticalGap = Math.max(aBounds.y - (bBounds.y + bBounds.height), bBounds.y - (aBounds.y + aBounds.height));
      const sideBySide = horizontalGap >= 0 && horizontalGap < spacingHintThreshold && projectionsOverlap(aBounds.y, aBounds.y + aBounds.height, bBounds.y, bBounds.y + bBounds.height);
      const stacked = verticalGap >= 0 && verticalGap < spacingHintThreshold && projectionsOverlap(aBounds.x, aBounds.x + aBounds.width, bBounds.x, bBounds.x + bBounds.width);
      if (sideBySide || stacked) {
        warnings.push({
          code: "narrow-aisle",
          severity: "info",
          itemIds,
          message: `${a.name} and ${b.name} are very close. Consider clearance if people need to pass between them. This is an optional map-unit hint, not a physical-distance measurement.`,
        });
      }
    }
  }

  return warnings;
}

/** Conservative clearance footprints for authored entrances and permanent assets. */
export function eventProtectedAccessRegions(floor: Pick<FloorPlan, "doors" | "furniture"> & Partial<Pick<FloorPlan, "id" | "rooms">>): EventProtectedRegion[] {
  return [
    ...(floor.id === "campus" ? (floor.rooms ?? []).filter(room => room.type === "building" && room.visible !== false).map(room => ({
      x: room.x, y: room.y, width: room.w, height: room.h, rotation: room.rotation ?? 0, label: room.name, kind: "building" as const,
    })) : []),
    ...(floor.doors ?? []).filter(door => door.visible !== false).map(door => {
      const name = door.label?.trim();
      const humanLabel = name && name !== door.id && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name) ? name : null;
      return { x: door.x - door.width / 2, y: door.y - door.width / 2, width: door.width, height: door.width, label: humanLabel ? `the ${door.isEmergencyExit ? "emergency exit" : "entrance"} (${humanLabel})` : `the ${door.isEmergencyExit ? "emergency exit" : "entrance"}` };
    }),
    ...(floor.furniture ?? []).filter(item => item.visible !== false).map(item => ({ ...polygonBounds(rotatedRectPoints(item)), label: `Permanent asset: ${item.name}` })),
  ];
}
