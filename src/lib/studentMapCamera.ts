import { clampStudentMapZoom, type MapPoint, type MapViewportInsets } from "./mapViewport";

export interface StudentCameraBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudentOverviewCameraOptions {
  mapWidth: number;
  mapHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  content: StudentCameraBounds;
  insets?: MapViewportInsets;
  /** Translation applied by a child scene inside the SVG viewBox. */
  contentOffset?: MapPoint;
  /** Fraction of the usable viewport filled by the structural content. */
  fillRatio?: number;
}

export interface StudentOverviewCamera {
  pan: MapPoint;
  zoom: number;
}

export interface StudentRoomFocusCameraOptions {
  mapWidth: number;
  mapHeight: number;
  roomBounds: StudentCameraBounds;
  currentPan: MapPoint;
  zoom: number;
  insets?: MapViewportInsets;
  /** Letterbox space around the SVG viewBox, expressed in viewBox units. */
  viewportOffset?: MapPoint;
  /** Translation applied by a child scene inside the SVG viewBox. */
  contentOffset?: MapPoint;
  /** Minimum visible fraction required before a room is considered in view. */
  visibleThreshold?: number;
  /** Extra breathing room around the room center in map/viewBox units. */
  comfortMargin?: number;
}

export interface StudentRoomFocusCamera {
  pan: MapPoint;
  zoom: number;
  shouldMove: boolean;
  visibleRatio: number;
}

/** Ease-out used by the short scripted pan when a room needs revealing. */
export function getStudentRoomFocusProgress(elapsedMs: number, durationMs = 330): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Fit meaningful map content into the usable part of the screen. Bounds are
 * structural (buildings or floor shape), so furniture and decorative objects
 * cannot unexpectedly shrink the overview.
 */
export function getStudentOverviewCamera({
  mapWidth,
  mapHeight,
  viewportWidth,
  viewportHeight,
  content,
  insets,
  contentOffset = { x: 0, y: 0 },
  fillRatio = 0.82,
}: StudentOverviewCameraOptions): StudentOverviewCamera {
  const safeMapWidth = Math.max(1, mapWidth);
  const safeMapHeight = Math.max(1, mapHeight);
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeContentWidth = Math.max(1, content.width);
  const safeContentHeight = Math.max(1, content.height);
  const baseScale = Math.min(safeViewportWidth / safeMapWidth, safeViewportHeight / safeMapHeight);
  const letterboxX = (safeViewportWidth - safeMapWidth * baseScale) / 2;
  const letterboxY = (safeViewportHeight - safeMapHeight * baseScale) / 2;
  const left = Math.max(0, insets?.left ?? 0);
  const right = Math.max(0, insets?.right ?? 0);
  const top = Math.max(0, insets?.top ?? 0);
  const bottom = Math.max(0, insets?.bottom ?? 0);
  const usableWidth = Math.max(1, safeViewportWidth - left - right);
  const usableHeight = Math.max(1, safeViewportHeight - top - bottom);
  const safeFillRatio = Math.max(0.5, Math.min(1.35, fillRatio));
  const zoom = clampStudentMapZoom(Math.min(
    (usableWidth * safeFillRatio) / (baseScale * safeContentWidth),
    (usableHeight * safeFillRatio) / (baseScale * safeContentHeight),
  ));
  const contentCenterX = content.x + safeContentWidth / 2 + contentOffset.x;
  const contentCenterY = content.y + safeContentHeight / 2 + contentOffset.y;
  const targetScreenX = left + usableWidth / 2;
  const targetScreenY = top + usableHeight / 2;

  return {
    zoom,
    pan: {
      x: (targetScreenX - letterboxX) / baseScale - (safeMapWidth / 2) * (1 - zoom) - contentCenterX * zoom,
      y: (targetScreenY - letterboxY) / baseScale - (safeMapHeight / 2) * (1 - zoom) - contentCenterY * zoom,
    },
  };
}

/** Structural floor bounds intentionally exclude furniture and loose decor. */
export function getStudentFloorStructuralBounds(
  shape: StudentCameraBounds,
): StudentCameraBounds {
  return {
    x: shape.x,
    y: shape.y,
    width: Math.max(1, shape.width),
    height: Math.max(1, shape.height),
  };
}

/**
 * Pan a selected room into the safe viewport without changing zoom. The input
 * bounds come from the room's rendered polygon, so rotated and custom rooms
 * use the same focus logic as their visible geometry.
 */
