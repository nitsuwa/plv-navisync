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

export function outdoorWalkingDistance(route: {
  dist: number;
  indoorSegments?: ReadonlyArray<{ distanceM: number }>;
}): number {
  const indoorDistance = (route.indoorSegments ?? []).reduce((sum, segment) =>
    sum + (Number.isFinite(segment.distanceM) ? Math.max(0, segment.distanceM) : 0), 0);
  return Math.max(0, route.dist - indoorDistance);
}
