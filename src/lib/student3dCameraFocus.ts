export interface Student3dFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Find the center of the map area that remains visible around docked UI. */
export function student3dSafeFocusCenter(
  map: Student3dFocusRect,
  overlays: readonly Student3dFocusRect[],
  margin = 12,
): { x: number; y: number } {
  let left = map.left + margin;
  let right = map.left + map.width - margin;
  let top = map.top + margin;
  let bottom = map.top + map.height - margin;
  const middleX = map.left + map.width / 2;
  const middleY = map.top + map.height / 2;
  const edgeTolerance = 48;

  for (const overlay of overlays) {
    if (![overlay.left, overlay.top, overlay.width, overlay.height].every(Number.isFinite)
      || overlay.width <= 0 || overlay.height <= 0) continue;
    const overlayRight = overlay.left + overlay.width;
    const overlayBottom = overlay.top + overlay.height;
    if (overlayRight <= map.left || overlay.left >= map.left + map.width
      || overlayBottom <= map.top || overlay.top >= map.top + map.height) continue;

    // Mobile sheets and route cards take the bottom part of the map. Resolve
    // these first so a wide bottom sheet is not mistaken for a side rail.
    const mobileMap = map.width < 768;
    if (mobileMap && overlayBottom >= map.top + map.height - edgeTolerance
      && overlay.top > middleY && overlay.height >= 96) {
      bottom = Math.min(bottom, overlay.top - margin);
      continue;
    }
    // Full-height desktop cards/rails begin at the top edge too, but they are
    // side docks. Let the later left/right checks classify those correctly.
    if (overlay.top <= map.top + edgeTolerance && overlay.height >= 40 && overlay.height < map.height * 0.7) {
      top = Math.max(top, overlayBottom + margin);
      continue;
    }
    if (overlay.left <= map.left + edgeTolerance && overlay.width >= map.width * 0.2) {
      left = Math.max(left, overlayRight + margin);
      continue;
    }
    if (overlayRight >= map.left + map.width - edgeTolerance
      && overlay.width >= map.width * 0.2 && overlay.left > middleX) {
      right = Math.min(right, overlay.left - margin);
      continue;
    }
    if (!mobileMap && overlayBottom >= map.top + map.height - edgeTolerance
      && overlay.top > middleY && overlay.height >= 96) {
      bottom = Math.min(bottom, overlay.top - margin);
    }
  }

  // If panels leave only a sliver, use the canvas center instead of producing
  // an extreme camera offset.
  if (right - left < map.width * 0.12) {
    left = map.left + margin;
    right = map.left + map.width - margin;
  }
  if (bottom - top < map.height * 0.12) {
    top = map.top + margin;
    bottom = map.top + map.height - margin;
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** Perspective-camera distance that frames a world-space box with padding. */
export function student3dFocusDistance(
  width: number,
  depth: number,
  height: number,
  verticalFovDegrees: number,
  aspect: number,
  { padding = 1.35, min = 5.5, max = 18 }: { padding?: number; min?: number; max?: number } = {},
): number {
  const fov = Math.max(1, Math.min(150, verticalFovDegrees)) * Math.PI / 180;
  const safeAspect = Math.max(0.2, aspect);
  const halfVertical = Math.tan(fov / 2);
  const halfHorizontal = halfVertical * safeAspect;
  const required = Math.max(
    Math.max(0.1, width) / (2 * halfHorizontal),
    Math.max(0.1, depth) / (2 * halfVertical),
    Math.max(0.1, height) / (2 * halfVertical),
  ) * padding;
  return Math.max(min, Math.min(max, required));
}
