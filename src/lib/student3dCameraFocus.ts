export interface Student3dFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Student3dBounds2d {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isCompactPortraitMap(map: Student3dFocusRect): boolean {
  return map.width < 768 || (map.width <= 900 && map.height > map.width);
}

/** Resolve authored 2D geometry into a finite camera-fit rectangle. */
export function student3dBoundsFromPoints(
  points: readonly { x: number; y: number }[],
  fallback: Student3dBounds2d,
): Student3dBounds2d {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return fallback;
  const minDimension = 48;
  const width = Math.max(minDimension, maxX - minX);
  const height = Math.max(minDimension, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

/** Build a restrained front three-quarter camera direction from an authored
 * entrance point and the building center. Coordinates are campus-map X/Y; Y
 * maps to world Z in the 3D renderer. Returns null when no reliable façade
 * direction can be derived. */
export function student3dShowcaseCameraDirection(
  center: { x: number; y: number },
  entrance: { x: number; y: number },
  { sideBias = 0.38, elevation = 0.53 }: { sideBias?: number; elevation?: number } = {},
): { x: number; y: number; z: number } | null {
  const dx = entrance.x - center.x;
  const dz = entrance.y - center.y;
  const length = Math.hypot(dx, dz);
  if (![center.x, center.y, entrance.x, entrance.y, length, sideBias, elevation].every(Number.isFinite) || length < 0.001) return null;

  const frontX = dx / length;
  const frontZ = dz / length;
  // Bias toward one adjacent façade so both the authored front and a side are
  // visible, while the selected entrance remains the camera's leading face.
  const horizontalLength = Math.hypot(frontX - frontZ * sideBias, frontZ + frontX * sideBias);
  const horizontalX = (frontX - frontZ * sideBias) / horizontalLength;
  const horizontalZ = (frontZ + frontX * sideBias) / horizontalLength;
  const safeElevation = Math.max(0.25, Math.min(0.8, elevation));
  const horizontalScale = Math.sqrt(1 - safeElevation * safeElevation);
  return { x: horizontalX * horizontalScale, y: safeElevation, z: horizontalZ * horizontalScale };
}

/**
 * Place an indoor Follow camera behind the authored route direction, with a
 * restrained side bias so the opening view exposes the corridor ahead instead
 * of aiming every building entrance from the same fixed corner.
 */
export function student3dIndoorFollowCameraOffset(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  distance: number,
  { sideBias = 0.24, elevation = 0.7 }: { sideBias?: number; elevation?: number } = {},
): { x: number; y: number; z: number } | null {
  const dx = next.x - previous.x;
  const dz = next.y - previous.y;
  const length = Math.hypot(dx, dz);
  if (![dx, dz, length, distance, sideBias, elevation].every(Number.isFinite) || length < 0.001 || distance <= 0) return null;

  const forwardX = dx / length;
  const forwardZ = dz / length;
  const sideX = -forwardZ;
  const sideZ = forwardX;
  const preferredX = 0.65;
  const preferredZ = 0.76;
  const sideSign = sideX * preferredX + sideZ * preferredZ >= 0 ? 1 : -1;
  const horizontalX = -forwardX + sideX * sideBias * sideSign;
  const horizontalZ = -forwardZ + sideZ * sideBias * sideSign;
  const horizontalLength = Math.hypot(horizontalX, horizontalZ);
  if (horizontalLength < 0.001) return null;
  const safeElevation = Math.max(0.25, Math.min(0.82, elevation));
  const horizontalScale = Math.sqrt(1 - safeElevation * safeElevation);
  return {
    x: horizontalX / horizontalLength * horizontalScale * distance,
    y: safeElevation * distance,
    z: horizontalZ / horizontalLength * horizontalScale * distance,
  };
}

/** Use the route's final approach to orient an indoor arrival camera. This
 * keeps the destination view looking into the room from the authored doorway
 * direction instead of choosing a fixed corner that may be blocked by a wall.
 */
export function student3dIndoorArrivalCameraDirection(
  points: readonly { x: number; y: number }[],
  { sideBias = 0.16, elevation = 0.64 }: { sideBias?: number; elevation?: number } = {},
): { x: number; y: number; z: number } | null {
  const destination = points.at(-1);
  if (!destination) return null;
  let approach: { x: number; y: number } | null = null;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const candidate = points[index];
    if (Math.hypot(destination.x - candidate.x, destination.y - candidate.y) > 0.001) {
      approach = candidate;
      break;
    }
  }
  if (!approach) return null;
  return student3dIndoorFollowCameraOffset(approach, destination, 1, { sideBias, elevation });
}

/** Identify a mobile bottom sheet even when its top edge is above mid-screen. */
export function studentMapOverlayIsBottomSheet(
  map: Student3dFocusRect,
  overlay: Student3dFocusRect,
): boolean {
  if (!isCompactPortraitMap(map) || map.width <= 0 || map.height <= 0) return false;
  const mapRight = map.left + map.width;
  const mapBottom = map.top + map.height;
  const overlayRight = overlay.left + overlay.width;
  const overlayBottom = overlay.top + overlay.height;
  const bottomTolerance = Math.max(64, map.height * 0.18);
  return overlay.width >= map.width * 0.72
    && overlay.height >= 96
    && overlay.left <= map.left + map.width * 0.15
    && overlayRight >= mapRight - map.width * 0.15
    && overlay.top > map.top + map.height * 0.12
    && overlayBottom >= mapBottom - bottomTolerance;
}

/** Find the part of the map area that remains visible around docked UI. */
export function student3dSafeFocusRect(
  map: Student3dFocusRect,
  overlays: readonly Student3dFocusRect[],
  margin = 12,
): Student3dFocusRect {
  let left = map.left + margin;
  let right = map.left + map.width - margin;
  let top = map.top + margin;
  let bottom = map.top + map.height - margin;
  const middleX = map.left + map.width / 2;
  const middleY = map.top + map.height / 2;
  const mapBottom = map.top + map.height;
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
    const mobileMap = isCompactPortraitMap(map);
    // The compact utility rail is narrow, but still occupies the right edge.
    // Classify it before the bottom-sheet rule when its last button reaches
    // the canvas edge.
    if (mobileMap && overlayRight >= map.left + map.width - edgeTolerance
      && overlay.left > middleX && overlay.width < map.width * 0.2
      && overlay.height >= map.height * 0.18) {
      right = Math.min(right, overlay.left - margin);
      continue;
    }
    const mobileBottomSheet = mobileMap && studentMapOverlayIsBottomSheet(map, overlay);
    if (mobileBottomSheet) {
      bottom = Math.min(bottom, overlay.top - margin);
      continue;
    }
    // Compact mobile controls such as the floor picker can sit just below the
    // search bar. Treat them as part of the top control band instead of
    // reserving their narrow width as if they were a full-height side panel.
    const topControlBand = mobileMap
      ? Math.max(edgeTolerance, Math.min(120, map.height * 0.15))
      : edgeTolerance;
    if (overlay.top <= map.top + topControlBand && overlay.height >= 40 && overlay.height < map.height * 0.7) {
      top = Math.max(top, overlayBottom + margin);
      continue;
    }
    // A short action row at the bottom is a horizontal obstruction, not a
    // left-side rail. Reserve its height so the floor remains above Discover
    // and Event Map actions without needlessly narrowing the whole fit.
    if (mobileMap && overlay.width >= map.width * 0.25 && overlay.height < 96
      && overlay.top > middleY && overlayBottom >= mapBottom - edgeTolerance) {
      bottom = Math.min(bottom, overlay.top - margin);
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
  return { left, top, width: right - left, height: bottom - top };
}

/** Find the center of the map area that remains visible around docked UI. */
export function student3dSafeFocusCenter(
  map: Student3dFocusRect,
  overlays: readonly Student3dFocusRect[],
  margin = 12,
): { x: number; y: number } {
  const safe = student3dSafeFocusRect(map, overlays, margin);
  return { x: safe.left + safe.width / 2, y: safe.top + safe.height / 2 };
}

/** World-space camera-target offset along screen right/up for a safe viewport center. */
export function student3dSafeFocusOffset(
  map: Student3dFocusRect,
  overlays: readonly Student3dFocusRect[],
  distance: number,
  verticalFovDegrees: number,
): { right: number; up: number } {
  const center = student3dSafeFocusCenter(map, overlays);
  const offsetX = center.x - (map.left + map.width / 2);
  const offsetY = center.y - (map.top + map.height / 2);
  const fov = Math.max(1, Math.min(150, verticalFovDegrees)) * Math.PI / 180;
  const worldUnitsPerPixel = 2 * Math.max(0, distance) * Math.tan(fov / 2) / Math.max(1, map.height);
  return { right: -offsetX * worldUnitsPerPixel, up: offsetY * worldUnitsPerPixel };
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

/** Fit a world-space box inside an exposed pixel rectangle within the canvas. */
export function student3dFocusDistanceForViewport(
  width: number,
  depth: number,
  height: number,
  verticalFovDegrees: number,
  canvasHeight: number,
  safeWidth: number,
  safeHeight: number,
  options: { padding?: number; min?: number; max?: number } = {},
): number {
  const safeCanvasHeight = Math.max(1, canvasHeight);
  const heightRatio = Math.max(0.05, Math.min(1, safeHeight / safeCanvasHeight));
  const halfFov = Math.tan((Math.max(1, Math.min(150, verticalFovDegrees)) * Math.PI / 180) / 2);
  const safeFov = 2 * Math.atan(halfFov * heightRatio) * 180 / Math.PI;
  const safeAspect = Math.max(1, safeWidth) / Math.max(1, safeHeight);
  return student3dFocusDistance(width, depth, height, safeFov, safeAspect, options);
}
