/** Keep the outdoor demo's pacing, but divide its time proportionally between
 * legs. Clamping each indoor leg independently makes short corridors crawl. */
export function walkingAnimationDuration(distanceM: number, journeyDistanceM = distanceM): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 1;
  const journeyDistance = Number.isFinite(journeyDistanceM) && journeyDistanceM > 0
    ? Math.max(distanceM, journeyDistanceM)
    : distanceM;
  const journeyDuration = Math.max(4000, Math.min(12000, Math.round(journeyDistance / 40) * 1000));
  return Math.max(1, journeyDuration * 1.2 * distanceM / journeyDistance);
}

/**
 * Time one canonical walk leg as its share of the same-context journey.
 * RouteContextLeg/RouteIndoorSegment distances are already normalized meters,
 * so this avoids charging every short leg a full route-sized animation. The
 * progress remains continuous across all waypoints in the leg.
 */
export function navigationWalkDuration(
  distanceM: number,
  journeyDistanceM: number,
  speedMultiplier: number = 1,
): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 1;
  const journeyDistance = Number.isFinite(journeyDistanceM) && journeyDistanceM > 0
    ? Math.max(distanceM, journeyDistanceM)
    : distanceM;
  const speed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const journeyDuration = Math.max(1600, Math.min(16000, journeyDistance * 80));
  const legShare = distanceM / journeyDistance;
  return Math.max(450, journeyDuration * legShare) / speed;
}

/** Route playback is a presentation pace derived from human instructions,
 * never from uncalibrated map units or estimated real-world walking speed. */
export function guidedRouteProgressDuration(meaningfulStepCount: number): number {
  const count = Number.isFinite(meaningfulStepCount)
    ? Math.max(1, Math.min(14, Math.round(meaningfulStepCount)))
    : 1;
  return Math.max(6500, Math.min(16000, 5800 + count * 850));
}

export function outdoorWalkingDistance(route: {
  dist: number;
  indoorSegments?: ReadonlyArray<{ distanceM: number }>;
}): number {
  const indoorDistance = (route.indoorSegments ?? []).reduce((sum, segment) =>
    sum + (Number.isFinite(segment.distanceM) ? Math.max(0, segment.distanceM) : 0), 0);
  return Math.max(0, route.dist - indoorDistance);
}
