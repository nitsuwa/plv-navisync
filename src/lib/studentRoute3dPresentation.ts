import type { Pt } from "./routePlanner";

/** Authored indoor floor coordinates to Three.js world units. */
export const STUDENT_FLOOR_3D_SCALE = 0.025;
const DEFAULT_AVATAR_ENDPOINT_CLEARANCE_WORLD = 0.08;

/** Route length in rendered world units, used only for presentation decisions. */
export function routePolylineWorldLength(points: readonly Pt[], worldScale: number): number {
  if (!Number.isFinite(worldScale) || worldScale <= 0) return 0;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!Number.isFinite(previous.x) || !Number.isFinite(previous.y)
      || !Number.isFinite(current.x) || !Number.isFinite(current.y)) continue;
    length += Math.hypot(current.x - previous.x, current.y - previous.y) * worldScale;
  }
  return length;
}

/** Keep the rendered avatar slightly before a possibly wall-adjacent endpoint.
 * This never changes canonical route progress, destination, or arrival state. */
export function routeVisualProgressWithEndpointClearance(
  progress: number,
  routeLengthWorld: number,
  clearanceWorld = DEFAULT_AVATAR_ENDPOINT_CLEARANCE_WORLD,
): number {
  const clampedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  if (!Number.isFinite(routeLengthWorld) || routeLengthWorld <= 0
    || !Number.isFinite(clearanceWorld) || clearanceWorld <= 0) return clampedProgress;
  // On short room-to-room paths, keep the correction proportional so the
  // character still arrives close to its destination.
  const clearance = Math.min(clearanceWorld, routeLengthWorld * 0.12);
  const start = Math.max(0, 1 - (clearance * 2) / routeLengthWorld);
  if (clampedProgress <= start) return clampedProgress;
  const amount = Math.min(1, (clampedProgress - start) / (1 - start));
  // Smoothstep keeps walking movement continuous as the avatar eases to rest.
  const eased = amount * amount * (3 - 2 * amount);
  return start + eased * (clearance / routeLengthWorld);
}

export interface RouteArrowPlacement {
  point: Pt;
  /** Yaw for a flat arrow whose local forward axis is +X, with map Y mapped to world +Z. */
  yaw: number;
  distance: number;
}

export interface RouteWorldSampler {
  totalLength: number;
  sample(distance: number, output?: Pt): Pt | null;
  yawAt(distance: number): number;
  isNearCorner(distance: number, clearance?: number): boolean;
}

/** Return one arrow's cyclic distance along a route. The end margins keep the
 * chevrons on valid route geometry; modulo spacing distributes the bounded
 * arrow set so a loop boundary never leaves the route empty. */
export function routeArrowDistanceAt(
  totalLength: number,
  arrowCount: number,
  arrowIndex: number,
  elapsedSeconds: number,
  speedWorldPerSecond: number,
): number | null {
  const usable = totalLength - 1.8;
  if (!Number.isFinite(usable) || usable <= 0
    || !Number.isInteger(arrowCount) || arrowCount < 1
    || !Number.isInteger(arrowIndex) || arrowIndex < 0 || arrowIndex >= arrowCount
    || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0
    || !Number.isFinite(speedWorldPerSecond) || speedWorldPerSecond < 0) return null;
  const spacing = usable / arrowCount;
  if (spacing <= 0) return null;
  const phase = (elapsedSeconds * speedWorldPerSecond) % spacing;
  return 0.9 + ((arrowIndex * spacing + phase) % usable);
}

/** Cache canonical route segments in rendered world-distance units so small
 * directional chevrons can flow over the same route without React state or
 * rebuilding route geometry. */
export function createRouteWorldSampler(points: readonly Pt[], worldScale: number): RouteWorldSampler {
  const clean: Pt[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) * worldScale > 0.002) clean.push(point);
  }
  const lengths = clean.slice(1).map((point, index) => Math.hypot(point.x - clean[index].x, point.y - clean[index].y) * worldScale);
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative.at(-1)! + length);
  const totalLength = cumulative.at(-1) ?? 0;
  const corners: number[] = [];
  for (let index = 1; index < clean.length - 1; index += 1) {
    const before = clean[index - 1]; const point = clean[index]; const after = clean[index + 1];
    const ax = point.x - before.x; const ay = point.y - before.y;
    const bx = after.x - point.x; const by = after.y - point.y;
    const aLength = Math.hypot(ax, ay); const bLength = Math.hypot(bx, by);
    if (aLength <= 1e-8 || bLength <= 1e-8) continue;
    const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLength * bLength)));
    if (Math.acos(cosine) >= (38 * Math.PI) / 180) corners.push(cumulative[index]);
  }
  const sample = (distance: number, output: Pt = { x: 0, y: 0 }): Pt | null => {
    if (!clean.length) return null;
    if (clean.length === 1 || totalLength <= 0 || distance <= 0) {
      output.x = clean[0].x; output.y = clean[0].y; return output;
    }
    if (distance >= totalLength) {
      output.x = clean.at(-1)!.x; output.y = clean.at(-1)!.y; return output;
    }
    let low = 1; let high = cumulative.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cumulative[middle] < distance) low = middle + 1; else high = middle;
    }
    const segment = low - 1;
    const segmentLength = lengths[segment];
    const ratio = segmentLength > 0 ? (distance - cumulative[segment]) / segmentLength : 0;
    const a = clean[segment]; const b = clean[segment + 1];
    output.x = a.x + (b.x - a.x) * ratio;
    output.y = a.y + (b.y - a.y) * ratio;
    return output;
  };
  const yawAt = (distance: number) => {
    // Sample a short chord around the current point. A wider chord blends the
    // heading across a corner so animated chevrons rotate continuously
    // instead of snapping between authored segment tangents.
    const delta = Math.min(0.42, Math.max(0.18, totalLength * 0.012));
    const before = sample(Math.max(0, distance - delta));
    const after = sample(Math.min(totalLength, distance + delta));
    if (!before || !after) return 0;
    return -Math.atan2(after.y - before.y, after.x - before.x);
  };
  return {
    totalLength,
    sample,
    yawAt,
    isNearCorner: (distance, clearance = 0.42) => corners.some((corner) => Math.abs(corner - distance) < clearance),
  };
}

