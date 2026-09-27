import type { FloorRoom, FloorWall } from "../components/map-builder/types";

export interface RoomShapePoint {
  x: number;
  y: number;
}

export interface RoomShapeBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPSILON = 0.0001;

export function rectangleRoomPoints(room: Pick<FloorRoom, "x" | "y" | "w" | "h">): RoomShapePoint[] {
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
}

/** World-space outline used only by visual Room authoring/rendering. */
export function roomOutlinePoints(room: FloorRoom): RoomShapePoint[] {
  if (Array.isArray(room.shapePoints) && room.shapePoints.length >= 3) {
    const basePoints = room.shapePoints.map((point) => ({ x: point.x, y: point.y }));
    const rotation = room.rotation ?? 0;
    if (rotation === 0) return basePoints;
    const bounds = roomShapeBounds(basePoints);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return basePoints.map((point) => {
      const dx = point.x - cx;
      const dy = point.y - cy;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    });
  }
  const points = rectangleRoomPoints(room);
  const rotation = room.rotation ?? 0;
  if (rotation === 0) return points;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

export function roomShapeBounds(points: RoomShapePoint[]): RoomShapeBounds {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(0, Math.max(...xs) - x),
    h: Math.max(0, Math.max(...ys) - y),
  };
}

/** Horizontal room span at a visual label row. Render-only helper used to
 * keep custom-shape labels inside slanted or irregular boundaries. */
export function roomShapeHorizontalSpan(points: RoomShapePoint[], y: number) {
  if (points.length < 3) return 0;
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    if (y < minY - EPSILON || y > maxY + EPSILON) continue;
    if (Math.abs(end.y - start.y) <= EPSILON) {
      intersections.push(start.x, end.x);
      continue;
    }
    const ratio = (y - start.y) / (end.y - start.y);
    intersections.push(start.x + ratio * (end.x - start.x));
  }
  if (intersections.length < 2) return 0;
  return Math.max(...intersections) - Math.min(...intersections);
}

