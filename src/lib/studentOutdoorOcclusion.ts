export interface OutdoorOccluderBox {
  center: readonly [number, number, number];
  halfSize: readonly [number, number, number];
  yaw: number;
}

/** Heights above the walker's feet for torso, upper torso, and face visibility samples. */
export const OUTDOOR_AVATAR_OCCLUSION_SAMPLE_HEIGHTS = [0.15, 0.25, 0.34] as const;

/** Require most of the useful character silhouette to be hidden before fading a building. */
export function shouldFadeOutdoorBuildingForSamples(blocked: readonly boolean[]): boolean {
  return blocked.length >= 3 && blocked.filter(Boolean).length >= 2;
}

/** Preserve each component's authored alpha while applying one building-wide fade. */
export function outdoorBuildingFadeOpacity(originalOpacity: number, fadeProgress: number): number {
  const progress = Number.isFinite(fadeProgress) ? Math.max(0, Math.min(1, fadeProgress)) : 1;
  return (Number.isFinite(originalOpacity) ? originalOpacity : 1) * progress;
}

export function outdoorBuildingFadeMaterialState(
  original: { opacity: number; transparent: boolean; depthWrite: boolean },
  fadeProgress: number,
) {
  const progress = Number.isFinite(fadeProgress) ? Math.max(0, Math.min(1, fadeProgress)) : 1;
  return {
    opacity: outdoorBuildingFadeOpacity(original.opacity, progress),
    transparent: original.transparent || progress < 0.999,
    depthWrite: progress < 0.99 ? false : original.depthWrite,
  };
}

/** Segment test against the same yaw-rotated building box used by the outdoor renderer. */
export function cameraSegmentIntersectsOutdoorBuilding(
  camera: readonly [number, number, number],
  target: readonly [number, number, number],
  box: OutdoorOccluderBox,
  margin = 0.015,
): boolean {
  const c = Math.cos(-box.yaw), s = Math.sin(-box.yaw);
  const toLocal = (p: readonly number[]) => {
    const x = p[0] - box.center[0], z = p[2] - box.center[2];
    return [x * c - z * s, p[1] - box.center[1], x * s + z * c];
  };
  const a = toLocal(camera), b = toLocal(target);
  const half = box.halfSize.map((v) => v + margin);
  let low = 0, high = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < -half[axis] || a[axis] > half[axis]) return false;
      continue;
    }
    let first = (-half[axis] - a[axis]) / delta;
    let last = (half[axis] - a[axis]) / delta;
    if (first > last) [first, last] = [last, first];
    low = Math.max(low, first);
    high = Math.min(high, last);
    if (low > high) return false;
  }
  // Ignore intersections at the figure itself or camera endpoint.
  return high >= 0.025 && low <= 0.975;
}

/** Broad phase plus an exact geometry hit; footprint/bounds overlap alone is never enough. */
export function outdoorBuildingBlocksAvatarSample(
  candidateBoundsIntersect: boolean,
  geometryHit: boolean,
): boolean {
  return candidateBoundsIntersect && geometryHit;
}
