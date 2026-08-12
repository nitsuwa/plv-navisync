/**
 * Pure geometry/state helpers for the Map Builder canvas.
 *
 * Extracted so that:
 *  - the canvas preview and the final building share ONE placement function
 *    (they can never disagree), and
 *  - the coordinate conversion and cleanup rules are unit-testable.
 *
 * These functions are intentionally free of React/DOM dependencies.
 */

export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum drag-to-create building footprint (matches the editor's floor plan minimums). */
export const MIN_BUILDING_W = 40;
export const MIN_BUILDING_H = 30;

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SvgContentBox {
  /** Horizontal offset (px) of the viewBox content inside the SVG element. */
  offsetX: number;
  /** Vertical offset (px) of the viewBox content inside the SVG element. */
  offsetY: number;
  /** Scale factor from viewBox units to screen px. */
  scale: number;
}

/**
 * Compute where the viewBox content actually sits inside the SVG element.
 *
 * The editor canvas is an <svg viewBox="0 0 W H"> stretched to fill its
 * container (w-full h-full) with the default preserveAspectRatio="xMidYMid
 * meet". When the container's aspect ratio differs from the canvas, the
 * content is LETTERBOXED (scaled to fit and centered), leaving empty margins
 * on two sides. Pointer conversion MUST subtract those margins and divide by
 * the real content scale — a naive `(clientX - rect.left) / rect.width * W`
 * stretches the whole element box and places objects offset from the cursor
 * (the rubber-band box visibly shifted to the right).
 *
 * Returns a sane fallback (offset 0, element-box scale) for degenerate rects
 * so a freshly-created campus whose SVG has not laid out yet can never push
 * placements toward the top-left corner.
 */
export function getSvgContentBox(
  rect: ScreenRect,
  canvasW: number,
  canvasH: number
): SvgContentBox {
  if (rect.width <= 0 || rect.height <= 0 || canvasW <= 0 || canvasH <= 0) {
    const scale = rect.width > 0 && canvasW > 0 ? rect.width / canvasW : 1;
    return { offsetX: 0, offsetY: 0, scale };
  }
  const scale = Math.min(rect.width / canvasW, rect.height / canvasH);
  return {
    offsetX: (rect.width - canvasW * scale) / 2,
    offsetY: (rect.height - canvasH * scale) / 2,
    scale,
  };
}

/**
 * Convert a client (screen) point into canvas/world coordinates.
 *
 * This is the SINGLE pointer→world conversion path for the whole editor:
 * screen/client coordinates → content-box (letterbox-aware) → undo pan → undo
 * zoom → world/campus coordinates. Placement, rubber-band selection, item
 * drags, resize/rotate handles, drag-and-drop and zoom-to-cursor all call it
 * (directly or via useCanvasControls.getPoint) so the visible cursor and the
 * interaction location always match, at any zoom, after any pan.
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  canvasW: number,
  canvasH: number,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const box = getSvgContentBox(rect, canvasW, canvasH);
  const z = zoom > 0 ? zoom : 1;
  return {
    x: ((clientX - rect.left - box.offsetX) / box.scale - pan.x) / z,
    y: ((clientY - rect.top - box.offsetY) / box.scale - pan.y) / z,
  };
}

/**
 * Inverse helper for zoom-to-cursor: compute the pan that keeps the world
 * point (worldX, worldY) exactly under the client point (clientX, clientY)
 * at the given zoom, respecting the letterbox content box. Returns the
 * resulting pan.
 */
export function panToKeepWorldPoint(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  canvasW: number,
  canvasH: number,
  worldX: number,
  worldY: number,
  zoom: number
): { x: number; y: number } {
  const box = getSvgContentBox(rect, canvasW, canvasH);
  const z = zoom > 0 ? zoom : 1;
  return {
    x: (clientX - rect.left - box.offsetX) / box.scale - worldX * z,
    y: (clientY - rect.top - box.offsetY) / box.scale - worldY * z,
  };
}

/**
 * Single source of truth for drag-to-create building geometry.
 *
 * The canvas drag preview AND the final building both call this with the
 * same drag box, so the preview always matches the created building exactly
 * (same clamping, same minimum size). A degenerate click (no drag) still
 * yields the minimum 40×30 footprint at the click point — never an
 * accidental placement at (0,0) unless the user actually clicked at (0,0).
 */
export function computeBuildingPlacement(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number
): PlacementRect {
  const rx = Math.min(sx, cx);
  const ry = Math.min(sy, cy);
  const rw = Math.max(Math.abs(cx - sx), MIN_BUILDING_W);
  const rh = Math.max(Math.abs(cy - sy), MIN_BUILDING_H);
  return {
    x: Math.round(Math.max(0, Math.min(canvasW - rw, rx))),
    y: Math.round(Math.max(0, Math.min(canvasH - rh, ry))),
    width: Math.round(rw),
    height: Math.round(rh),
  };
}

/**
 * True when a world-space point falls inside a building's footprint,
 * including its rotation (the point is inverse-rotated around the building
 * center before the axis-aligned check). Used by the Navigation layer to
 * reject outdoor waypoints placed on arbitrary building bodies — outdoor
 * graph nodes belong to outdoor navigable space, so a click inside a
 * building should prompt "connect through a building entrance" instead of
 * silently creating a waypoint.
 */
export function pointInBuilding(
  building: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  point: { x: number; y: number }
): boolean {
  const rotation = building.rotation ?? 0;
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const unrotatedX = dx * cos - dy * sin;
  const unrotatedY = dx * sin + dy * cos;
  const halfW = building.width / 2;
  const halfH = building.height / 2;
  return unrotatedX >= -halfW && unrotatedX <= halfW && unrotatedY >= -halfH && unrotatedY <= halfH;
}

/**
 * Transient tool/drawing state that must be cleared when switching tools,
 * switching layers, or cancelling an in-progress gesture. Returns a fresh
 * fully-reset object so callers can spread it into state setters.
 */
export function resetTransientToolState(): {
  drawingPath: { x: number; y: number }[];
  buildingDrag: null;
  rubberBand: null;
  selectedBuildingType: null;
  guides: { type: "h" | "v"; pos: number }[];
} {
  return {
    drawingPath: [],
    buildingDrag: null,
    rubberBand: null,
    selectedBuildingType: null,
    guides: [],
  };
}