export function roomShapePath(points: RoomShapePoint[]) {
  if (points.length === 0) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} Z`;
}

export function roomShapeSignedArea(points: RoomShapePoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function roomShapeArea(points: RoomShapePoint[]) {
  return Math.abs(roomShapeSignedArea(points));
}

export function roomShapeCentroid(points: RoomShapePoint[]): RoomShapePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  const signedArea = roomShapeSignedArea(points);
  if (Math.abs(signedArea) < EPSILON) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  return { x: x / (6 * signedArea), y: y / (6 * signedArea) };
}

export function pointInRoomShape(point: RoomShapePoint, polygon: RoomShapePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects = (current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistance(point: RoomShapePoint, start: RoomShapePoint, end: RoomShapePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** True for two footprints that are effectively the same authored Room.
 * The test is based on polygon geometry so it also covers rotated and custom
 * shaped Rooms. The small tolerance prevents a duplicate moved by a few units
 * from being mistaken for an intentional nested Room. */
export function roomFootprintsNearlyIdentical(a: FloorRoom, b: FloorRoom, tolerance = 3): boolean {
  const pointsA = roomOutlinePoints(a);
  const pointsB = roomOutlinePoints(b);
  if (pointsA.length < 3 || pointsB.length < 3) return false;

  const boundsA = roomShapeBounds(pointsA);
  const boundsB = roomShapeBounds(pointsB);
  if (Math.abs(boundsA.x - boundsB.x) > tolerance
    || Math.abs(boundsA.y - boundsB.y) > tolerance
    || Math.abs(boundsA.w - boundsB.w) > tolerance
    || Math.abs(boundsA.h - boundsB.h) > tolerance) return false;

  const areaA = roomShapeArea(pointsA);
  const areaB = roomShapeArea(pointsB);
  const largerArea = Math.max(areaA, areaB);
  if (largerArea <= EPSILON || Math.abs(areaA - areaB) / largerArea > 0.03) return false;

  const maxDistanceToBoundary = (source: RoomShapePoint[], target: RoomShapePoint[]) => Math.max(
    ...source.map((point) => Math.min(...target.map((start, index) =>
      pointToSegmentDistance(point, start, target[(index + 1) % target.length]),
    ))),
  );
  return maxDistanceToBoundary(pointsA, pointsB) <= tolerance
    && maxDistanceToBoundary(pointsB, pointsA) <= tolerance;
}

/** Point-in-polygon that also treats points on the architectural boundary as inside. */
export function pointInRoomShapeInclusive(point: RoomShapePoint, polygon: RoomShapePoint[], tolerance = 0.5) {
  if (pointInRoomShape(point, polygon)) return true;
  if (polygon.length < 2) return false;
  return polygon.some((start, index) => pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length]) <= tolerance);
}

function orientation(a: RoomShapePoint, b: RoomShapePoint, c: RoomShapePoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: RoomShapePoint, b: RoomShapePoint, point: RoomShapePoint) {
  return point.x >= Math.min(a.x, b.x) - EPSILON
    && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON
    && point.y <= Math.max(a.y, b.y) + EPSILON
    && Math.abs(orientation(a, b, point)) <= EPSILON;
}

function segmentsIntersect(a1: RoomShapePoint, a2: RoomShapePoint, b1: RoomShapePoint, b2: RoomShapePoint) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON))
    && ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))) return true;
  return (Math.abs(o1) <= EPSILON && onSegment(a1, a2, b1))
    || (Math.abs(o2) <= EPSILON && onSegment(a1, a2, b2))
    || (Math.abs(o3) <= EPSILON && onSegment(b1, b2, a1))
    || (Math.abs(o4) <= EPSILON && onSegment(b1, b2, a2));
}

function segmentsProperlyIntersect(a1: RoomShapePoint, a2: RoomShapePoint, b1: RoomShapePoint, b2: RoomShapePoint) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  return ((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON))
    && ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON));
}

/** True when the complete inner Room polygon lies in the outer Room polygon.
 * Shared boundary segments are allowed; crossing out through a concave edge is not. */
export function roomContainsRoom(outer: FloorRoom, inner: FloorRoom): boolean {
  if (outer.id === inner.id) return false;
  if (roomFootprintsNearlyIdentical(outer, inner)) return false;
  const outerPoints = roomOutlinePoints(outer);
  const innerPoints = roomOutlinePoints(inner);
  const outerArea = roomShapeArea(outerPoints);
  const innerArea = roomShapeArea(innerPoints);
  // A child must be meaningfully smaller than its parent. The near-identical
  // footprint check above handles small coordinate/resize drift.
  if (innerArea < EPSILON || innerArea >= outerArea - 1) return false;
  if (!innerPoints.every((point) => pointInRoomShapeInclusive(point, outerPoints))) return false;
  for (let index = 0; index < innerPoints.length; index += 1) {
    const start = innerPoints[index];
    const end = innerPoints[(index + 1) % innerPoints.length];
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (!pointInRoomShapeInclusive(midpoint, outerPoints)) return false;
    for (let other = 0; other < outerPoints.length; other += 1) {
      if (segmentsProperlyIntersect(start, end, outerPoints[other], outerPoints[(other + 1) % outerPoints.length])) return false;
    }
  }
  return true;
}

/** Positive-area Room intersection using the authored polygons rather than
 * their bounding rectangles. `minimumBoundsOverlap` preserves the editor's
 * existing tolerance for near-touching rectangular Rooms. */
export function roomShapesOverlap(a: FloorRoom, b: FloorRoom, minimumBoundsOverlap = 0): boolean {
  if (a.id === b.id || roomContainsRoom(a, b) || roomContainsRoom(b, a)) return false;
  const pointsA = roomOutlinePoints(a);
  const pointsB = roomOutlinePoints(b);
  const boundsA = roomShapeBounds(pointsA);
  const boundsB = roomShapeBounds(pointsB);
  const overlapX = Math.min(boundsA.x + boundsA.w, boundsB.x + boundsB.w) - Math.max(boundsA.x, boundsB.x);
  const overlapY = Math.min(boundsA.y + boundsA.h, boundsB.y + boundsB.h) - Math.max(boundsA.y, boundsB.y);
  if (overlapX <= minimumBoundsOverlap || overlapY <= minimumBoundsOverlap) return false;

  // For two unrotated rectangular Rooms, positive overlap in both axes is
  // exact. The polygon edge test below can miss a thin partial intersection
  // when both Rooms share their top and bottom edges (all candidate vertices
  // then lie on boundaries, with no proper edge crossing).
  const isAxisAlignedRectangle = (room: FloorRoom) =>
    !(Array.isArray(room.shapePoints) && room.shapePoints.length >= 3)
    && Math.abs((room.rotation ?? 0) % 360) <= EPSILON;
  if (isAxisAlignedRectangle(a) && isAxisAlignedRectangle(b)) return true;

  const strictlyInside = (point: RoomShapePoint, polygon: RoomShapePoint[]) => pointInRoomShape(point, polygon)
    && !polygon.some((start, index) => pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length]) <= EPSILON);
  if (pointsA.some((point) => strictlyInside(point, pointsB)) || pointsB.some((point) => strictlyInside(point, pointsA))) return true;
  for (let aIndex = 0; aIndex < pointsA.length; aIndex += 1) {
    for (let bIndex = 0; bIndex < pointsB.length; bIndex += 1) {
      if (segmentsProperlyIntersect(
        pointsA[aIndex], pointsA[(aIndex + 1) % pointsA.length],
        pointsB[bIndex], pointsB[(bIndex + 1) % pointsB.length],
      )) return true;
    }
  }
  // Identical/coincident outlines still occupy the same interior even though
  // every vertex lies on the other boundary.
  const centerA = roomShapeCentroid(pointsA);
  const centerB = roomShapeCentroid(pointsB);
  return (pointInRoomShape(centerA, pointsB) && pointInRoomShape(centerB, pointsA));
}

/** Simple polygon validation for the intentionally small Room shape editor. */
export function isValidRoomShape(points: RoomShapePoint[], canvasW?: number, canvasH?: number) {
  if (points.length < 3 || roomShapeArea(points) < 4) return false;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (canvasW !== undefined && (point.x < -EPSILON || point.x > canvasW + EPSILON)) return false;
    if (canvasH !== undefined && (point.y < -EPSILON || point.y > canvasH + EPSILON)) return false;
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    if (Math.hypot(next.x - points[index].x, next.y - points[index].y) < 2) return false;
    for (let other = index + 1; other < points.length; other += 1) {
      const otherNext = points[(other + 1) % points.length];
      const adjacent = other === index
        || other === (index + 1) % points.length
        || (other + 1) % points.length === index;
      if (adjacent) continue;
      if (segmentsIntersect(points[index], next, points[other], otherNext)) return false;
    }
  }
  return true;
}

export function translateRoomShape(room: FloorRoom, dx: number, dy: number): FloorRoom {
  if (!Array.isArray(room.shapePoints)) return { ...room, x: room.x + dx, y: room.y + dy };
  return {
    ...room,
    x: room.x + dx,
    y: room.y + dy,
    shapePoints: room.shapePoints.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function lineIntersection(a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) {
  const denominator = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(denominator) < EPSILON) return null;
  const detA = a.x1 * a.y2 - a.y1 * a.x2;
  const detB = b.x1 * b.y2 - b.y1 * b.x2;
  return {
    x: (detA * (b.x1 - b.x2) - (a.x1 - a.x2) * detB) / denominator,
    y: (detA * (b.y1 - b.y2) - (a.y1 - a.y2) * detB) / denominator,
  };
}

function wallSegment(wall: FloorWall) {
  return { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
}

function pointOnWallSegment(point: RoomShapePoint, wall: FloorWall) {
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (length < EPSILON) return false;
  const cross = Math.abs((point.x - wall.x1) * (wall.y2 - wall.y1) - (point.y - wall.y1) * (wall.x2 - wall.x1));
  if (cross > EPSILON * Math.max(1, length)) return false;
  return point.x >= Math.min(wall.x1, wall.x2) - EPSILON
    && point.x <= Math.max(wall.x1, wall.x2) + EPSILON
    && point.y >= Math.min(wall.y1, wall.y2) - EPSILON
    && point.y <= Math.max(wall.y1, wall.y2) + EPSILON;
}

function distanceToNominalSide(wall: FloorWall, side: "top" | "right" | "bottom" | "left", room: FloorRoom) {
  const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  const sideValue = side === "top" ? room.y : side === "bottom" ? room.y + room.h : side === "left" ? room.x : room.x + room.w;
  if ((side === "top" || side === "bottom") && !horizontal) return Number.POSITIVE_INFINITY;
  if ((side === "left" || side === "right") && horizontal) return Number.POSITIVE_INFINITY;
  const axisDistance = side === "top" || side === "bottom"
    ? Math.min(Math.abs(wall.y1 - sideValue), Math.abs(wall.y2 - sideValue))
    : Math.min(Math.abs(wall.x1 - sideValue), Math.abs(wall.x2 - sideValue));
  const wallMin = side === "top" || side === "bottom" ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
  const wallMax = side === "top" || side === "bottom" ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
  const roomMin = side === "top" || side === "bottom" ? room.x : room.y;
  const roomMax = side === "top" || side === "bottom" ? room.x + room.w : room.y + room.h;
  const overlap = Math.max(0, Math.min(wallMax, roomMax) - Math.max(wallMin, roomMin));
  return axisDistance - overlap * 0.01;
}

/**
 * Build a simple visual Room polygon from the nearest structural boundaries.
 * Missing sides fall back to the Room rectangle, so a Floor perimeter can
 * provide one or more sides without being copied or changed.
 */
export function fitRoomToWalls(room: FloorRoom, walls: FloorWall[], canvasW: number, canvasH: number) {
  const sides = ["top", "right", "bottom", "left"] as const;
  const selected = new Map<typeof sides[number], FloorWall>();
  for (const side of sides) {
    const candidates = walls
      .filter((wall) => wall.visible !== false)
      .map((wall) => {
        const anchoredSide = wall.startAnchor?.roomId === room.id
          ? wall.startAnchor.edge
          : wall.endAnchor?.roomId === room.id
            ? wall.endAnchor.edge
            : undefined;
        const score = wall.managedKind === "perimeter" && wall.perimeterSide === side
          ? -100000
          : anchoredSide === side
            ? -10000
            : distanceToNominalSide(wall, side, room);
        return { wall, score };
      })
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (best && (best.score < Math.max(10, Math.min(room.w, room.h) * 0.35) || best.wall.managedKind === "perimeter" || best.wall.startAnchor?.roomId === room.id || best.wall.endAnchor?.roomId === room.id)) {
      selected.set(side, best.wall);
    }
  }
  if (selected.size < 3) return null;

  const fallback = new Map<typeof sides[number], { x1: number; y1: number; x2: number; y2: number }>([
    ["top", { x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y }],
    ["right", { x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.h }],
    ["bottom", { x1: room.x + room.w, y1: room.y + room.h, x2: room.x, y2: room.y + room.h }],
    ["left", { x1: room.x, y1: room.y + room.h, x2: room.x, y2: room.y }],
  ]);
  const lineFor = (side: typeof sides[number]) => selected.has(side) ? wallSegment(selected.get(side)!) : fallback.get(side)!;
  const corner = (first: typeof sides[number], second: typeof sides[number], fallbackPoint: RoomShapePoint) => {
    const intersection = lineIntersection(lineFor(first), lineFor(second));
    if (!intersection) return selected.has(first) || selected.has(second) ? null : fallbackPoint;
    if (selected.has(first) && !pointOnWallSegment(intersection, selected.get(first)!)) return null;
    if (selected.has(second) && !pointOnWallSegment(intersection, selected.get(second)!)) return null;
    return intersection;
  };
  const topLeft = corner("top", "left", { x: room.x, y: room.y });
  const topRight = corner("top", "right", { x: room.x + room.w, y: room.y });
  const bottomRight = corner("bottom", "right", { x: room.x + room.w, y: room.y + room.h });
  const bottomLeft = corner("bottom", "left", { x: room.x, y: room.y + room.h });
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;
  const points = [topLeft, topRight, bottomRight, bottomLeft];
  return isValidRoomShape(points, canvasW, canvasH) ? points : null;
}

export function roomShapeLabelPoint(points: RoomShapePoint[]) {
  const centroid = roomShapeCentroid(points);
  if (pointInRoomShape(centroid, points)) return centroid;
  const average = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  if (pointInRoomShape(average, points)) return average;
  return points[0] ?? { x: 0, y: 0 };
}
