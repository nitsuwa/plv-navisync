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

/**
 * Convert a client (screen) point into canvas/world coordinates.
 * Mirrors the SVG math in useCanvasControls: the world point W maps to the
 * SVG viewBox coordinate V = W·zoom + pan, and the viewBox spans the element
 * (fraction · canvasW). This is the inverse of that mapping.
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
  return {
    x: (((clientX - rect.left) / rect.width) * canvasW - pan.x) / zoom,
    y: (((clientY - rect.top) / rect.height) * canvasH - pan.y) / zoom,
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
 * Whether the Navigation layer should draw the "building → walking network"
 * connector indicator for a building.
 *
 * The indicator is a green dashed line from the building's entrance down to
 * the network. It is only truthful when the building actually has navigation
 * data: either a nav node that references the building, or an entranceNodeId
 * linking the building to a nav node (set from the Properties panel). A bare
 * building with neither must never silently produce path-looking decoration.
 */
export function shouldDrawNavConnector(
  buildingId: string,
  navNodes: { buildingId?: string }[],
  entranceNodeId?: string
): boolean {
  return navNodes.some((n) => n.buildingId === buildingId) || !!entranceNodeId;
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