/** Build a cached, allocation-light sampler for visual playback along a route. */
export function createRoutePointSampler(points: readonly Pt[]) {
  const cumulative: number[] = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  const total = cumulative.at(-1) ?? 0;

  return (progress: number, output: Pt = { x: 0, y: 0 }): Pt | null => {
    if (!points.length) return null;
    if (points.length === 1 || progress <= 0 || total <= 0) {
      output.x = points[0].x;
      output.y = points[0].y;
      return output;
    }
    if (progress >= 1) {
      output.x = points.at(-1)!.x;
      output.y = points.at(-1)!.y;
      return output;
    }

    const target = Math.max(0, Math.min(1, progress)) * total;
    let low = 1;
    let high = cumulative.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cumulative[middle] < target) low = middle + 1;
      else high = middle;
    }
    const endIndex = low;
    const startDistance = cumulative[endIndex - 1];
    const segmentLength = cumulative[endIndex] - startDistance;
    const ratio = segmentLength > 0 ? (target - startDistance) / segmentLength : 0;
    const start = points[endIndex - 1];
    const end = points[endIndex];
    output.x = start.x + (end.x - start.x) * ratio;
    output.y = start.y + (end.y - start.y) * ratio;
    return output;
  };
}

/**
 * Sample sparse arrow placements from an ordered canonical route polyline.
 * This is renderer-only geometry: it never changes route points or progress.
 */
export function routeArrowPlacements(
  points: readonly Pt[],
  {
    worldScale,
    spacingWorld = 1.8,
    endMarginWorld = 0.9,
    maxArrows = 36,
  }: {
    worldScale: number;
    spacingWorld?: number;
    endMarginWorld?: number;
    maxArrows?: number;
  },
): RouteArrowPlacement[] {
  if (points.length < 2 || !Number.isFinite(worldScale) || worldScale <= 0) return [];

  const clean: Pt[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) * worldScale > 0.002) clean.push(point);
  }
  if (clean.length < 2) return [];

  const segmentLengths = clean.slice(1).map((point, index) => Math.hypot(point.x - clean[index].x, point.y - clean[index].y) * worldScale);
  const cumulative = [0];
  for (const length of segmentLengths) cumulative.push(cumulative.at(-1)! + length);
  const total = cumulative.at(-1)!;
  const usable = total - endMarginWorld * 2;
  if (usable < spacingWorld * 0.7) return [];

  const count = Math.min(maxArrows, Math.floor(usable / spacingWorld));
  if (count < 1) return [];
  const spacing = Math.min(spacingWorld, usable / count);
  const first = (total - (count - 1) * spacing) / 2;
  const pointAt = (distance: number): Pt => {
    const target = Math.max(0, Math.min(total, distance));
    let index = segmentLengths.findIndex((length, segment) => target <= cumulative[segment + 1] || segment === segmentLengths.length - 1);
    if (index < 0) index = segmentLengths.length - 1;
    const length = segmentLengths[index];
    const ratio = length > 1e-8 ? (target - cumulative[index]) / length : 0;
    const a = clean[index]; const b = clean[index + 1];
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  };

  const tangentDelta = Math.min(0.34, total * 0.035);
  const placements: RouteArrowPlacement[] = [];
  for (let index = 0; index < count; index += 1) {
    const distance = first + index * spacing;
    const before = pointAt(distance - tangentDelta / 2);
    const after = pointAt(distance + tangentDelta / 2);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    if (Math.hypot(dx, dy) < 1e-8) continue;
    placements.push({
      point: pointAt(distance),
      // The rendered chevron points along local +X. Rotating by -theta maps
      // increasing map Y onto world +Z, matching campus and floor projection.
      yaw: -Math.atan2(dy, dx),
      distance,
    });
  }
  return placements;
}
