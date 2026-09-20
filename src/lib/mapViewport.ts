export const STUDENT_MAP_MIN_ZOOM = 0.75;
export const STUDENT_MAP_MAX_ZOOM = 3.5;
export const STUDENT_MAP_ZOOM_STEP = 0.2;

/** Keep every student-map zoom input inside one predictable, readable range. */
export function clampStudentMapZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Number(
    Math.max(STUDENT_MAP_MIN_ZOOM, Math.min(STUDENT_MAP_MAX_ZOOM, value)).toFixed(2),
  );
}
export interface MapPoint {
  x: number;
  y: number;
}

export interface MapViewportSize {
  mapWidth: number;
  mapHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface MapViewportPanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MapViewportInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface MapViewportPanOptions extends MapViewportSize {
  /** Scale applied to the authored map around its top-left origin. */
  zoom: number;
  /** Screen-space margin allowed outside the map (used by editors only). */
  padding?: number;
  /** Screen-space areas reserved for fixed controls in viewer mode. */
  insets?: MapViewportInsets;
  /** Transform origin used by the renderer. */
  zoomOrigin?: "top-left" | "center";
  /** Optional screen pixels per authored unit at zoom 1. */
  baseScale?: number;
}

export interface MapViewportZoomPanOptions {
  mapWidth: number;
  mapHeight: number;
  worldPoint: MapPoint;
  pan: MapPoint;
  zoom: number;
  nextZoom: number;
  zoomOrigin?: "top-left" | "center";
}

/**
 * Return the pan that keeps a world point under the same viewport coordinate
 * while changing zoom. Pan is expressed in the renderer's authored units.
 */
export function getPanToKeepWorldPoint({
  mapWidth,
  mapHeight,
  worldPoint,
  pan,
  zoom,
  nextZoom,
  zoomOrigin = "top-left",
}: MapViewportZoomPanOptions): MapPoint {
  const safeZoom = Math.max(0.01, zoom);
  const safeNextZoom = Math.max(0.01, nextZoom);
  const originX = zoomOrigin === "center" ? mapWidth / 2 : 0;
  const originY = zoomOrigin === "center" ? mapHeight / 2 : 0;
  const screenX = originX * (1 - safeZoom) + pan.x + worldPoint.x * safeZoom;
  const screenY = originY * (1 - safeZoom) + pan.y + worldPoint.y * safeZoom;

  return {
    x: screenX - originX * (1 - safeNextZoom) - worldPoint.x * safeNextZoom,
    y: screenY - originY * (1 - safeNextZoom) - worldPoint.y * safeNextZoom,
  };
}

/**
 * The scale at which an authored map fits inside its viewport when the
 * rendered map is a direct world-space surface. SVG map consumers use this
 * value as their normalized zoom baseline (1 = fit-to-map).
 */
export function getViewportFitZoom({
  mapWidth,
  mapHeight,
  viewportWidth,
  viewportHeight,
}: MapViewportSize): number {
  if (mapWidth <= 0 || mapHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1;
  return Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight);
}

/**
 * Calculate pan limits for a map rendered in an SVG viewBox whose authored
 * world is [0..mapWidth] × [0..mapHeight]. The caller supplies a zoom factor
 * and the returned pan is in authored world units.
 *
 * When a zoomed map is smaller than the viewport on one axis, that axis is
 * centered instead of exposing an arbitrary blank edge. Padding deliberately
 * expands the editor workspace without changing the authored map bounds.
 */
export function getViewportPanBounds({
  mapWidth,
  mapHeight,
  viewportWidth,
  viewportHeight,
  zoom,
  padding = 0,
  insets,
  zoomOrigin = "top-left",
  baseScale,
}: MapViewportPanOptions): MapViewportPanBounds {
  const safeMapWidth = Math.max(1, mapWidth);
  const safeMapHeight = Math.max(1, mapHeight);
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeZoom = Math.max(0.01, zoom);
  const safePadding = Math.max(0, padding);
  const safeInsets = {
    top: safePadding + Math.max(0, insets?.top ?? 0),
    right: safePadding + Math.max(0, insets?.right ?? 0),
    bottom: safePadding + Math.max(0, insets?.bottom ?? 0),
    left: safePadding + Math.max(0, insets?.left ?? 0),
  };
  const fitScale = baseScale && Number.isFinite(baseScale) && baseScale > 0
    ? baseScale
    : getViewportFitZoom({
        mapWidth: safeMapWidth,
        mapHeight: safeMapHeight,
        viewportWidth: safeViewportWidth,
        viewportHeight: safeViewportHeight,
      });
  const letterboxX = Math.max(0, (safeViewportWidth - safeMapWidth * fitScale) / 2);
  const letterboxY = Math.max(0, (safeViewportHeight - safeMapHeight * fitScale) / 2);

  const axisBounds = (
    mapSize: number,
    viewportSize: number,
    letterbox: number,
    leadingInset: number,
    trailingInset: number,
  ): { min: number; max: number } => {
    const zoomOriginOffset = zoomOrigin === "center"
      ? (mapSize / 2) * (1 - safeZoom)
      : 0;
    const min = (viewportSize - trailingInset - letterbox) / fitScale - zoomOriginOffset - mapSize * safeZoom;
    const max = (leadingInset - letterbox) / fitScale - zoomOriginOffset;
    if (min <= max) return { min, max };
    const safeCenter = (leadingInset + viewportSize - trailingInset) / 2;
    const centered = (safeCenter - letterbox) / fitScale - zoomOriginOffset - (mapSize * safeZoom) / 2;
    return { min: centered, max: centered };
  };

  const x = axisBounds(safeMapWidth, safeViewportWidth, letterboxX, safeInsets.left, safeInsets.right);
  const y = axisBounds(safeMapHeight, safeViewportHeight, letterboxY, safeInsets.top, safeInsets.bottom);
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

export function clampViewportPan(point: MapPoint, bounds: MapViewportPanBounds): MapPoint {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  };
}

export interface BuildingFocusPanOptions {
  buildingCenter: MapPoint;
  canvasW: number;
  canvasH: number;
  zoom: number;
  mapWidth: number;
  mapHeight: number;
  isMobile: boolean;
}

const DESKTOP_PANEL_OFFSET = -80;
const MOBILE_FOCUS_Y_RATIO = 0.4;

/**
 * Return the pan needed to focus a building in the map viewport.
 *
 * Mobile focuses a little above the canvas midpoint so the selected building
 * stays visible above the details sheet. The scale is derived from the
 * rendered map and authored canvas, so published campuses of any size frame
 * correctly.
 */
export function getBuildingFocusPan({
  buildingCenter,
  canvasW,
  canvasH,
  zoom,
  mapWidth,
  mapHeight,
  isMobile,
}: BuildingFocusPanOptions): MapPoint {
  const canvasCenter = { x: canvasW / 2, y: canvasH / 2 };
  const renderedScale = Math.min(
    mapWidth / (canvasW / zoom),
    mapHeight / (canvasH / zoom),
  );
  const safeScale = renderedScale > 0 ? renderedScale : 1;
  const mobileYOffset = isMobile
    ? ((mapHeight * MOBILE_FOCUS_Y_RATIO) - (mapHeight / 2)) / safeScale
    : 0;

  return {
    x: (canvasCenter.x - buildingCenter.x) * zoom + (isMobile ? 0 : DESKTOP_PANEL_OFFSET),
    y: (canvasCenter.y - buildingCenter.y) * zoom + mobileYOffset,
  };
}