export function getStudentRoomFocusCamera({
  mapWidth,
  mapHeight,
  roomBounds,
  currentPan,
  zoom,
  insets,
  viewportOffset = { x: 0, y: 0 },
  contentOffset = { x: 0, y: 0 },
  visibleThreshold = 0.9,
  comfortMargin = 14,
}: StudentRoomFocusCameraOptions): StudentRoomFocusCamera {
  const safeMapWidth = Math.max(1, mapWidth);
  const safeMapHeight = Math.max(1, mapHeight);
  const safeZoom = clampStudentMapZoom(zoom);
  const left = Math.max(0, insets?.left ?? 0);
  const right = Math.max(0, insets?.right ?? 0);
  const top = Math.max(0, insets?.top ?? 0);
  const bottom = Math.max(0, insets?.bottom ?? 0);
  const letterboxX = Math.max(0, viewportOffset.x);
  const letterboxY = Math.max(0, viewportOffset.y);
  const visibleMapWidth = safeMapWidth + letterboxX * 2;
  const visibleMapHeight = safeMapHeight + letterboxY * 2;
  const requestedSafeLeft = -letterboxX + Math.min(left, visibleMapWidth);
  const requestedSafeRight = safeMapWidth + letterboxX - Math.min(right, visibleMapWidth);
  const requestedSafeTop = -letterboxY + Math.min(top, visibleMapHeight);
  const requestedSafeBottom = safeMapHeight + letterboxY - Math.min(bottom, visibleMapHeight);
  const safeLeft = Math.min(requestedSafeLeft, (requestedSafeLeft + requestedSafeRight) / 2);
  const safeRightEdge = Math.max(requestedSafeRight, (requestedSafeLeft + requestedSafeRight) / 2);
  const safeTop = Math.min(requestedSafeTop, (requestedSafeTop + requestedSafeBottom) / 2);
  const safeBottomEdge = Math.max(requestedSafeBottom, (requestedSafeTop + requestedSafeBottom) / 2);

  const roomLeft = roomBounds.x + contentOffset.x;
  const roomTop = roomBounds.y + contentOffset.y;
  const roomRight = roomLeft + Math.max(1, roomBounds.width);
  const roomBottom = roomTop + Math.max(1, roomBounds.height);
  const tx = (safeMapWidth / 2) * (1 - safeZoom) + currentPan.x;
  const ty = (safeMapHeight / 2) * (1 - safeZoom) + currentPan.y;
  const visibleLeft = tx + roomLeft * safeZoom;
  const visibleTop = ty + roomTop * safeZoom;
  const visibleRight = tx + roomRight * safeZoom;
  const visibleBottom = ty + roomBottom * safeZoom;
  const visibleWidth = Math.max(0, Math.min(visibleRight, safeRightEdge) - Math.max(visibleLeft, safeLeft));
  const visibleHeight = Math.max(0, Math.min(visibleBottom, safeBottomEdge) - Math.max(visibleTop, safeTop));
  const visibleRatio = (visibleWidth / Math.max(1, (roomRight - roomLeft) * safeZoom))
    * (visibleHeight / Math.max(1, (roomBottom - roomTop) * safeZoom));
  const roomCenterX = (visibleLeft + visibleRight) / 2;
  const roomCenterY = (visibleTop + visibleBottom) / 2;
  const marginX = Math.min(comfortMargin, Math.max(0, (safeRightEdge - safeLeft) / 2));
  const marginY = Math.min(comfortMargin, Math.max(0, (safeBottomEdge - safeTop) / 2));
  const centerIsComfortable = roomCenterX >= safeLeft + marginX
    && roomCenterX <= safeRightEdge - marginX
    && roomCenterY >= safeTop + marginY
    && roomCenterY <= safeBottomEdge - marginY;

  if (visibleRatio >= Math.max(0, Math.min(1, visibleThreshold)) && centerIsComfortable) {
    return { pan: currentPan, zoom: safeZoom, shouldMove: false, visibleRatio };
  }

  const safeCenterX = safeLeft + Math.max(1, safeRightEdge - safeLeft) / 2;
  const safeCenterY = safeTop + Math.max(1, safeBottomEdge - safeTop) / 2;
  const targetPan = {
    x: safeCenterX - (safeMapWidth / 2) * (1 - safeZoom) - ((roomLeft + roomRight) / 2) * safeZoom,
    y: safeCenterY - (safeMapHeight / 2) * (1 - safeZoom) - ((roomTop + roomBottom) / 2) * safeZoom,
  };
  const shouldMove = Math.abs(targetPan.x - currentPan.x) > 1 || Math.abs(targetPan.y - currentPan.y) > 1;
  return {
    pan: shouldMove ? targetPan : currentPan,
    zoom: safeZoom,
    shouldMove,
    visibleRatio,
  };
}

/** Keep bounded but generous inspection room around an indoor floor. */
export function getStudentFloorInspectionSlack(
  viewportWidth: number,
  viewportHeight: number,
  isMobile: boolean,
): MapPoint {
  const ratio = isMobile ? 0.4 : 0.25;
  return {
    x: Math.max(0, viewportWidth) * ratio,
    y: Math.max(0, viewportHeight) * ratio,
  };
}
