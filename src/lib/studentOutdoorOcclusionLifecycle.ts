export interface OutdoorOcclusionLifecycleTransition {
  active: boolean;
  changed: boolean;
  restore: boolean;
  evaluateImmediately: boolean;
}

/** Outdoor building fading follows live route playback, not the mere presence
 * of a route marker or camera mode. Paused routes must restore authored looks. */
export function shouldRunOutdoorOcclusion(followPlaying: boolean, routePointCount: number): boolean {
  return followPlaying && routePointCount > 1;
}

/** Describes the synchronous lifecycle work needed when playback toggles. */
export function outdoorOcclusionLifecycleTransition(
  wasActive: boolean,
  isActive: boolean,
): OutdoorOcclusionLifecycleTransition {
  const changed = wasActive !== isActive;
  return {
    active: isActive,
    changed,
    restore: changed && !isActive,
    evaluateImmediately: changed && isActive,
  };
}
