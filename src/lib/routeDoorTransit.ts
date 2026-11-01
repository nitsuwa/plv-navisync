import type { Pt } from "./routePlanner";

export interface RouteDoorCrossing {
  /** Distance from the start of the route to the Door crossing. */
  distance: number;
  /** Route progress in the same normalized 0..1 space used by playback. */
  progress: number;
}

export interface RouteDoorCrossingMeasure {
  totalLength: number;
  crossings: readonly RouteDoorCrossing[];
}

export const ROUTE_DOOR_TRANSIT_OPACITY = 0.35;
export const ROUTE_DOOR_TRANSIT_RADIUS = 0.42;

/** During Follow, Door visibility is owned by route crossing, not camera sight lines. */
export function shouldApplyDoorFocusOcclusion(kind: "wall" | "door" | "window", followMode: boolean): boolean {
  return kind !== "door" || !followMode;
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Find where a route actually intersects the authored Door opening segment.
 * Inputs must share a coordinate space (indoor renderer world units or
 * authored campus coordinates). Camera position is intentionally irrelevant.
 */
export function measureRouteDoorCrossings(
  route: readonly Pt[],
  doorStart: Pt,
  doorEnd: Pt,
): RouteDoorCrossingMeasure {
  const cumulative: number[] = [0];
  for (let index = 1; index < route.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(route[index].x - route[index - 1].x, route[index].y - route[index - 1].y));
  }
  const totalLength = cumulative.at(-1) ?? 0;
  const doorX = doorEnd.x - doorStart.x;
  const doorY = doorEnd.y - doorStart.y;
  const doorLength = Math.hypot(doorX, doorY);
  const crossings: RouteDoorCrossing[] = [];
  if (route.length < 2 || totalLength <= 1e-8 || doorLength <= 1e-8) return { totalLength, crossings };

  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const routeX = end.x - start.x;
    const routeY = end.y - start.y;
    const routeLength = Math.hypot(routeX, routeY);
    if (routeLength <= 1e-8) continue;
    const denominator = cross(routeX, routeY, doorX, doorY);
    // A route running along a wall or parallel to the Door must not count as
    // crossing the threshold.
    if (Math.abs(denominator) <= 1e-8) continue;
    const offsetX = doorStart.x - start.x;
    const offsetY = doorStart.y - start.y;
    const routeRatio = cross(offsetX, offsetY, doorX, doorY) / denominator;
    const doorRatio = cross(offsetX, offsetY, routeX, routeY) / denominator;
    const routeEndpointTolerance = 0.015 / routeLength;
    const doorEndpointTolerance = 0.015 / doorLength;
    if (routeRatio < -routeEndpointTolerance || routeRatio > 1 + routeEndpointTolerance
      || doorRatio < -doorEndpointTolerance || doorRatio > 1 + doorEndpointTolerance) continue;

    const distance = cumulative[index - 1] + Math.max(0, Math.min(1, routeRatio)) * routeLength;
    if (crossings.some((crossing) => Math.abs(crossing.distance - distance) <= 0.02)) continue;
    crossings.push({ distance, progress: distance / totalLength });
  }

  return { totalLength, crossings };
}

/** Return the opacity target only while active playback is at a real crossing. */
export function routeDoorTransitOpacity(
  progress: number,
  active: boolean,
  measure: RouteDoorCrossingMeasure,
  radius = ROUTE_DOOR_TRANSIT_RADIUS,
  opacity = ROUTE_DOOR_TRANSIT_OPACITY,
): number {
  if (!active || !Number.isFinite(progress) || measure.totalLength <= 0 || measure.crossings.length === 0) return 1;
  const routeDistance = Math.max(0, Math.min(1, progress)) * measure.totalLength;
  return measure.crossings.some((crossing) => Math.abs(routeDistance - crossing.distance) <= radius) ? opacity : 1;
}
