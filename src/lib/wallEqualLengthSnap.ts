export interface EqualLengthCandidateGroup {
  length: number;
  wallIds: string[];
}

export interface EqualLengthSnap {
  wallId: string;
  length: number;
  distance: number;
  point: { x: number; y: number };
}

/** Resolve an equal-length endpoint snap from the current pointer sample.
 * Keeping this stateless prevents a previous snapped point from becoming the
 * input to the next sample (which can make the endpoint feel sticky).
 */
export function resolveEqualLengthEndpointSnap(
  fixed: { x: number; y: number },
  pointer: { x: number; y: number },
  candidates: readonly EqualLengthCandidateGroup[],
  excludedWallId: string,
  threshold: number,
): EqualLengthSnap | null {
  const dx = pointer.x - fixed.x;
  const dy = pointer.y - fixed.y;
  const pointerLength = Math.hypot(dx, dy);
  if (!Number.isFinite(pointerLength) || pointerLength <= 0 || threshold < 0) return null;

  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (candidates[middle].length < pointerLength) low = middle + 1;
    else high = middle;
  }

  let best: { wallId: string; length: number; distance: number } | null = null;
  for (const index of [low - 1, low]) {
    const group = candidates[index];
    if (!group) continue;
    const wallId = group.wallIds.find((id) => id !== excludedWallId);
    if (!wallId) continue;
    const distance = Math.abs(group.length - pointerLength);
    if (distance > threshold) continue;
    if (!best || distance < best.distance || (distance === best.distance && group.length < best.length)) {
      best = { wallId, length: group.length, distance };
    }
  }
  if (!best) return null;

  // Keep the angle from the latest pointer position. Snapping changes only the
  // length, so approaching an equal-length target cannot rotate the Wall back
  // toward its gesture-start angle.
  const scale = best.length / pointerLength;
  return {
    ...best,
    point: { x: fixed.x + dx * scale, y: fixed.y + dy * scale },
  };
}
