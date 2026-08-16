/**
 * Pure helpers for B2 Phase 3 decorative-asset property editing.
 *
 * Decorative assets are positioned by their CENTER (x, y) and sized by a
 * single uniform `scale` factor (canvas render multiplies it by 3). These
 * functions contain no React or DOM logic so they can be unit-tested directly
 * (see src/lib/__tests__/decorAsset.test.ts).
 */

/** Scale bounds shared by the canvas corner-resize handler and the panel. */
export const DECOR_SCALE_MIN = 0.1;
export const DECOR_SCALE_MAX = 12;

/** Normalize any degree value into [0, 360) — matches the canvas rotate logic. */
export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Clamp a uniform scale to the editor's allowed range. */
export function clampDecorScale(scale: number): number {
  return Math.min(DECOR_SCALE_MAX, Math.max(DECOR_SCALE_MIN, scale));
}

/**
 * Create a duplicate of a decorative asset: same visual properties, a NEW id,
 * and a small visible offset so the copy does not overlap the original.
 * Returns a shallow copy — the original object is never mutated.
 */
export function duplicateDecorAsset<T extends { id: string; x: number; y: number }>(
  asset: T,
  newId: string,
  offsetX = 20,
  offsetY = 20
): T {
  return { ...asset, id: newId, x: asset.x + offsetX, y: asset.y + offsetY };
}
