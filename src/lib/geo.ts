/**
 * geo.ts — Geographic helpers for the "You are here" feature (C4 demo).
 *
 * Converts browser GPS coordinates (lat/lng) into the campus map's SVG
 * coordinate space (900×680), and snaps a raw point to the nearest walkway
 * node so route planning always has a valid graph start.
 *
 * Scale calibration matches the walkway graph in `pathfinding.ts`:
 * the campus is roughly 200m × 150m on a 900×680 SVG canvas
 * → ~0.22 m per SVG unit.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

/** Meters per degree of latitude (WGS-84, roughly constant). */
const M_PER_DEG_LAT = 111_320;

/** Meters per SVG unit — matches the walkway graph calibration. */
export const M_PER_UNIT = 0.22;

/**
 * Convert GPS coordinates to SVG canvas coordinates, anchored on the
 * campus center (the campus `coordinates` field from the published map).
 *
 * SVG y grows downward = south; x grows right = east.
 * Out-of-range results are clamped to the canvas so the marker always
 * stays visible.
 */
export function latLngToMapPoint(
  lat: number,
  lng: number,
  anchor: GeoPoint,
  canvasW: number,
  canvasH: number
): SvgPoint {
  const dLatM = (lat - anchor.lat) * M_PER_DEG_LAT;
  // Longitude degrees shrink as you move away from the equator.
  const lngScale = Math.cos((anchor.lat * Math.PI) / 180);
  const dLngM = (lng - anchor.lng) * M_PER_DEG_LAT * Math.max(lngScale, 0.05);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const x = cx + dLngM / M_PER_UNIT;
  const y = cy - dLatM / M_PER_UNIT;

  return {
    x: clamp(x, 0, canvasW),
    y: clamp(y, 0, canvasH),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Squared distance between two SVG points. */
export function dist2(a: SvgPoint, b: SvgPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Euclidean distance between two SVG points. */
export function dist(a: SvgPoint, b: SvgPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Snap a point to the nearest candidate (walkway node / entrance / gate).
 * Returns the nearest candidate and the distance to it.
 */
export function snapToNearest(
  point: SvgPoint,
  candidates: readonly SvgPoint[]
): { point: SvgPoint; distance: number } | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestD = dist2(point, best);
  for (let i = 1; i < candidates.length; i++) {
    const d = dist2(point, candidates[i]);
    if (d < bestD) {
      best = candidates[i];
      bestD = d;
    }
  }
  return { point: best, distance: Math.sqrt(bestD) };
}

/**
 * Point at fraction `t` (0..1) along a polyline of SVG points.
 * Uses cumulative segment lengths so the walk avatar moves at a
 * constant visual speed.
 */
export function pointAlongPolyline(points: readonly SvgPoint[], t: number): SvgPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  // Cumulative lengths per segment.
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = dist(points[i], points[i + 1]);
    segLens.push(len);
    total += len;
  }
  if (total <= 0) return points[0];

  const target = t * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target || i === segLens.length - 1) {
      const segT = segLens[i] === 0 ? 0 : (target - acc) / segLens[i];
      const a = points[i];
      const b = points[i + 1];
      return {
        x: a.x + (b.x - a.x) * segT,
        y: a.y + (b.y - a.y) * segT,
      };
    }
    acc += segLens[i];
  }
  return points[points.length - 1];
}

/** Total polyline length in SVG units. */
export function polylineLength(points: readonly SvgPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1]);
  }
  return total;
}
